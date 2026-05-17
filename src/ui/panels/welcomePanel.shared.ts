export type IncidentWorkspaceGraphSnapshot = {
  snapshotVersion: 'v1';
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
    policyProfile: 'strict' | 'balanced' | 'permissive';
    sensitivity: 'normal' | 'sensitive';
    localProcessingMode: boolean;
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
    localProcessingMode: boolean;
    projectScoped: boolean;
  };
  completeness: 'fresh' | 'cached' | 'partial' | 'degraded';
  lastUpdatedAt: number;
};

export type IncidentMemoryInfluenceAuditEntry = {
  memoryEventId: string;
  timestamp: string;
  source: 'workspace-memory' | 'incident-replay-learning';
  influenceKind: 'context' | 'policy' | 'decision' | 'artifact-link';
  summary: string;
  policyProfile: 'strict' | 'balanced' | 'permissive';
  sensitivity: 'normal' | 'sensitive';
  localProcessingMode: boolean;
  decisionArtifacts: {
    actionId: string;
    reproPackId?: string;
    releaseReadinessArtifactId?: string;
  };
};

export type WorkspaceMarkerSnapshot = {
  signature?: string;
  createdBy?: string;
  version?: string;
  name?: string;
};

export function normalizeRequestedModelId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return value as Record<string, unknown>;
}

export function isConversationMessageEntry(
  value: unknown
): value is { role: 'user' | 'assistant'; content: string } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    (record.role === 'user' || record.role === 'assistant') && typeof record.content === 'string'
  );
}

export function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
