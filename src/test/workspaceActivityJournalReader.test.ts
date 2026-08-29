import crypto from 'node:crypto';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  isWorkspaceActivityEvent,
  readWorkspaceActivityJournal,
} from '../core/workspaceActivityJournalReader';

describe('workspace activity journal reader', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((directory) => fs.remove(directory)));
  });

  it('projects a bounded CLI activity journal without promoting it to evidence', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-activity-project-'));
    const state = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-activity-state-'));
    tempDirs.push(root, state);
    const canonical = await fs.realpath(root);
    const channel = `local-${crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 24)}`;
    const runs = path.join(state, channel, 'runs');
    await fs.ensureDir(runs);
    const base = {
      schemaVersion: 'workspace-activity-event.v1',
      runId: 'run-12345678',
      scope: { kind: 'workspace', id: 'scope-12345678', label: 'demo', portable: false },
      component: 'cli',
      origin: { id: 'origin-12345678', kind: 'workspace-root', label: 'demo' },
    };
    await fs.writeFile(
      path.join(runs, 'run-12345678.ndjson'),
      [
        {
          ...base,
          eventId: 'event-0001',
          sequence: 1,
          timestamp: '2026-08-28T00:00:00.000Z',
          kind: 'run.started',
          status: 'running',
          message: 'workspai workspace intelligence run',
          attributes: { command: ['workspace', 'intelligence', 'run'] },
        },
        {
          ...base,
          eventId: 'event-0002',
          sequence: 2,
          timestamp: '2026-08-28T00:00:02.000Z',
          kind: 'run.completed',
          status: 'succeeded',
          message: 'CLI run completed',
        },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n') + '\n'
    );

    const activity = await readWorkspaceActivityJournal({
      workspacePath: root,
      env: { ...process.env, WORKSPAI_ACTIVITY_STATE_DIR: state },
    });

    expect(activity).toEqual([
      expect.objectContaining({
        command: 'workspace intelligence run',
        status: 'completed',
        scope: 'workspace',
        detail: 'CLI run completed · observational activity',
      }),
    ]);
    expect(isWorkspaceActivityEvent({ schemaVersion: 'workspace-activity-event.v1' })).toBe(false);
  });
});
