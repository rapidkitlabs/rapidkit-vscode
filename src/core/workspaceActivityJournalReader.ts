import crypto from 'node:crypto';
import { open } from 'node:fs/promises';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import type { DashboardActivityEntry } from './dashboardActivityBridge.js';

type WorkspaceActivityEvent = {
  schemaVersion: 'workspace-activity-event.v1';
  eventId: string;
  sequence: number;
  timestamp: string;
  runId: string;
  kind: string;
  status: string;
  component: string;
  message: string;
  scope: { kind: 'ephemeral-project' | 'project' | 'workspace'; label: string };
  origin?: { kind: 'project' | 'workspace-root'; label: string };
  attributes?: Record<string, unknown>;
};

const MAX_JOURNAL_BYTES = 2 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isWorkspaceActivityEvent(value: unknown): value is WorkspaceActivityEvent {
  if (!isRecord(value) || !isRecord(value.scope)) {
    return false;
  }
  return (
    value.schemaVersion === 'workspace-activity-event.v1' &&
    typeof value.eventId === 'string' &&
    value.eventId.length >= 8 &&
    Number.isInteger(value.sequence) &&
    Number(value.sequence) >= 1 &&
    typeof value.timestamp === 'string' &&
    Number.isFinite(Date.parse(value.timestamp)) &&
    typeof value.runId === 'string' &&
    value.runId.length >= 8 &&
    typeof value.kind === 'string' &&
    typeof value.status === 'string' &&
    typeof value.component === 'string' &&
    typeof value.message === 'string' &&
    ['ephemeral-project', 'project', 'workspace'].includes(String(value.scope.kind)) &&
    typeof value.scope.label === 'string'
  );
}

function activityStateHome(env: NodeJS.ProcessEnv): string {
  if (env.WORKSPAI_ACTIVITY_STATE_DIR) {
    return path.resolve(env.WORKSPAI_ACTIVITY_STATE_DIR);
  }
  if (process.platform === 'win32') {
    return path.join(env.LOCALAPPDATA || os.homedir(), 'Workspai', 'activity');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Workspai', 'activity');
  }
  return path.join(
    env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'),
    'workspai',
    'activity'
  );
}

async function channelPath(rootPath: string, env: NodeJS.ProcessEnv): Promise<string> {
  let canonical = path.resolve(rootPath);
  try {
    canonical = await fs.realpath(canonical);
  } catch {
    // Preserve the normalized requested root when it is temporarily unavailable.
  }
  if (process.platform === 'win32') {
    canonical = canonical.toLowerCase();
  }
  const id = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 24);
  return path.join(activityStateHome(env), `local-${id}`, 'runs');
}

function commandFromEvent(event: WorkspaceActivityEvent): string {
  const command = event.attributes?.command;
  return Array.isArray(command) && command.every((entry) => typeof entry === 'string')
    ? command.join(' ')
    : event.message.replace(/^workspai\s+/, '');
}

function dashboardStatus(event: WorkspaceActivityEvent): DashboardActivityEntry['status'] {
  if (event.kind === 'run.failed' || event.status === 'failed' || event.status === 'blocked') {
    return 'failed';
  }
  if (
    event.kind === 'run.completed' ||
    event.kind === 'run.cancelled' ||
    ['succeeded', 'cancelled', 'rolled-back'].includes(event.status)
  ) {
    return 'completed';
  }
  return 'dispatched';
}

async function readJournalTail(filePath: string): Promise<string> {
  const handle = await open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      return '';
    }
    const length = Math.min(stat.size, MAX_JOURNAL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, Math.max(0, stat.size - length));
    const text = buffer.toString('utf8');
    // A bounded tail may begin inside one JSON line; discard that fragment.
    return stat.size > length ? text.slice(Math.max(0, text.indexOf('\n') + 1)) : text;
  } finally {
    await handle.close();
  }
}

/** Read the CLI 0.66 machine-local activity plane without treating it as evidence authority. */
export async function readWorkspaceActivityJournal(input: {
  workspacePath: string;
  projectPath?: string;
  env?: NodeJS.ProcessEnv;
  maxRuns?: number;
}): Promise<DashboardActivityEntry[]> {
  const env = input.env ?? process.env;
  if (env.WORKSPAI_ACTIVITY_DISABLE === '1') {
    return [];
  }
  const roots = [...new Set([input.workspacePath, input.projectPath].filter(Boolean) as string[])];
  const runDirectories = await Promise.all(roots.map((root) => channelPath(root, env)));
  const files = (
    await Promise.all(
      runDirectories.map(async (directory) => {
        try {
          return (await fs.readdir(directory))
            .filter((name) => name.endsWith('.ndjson'))
            .map((name) => path.join(directory, name));
        } catch {
          return [];
        }
      })
    )
  ).flat();
  const uniqueFiles = [...new Set(files)];
  const ranked = (
    await Promise.all(
      uniqueFiles.map(async (filePath) => {
        try {
          const stat = await fs.lstat(filePath);
          return stat.isFile() ? { filePath, stat } : null;
        } catch {
          return null;
        }
      })
    )
  )
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs)
    .slice(0, Math.max(1, input.maxRuns ?? 12));
  const events = new Map<string, WorkspaceActivityEvent>();
  for (const { filePath } of ranked) {
    try {
      const lines = (await readJournalTail(filePath)).trim().split(/\r?\n/).slice(-2_000);
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        const parsed = JSON.parse(line) as unknown;
        if (isWorkspaceActivityEvent(parsed)) {
          events.set(parsed.eventId, parsed);
        }
      }
    } catch {
      // A partial/corrupt journal is diagnostic noise and must not break Dashboard evidence.
    }
  }
  const runs = new Map<string, WorkspaceActivityEvent[]>();
  for (const event of events.values()) {
    const run = runs.get(event.runId) ?? [];
    run.push(event);
    runs.set(event.runId, run);
  }
  return [...runs.entries()]
    .flatMap(([runId, run]) => {
      run.sort((left, right) => left.sequence - right.sequence);
      const started = run.find((event) => event.kind === 'run.started') ?? run[0];
      const latest = run.at(-1);
      if (!started || !latest) {
        return [];
      }
      const command = commandFromEvent(started);
      return [
        {
          id: `activity-${runId}`,
          command: command || 'live',
          label: command ? `workspai ${command}` : started.message,
          scope: started.origin?.kind === 'project' ? ('project' as const) : ('workspace' as const),
          status: dashboardStatus(latest),
          timestamp: Date.parse(latest.timestamp),
          detail: `${latest.message} · observational activity`,
          runCount: 1,
        },
      ];
    })
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, Math.max(1, input.maxRuns ?? 12));
}
