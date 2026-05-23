/**
 * Incident Studio State Management
 * 5-phase workflow + user mode + scope truthfulness
 */

export type IncidentPhase = 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';
export type UserMode = 'guided' | 'standard' | 'expert';
export type ReleaseGatePosture = 'go' | 'no-go' | 'pending';
export type ScopeType = 'workspace' | 'project';

export interface HealthMetrics {
  modulesOk: number;
  modulesWarning: number;
  modulesError: number;
  systemLastCheck?: string;
  gitState?: string;
  memoryState?: string;
}

export interface RelatedFile {
  path: string;
  health: 'ok' | 'warning' | 'error';
  freshness?: string;
}

export interface PolicyGateState {
  flowState: 'passing' | 'warning' | 'blocking';
  telemetryState: 'complete' | 'partial' | 'stale';
  releasePosture: ReleaseGatePosture;
  artifactId?: string;
  freshness?: string;
}

export interface IncidentStudioState {
  // Workflow
  currentPhase: IncidentPhase;
  isPhaseTransitioning: boolean;

  // User interaction
  userMode: UserMode;
  scopeType: ScopeType;
  workspaceName?: string;

  // Evidence & gates
  health: HealthMetrics;
  relatedFiles: RelatedFile[];
  policyGates: PolicyGateState;
  releasePosture: ReleaseGatePosture;

  // Chat state
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingPhaseHint?: string;

  // UI state
  expandedSources?: Record<string, boolean>;
  expertModeExpanded?: boolean;

  // Cross-session retention
  actionItems: ActionItem[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  phase?: IncidentPhase;
  confidence?: number;
  sources?: SourcePill[];
}

export interface SourcePill {
  type: 'git' | 'system' | 'telemetry' | 'analysis';
  label: string;
  freshness?: string;
  confidence?: number;
}

export interface ActionItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

export const PHASE_SEQUENCE: IncidentPhase[] = ['detect', 'diagnose', 'plan', 'verify', 'learn'];

export const PHASE_LABELS: Record<IncidentPhase, string> = {
  detect: 'Detect',
  diagnose: 'Diagnose',
  plan: 'Plan',
  verify: 'Verify',
  learn: 'Learn',
};

export const USER_MODE_LABELS: Record<UserMode, string> = {
  guided: 'Guided (1 safe route)',
  standard: 'Standard (balanced)',
  expert: 'Expert (deep details)',
};

export const RELEASE_GATE_LABELS: Record<ReleaseGatePosture, string> = {
  go: 'GO - Safe to release',
  'no-go': 'NO-GO - Holds detected',
  pending: 'Pending verification',
};

/**
 * Create initial state for Incident Studio
 */
export function createInitialState(overrides?: Partial<IncidentStudioState>): IncidentStudioState {
  return {
    currentPhase: 'detect',
    isPhaseTransitioning: false,
    userMode: 'standard',
    scopeType: 'workspace',
    health: {
      modulesOk: 0,
      modulesWarning: 0,
      modulesError: 0,
    },
    relatedFiles: [],
    policyGates: {
      flowState: 'pending',
      telemetryState: 'pending',
      releasePosture: 'pending',
    },
    releasePosture: 'pending',
    messages: [],
    isStreaming: false,
    expandedSources: {},
    expertModeExpanded: false,
    actionItems: [],
    ...overrides,
  };
}

/**
 * Transition to next phase
 */
export function getNextPhase(current: IncidentPhase): IncidentPhase | null {
  const index = PHASE_SEQUENCE.indexOf(current);
  if (index === -1 || index === PHASE_SEQUENCE.length - 1) {
    return null;
  }
  return PHASE_SEQUENCE[index + 1];
}

/**
 * Check if transition is valid
 */
export function canTransitionToPhase(
  from: IncidentPhase,
  to: IncidentPhase,
  gates: PolicyGateState
): boolean {
  // In 'verify' phase, can only move forward if gates are passing
  if (from === 'verify' && gates.flowState === 'blocking') {
    return false;
  }
  // Can only move to next phase or previous phase
  const fromIndex = PHASE_SEQUENCE.indexOf(from);
  const toIndex = PHASE_SEQUENCE.indexOf(to);
  return Math.abs(fromIndex - toIndex) <= 1;
}
