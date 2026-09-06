import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import { run } from '../utils/exec.js';
import { buildRapidkitExecutionSpec } from '../utils/platformCapabilities.js';
import type { ChangeReview } from '../contracts/changeReview.js';

type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as RecordValue) : {};
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
const records = (v: unknown): RecordValue[] => (Array.isArray(v) ? v.map(record) : []);
const hash = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await run('git', ['--no-optional-locks', ...args], {
    cwd,
    shell: false,
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || 'Git observation failed.');
  }
  return result.stdout;
}

export function parseReviewFiles(diff: string, untracked: string): ChangeReview['files'] {
  const tokens = diff.split('\0');
  const files = new Map<string, string>();
  for (let index = 0; index < tokens.length - 1; index += 2) {
    if (!tokens[index] || !tokens[index + 1]) {
      continue;
    }
    files.set(tokens[index + 1], tokens[index]);
  }
  for (const file of untracked.split('\0').filter(Boolean)) {
    files.set(file, '?');
  }
  return [...files]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, status]) => ({ path: file, status }));
}

export async function observeReviewTree(repositoryPath: string, baseRef = 'HEAD') {
  // Resolve a ref to a commit before it can enter a CLI argument. No shell syntax.
  if (
    !baseRef ||
    baseRef.length > 256 ||
    baseRef.startsWith('-') ||
    [...baseRef].some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127
    )
  ) {
    throw new Error('Enter a local branch, tag or commit.');
  }
  const root = await fs.realpath(
    (await git(repositoryPath, ['rev-parse', '--show-toplevel'])).trim()
  );
  if (root !== (await fs.realpath(repositoryPath))) {
    throw new Error('Select the Git repository root, not a subdirectory.');
  }
  const base = (
    await git(root, ['rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`])
  ).trim();
  const head = (await git(root, ['rev-parse', 'HEAD'])).trim();
  if (!/^[a-f0-9]{40,64}$/.test(base)) {
    throw new Error('Git did not resolve the comparison commit.');
  }
  const files = parseReviewFiles(
    await git(root, [
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      '--name-status',
      '-z',
      base,
      '--',
    ]),
    await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
  );
  if (files.length > 1000) {
    throw new Error(
      'Review is limited to 1,000 changed files. Narrow the change before reviewing.'
    );
  }
  let bytes = 0;
  const observations: string[] = [base, head];
  for (const file of files) {
    const absolute = path.resolve(root, file.path);
    const relative = path.relative(root, absolute);
    if (
      !relative ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error('Git returned an out-of-repository path.');
    }
    let content = 'deleted';
    try {
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) {
        content = `symlink:${await fs.readlink(absolute)}`;
      } else if (stat.isFile()) {
        const real = await fs.realpath(absolute);
        const realRelative = path.relative(root, real);
        if (
          realRelative === '..' ||
          realRelative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(realRelative)
        ) {
          throw new Error('Changed file resolves outside the repository.');
        }
        bytes += stat.size;
        if (bytes > 32 * 1024 * 1024) {
          throw new Error('Changed contents exceed the 32 MiB review budget.');
        }
        content = `${stat.mode}:${hash(await fs.readFile(absolute))}`;
      } else {
        throw new Error('Submodule or directory changes need a separate review.');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    observations.push(JSON.stringify([file.path, file.status, content]));
  }
  return { repositoryPath: root, base, head, files, fingerprint: hash(observations.join('\n')) };
}

async function cli(cwd: string, args: string[]): Promise<RecordValue> {
  const execution = buildRapidkitExecutionSpec(args);
  const result = await run(execution.command, execution.args, {
    cwd,
    env: execution.env,
    shell: execution.shell,
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  let envelope: RecordValue;
  try {
    envelope = record(JSON.parse(result.stdout));
  } catch {
    throw new Error(result.stderr.trim() || 'CLI returned no structured evidence.');
  }
  if (result.exitCode !== 0 || envelope.status === 'error') {
    throw new Error(
      String(
        record(envelope.error).message || result.stderr.trim() || 'CLI evidence is unavailable.'
      )
    );
  }
  if (
    envelope.schemaVersion !== 'workspai-cli-operation-result-v1' ||
    envelope.status !== 'success' ||
    envelope.operation !== args.slice(0, 2).join(' ')
  ) {
    throw new Error('Unexpected CLI operation envelope.');
  }
  return record(envelope.artifact);
}

export function projectReviewImpact(
  diff: RecordValue,
  impact: RecordValue,
  observation: Awaited<ReturnType<typeof observeReviewTree>>
) {
  if (
    diff.schemaVersion !== 'workspace-model-diff.v1' ||
    impact.schemaVersion !== 'workspace-impact.v1'
  ) {
    throw new Error('Unsupported CLI review contracts.');
  }
  // A missing collection is unavailable evidence, never an empty/clean result.
  for (const value of [
    diff.changes,
    impact.affectedProjects,
    impact.transitiveImpact,
    impact.workspaceImpact,
    impact.verificationPlan,
  ]) {
    if (
      !Array.isArray(value) ||
      value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))
    ) {
      throw new Error('Incomplete CLI review evidence collections.');
    }
  }
  const impactDiff = record(impact.diff);
  if (
    impactDiff.schemaVersion !== diff.schemaVersion ||
    impactDiff.fromRef !== diff.fromRef ||
    record(impactDiff.git).commit !== observation.head ||
    record(impactDiff.git).available !== true ||
    impactDiff.toHash !== diff.toHash ||
    impactDiff.fromHash !== diff.fromHash
  ) {
    throw new Error('Impact was not computed from matching diff evidence. Refresh the review.');
  }
  const gitEvidence = record(diff.git);
  if (
    gitEvidence.available !== true ||
    gitEvidence.commit !== observation.head ||
    diff.fromRef !== `git:${observation.base}` ||
    impact.fromRef !== diff.fromRef
  ) {
    throw new Error(
      'CLI Git evidence does not cover this repository and comparison. Linked workspaces need a matching Git observation; no impact verdict was inferred.'
    );
  }
  const mapped = new Set(
    records(diff.changes)
      .filter((c) => String(c.type).startsWith('git.'))
      .map((c) => c.target)
  );
  if (observation.files.some((f) => !mapped.has(`git:${f.path}`))) {
    throw new Error('CLI evidence does not cover every changed path. Impact is incomplete.');
  }
  const impactPaths = new Set(
    records(impactDiff.changes)
      .filter((c) => String(c.type).startsWith('git.'))
      .map((c) => c.target)
  );
  if (observation.files.some((f) => !impactPaths.has(`git:${f.path}`))) {
    throw new Error('Impact evidence does not cover every changed path.');
  }
  return {
    impact: [
      ...records(impact.affectedProjects),
      ...records(impact.transitiveImpact),
      ...records(impact.workspaceImpact),
    ].map((item) => ({
      title: String(item.title ?? item.target ?? 'Affected surface'),
      summary: String(item.summary ?? ''),
      origin: String(item.origin ?? 'workspace'),
      reasons: strings(item.reasons),
    })),
    checks: records(impact.verificationPlan)
      .filter((c) => typeof c.display === 'string')
      .map((c, i) => ({
        id: String(c.id ?? i),
        label: String(c.label ?? 'Suggested check'),
        command: String(c.display),
        required: c.required !== false,
      })),
    limitations: strings(record(impact.agentBrief).unsafeAssumptions),
  };
}

export async function buildChangeReview(
  repositoryPath: string,
  baseRef = 'HEAD'
): Promise<ChangeReview> {
  const before = await observeReviewTree(repositoryPath, baseRef);
  const report: ChangeReview = {
    ...before,
    id: crypto.randomUUID(),
    requestedBase: baseRef,
    observedAt: new Date().toISOString(),
    impact: [],
    checks: [],
    impactAvailable: false,
    limitations: [
      'No tests were run. Existing green reports are not treated as proof for these contents.',
      'Impact uses discovered project relationships, not complete runtime behavior or line-level test coverage.',
      'Comparison includes tracked working-tree changes and untracked files, not staged changes alone.',
    ],
  };
  try {
    const from = `git:${before.base}`;
    const diff = await cli(repositoryPath, [
      'workspace',
      'diff',
      '--from',
      from,
      '--workspace',
      repositoryPath,
      '--json',
    ]);
    const impact = await cli(repositoryPath, [
      'workspace',
      'impact',
      '--from',
      from,
      '--workspace',
      repositoryPath,
      '--json',
    ]);
    const projected = projectReviewImpact(diff, impact, before);
    report.impact = projected.impact;
    report.checks = projected.checks;
    report.limitations.push(...projected.limitations);
    report.impactAvailable = true;
  } catch (error) {
    report.limitations.push(error instanceof Error ? error.message : String(error));
  }
  const after = await observeReviewTree(repositoryPath, before.base);
  if (before.fingerprint !== after.fingerprint) {
    throw new Error('Files changed during review. Refresh after the working tree settles.');
  }
  return report;
}

export function changeReviewMarkdown(report: ChangeReview): string {
  return [
    `# Change review`,
    `Observed: ${report.observedAt}`,
    `Repository: ${JSON.stringify(report.repositoryPath)}`,
    `Comparison ref: ${JSON.stringify(report.requestedBase)}`,
    `Base: ${report.base}`,
    `HEAD: ${report.head}`,
    `Contents: ${report.fingerprint}`,
    '',
    '## Changes',
    ...report.files.map((f) => `- ${f.status} ${JSON.stringify(f.path)}`),
    '',
    '## CLI impact',
    ...(report.impactAvailable
      ? report.impact.flatMap((i) => [
          `- ${i.title} (${i.origin}): ${i.summary}`,
          ...i.reasons.map((reason) => `  - Evidence: ${reason}`),
        ])
      : ['Unavailable; no impact verdict.']),
    '',
    '## Suggested checks (not executed)',
    ...report.checks.map(
      (c) =>
        `- ${c.label} (${c.required ? 'required by CLI' : 'optional'}; not executed): ${c.command}`
    ),
    '',
    '## Limits',
    ...report.limitations.map((l) => `- ${l}`),
  ].join('\n');
}
