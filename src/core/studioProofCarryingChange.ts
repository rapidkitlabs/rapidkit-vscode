import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';

import type { StreamingRunResult } from './streamingRapidkitRunner.js';
import type {
  WorkspaceRepairCliExecutionResult,
  WorkspaceRepairCliFileChange,
} from './workspaceRepairCliClient.js';
import type { StudioWorkspaceCommandPlan } from './studioWorkspaceCommand.js';
import { parseCliOperationError, sanitizeGoalCommandDetail } from './workspaceGoals.js';

export type StudioProofCarryingChangeEffectClass =
  | 'filesystem'
  | 'command'
  | 'configuration'
  | 'dependency'
  | 'external';

export function studioProofEffectClassesForCommand(
  plan: Pick<
    StudioWorkspaceCommandPlan,
    'mutatesSource' | 'purpose' | 'externalSideEffects' | 'repositoryMetadataEffects'
  >
): StudioProofCarryingChangeEffectClass[] {
  if (plan.externalSideEffects || plan.repositoryMetadataEffects) {
    return ['external'];
  }
  if (!plan.mutatesSource) {
    return [];
  }
  return [plan.purpose === 'dependency' ? 'dependency' : 'command'];
}

export type StudioProofCarryingChangeOperation = {
  schemaVersion: 'workspai.change-operation-result.v1';
  operation: string;
  changeId: string;
  state: string;
  capsule: {
    schemaVersion: 'workspai.proof-carrying-change-capsule.v1';
    status: 'open' | 'blocked' | 'verified' | 'sealed' | 'aborted';
    remainingUncertainty: string[];
  };
  artifacts: Record<string, string | null>;
  nextActions: string[];
};

export type StudioProofCarryingChangeResumeDecision = {
  approved: boolean;
  approvedBy: string;
  reason?: string;
};

type Runner = <T = unknown>(options: {
  command: string[];
  cwd: string;
  featureLabel?: string;
  timeoutMs?: number;
}) => Promise<StreamingRunResult<T>>;

type EffectArtifact = {
  role: string;
  artifact: string;
  schemaVersion: string;
  digest: {
    algorithm: 'sha256';
    semantics: 'raw-bytes-v1';
    value: string;
  };
};

type WorkspaceContractProject = {
  relativePath?: unknown;
  externalPath?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseOperation(value: unknown): StudioProofCarryingChangeOperation {
  if (!isRecord(value) || value.schemaVersion !== 'workspai.change-operation-result.v1') {
    throw new Error('Workspai CLI returned an incompatible Proof-Carrying Change result.');
  }
  if (
    typeof value.operation !== 'string' ||
    typeof value.changeId !== 'string' ||
    typeof value.state !== 'string' ||
    !isRecord(value.capsule) ||
    value.capsule.schemaVersion !== 'workspai.proof-carrying-change-capsule.v1' ||
    !['open', 'blocked', 'verified', 'sealed', 'aborted'].includes(String(value.capsule.status)) ||
    !Array.isArray(value.capsule.remainingUncertainty) ||
    !value.capsule.remainingUncertainty.every((entry) => typeof entry === 'string') ||
    !isRecord(value.artifacts) ||
    !Array.isArray(value.nextActions) ||
    !value.nextActions.every((entry) => typeof entry === 'string')
  ) {
    throw new Error('Workspai CLI returned a malformed Proof-Carrying Change result.');
  }
  return value as StudioProofCarryingChangeOperation;
}

function failureMessage(
  run: StreamingRunResult<unknown>,
  fallback: string,
  workspacePath: string
): string {
  // Structured stdout owns the operation verdict. Stderr is an NDJSON
  // lifecycle stream whose final `run.failed` message is intentionally terse;
  // preferring it hid actionable PCC errors behind the generic text "CLI run
  // failed" and sent Studio down the wrong recovery path.
  const operationError = parseCliOperationError(run.stdout) ?? parseCliOperationError(run.stderr);
  const detail =
    operationError?.error.message ||
    run.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ||
    run.stderr.trim().split(/\r?\n/).filter(Boolean).at(-1) ||
    fallback;
  return sanitizeGoalCommandDetail(detail, workspacePath);
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function readWorkspaceContractProjects(
  workspacePath: string
): Promise<WorkspaceContractProject[]> {
  for (const relativePath of [
    '.workspai/workspace.contract.json',
    '.rapidkit/workspace.contract.json',
  ]) {
    const payload = await fs.readJson(path.join(workspacePath, relativePath)).catch(() => null);
    if (isRecord(payload) && Array.isArray(payload.projects)) {
      return payload.projects.filter(isRecord) as WorkspaceContractProject[];
    }
  }
  return [];
}

/**
 * Convert a physical source path into the exact portable identity used by the
 * canonical Graph. Adopted linked projects are represented through their
 * contract-owned `external/<project>` prefix, never through an absolute path.
 */
export async function resolveStudioProofArtifactIdentity(input: {
  workspacePath: string;
  projectPath?: string;
  relativePath: string;
}): Promise<{ artifact: string; absolutePath: string }> {
  const workspaceRoot = path.resolve(input.workspacePath);
  const sourceRoot = input.projectPath ? path.resolve(input.projectPath) : workspaceRoot;
  const absolutePath = path.resolve(sourceRoot, input.relativePath);
  if (!isInside(sourceRoot, absolutePath)) {
    throw new Error(`Proof artifact escapes the selected source boundary: ${input.relativePath}`);
  }
  if (isInside(workspaceRoot, absolutePath)) {
    return {
      artifact: path.relative(workspaceRoot, absolutePath).split(path.sep).join('/'),
      absolutePath,
    };
  }
  const projects = await readWorkspaceContractProjects(workspaceRoot);
  const project = projects
    .filter(
      (candidate): candidate is { relativePath: string; externalPath: string } =>
        typeof candidate.relativePath === 'string' &&
        typeof candidate.externalPath === 'string' &&
        path.isAbsolute(candidate.externalPath)
    )
    .map((candidate) => ({
      relativePath: candidate.relativePath.replace(/\\/g, '/').replace(/\/$/, ''),
      externalPath: path.resolve(candidate.externalPath),
    }))
    .filter((candidate) => isInside(candidate.externalPath, absolutePath))
    .sort((left, right) => right.externalPath.length - left.externalPath.length)[0];
  if (!project) {
    throw new Error(
      'The changed source is outside the workspace and has no canonical linked-project contract.'
    );
  }
  return {
    artifact: `${project.relativePath}/${path
      .relative(project.externalPath, absolutePath)
      .split(path.sep)
      .join('/')}`,
    absolutePath,
  };
}

async function sourceArtifacts(input: {
  workspacePath: string;
  projectPath?: string;
  fileChanges: Array<Pick<WorkspaceRepairCliFileChange, 'relativePath' | 'status' | 'afterHash'>>;
}): Promise<{ artifacts: EffectArtifact[]; deleted: string[] }> {
  const artifacts: EffectArtifact[] = [];
  const deleted: string[] = [];
  for (const change of input.fileChanges) {
    const identity = await resolveStudioProofArtifactIdentity({
      workspacePath: input.workspacePath,
      projectPath: input.projectPath,
      relativePath: change.relativePath,
    });
    if (change.status === 'deleted' || change.afterHash === null) {
      deleted.push(identity.artifact);
      continue;
    }
    const content = await fs.readFile(identity.absolutePath);
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    if (change.afterHash && digest !== change.afterHash) {
      throw new Error(
        `Changed source no longer matches its repair receipt: ${change.relativePath}`
      );
    }
    artifacts.push({
      role: 'observed-source-effect',
      artifact: identity.artifact,
      schemaVersion: 'raw-bytes.v1',
      digest: { algorithm: 'sha256', semantics: 'raw-bytes-v1', value: digest },
    });
  }
  return { artifacts, deleted };
}

async function withJsonInput<T>(
  payload: unknown,
  operation: (file: string) => Promise<T>
): Promise<T> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-vscode-pcc-'));
  const file = path.join(tempRoot, 'receipt.json');
  try {
    await fs.writeJson(file, payload, { spaces: 2 });
    return await operation(file);
  } finally {
    await fs.remove(tempRoot).catch(() => undefined);
  }
}

export class StudioProofCarryingChangeSession {
  private changeId: string | undefined;
  private authorizedEffects = new Set<StudioProofCarryingChangeEffectClass>();

  constructor(
    private readonly input: {
      workspacePath: string;
      goalId: string;
      actorId: string;
      allowedEffects?: StudioProofCarryingChangeEffectClass[];
      requestResume?(input: {
        changeId: string;
        state: 'blocked' | 'awaiting-human';
      }): Promise<StudioProofCarryingChangeResumeDecision>;
      run?: Runner;
    }
  ) {}

  get activeChangeId(): string | undefined {
    return this.changeId;
  }

  private async resolveRunner(): Promise<Runner> {
    if (this.input.run) {
      return this.input.run;
    }
    const { runRapidkitStreaming } = await import('./streamingRapidkitRunner.js');
    return runRapidkitStreaming;
  }

  private async operation(
    command: string[],
    label: string
  ): Promise<StudioProofCarryingChangeOperation> {
    const run = await this.resolveRunner();
    const result = await run<unknown>({
      command: [...command, '--json'],
      cwd: this.input.workspacePath,
      featureLabel: label,
      timeoutMs: 20 * 60_000,
    });
    if (result.failed || result.exitCode !== 0 || !result.result) {
      throw new Error(failureMessage(result, `${label} failed.`, this.input.workspacePath));
    }
    return parseOperation(result.result);
  }

  private async discoverResumableChange(): Promise<{
    changeId: string;
    state: string;
  } | null> {
    const run = await this.resolveRunner();
    const result = await run<unknown>({
      command: ['change', 'list', '--json'],
      cwd: this.input.workspacePath,
      featureLabel: 'Discover Proof-Carrying Change',
      timeoutMs: 2 * 60_000,
    });
    if (result.failed || result.exitCode !== 0 || !isRecord(result.result)) {
      return null;
    }
    if (
      result.result.schemaVersion !== 'workspai.proof-carrying-change-list.v1' ||
      !Array.isArray(result.result.changes)
    ) {
      throw new Error('Workspai CLI returned an incompatible Proof-Carrying Change list.');
    }
    const matching = result.result.changes.find(
      (candidate) =>
        isRecord(candidate) &&
        candidate.goalId === this.input.goalId &&
        candidate.valid === true &&
        !['sealed', 'aborted', 'invalid'].includes(String(candidate.status)) &&
        typeof candidate.changeId === 'string' &&
        typeof candidate.state === 'string'
    ) as Record<string, unknown> | undefined;
    return matching ? { changeId: String(matching.changeId), state: String(matching.state) } : null;
  }

  async authorize(
    requiredEffects: StudioProofCarryingChangeEffectClass[],
    grantedBy = this.input.actorId
  ): Promise<StudioProofCarryingChangeOperation> {
    const allowed = new Set<StudioProofCarryingChangeEffectClass>(
      this.input.allowedEffects ?? [
        'filesystem',
        'command',
        'configuration',
        'dependency',
        'external',
      ]
    );
    const unauthorized = requiredEffects.filter((effect) => !allowed.has(effect));
    if (unauthorized.length > 0) {
      throw new Error(
        `This Studio session has no PCC authorization for: ${unauthorized.join(', ')}.`
      );
    }
    if (this.changeId) {
      const missing = requiredEffects.filter((effect) => !this.authorizedEffects.has(effect));
      if (missing.length > 0) {
        throw new Error(
          `The active Proof-Carrying Change was not authorized for: ${missing.join(', ')}.`
        );
      }
      return this.status();
    }
    const grant: StudioProofCarryingChangeEffectClass[] = [...allowed].sort();
    const resumable = await this.discoverResumableChange();
    if (resumable) {
      this.changeId = resumable.changeId;
      if (resumable.state === 'blocked' || resumable.state === 'awaiting-human') {
        if (!this.input.requestResume) {
          throw new Error(
            `Proof-Carrying Change ${resumable.changeId} is ${resumable.state} and requires an explicit human resume decision.`
          );
        }
        const decision = await this.input.requestResume({
          changeId: resumable.changeId,
          state: resumable.state,
        });
        if (!decision.approved) {
          throw new Error(
            `Human resume was declined for Proof-Carrying Change ${resumable.changeId}.`
          );
        }
        const resumed = await this.operation(
          [
            'change',
            'resume',
            '--change',
            resumable.changeId,
            '--to',
            'authorized',
            '--reason',
            decision.reason?.trim() ||
              'User approved resuming the governed Studio change after reviewing the blocked state.',
            '--actor',
            decision.approvedBy,
          ],
          'Resume Proof-Carrying Change'
        );
        this.authorizedEffects = new Set(grant);
        return resumed;
      }
      if (resumable.state === 'authorized' || resumable.state === 'executing') {
        this.authorizedEffects = new Set(grant);
        return this.status();
      }
      if (resumable.state !== 'evidence-ready') {
        throw new Error(
          `Proof-Carrying Change ${resumable.changeId} cannot accept new effects from state ${resumable.state}.`
        );
      }
    } else {
      const begun = await this.operation(
        ['change', 'begin', '--goal', this.input.goalId],
        'Begin Proof-Carrying Change'
      );
      this.changeId = begun.changeId;
    }
    const authorized = await this.operation(
      [
        'change',
        'authorize',
        '--change',
        this.changeId,
        '--effects',
        grant.join(','),
        '--granted-by',
        grantedBy,
      ],
      'Authorize Proof-Carrying Change'
    );
    this.authorizedEffects = new Set(grant);
    return authorized;
  }

  async status(): Promise<StudioProofCarryingChangeOperation> {
    if (!this.changeId) {
      throw new Error('No Proof-Carrying Change is active for this Studio session.');
    }
    return this.operation(
      ['change', 'status', '--change', this.changeId],
      'Inspect Proof-Carrying Change'
    );
  }

  async recordRepairEffect(input: {
    result: WorkspaceRepairCliExecutionResult;
    projectPath?: string;
    effectClass?: StudioProofCarryingChangeEffectClass;
    command?: string[];
  }): Promise<StudioProofCarryingChangeOperation> {
    const effectClass = input.effectClass ?? 'filesystem';
    await this.authorize([effectClass]);
    if (
      input.result.fileChanges.length === 0 ||
      input.result.transaction.state === 'rolled-back' ||
      input.result.transaction.state === 'cancelled'
    ) {
      return this.status();
    }
    const changeId = this.changeId!;
    const source = await sourceArtifacts({
      workspacePath: this.input.workspacePath,
      projectPath: input.projectPath,
      fileChanges: input.result.fileChanges,
    });
    const successful =
      input.result.transaction.state === 'closed' &&
      input.result.transaction.verification?.status === 'passed';
    const summary = [
      successful
        ? `CLI Repair ${input.result.transaction.transactionId} completed with verified effects.`
        : `CLI Repair ${input.result.transaction.transactionId} did not close with passing verification.`,
      source.deleted.length > 0
        ? `Deleted artifacts require post-effect Graph coverage: ${source.deleted.join(', ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
    const observedAt = new Date().toISOString();
    const receipt = {
      id: `effect-${crypto.randomUUID()}`,
      effectClass,
      status: successful ? ('succeeded' as const) : ('failed' as const),
      summary,
      ...(input.command ? { command: input.command } : {}),
      artifacts: source.artifacts,
      ...(source.deleted.length > 0
        ? {
            deletedArtifacts: source.deleted.map((artifact) => ({
              artifact,
              observedAt,
            })),
          }
        : {}),
      observedAt,
      idempotencyKey: `vscode-repair:${input.result.transaction.transactionId}:${effectClass}`,
    };
    return withJsonInput(receipt, (file) =>
      this.operation(
        ['change', 'effect', 'record', '--change', changeId, '--file', file],
        'Record Proof-Carrying Change effect'
      )
    );
  }

  async recordCommandEffect(input: {
    transactionId: string;
    projectPath?: string;
    command: string[];
    changedPaths: string[];
    succeeded: boolean;
    effectClass?: StudioProofCarryingChangeEffectClass;
    summary: string;
  }): Promise<StudioProofCarryingChangeOperation> {
    const effectClass = input.effectClass ?? 'command';
    await this.authorize([effectClass]);
    const fileChanges = await Promise.all(
      input.changedPaths.map(async (relativePath) => {
        const identity = await resolveStudioProofArtifactIdentity({
          workspacePath: this.input.workspacePath,
          projectPath: input.projectPath,
          relativePath,
        });
        const exists = await fs.pathExists(identity.absolutePath);
        return {
          relativePath,
          status: exists ? ('modified' as const) : ('deleted' as const),
          afterHash: exists
            ? crypto
                .createHash('sha256')
                .update(await fs.readFile(identity.absolutePath))
                .digest('hex')
            : null,
        };
      })
    );
    const source = await sourceArtifacts({
      workspacePath: this.input.workspacePath,
      projectPath: input.projectPath,
      fileChanges,
    });
    const observedAt = new Date().toISOString();
    const receipt = {
      id: `effect-${crypto.randomUUID()}`,
      effectClass,
      status: input.succeeded ? ('succeeded' as const) : ('failed' as const),
      summary: [
        input.summary,
        source.deleted.length > 0
          ? `Deleted artifacts require post-effect Graph coverage: ${source.deleted.join(', ')}.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      command: input.command,
      artifacts: source.artifacts,
      ...(source.deleted.length > 0
        ? {
            deletedArtifacts: source.deleted.map((artifact) => ({
              artifact,
              observedAt,
            })),
          }
        : {}),
      observedAt,
      idempotencyKey: `vscode-command:${input.transactionId}:${effectClass}`,
    };
    return withJsonInput(receipt, (file) =>
      this.operation(
        ['change', 'effect', 'record', '--change', this.changeId!, '--file', file],
        'Record Proof-Carrying Change command effect'
      )
    );
  }

  async verifyIfStarted(strict = true): Promise<StudioProofCarryingChangeOperation | null> {
    if (!this.changeId) {
      return null;
    }
    return this.operation(
      ['change', 'verify', '--change', this.changeId, ...(strict ? ['--strict'] : [])],
      'Verify Proof-Carrying Change'
    );
  }
}
