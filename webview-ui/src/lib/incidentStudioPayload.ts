export type IncidentProjectSelection = {
  path: string;
  name?: string;
  type?: string;
};

export type IncidentActionRiskClass =
  | 'informational'
  | 'non-mutating-executable'
  | 'guarded-mutating'
  | 'high-risk-mutating';

export type IncidentActionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type IncidentActionExecutionMetadata = {
  riskClass: IncidentActionRiskClass;
  riskLevel: IncidentActionRiskLevel;
  requiresImpactReview: boolean;
  requiresVerifyPath: boolean;
  allowCompletionClaimWithoutVerify: boolean;
};

export type NormalizedIncidentProtocolMeta = {
  requestId: string | null;
  version: string | null;
};

export type IncidentPartialFailurePayload = {
  code: string;
  message: string;
  retryable: boolean;
};

export type IncidentVerifyPolicy = {
  requiresVerifyPath?: boolean;
  requiresImpactReview?: boolean;
  allowCompletionClaimWithoutVerify?: boolean;
};

export type IncidentActionEvidence = {
  source?: string;
  healthScoreText?: string;
  generatedAt?: string;
  passed?: number;
  warnings?: number;
  errors?: number;
};

export type IncidentDiagnosisEvidence = {
  confidence: number;
  confidenceBand: 'low' | 'medium' | 'high';
  signalSources: string[];
  relatedFiles: string[];
  recommendedFocus?: string;
};

export type IncidentRollbackEvidence = {
  attempted: boolean;
  status: 'succeeded' | 'failed' | 'partial' | 'skipped' | 'unavailable';
  reason?: string;
  attemptedAt?: string;
  candidateFiles: string[];
  restoredFiles: string[];
  failedFiles: string[];
  suggestedNextStep?: string;
};

export type IncidentSandboxSimulationCommandEvidence = {
  label: string;
  command: string;
  args: string[];
  exitCode: number;
  stdout?: string;
  stderr?: string;
  durationMs: number;
};

export type IncidentSandboxSimulationEvidence = {
  actionId: string;
  workspacePath: string;
  riskClass: IncidentActionRiskClass;
  mode: 'verify-pack-simulation' | 'disposable-sandbox';
  status: 'passed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  durationMs: number;
  commandResults: IncidentSandboxSimulationCommandEvidence[];
  recommendedRollbackPath?: string;
  safeToApply: boolean;
  reason?: string;
};

export type IncidentReproPackEvidence = {
  packId: string;
  status: 'captured' | 'failed' | 'skipped';
  capturedAt: string;
  schemaVersion: 'v1';
  workspacePath: string;
  conversationId: string;
  actionId: string;
  redaction: {
    policy: string;
    applied: boolean;
    redactedFields: string[];
  };
  summary: {
    historyTurns: number;
    hasDoctorEvidence: boolean;
    hasRollbackEvidence: boolean;
    hasSandboxEvidence: boolean;
    hasPredictiveWarning: boolean;
    verifySuccess: boolean;
    affectedFilesCount: number;
    blockedReasonCount: number;
  };
  replayPayload: {
    workspacePath: string;
    conversationId: string;
    actionType: string;
    riskLevel: IncidentActionRiskLevel;
    likelyFailureMode?: string;
    verifyChecklist: string[];
    blockedReasons: string[];
    relatedFiles: string[];
  };
  exportHint?: string;
};

// ─── Multi-file patch apply/reject workflow (A02 / A03) ─────────────────────

export type FilePatchStatus = 'pending' | 'accepted' | 'rejected' | 'applied' | 'failed';

export type FilePatchHunk = {
  startLine: number;
  removedLines: string[];
  addedLines: string[];
};

export type FilePatch = {
  relativePath: string;
  language?: string;
  isNewFile: boolean;
  originalContent?: string;
  patchedContent: string;
  hunks: FilePatchHunk[];
  status: FilePatchStatus;
  failReason?: string;
};

export type MultiFilePatchResult = {
  patchId: string;
  generatedAt: string;
  actionId: string;
  branchCreated?: string;
  patches: FilePatch[];
  verificationPassed?: boolean;
  verificationNote?: string;
  appliedCount: number;
  rejectedCount: number;
  failedCount: number;
};

// ─────────────────────────────────────────────────────────────────────────────

export type NormalizedIncidentActionResultPayload = {
  success: boolean;
  outputSummary?: string;
  verificationRequired?: boolean;
  verifyPolicy?: IncidentVerifyPolicy;
  evidence?: IncidentActionEvidence;
  diagnosis?: IncidentDiagnosisEvidence;
  rollback?: IncidentRollbackEvidence;
  multiFilePatch?: MultiFilePatchResult;
  sandboxSimulation?: IncidentSandboxSimulationEvidence;
  incidentReproPack?: IncidentReproPackEvidence;
};

export type NormalizedIncidentActionProgressPayload = {
  stage: string;
  progress: number;
  note?: string;
};

export type NormalizedIncidentDonePayload = {
  modelId?: string;
  finalText?: string;
};

export type IncidentSystemGraphNodeType =
  | 'route'
  | 'controller'
  | 'service'
  | 'model'
  | 'datastore'
  | 'test'
  | 'unknown';

export type IncidentSystemGraphNode = {
  id: string;
  type: IncidentSystemGraphNodeType;
  label: string;
  filePath?: string;
  confidence: number;
  symbolName?: string;
  startLine?: number;
};

export type IncidentSystemGraphEdge = {
  sourceId: string;
  targetId: string;
  relation: string;
};

export type NormalizedIncidentSystemGraphSnapshotPayload = {
  requestId?: string;
  workspacePath: string;
  projectPath?: string;
  graphVersion: string;
  nodes: IncidentSystemGraphNode[];
  edges: IncidentSystemGraphEdge[];
  summary: {
    nodeCount: number;
    edgeCount: number;
    supportedTopology: string;
  };
};

export type NormalizedIncidentImpactAssessmentPayload = {
  requestId?: string;
  sources: string[];
  confidence: number;
  riskLevel: IncidentActionRiskLevel;
  affectedFiles: string[];
  affectedModules: string[];
  affectedTests: string[];
  likelyFailureMode?: string;
  rationale: string[];
  verifyChecklist: string[];
  blockMutationWhenScopeUnknown: boolean;
};

export type IncidentPredictiveConfidenceBand = 'low' | 'medium' | 'high';

export type NormalizedIncidentPredictiveWarningPayload = {
  requestId?: string;
  warningId: string;
  confidenceBand: IncidentPredictiveConfidenceBand;
  predictedFailure?: string;
  affectedScopeSummary?: string;
  nextSafeAction?: string;
  verifyChecklist: string[];
  telemetrySeed: {
    predictionKey: string;
    evidenceSources: string[];
  };
};

export type NormalizedIncidentReleaseGateEvidencePayload = {
  requestId?: string;
  scopeKnown: boolean;
  verifyPathPresent: boolean;
  rollbackPathPresent: boolean;
  confidenceSufficient: boolean;
  blockedReasons: string[];
};

export type IncidentWorkspaceGraphSnapshot = {
  snapshotVersion: string;
  workspace: {
    path?: string;
    name?: string;
  };
  project: {
    framework: string;
    kit: string;
    selectedProject: {
      path: string;
      name?: string;
      type?: string;
    } | null;
  };
  topology: {
    modulesCount: number;
    topModules: string[];
  };
  doctor: {
    hasEvidence: boolean;
    generatedAt?: string;
    health?: {
      passed: number;
      warnings: number;
      errors: number;
      total: number;
      percent: number;
    };
  };
  git: {
    diffStat: string;
    hasDiffContext: boolean;
  };
  memory: {
    context?: string;
    conventionsCount: number;
    decisionsCount: number;
    hasMemory: boolean;
  };
  telemetry: {
    totalEvents: number;
    lastCommand: string | null;
    onboardingFollowupClickThroughRate: number;
  };
  evidence: {
    hasDoctorEvidence: boolean;
    hasGitDiff: boolean;
    hasWorkspaceMemory: boolean;
    projectScoped: boolean;
  };
  completeness: 'fresh' | 'cached' | 'partial' | 'degraded';
  lastUpdatedAt: number;
};

export type NormalizedIncidentStudioOpen = {
  workspacePath: string;
  workspaceName: string;
  initialQuery?: string;
  projectSelection: IncidentProjectSelection | null;
};

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

const INCIDENT_SECRET_ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret|client[_-]?secret|authorization)\b\s*[:=]\s*(['"]?)([^\s'",;`]+)\2/gi;
const INCIDENT_AUTHORIZATION_ASSIGNMENT_PATTERN = /\bauthorization\b\s*[:=]\s*[^\n\r]+/gi;
const INCIDENT_BEARER_PATTERN = /(?:^|\s)Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const INCIDENT_TOKEN_LITERAL_PATTERN =
  /\b(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z\-_]{20,})\b/g;

function sanitizeIncidentText(value: unknown, maxLength: number): string | undefined {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return undefined;
  }

  const redacted = cleaned
    .replace(INCIDENT_AUTHORIZATION_ASSIGNMENT_PATTERN, 'authorization: [REDACTED]')
    .replace(INCIDENT_SECRET_ASSIGNMENT_PATTERN, (full, key: string, quote: string) => {
      const delimiter = full.includes(':') ? ':' : '=';
      const wrapped = quote ? `${quote}[REDACTED]${quote}` : '[REDACTED]';
      return `${key}${delimiter}${wrapped}`;
    })
    .replace(INCIDENT_BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(INCIDENT_TOKEN_LITERAL_PATTERN, '[REDACTED]');

  if (redacted.length <= maxLength) {
    return redacted;
  }

  return `${redacted.slice(0, maxLength)}\n...[TRUNCATED]`;
}

function sanitizeStringArray(value: unknown, maxLength: number, maxItems = 32): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique: string[] = [];
  for (const entry of value) {
    const sanitized = sanitizeIncidentText(entry, maxLength);
    if (!sanitized || unique.includes(sanitized)) {
      continue;
    }
    unique.push(sanitized);
    if (unique.length >= maxItems) {
      break;
    }
  }
  return unique;
}

function sanitizeStringList(value: unknown, maxLength: number, maxItems = 32): string[] {
  if (typeof value === 'string') {
    const single = sanitizeIncidentText(value, maxLength);
    return single ? [single] : [];
  }

  return sanitizeStringArray(value, maxLength, maxItems);
}

function normalizeIncidentRiskLevel(value: unknown): IncidentActionRiskLevel {
  const normalized = cleanText(value)?.toLowerCase();
  if (
    normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high' ||
    normalized === 'critical'
  ) {
    return normalized;
  }
  return 'medium';
}

function normalizeIncidentGraphNodeType(value: unknown): IncidentSystemGraphNodeType {
  const normalized = cleanText(value)?.toLowerCase();
  if (
    normalized === 'route' ||
    normalized === 'controller' ||
    normalized === 'service' ||
    normalized === 'model' ||
    normalized === 'datastore' ||
    normalized === 'test'
  ) {
    return normalized;
  }

  return 'unknown';
}

function normalizePredictiveConfidenceBand(value: unknown): IncidentPredictiveConfidenceBand {
  const normalized = cleanText(value)?.toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }

  return 'medium';
}

export function normalizeIncidentProtocolMeta(meta: unknown): NormalizedIncidentProtocolMeta {
  const record = asRecord(meta);
  return {
    requestId: cleanText(record.requestId) || null,
    version: cleanText(record.version) || null,
  };
}

export function isIncidentDuplicateRequest(
  lastProcessedRequestId: string | null | undefined,
  nextRequestId: string | null | undefined
): boolean {
  if (!lastProcessedRequestId || !nextRequestId) {
    return false;
  }
  return lastProcessedRequestId === nextRequestId;
}

export function normalizeIncidentPartialFailurePayload(
  value: unknown
): IncidentPartialFailurePayload {
  const record = asRecord(value);
  const code = cleanText(record.code) || 'PARTIAL_FAILURE';
  const message =
    sanitizeIncidentText(record.message, 1200) ||
    'Incident Studio request completed with partial failure.';
  const retryable = typeof record.retryable === 'boolean' ? record.retryable : true;

  return {
    code,
    message,
    retryable,
  };
}

export function normalizeIncidentActionResultPayload(
  value: unknown
): NormalizedIncidentActionResultPayload {
  const record = asRecord(value);
  const verifyPolicyRecord = asRecord(record.verifyPolicy);
  const evidenceRecord = asRecord(record.evidence);
  const diagnosisRecord = asRecord(record.diagnosis);
  const rollbackRecord = asRecord(record.rollback);
  const sandboxRecord = asRecord(record.sandboxSimulation);
  const reproPackRecord = asRecord(record.incidentReproPack);

  const verifyPolicy: IncidentVerifyPolicy = {
    requiresVerifyPath: asOptionalBoolean(verifyPolicyRecord.requiresVerifyPath),
    requiresImpactReview: asOptionalBoolean(verifyPolicyRecord.requiresImpactReview),
    allowCompletionClaimWithoutVerify: asOptionalBoolean(
      verifyPolicyRecord.allowCompletionClaimWithoutVerify
    ),
  };

  const hasVerifyPolicyField =
    typeof verifyPolicy.requiresVerifyPath === 'boolean' ||
    typeof verifyPolicy.requiresImpactReview === 'boolean' ||
    typeof verifyPolicy.allowCompletionClaimWithoutVerify === 'boolean';

  const evidence: IncidentActionEvidence = {
    source: sanitizeIncidentText(evidenceRecord.source, 120),
    healthScoreText: sanitizeIncidentText(evidenceRecord.healthScoreText, 160),
    generatedAt: cleanText(evidenceRecord.generatedAt),
    passed: asOptionalNumber(evidenceRecord.passed),
    warnings: asOptionalNumber(evidenceRecord.warnings),
    errors: asOptionalNumber(evidenceRecord.errors),
  };

  const hasEvidenceField =
    typeof evidence.source === 'string' ||
    typeof evidence.healthScoreText === 'string' ||
    typeof evidence.generatedAt === 'string' ||
    typeof evidence.passed === 'number' ||
    typeof evidence.warnings === 'number' ||
    typeof evidence.errors === 'number';

  const diagnosisConfidence = clampNumber(asNumber(diagnosisRecord.confidence, 0), 0, 100);
  const diagnosisBand = cleanText(diagnosisRecord.confidenceBand)?.toLowerCase();
  const diagnosis: IncidentDiagnosisEvidence = {
    confidence: diagnosisConfidence,
    confidenceBand:
      diagnosisBand === 'low' || diagnosisBand === 'medium' || diagnosisBand === 'high'
        ? diagnosisBand
        : diagnosisConfidence >= 75
          ? 'high'
          : diagnosisConfidence >= 50
            ? 'medium'
            : 'low',
    signalSources: sanitizeStringArray(diagnosisRecord.signalSources, 80, 10),
    relatedFiles: sanitizeStringArray(diagnosisRecord.relatedFiles, 240, 12),
    recommendedFocus: sanitizeIncidentText(diagnosisRecord.recommendedFocus, 320),
  };

  const hasDiagnosisField =
    Array.isArray(diagnosisRecord.signalSources) ||
    Array.isArray(diagnosisRecord.relatedFiles) ||
    typeof diagnosisRecord.confidence === 'number' ||
    typeof diagnosisRecord.confidenceBand === 'string' ||
    typeof diagnosisRecord.recommendedFocus === 'string';

  const rollbackStatus = cleanText(rollbackRecord.status);
  const rollback: IncidentRollbackEvidence = {
    attempted: asBoolean(rollbackRecord.attempted, false),
    status:
      rollbackStatus === 'succeeded' ||
      rollbackStatus === 'failed' ||
      rollbackStatus === 'partial' ||
      rollbackStatus === 'skipped' ||
      rollbackStatus === 'unavailable'
        ? rollbackStatus
        : 'unavailable',
    reason: sanitizeIncidentText(rollbackRecord.reason, 320),
    attemptedAt: cleanText(rollbackRecord.attemptedAt),
    candidateFiles: sanitizeStringArray(rollbackRecord.candidateFiles, 240, 32),
    restoredFiles: sanitizeStringArray(rollbackRecord.restoredFiles, 240, 32),
    failedFiles: sanitizeStringArray(rollbackRecord.failedFiles, 240, 32),
    suggestedNextStep: sanitizeIncidentText(rollbackRecord.suggestedNextStep, 280),
  };

  const hasRollbackField =
    rollback.attempted ||
    rollback.candidateFiles.length > 0 ||
    rollback.restoredFiles.length > 0 ||
    rollback.failedFiles.length > 0 ||
    typeof rollback.reason === 'string' ||
    typeof rollback.suggestedNextStep === 'string' ||
    typeof rollback.attemptedAt === 'string';

  const sandboxRiskClass = cleanText(sandboxRecord.riskClass)?.toLowerCase();
  const sandboxStatus = cleanText(sandboxRecord.status)?.toLowerCase();
  const sandboxMode = cleanText(sandboxRecord.mode)?.toLowerCase();
  const sandboxCommands = Array.isArray(sandboxRecord.commandResults)
    ? sandboxRecord.commandResults
        .map((entry): IncidentSandboxSimulationCommandEvidence | null => {
          const commandRecord = asRecord(entry);
          const command = cleanText(commandRecord.command);
          if (!command) {
            return null;
          }

          return {
            label: sanitizeIncidentText(commandRecord.label, 120) || command,
            command,
            args: sanitizeStringArray(commandRecord.args, 120, 20),
            exitCode: asNumber(commandRecord.exitCode, 1),
            stdout: sanitizeIncidentText(commandRecord.stdout, 600),
            stderr: sanitizeIncidentText(commandRecord.stderr, 600),
            durationMs: Math.max(0, asNumber(commandRecord.durationMs, 0)),
          };
        })
        .filter((entry): entry is IncidentSandboxSimulationCommandEvidence => entry !== null)
    : [];

  const sandboxSimulation: IncidentSandboxSimulationEvidence = {
    actionId: cleanText(sandboxRecord.actionId) || cleanText(record.actionId) || 'unknown-action',
    workspacePath: cleanText(sandboxRecord.workspacePath) || '',
    riskClass:
      sandboxRiskClass === 'informational' ||
      sandboxRiskClass === 'non-mutating-executable' ||
      sandboxRiskClass === 'guarded-mutating' ||
      sandboxRiskClass === 'high-risk-mutating'
        ? sandboxRiskClass
        : 'guarded-mutating',
    mode:
      sandboxMode === 'verify-pack-simulation' || sandboxMode === 'disposable-sandbox'
        ? sandboxMode
        : 'verify-pack-simulation',
    status:
      sandboxStatus === 'passed' || sandboxStatus === 'failed' || sandboxStatus === 'skipped'
        ? sandboxStatus
        : 'skipped',
    startedAt: cleanText(sandboxRecord.startedAt),
    completedAt: cleanText(sandboxRecord.completedAt),
    durationMs: Math.max(0, asNumber(sandboxRecord.durationMs, 0)),
    commandResults: sandboxCommands,
    recommendedRollbackPath: sanitizeIncidentText(sandboxRecord.recommendedRollbackPath, 320),
    safeToApply: asBoolean(sandboxRecord.safeToApply, false),
    reason: sanitizeIncidentText(sandboxRecord.reason, 320),
  };

  const hasSandboxField =
    typeof sandboxRecord.actionId === 'string' ||
    typeof sandboxRecord.workspacePath === 'string' ||
    sandboxCommands.length > 0 ||
    typeof sandboxSimulation.reason === 'string' ||
    typeof sandboxSimulation.recommendedRollbackPath === 'string';

  const reproStatus = cleanText(reproPackRecord.status)?.toLowerCase();
  const replayPayloadRecord = asRecord(reproPackRecord.replayPayload);
  const redactionRecord = asRecord(reproPackRecord.redaction);
  const incidentReproPack: IncidentReproPackEvidence = {
    packId:
      cleanText(reproPackRecord.packId) ||
      `repro-${cleanText(record.actionId) || Date.now().toString(36)}`,
    status:
      reproStatus === 'captured' || reproStatus === 'failed' || reproStatus === 'skipped'
        ? reproStatus
        : 'captured',
    capturedAt: cleanText(reproPackRecord.capturedAt) || new Date().toISOString(),
    schemaVersion: 'v1',
    workspacePath: cleanText(reproPackRecord.workspacePath) || '',
    conversationId: cleanText(reproPackRecord.conversationId) || '',
    actionId: cleanText(reproPackRecord.actionId) || cleanText(record.actionId) || 'unknown-action',
    redaction: {
      policy: sanitizeIncidentText(redactionRecord.policy, 120) || 'incident-studio-default',
      applied: asBoolean(redactionRecord.applied, true),
      redactedFields: sanitizeStringArray(redactionRecord.redactedFields, 120, 16),
    },
    summary: {
      historyTurns: Math.max(
        0,
        Math.floor(asNumber(asRecord(reproPackRecord.summary).historyTurns, 0))
      ),
      hasDoctorEvidence: asBoolean(asRecord(reproPackRecord.summary).hasDoctorEvidence, false),
      hasRollbackEvidence: asBoolean(asRecord(reproPackRecord.summary).hasRollbackEvidence, false),
      hasSandboxEvidence: asBoolean(asRecord(reproPackRecord.summary).hasSandboxEvidence, false),
      hasPredictiveWarning: asBoolean(
        asRecord(reproPackRecord.summary).hasPredictiveWarning,
        false
      ),
      verifySuccess: asBoolean(asRecord(reproPackRecord.summary).verifySuccess, false),
      affectedFilesCount: Math.max(
        0,
        Math.floor(asNumber(asRecord(reproPackRecord.summary).affectedFilesCount, 0))
      ),
      blockedReasonCount: Math.max(
        0,
        Math.floor(asNumber(asRecord(reproPackRecord.summary).blockedReasonCount, 0))
      ),
    },
    replayPayload: {
      workspacePath: cleanText(replayPayloadRecord.workspacePath) || '',
      conversationId: cleanText(replayPayloadRecord.conversationId) || '',
      actionType: sanitizeIncidentText(replayPayloadRecord.actionType, 120) || 'unknown',
      riskLevel: normalizeIncidentRiskLevel(replayPayloadRecord.riskLevel),
      likelyFailureMode: sanitizeIncidentText(replayPayloadRecord.likelyFailureMode, 240),
      verifyChecklist: sanitizeStringArray(replayPayloadRecord.verifyChecklist, 220, 12),
      blockedReasons: sanitizeStringArray(replayPayloadRecord.blockedReasons, 220, 12),
      relatedFiles: sanitizeStringArray(replayPayloadRecord.relatedFiles, 240, 16),
    },
    exportHint: sanitizeIncidentText(reproPackRecord.exportHint, 240),
  };

  const hasReproPackField =
    typeof reproPackRecord.packId === 'string' ||
    typeof reproPackRecord.status === 'string' ||
    typeof reproPackRecord.workspacePath === 'string' ||
    typeof reproPackRecord.conversationId === 'string' ||
    typeof reproPackRecord.actionId === 'string' ||
    typeof reproPackRecord.exportHint === 'string';

  return {
    success: Boolean(record.success),
    outputSummary: sanitizeIncidentText(record.outputSummary, 1200),
    verificationRequired: asOptionalBoolean(record.verificationRequired),
    verifyPolicy: hasVerifyPolicyField ? verifyPolicy : undefined,
    evidence: hasEvidenceField ? evidence : undefined,
    diagnosis: hasDiagnosisField ? diagnosis : undefined,
    rollback: hasRollbackField ? rollback : undefined,
    sandboxSimulation: hasSandboxField ? sandboxSimulation : undefined,
    incidentReproPack: hasReproPackField ? incidentReproPack : undefined,
  };
}

export function normalizeIncidentActionProgressPayload(
  value: unknown
): NormalizedIncidentActionProgressPayload {
  const record = asRecord(value);
  const rawProgress = asNumber(record.progress, 0);

  return {
    stage: sanitizeIncidentText(record.stage, 80) || 'running',
    progress: Math.max(0, Math.min(100, rawProgress)),
    note: sanitizeIncidentText(record.note, 320),
  };
}

export function normalizeIncidentDonePayload(value: unknown): NormalizedIncidentDonePayload {
  const record = asRecord(value);
  return {
    modelId: sanitizeIncidentText(record.modelId, 120),
    finalText: sanitizeIncidentText(record.finalText, 24000),
  };
}

export function normalizeIncidentSystemGraphSnapshotPayload(
  value: unknown
): NormalizedIncidentSystemGraphSnapshotPayload | null {
  const root = asRecord(value);
  const workspacePath = cleanText(root.workspacePath);
  if (!workspacePath) {
    return null;
  }

  const nodes = Array.isArray(root.nodes)
    ? root.nodes
        .map((entry): IncidentSystemGraphNode | null => {
          const node = asRecord(entry);
          const id = cleanText(node.id);
          if (!id) {
            return null;
          }

          const filePath = cleanText(node.filePath);
          const symbolName = sanitizeIncidentText(node.symbolName, 200);
          const rawStartLine = asNumber(node.startLine, 0);
          const startLine = rawStartLine > 0 ? Math.floor(rawStartLine) : undefined;

          return {
            id,
            type: normalizeIncidentGraphNodeType(node.type),
            label: sanitizeIncidentText(node.label, 200) || id,
            ...(filePath ? { filePath } : {}),
            ...(symbolName ? { symbolName } : {}),
            ...(startLine ? { startLine } : {}),
            confidence: clampNumber(asNumber(node.confidence, 50), 0, 100),
          };
        })
        .filter((entry): entry is IncidentSystemGraphNode => entry !== null)
    : [];

  const edges = Array.isArray(root.edges)
    ? root.edges
        .map((entry) => {
          const edge = asRecord(entry);
          const sourceId = cleanText(edge.sourceId);
          const targetId = cleanText(edge.targetId);
          if (!sourceId || !targetId) {
            return null;
          }

          return {
            sourceId,
            targetId,
            relation: sanitizeIncidentText(edge.relation, 120) || 'depends-on',
          } satisfies IncidentSystemGraphEdge;
        })
        .filter((entry): entry is IncidentSystemGraphEdge => entry !== null)
    : [];

  const summary = asRecord(root.summary);
  return {
    requestId: cleanText(root.requestId),
    workspacePath,
    projectPath: cleanText(root.projectPath),
    graphVersion: cleanText(root.graphVersion) || 'v1',
    nodes,
    edges,
    summary: {
      nodeCount: asNumber(summary.nodeCount, nodes.length),
      edgeCount: asNumber(summary.edgeCount, edges.length),
      supportedTopology: sanitizeIncidentText(summary.supportedTopology, 120) || 'unknown',
    },
  };
}

export function normalizeIncidentImpactAssessmentPayload(
  value: unknown
): NormalizedIncidentImpactAssessmentPayload {
  const root = asRecord(value);

  return {
    requestId: cleanText(root.requestId),
    sources: sanitizeStringList(root.sources ?? root.source, 80),
    confidence: clampNumber(asNumber(root.confidence, 0), 0, 100),
    riskLevel: normalizeIncidentRiskLevel(root.riskLevel),
    affectedFiles: sanitizeStringArray(root.affectedFiles, 240),
    affectedModules: sanitizeStringArray(root.affectedModules, 120),
    affectedTests: sanitizeStringArray(root.affectedTests, 180),
    likelyFailureMode: sanitizeIncidentText(root.likelyFailureMode, 240),
    rationale: sanitizeStringArray(root.rationale, 280),
    verifyChecklist: sanitizeStringArray(root.verifyChecklist, 240),
    blockMutationWhenScopeUnknown: asBoolean(root.blockMutationWhenScopeUnknown, true),
  };
}

export function normalizeIncidentPredictiveWarningPayload(
  value: unknown
): NormalizedIncidentPredictiveWarningPayload {
  const root = asRecord(value);
  const warningId = cleanText(root.warningId) || cleanText(root.requestId) || 'prediction-warning';
  const telemetrySeed = asRecord(root.telemetrySeed);
  const predictionKey =
    cleanText(telemetrySeed.predictionKey) || cleanText(root.predictionKey) || warningId;

  return {
    requestId: cleanText(root.requestId),
    warningId,
    confidenceBand: normalizePredictiveConfidenceBand(root.confidenceBand),
    predictedFailure: sanitizeIncidentText(root.predictedFailure, 240),
    affectedScopeSummary: sanitizeIncidentText(root.affectedScopeSummary, 240),
    nextSafeAction: sanitizeIncidentText(root.nextSafeAction, 240),
    verifyChecklist: sanitizeStringArray(root.verifyChecklist, 240),
    telemetrySeed: {
      predictionKey,
      evidenceSources: sanitizeStringList(telemetrySeed.evidenceSources, 80),
    },
  };
}

export function normalizeIncidentReleaseGateEvidencePayload(
  value: unknown
): NormalizedIncidentReleaseGateEvidencePayload {
  const root = asRecord(value);

  return {
    requestId: cleanText(root.requestId),
    scopeKnown: asBoolean(root.scopeKnown, false),
    verifyPathPresent: asBoolean(root.verifyPathPresent, false),
    rollbackPathPresent: asBoolean(root.rollbackPathPresent, false),
    confidenceSufficient: asBoolean(root.confidenceSufficient, false),
    blockedReasons: sanitizeStringArray(root.blockedReasons, 220),
  };
}

export function buildIncidentActionExecutionMetadata(
  actionType: string
): IncidentActionExecutionMetadata {
  const normalized = cleanText(actionType)?.toLowerCase() || 'unknown';

  if (normalized === 'change-impact-lite') {
    return {
      riskClass: 'informational',
      riskLevel: 'medium',
      requiresImpactReview: false,
      requiresVerifyPath: false,
      allowCompletionClaimWithoutVerify: true,
    };
  }

  if (
    normalized === 'terminal-bridge' ||
    normalized === 'fix-preview-lite' ||
    normalized === 'workspace-memory-wizard' ||
    normalized === 'recipe-pack' ||
    normalized === 'incident-repro-pack'
  ) {
    return {
      riskClass: 'non-mutating-executable',
      riskLevel: normalized === 'incident-repro-pack' ? 'medium' : 'low',
      requiresImpactReview: false,
      requiresVerifyPath: false,
      allowCompletionClaimWithoutVerify: true,
    };
  }

  if (normalized === 'doctor-fix') {
    return {
      riskClass: 'non-mutating-executable',
      riskLevel: 'medium',
      requiresImpactReview: false,
      requiresVerifyPath: true,
      allowCompletionClaimWithoutVerify: false,
    };
  }

  if (normalized === 'inline-command') {
    return {
      riskClass: 'guarded-mutating',
      riskLevel: 'high',
      requiresImpactReview: true,
      requiresVerifyPath: true,
      allowCompletionClaimWithoutVerify: false,
    };
  }

  return {
    riskClass: 'high-risk-mutating',
    riskLevel: 'critical',
    requiresImpactReview: true,
    requiresVerifyPath: true,
    allowCompletionClaimWithoutVerify: false,
  };
}

export function normalizeIncidentWorkspaceGraphSnapshot(
  data: unknown
): IncidentWorkspaceGraphSnapshot | null {
  const root = asRecord(data);
  const workspace = asRecord(root.workspace);
  const project = asRecord(root.project);
  const selectedProject = asRecord(project.selectedProject);
  const topology = asRecord(root.topology);
  const doctor = asRecord(root.doctor);
  const health = asRecord(doctor.health);
  const git = asRecord(root.git);
  const memory = asRecord(root.memory);
  const telemetry = asRecord(root.telemetry);
  const evidence = asRecord(root.evidence);

  const workspacePath = cleanText(workspace.path);
  if (!workspacePath) {
    return null;
  }

  const selectedProjectPath = cleanText(selectedProject.path);

  return {
    snapshotVersion: cleanText(root.snapshotVersion) || 'v1',
    workspace: {
      path: workspacePath,
      name: cleanText(workspace.name),
    },
    project: {
      framework: cleanText(project.framework) || 'unknown',
      kit: cleanText(project.kit) || 'unknown',
      selectedProject: selectedProjectPath
        ? {
            path: selectedProjectPath,
            name: cleanText(selectedProject.name),
            type: cleanText(selectedProject.type),
          }
        : null,
    },
    topology: {
      modulesCount: asNumber(topology.modulesCount, 0),
      topModules: asStringArray(topology.topModules),
    },
    doctor: {
      hasEvidence: Boolean(doctor.hasEvidence),
      generatedAt: cleanText(doctor.generatedAt),
      health: {
        passed: asNumber(health.passed, 0),
        warnings: asNumber(health.warnings, 0),
        errors: asNumber(health.errors, 0),
        total: asNumber(health.total, 0),
        percent: asNumber(health.percent, 0),
      },
    },
    git: {
      diffStat: cleanText(git.diffStat) || 'Git context unavailable',
      hasDiffContext: Boolean(git.hasDiffContext),
    },
    memory: {
      context: cleanText(memory.context),
      conventionsCount: asNumber(memory.conventionsCount, 0),
      decisionsCount: asNumber(memory.decisionsCount, 0),
      hasMemory: Boolean(memory.hasMemory),
    },
    telemetry: {
      totalEvents: asNumber(telemetry.totalEvents, 0),
      lastCommand: cleanText(telemetry.lastCommand) || null,
      onboardingFollowupClickThroughRate: asNumber(telemetry.onboardingFollowupClickThroughRate, 0),
    },
    evidence: {
      hasDoctorEvidence: Boolean(evidence.hasDoctorEvidence),
      hasGitDiff: Boolean(evidence.hasGitDiff),
      hasWorkspaceMemory: Boolean(evidence.hasWorkspaceMemory),
      projectScoped: Boolean(evidence.projectScoped),
    },
    completeness:
      root.completeness === 'cached' ||
      root.completeness === 'partial' ||
      root.completeness === 'degraded'
        ? root.completeness
        : 'fresh',
    lastUpdatedAt: asNumber(root.lastUpdatedAt, Date.now()),
  };
}

function withProjectSelection<T extends Record<string, unknown>>(
  payload: T,
  projectSelection?: IncidentProjectSelection | null
) {
  if (!projectSelection?.path) {
    return payload;
  }

  return {
    ...payload,
    projectPath: projectSelection.path,
    projectName: projectSelection.name,
    projectType: projectSelection.type,
  };
}

export function normalizeIncomingIncidentStudioOpen(
  data: unknown
): NormalizedIncidentStudioOpen | null {
  const message = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};

  const workspacePath = cleanText(message.workspacePath);
  if (!workspacePath) {
    return null;
  }

  const workspaceName = sanitizeIncidentText(message.workspaceName, 200) || workspacePath;
  const initialQuery = sanitizeIncidentText(message.initialQuery, 4000);
  const projectPath = cleanText(message.projectPath);
  const projectSelection = projectPath
    ? {
        path: projectPath,
        name: sanitizeIncidentText(message.projectName, 200),
        type: sanitizeIncidentText(message.projectType, 120),
      }
    : null;

  return {
    workspacePath,
    workspaceName,
    initialQuery,
    projectSelection,
  };
}

export function buildIncidentChatStartPayload(input: {
  workspacePath: string;
  requestId: string;
  resumeConversationId: string;
  projectSelection?: IncidentProjectSelection | null;
}) {
  return withProjectSelection(
    {
      workspacePath: input.workspacePath,
      requestId: input.requestId,
      resumeConversationId: input.resumeConversationId,
    },
    input.projectSelection
  );
}

export function buildIncidentChatQueryPayload(input: {
  conversationId: string;
  workspacePath: string;
  requestId: string;
  message: string;
  modelId?: string;
  projectSelection?: IncidentProjectSelection | null;
}) {
  const sanitizedMessage =
    sanitizeIncidentText(input.message, 4000) || 'Provide a safe analysis summary.';

  return withProjectSelection(
    {
      conversationId: input.conversationId,
      workspacePath: input.workspacePath,
      requestId: input.requestId,
      modelId: input.modelId,
      message: sanitizedMessage,
    },
    input.projectSelection
  );
}

export function buildIncidentChatSyncWorkspacePayload(input: {
  workspacePath: string;
  requestId: string;
  forceRefresh?: boolean;
}) {
  return {
    workspacePath: input.workspacePath,
    requestId: input.requestId,
    ...(input.forceRefresh ? { forceRefresh: true } : {}),
  };
}

export function buildIncidentChatExecuteActionPayload(input: {
  conversationId: string;
  actionId: string;
  actionType: string;
  workspacePath?: string;
  requestId: string;
  modelId?: string;
  projectSelection?: IncidentProjectSelection | null;
}) {
  const execution = buildIncidentActionExecutionMetadata(input.actionType);

  return withProjectSelection(
    {
      conversationId: input.conversationId,
      actionId: input.actionId,
      actionType: input.actionType,
      workspacePath: input.workspacePath,
      modelId: input.modelId,
      requestId: input.requestId,
      execution,
    },
    input.projectSelection
  );
}
