import path from 'node:path';

import fs from 'fs-extra';

import type { StreamingRunResult } from './streamingRapidkitRunner.js';

export type ProofCarryingChangeStatus =
  | 'open'
  | 'blocked'
  | 'verified'
  | 'sealed'
  | 'aborted'
  | 'invalid';

export type ProofCarryingChangeListEntry = {
  changeId: string;
  goalId: string | null;
  state: string | null;
  status: ProofCarryingChangeStatus;
  createdAt: string | null;
  updatedAt: string | null;
  scope: { kind: string; values: string[] } | null;
  assurance: { passed: number; total: number };
  blockers: string[];
  capsuleArtifact: string;
  valid: boolean;
  errors: string[];
};

export type ProofCarryingChangeAssurance = {
  id:
    | 'intent-bound'
    | 'baseline-pinned'
    | 'effects-receipted'
    | 'architecture-reobserved'
    | 'independently-verified';
  status: 'passed' | 'failed' | 'pending';
  summary: string;
};

export type ProofCarryingChangeGraphOperation = {
  operation: string;
  targetKind: string;
  targetId: string;
};

export type ProofCarryingChangeGraphProjection = {
  prediction: {
    risk: 'none' | 'low' | 'medium' | 'high';
    operations: ProofCarryingChangeGraphOperation[];
  } | null;
  actual: {
    risk: 'none' | 'low' | 'medium' | 'high';
    impactedEntityIds: string[];
    changedArtifactCount: number;
  } | null;
  surprise: {
    verdict: 'exact' | 'within-expectation' | 'surprising' | 'no-prediction';
    matched: ProofCarryingChangeGraphOperation[];
    unpredicted: ProofCarryingChangeGraphOperation[];
    missing: ProofCarryingChangeGraphOperation[];
  } | null;
};

export type ProofCarryingChangeDetail = {
  changeId: string;
  goalId: string;
  state: string;
  status: Exclude<ProofCarryingChangeStatus, 'invalid'>;
  generatedAt: string;
  assurances: ProofCarryingChangeAssurance[];
  remainingUncertainty: string[];
  deletedArtifacts: Array<{
    artifact: string;
    observedAt: string;
    digest: string;
  }>;
  graphChange: ProofCarryingChangeGraphProjection;
  nextActions: string[];
  artifactPath: string;
  artifacts: {
    capsule: string;
    lease: string | null;
    prediction: string | null;
    actualOverlay: string | null;
    surpriseReport: string | null;
    transaction: string | null;
    events: string | null;
  };
};

export type ProofCarryingChangeProjection = {
  schemaVersion: 'workspai.extension-proof-carrying-change-projection.v1';
  availability: 'available' | 'unsupported' | 'unavailable';
  generatedAt: string;
  workspaceName: string | null;
  summary: {
    total: number;
    open: number;
    blocked: number;
    sealed: number;
    aborted: number;
    invalid: number;
  };
  changes: ProofCarryingChangeListEntry[];
  selected: ProofCarryingChangeDetail | null;
  diagnostics: string[];
};

type Runner = <T = unknown>(options: {
  command: string[];
  cwd: string;
  featureLabel?: string;
  timeoutMs?: number;
}) => Promise<StreamingRunResult<T>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

const CHANGE_STATUSES = new Set<ProofCarryingChangeStatus>([
  'open',
  'blocked',
  'verified',
  'sealed',
  'aborted',
  'invalid',
]);

function isChangeListEntry(value: unknown): value is ProofCarryingChangeListEntry {
  if (!isRecord(value) || !/^change-[a-z0-9][a-z0-9-]{7,95}$/.test(String(value.changeId))) {
    return false;
  }
  const assurance = value.assurance;
  const scope = value.scope;
  return (
    (typeof value.goalId === 'string' || value.goalId === null) &&
    (typeof value.state === 'string' || value.state === null) &&
    CHANGE_STATUSES.has(value.status as ProofCarryingChangeStatus) &&
    (isIsoDate(value.createdAt) || value.createdAt === null) &&
    (isIsoDate(value.updatedAt) || value.updatedAt === null) &&
    (scope === null ||
      (isRecord(scope) &&
        typeof scope.kind === 'string' &&
        Array.isArray(scope.values) &&
        scope.values.every((entry) => typeof entry === 'string'))) &&
    isRecord(assurance) &&
    isCount(assurance.passed) &&
    isCount(assurance.total) &&
    Array.isArray(value.blockers) &&
    value.blockers.every((entry) => typeof entry === 'string') &&
    typeof value.capsuleArtifact === 'string' &&
    typeof value.valid === 'boolean' &&
    Array.isArray(value.errors) &&
    value.errors.every((entry) => typeof entry === 'string')
  );
}

type ChangeListPayload = {
  generatedAt: string;
  workspace: { name: string };
  changes: ProofCarryingChangeListEntry[];
  summary: ProofCarryingChangeProjection['summary'];
};

function parseChangeList(value: unknown): ChangeListPayload | null {
  if (!isRecord(value) || value.schemaVersion !== 'workspai.proof-carrying-change-list.v1') {
    return null;
  }
  if (!isIsoDate(value.generatedAt) || !isRecord(value.workspace)) {
    return null;
  }
  if (typeof value.workspace.name !== 'string' || !Array.isArray(value.changes)) {
    return null;
  }
  if (!value.changes.every(isChangeListEntry) || !isRecord(value.summary)) {
    return null;
  }
  const summary = value.summary;
  if (
    ![
      summary.total,
      summary.open,
      summary.blocked,
      summary.sealed,
      summary.aborted,
      summary.invalid,
    ].every(isCount)
  ) {
    return null;
  }
  return {
    generatedAt: value.generatedAt,
    workspace: { name: value.workspace.name },
    changes: value.changes,
    summary: {
      total: summary.total as number,
      open: summary.open as number,
      blocked: summary.blocked as number,
      sealed: summary.sealed as number,
      aborted: summary.aborted as number,
      invalid: summary.invalid as number,
    },
  };
}

function isAssurance(value: unknown): value is ProofCarryingChangeAssurance {
  if (!isRecord(value)) {
    return false;
  }
  return (
    [
      'intent-bound',
      'baseline-pinned',
      'effects-receipted',
      'architecture-reobserved',
      'independently-verified',
    ].includes(String(value.id)) &&
    ['passed', 'failed', 'pending'].includes(String(value.status)) &&
    typeof value.summary === 'string'
  );
}

function deletedArtifactProjection(value: unknown): {
  artifact: string;
  observedAt: string;
  digest: string;
} | null {
  if (!isRecord(value) || !isRecord(value.digest)) {
    return null;
  }
  if (
    typeof value.artifact !== 'string' ||
    !value.artifact.trim() ||
    !isIsoDate(value.observedAt) ||
    value.digest.algorithm !== 'sha256' ||
    value.digest.semantics !== 'deletion-tombstone-v1' ||
    !/^[a-f0-9]{64}$/i.test(String(value.digest.value))
  ) {
    return null;
  }
  return {
    artifact: value.artifact,
    observedAt: value.observedAt,
    digest: String(value.digest.value),
  };
}

function graphOperations(value: unknown): ProofCarryingChangeGraphOperation[] | null {
  if (!Array.isArray(value) || value.length > 2_000) {
    return null;
  }
  const operations = value.map((entry) => {
    if (
      !isRecord(entry) ||
      !['add', 'remove', 'change'].includes(String(entry.operation)) ||
      !['entity', 'relation', 'proof', 'artifact'].includes(String(entry.targetKind)) ||
      typeof entry.targetId !== 'string' ||
      !entry.targetId.trim()
    ) {
      return null;
    }
    return {
      operation: entry.operation,
      targetKind: entry.targetKind,
      targetId: entry.targetId,
    };
  });
  return operations.some((entry) => entry === null)
    ? null
    : (operations as ProofCarryingChangeGraphOperation[]);
}

function risk(value: unknown): 'none' | 'low' | 'medium' | 'high' | null {
  return ['none', 'low', 'medium', 'high'].includes(String(value))
    ? (value as 'none' | 'low' | 'medium' | 'high')
    : null;
}

async function readContainedJson(workspacePath: string, artifact: string | null): Promise<unknown> {
  if (!artifact || path.isAbsolute(artifact)) {
    return null;
  }
  const lexicalRoot = path.resolve(workspacePath);
  const lexicalCandidate = path.resolve(lexicalRoot, artifact);
  const lexicalRelative = path.relative(lexicalRoot, lexicalCandidate);
  if (lexicalRelative.startsWith('..') || path.isAbsolute(lexicalRelative)) {
    return null;
  }
  try {
    const [root, candidate] = await Promise.all([
      fs.realpath(lexicalRoot),
      fs.realpath(lexicalCandidate),
    ]);
    const relative = path.relative(root, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }
    const stat = await fs.stat(candidate);
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) {
      return null;
    }
    return await fs.readJson(candidate);
  } catch {
    return null;
  }
}

async function loadGraphChangeProjection(
  workspacePath: string,
  changeId: string,
  artifacts: ProofCarryingChangeDetail['artifacts']
): Promise<ProofCarryingChangeGraphProjection> {
  const [predictionValue, actualValue, surpriseValue] = await Promise.all([
    readContainedJson(workspacePath, artifacts.prediction),
    readContainedJson(workspacePath, artifacts.actualOverlay),
    readContainedJson(workspacePath, artifacts.surpriseReport),
  ]);
  const validPrediction =
    isRecord(predictionValue) &&
    predictionValue.schemaVersion === 'workspai.predicted-architecture-change.v1' &&
    predictionValue.changeId === changeId &&
    predictionValue.nonCanonical === true &&
    predictionValue.proofEligible === false;
  const predictionOperations = validPrediction ? graphOperations(predictionValue.operations) : null;
  const predictionRisk = validPrediction ? risk(predictionValue.predictedRisk) : null;
  const validActual =
    isRecord(actualValue) &&
    actualValue.schemaVersion === 'workspace-knowledge-graph-change-overlay.v1';
  const actualSummary = validActual && isRecord(actualValue.summary) ? actualValue.summary : null;
  const actualRisk = actualSummary ? risk(actualSummary.risk) : null;
  const impactedEntityIds =
    validActual &&
    Array.isArray(actualValue.impactedEntityIds) &&
    actualValue.impactedEntityIds.length <= 2_000 &&
    actualValue.impactedEntityIds.every(
      (entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())
    )
      ? actualValue.impactedEntityIds
      : null;
  const validSurprise =
    isRecord(surpriseValue) &&
    surpriseValue.schemaVersion === 'workspai.architecture-surprise-report.v1' &&
    surpriseValue.changeId === changeId;
  const surpriseSummary =
    validSurprise && isRecord(surpriseValue.summary) ? surpriseValue.summary : null;
  const verdict = surpriseSummary?.verdict;
  const matched = validSurprise ? graphOperations(surpriseValue.matched) : null;
  const unpredicted = validSurprise ? graphOperations(surpriseValue.unpredicted) : null;
  const missing = validSurprise ? graphOperations(surpriseValue.missing) : null;
  return {
    prediction:
      predictionOperations && predictionRisk
        ? { risk: predictionRisk, operations: predictionOperations }
        : null,
    actual:
      impactedEntityIds && actualRisk && actualSummary && isCount(actualSummary.changedArtifacts)
        ? {
            risk: actualRisk,
            impactedEntityIds: [...new Set(impactedEntityIds)].slice(0, 2_000),
            changedArtifactCount: actualSummary.changedArtifacts as number,
          }
        : null,
    surprise:
      ['exact', 'within-expectation', 'surprising', 'no-prediction'].includes(String(verdict)) &&
      matched &&
      unpredicted &&
      missing
        ? {
            verdict: verdict as ProofCarryingChangeGraphProjection['surprise'] extends infer T
              ? T extends { verdict: infer V }
                ? V
                : never
              : never,
            matched,
            unpredicted,
            missing,
          }
        : null,
  };
}

function parseChangeDetail(value: unknown): ProofCarryingChangeDetail | null {
  if (!isRecord(value) || value.schemaVersion !== 'workspai.change-operation-result.v1') {
    return null;
  }
  const capsule = value.capsule;
  const artifacts = value.artifacts;
  if (!isRecord(capsule) || !isRecord(artifacts) || !Array.isArray(value.nextActions)) {
    return null;
  }
  if (
    capsule.schemaVersion !== 'workspai.proof-carrying-change-capsule.v1' ||
    typeof value.changeId !== 'string' ||
    capsule.changeId !== value.changeId ||
    typeof value.state !== 'string' ||
    typeof capsule.goalId !== 'string' ||
    !isIsoDate(capsule.generatedAt) ||
    !CHANGE_STATUSES.has(capsule.status as ProofCarryingChangeStatus) ||
    capsule.status === 'invalid' ||
    !Array.isArray(capsule.assurances) ||
    capsule.assurances.length !== 5 ||
    !capsule.assurances.every(isAssurance) ||
    !Array.isArray(capsule.remainingUncertainty) ||
    !capsule.remainingUncertainty.every((entry) => typeof entry === 'string') ||
    !value.nextActions.every((entry) => typeof entry === 'string') ||
    typeof artifacts.capsule !== 'string'
  ) {
    return null;
  }
  const deletedArtifacts = capsule.deletedArtifacts ?? [];
  if (!Array.isArray(deletedArtifacts)) {
    return null;
  }
  const projectedDeletedArtifacts = deletedArtifacts.map(deletedArtifactProjection);
  if (projectedDeletedArtifacts.some((entry) => entry === null)) {
    return null;
  }
  const artifact = (key: string): string | null =>
    typeof artifacts[key] === 'string' && String(artifacts[key]).trim()
      ? String(artifacts[key])
      : null;
  return {
    changeId: value.changeId,
    goalId: capsule.goalId,
    state: value.state,
    status: capsule.status as ProofCarryingChangeDetail['status'],
    generatedAt: capsule.generatedAt,
    assurances: capsule.assurances,
    remainingUncertainty: capsule.remainingUncertainty,
    deletedArtifacts: projectedDeletedArtifacts as ProofCarryingChangeDetail['deletedArtifacts'],
    graphChange: { prediction: null, actual: null, surprise: null },
    nextActions: value.nextActions,
    artifactPath: artifacts.capsule,
    artifacts: {
      capsule: artifacts.capsule,
      lease: artifact('lease'),
      prediction: artifact('prediction'),
      actualOverlay: artifact('actualOverlay'),
      surpriseReport: artifact('surpriseReport'),
      transaction: artifact('transaction'),
      events: artifact('events'),
    },
  };
}

function diagnosticFromRun(run: StreamingRunResult<unknown>, fallback: string): string {
  return run.stderr.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? fallback;
}

export async function loadProofCarryingChangeProjection(input: {
  workspacePath: string;
  run: Runner;
  selectedChangeId?: string;
}): Promise<ProofCarryingChangeProjection> {
  const listRun = await input.run<unknown>({
    command: ['change', 'list', '--json'],
    cwd: input.workspacePath,
    featureLabel: 'Proof-Carrying Changes',
    timeoutMs: 20_000,
  });
  if (listRun.failed) {
    const unavailableDetail = diagnosticFromRun(
      listRun,
      'Proof-Carrying Change discovery is currently unavailable.'
    );
    const unsupported = /unknown (?:command|option)|command.*not found|does not exist/i.test(
      unavailableDetail
    );
    return {
      schemaVersion: 'workspai.extension-proof-carrying-change-projection.v1',
      availability: unsupported ? 'unsupported' : 'unavailable',
      generatedAt: new Date().toISOString(),
      workspaceName: null,
      summary: { total: 0, open: 0, blocked: 0, sealed: 0, aborted: 0, invalid: 0 },
      changes: [],
      selected: null,
      diagnostics: unsupported ? [] : [unavailableDetail],
    };
  }
  const list = parseChangeList(listRun.result);
  if (!list) {
    return {
      schemaVersion: 'workspai.extension-proof-carrying-change-projection.v1',
      availability: 'unavailable',
      generatedAt: new Date().toISOString(),
      workspaceName: null,
      summary: { total: 0, open: 0, blocked: 0, sealed: 0, aborted: 0, invalid: 0 },
      changes: [],
      selected: null,
      diagnostics: ['Change list output does not match the published PCC v1 contract.'],
    };
  }

  const requested = input.selectedChangeId
    ? list.changes.find((entry) => entry.changeId === input.selectedChangeId)
    : list.changes[0];
  if (!requested || !requested.valid) {
    return {
      schemaVersion: 'workspai.extension-proof-carrying-change-projection.v1',
      availability: 'available',
      generatedAt: list.generatedAt,
      workspaceName: list.workspace.name,
      summary: list.summary,
      changes: list.changes,
      selected: null,
      diagnostics:
        requested && !requested.valid
          ? [`${requested.changeId} failed integrity validation and was not opened.`]
          : [],
    };
  }

  const statusRun = await input.run<unknown>({
    command: ['change', 'status', '--change', requested.changeId, '--json'],
    cwd: input.workspacePath,
    featureLabel: 'Proof-Carrying Change Assurance',
    timeoutMs: 20_000,
  });
  const parsedSelected = statusRun.failed ? null : parseChangeDetail(statusRun.result);
  const selected = parsedSelected
    ? {
        ...parsedSelected,
        graphChange: await loadGraphChangeProjection(
          input.workspacePath,
          parsedSelected.changeId,
          parsedSelected.artifacts
        ),
      }
    : null;
  const diagnostics = statusRun.failed
    ? [diagnosticFromRun(statusRun, `Could not inspect ${requested.changeId}.`)]
    : selected
      ? []
      : [`${requested.changeId} status does not match the published PCC v1 contract.`];
  return {
    schemaVersion: 'workspai.extension-proof-carrying-change-projection.v1',
    availability: 'available',
    generatedAt: list.generatedAt,
    workspaceName: list.workspace.name,
    summary: list.summary,
    changes: list.changes,
    selected,
    diagnostics,
  };
}
