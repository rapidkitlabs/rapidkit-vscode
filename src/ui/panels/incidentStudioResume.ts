export type IncidentConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type IncidentConversationState = {
  workspacePath?: string;
  lastActivityAt: number;
  phase: 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';
  history: IncidentConversationTurn[];
  queryCount: number;
  actionCount: number;
  verifyPassedAt?: number;
};

export type IncidentResumeSnapshot = {
  workspacePath: string;
  phase: 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';
  turnCount: number;
  queryCount: number;
  actionCount: number;
  lastActivityAt: number;
  resolved: boolean;
  recap: string;
  nextActionLabel: string;
  nextActionQuery: string;
};

function compactSingleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function trimToSentence(value: string, maxLength = 220): string {
  const singleLine = compactSingleLine(value);
  if (!singleLine) {
    return '';
  }

  const firstSentence = singleLine.match(/^(.+?[.!?])(?:\s|$)/)?.[1] || singleLine;
  if (firstSentence.length <= maxLength) {
    return firstSentence;
  }

  return `${firstSentence.slice(0, maxLength - 1).trim()}...`;
}

function buildRecapFromHistory(history: IncidentConversationTurn[]): string {
  const lastAssistant = [...history]
    .reverse()
    .find((turn) => turn.role === 'assistant' && compactSingleLine(turn.content));

  if (lastAssistant) {
    return trimToSentence(lastAssistant.content);
  }

  const lastUser = [...history]
    .reverse()
    .find((turn) => turn.role === 'user' && compactSingleLine(turn.content));

  if (lastUser) {
    return `Last request: ${trimToSentence(lastUser.content, 180)}`;
  }

  return 'Previous incident context exists, but no usable summary text was captured.';
}

function nextActionForPhase(
  phase: IncidentConversationState['phase'],
  resolved: boolean
): Pick<IncidentResumeSnapshot, 'nextActionLabel' | 'nextActionQuery'> {
  if (resolved || phase === 'learn') {
    return {
      nextActionLabel: 'Capture reusable outcome artifact',
      nextActionQuery:
        'Summarize what fixed this incident, include the verify command, capture it as reusable workspace memory, and prepare replay/share or release-readiness evidence if this pattern should help the team later.',
    };
  }

  if (phase === 'verify') {
    return {
      nextActionLabel: 'Run deterministic verification',
      nextActionQuery:
        'Give me one deterministic verify command with pass/fail criteria for this incident state.',
    };
  }

  if (phase === 'plan') {
    return {
      nextActionLabel: 'Preview safest fix',
      nextActionQuery:
        'Generate the safest patch preview with minimal blast radius and a rollback note.',
    };
  }

  return {
    nextActionLabel: 'Inspect runtime evidence',
    nextActionQuery:
      'Inspect latest runtime evidence and return one concrete next action with exact command.',
  };
}

export function buildIncidentResumeSnapshot(
  conversation: IncidentConversationState
): IncidentResumeSnapshot | null {
  const workspacePath = conversation.workspacePath?.trim();
  if (!workspacePath || conversation.history.length === 0) {
    return null;
  }

  const resolved = typeof conversation.verifyPassedAt === 'number';
  const nextAction = nextActionForPhase(conversation.phase, resolved);

  return {
    workspacePath,
    phase: conversation.phase,
    turnCount: conversation.history.length,
    queryCount: conversation.queryCount,
    actionCount: conversation.actionCount,
    lastActivityAt: conversation.lastActivityAt,
    resolved,
    recap: buildRecapFromHistory(conversation.history),
    nextActionLabel: nextAction.nextActionLabel,
    nextActionQuery: nextAction.nextActionQuery,
  };
}
