export type ChatBrainFallbackAction = {
  id: string;
  label: string;
  actionType: string;
  riskLevel: 'low' | 'medium';
  requiresImpactReview?: boolean;
  requiresVerifyPath?: boolean;
};

export type ChatBrainFallbackBoard = {
  id: string;
  type: string;
  title: string;
  summary: string;
  actions: ChatBrainFallbackAction[];
};

export function isRetryableChatBrainError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (!raw) {
    return true;
  }

  if (/cancel|aborted|scope_violation|invalid_input/i.test(raw)) {
    return false;
  }

  return /timeout|timed out|network|socket|econnreset|etimedout|enotfound|429|5\d\d/i.test(raw);
}

export function deriveChatBrainFailureCode(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  if (raw.includes('scope_violation')) {
    return 'WORKSPACE_SCOPE_VIOLATION';
  }
  if (raw.includes('timeout') || raw.includes('timed out')) {
    return 'TIMEOUT';
  }
  if (raw.includes('network') || raw.includes('socket') || raw.includes('enotfound')) {
    return 'NETWORK_INTERRUPTION';
  }
  return 'PARTIAL_FAILURE';
}

export function buildChatBrainFallbackBoard(
  actionType: string,
  projectName?: string,
  now: () => number = Date.now
): ChatBrainFallbackBoard {
  const safeActionType = actionType === 'orchestrate' ? 'terminal-bridge' : actionType;
  const summary = projectName
    ? `${projectName}: connection was interrupted. Continue with deterministic checks and retry.`
    : 'Connection was interrupted. Continue with deterministic checks and retry.';
  const timestamp = now();

  return {
    id: `fallback-board-${timestamp}`,
    type: 'fallback',
    title: 'Partial response received - continue safely',
    summary,
    actions: [
      {
        id: `fallback-retry-${timestamp}`,
        label: 'Retry diagnosis route',
        actionType: safeActionType,
        riskLevel: 'low',
      },
      {
        id: `fallback-doctor-${timestamp}`,
        label: 'Run doctor verification',
        actionType: 'doctor-fix',
        riskLevel: 'medium',
        requiresVerifyPath: true,
      },
      {
        id: `fallback-impact-${timestamp}`,
        label: 'Run impact check before mutation',
        actionType: 'change-impact-lite',
        riskLevel: 'low',
        requiresImpactReview: true,
      },
    ],
  };
}
