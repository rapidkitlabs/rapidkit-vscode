export type IncidentLifecycleInput = {
  startedAt?: unknown;
  verifyPassedAt?: unknown;
  history?: Array<{ role?: unknown; content?: unknown }>;
  queryCount?: unknown;
  actionCount?: unknown;
};

export type IncidentLifecycleMetrics = {
  durationMs: number;
  hasExchange: boolean;
  resolved: boolean;
  queryCount: number;
  actionCount: number;
  timeToVerifyMs: number | null;
};

function toNonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function hasUsableExchange(history: IncidentLifecycleInput['history']): boolean {
  if (!Array.isArray(history) || history.length === 0) {
    return false;
  }

  return history.some((turn) => {
    const role = turn?.role;
    const content = typeof turn?.content === 'string' ? turn.content.trim() : '';
    return (role === 'user' || role === 'assistant') && content.length > 0;
  });
}

export function buildIncidentLifecycleMetrics(
  input: IncidentLifecycleInput,
  nowMs: number
): IncidentLifecycleMetrics {
  const startedAt = toNonNegativeInteger(input.startedAt);
  const verifyPassedAt = toNonNegativeInteger(input.verifyPassedAt);
  const now = toNonNegativeInteger(nowMs);

  const durationMs = startedAt > 0 && now >= startedAt ? now - startedAt : 0;
  const resolved = startedAt > 0 && verifyPassedAt >= startedAt;
  const timeToVerifyMs = resolved ? verifyPassedAt - startedAt : null;

  return {
    durationMs,
    hasExchange: hasUsableExchange(input.history),
    resolved,
    queryCount: toNonNegativeInteger(input.queryCount),
    actionCount: toNonNegativeInteger(input.actionCount),
    timeToVerifyMs,
  };
}
