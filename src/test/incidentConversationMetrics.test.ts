import { describe, expect, it } from 'vitest';

import { buildIncidentLifecycleMetrics } from '../ui/panels/incidentConversationMetrics';

describe('incidentConversationMetrics', () => {
  it('sanitizes malformed counters and timestamps', () => {
    const metrics = buildIncidentLifecycleMetrics(
      {
        startedAt: Number.NaN,
        verifyPassedAt: -5,
        history: [{ role: 'user', content: '  ' }],
        queryCount: Number.NaN,
        actionCount: -3,
      },
      Number.NaN
    );

    expect(metrics).toEqual({
      durationMs: 0,
      hasExchange: false,
      resolved: false,
      queryCount: 0,
      actionCount: 0,
      timeToVerifyMs: null,
    });
  });

  it('computes resolved lifecycle only when verify timestamp is valid and ordered', () => {
    const metrics = buildIncidentLifecycleMetrics(
      {
        startedAt: 1000,
        verifyPassedAt: 3500,
        history: [
          { role: 'user', content: 'service down' },
          { role: 'assistant', content: 'apply migration patch' },
        ],
        queryCount: 2,
        actionCount: 1,
      },
      5000
    );

    expect(metrics).toEqual({
      durationMs: 4000,
      hasExchange: true,
      resolved: true,
      queryCount: 2,
      actionCount: 1,
      timeToVerifyMs: 2500,
    });
  });

  it('does not mark resolved when verify timestamp is older than start', () => {
    const metrics = buildIncidentLifecycleMetrics(
      {
        startedAt: 3000,
        verifyPassedAt: 2500,
        history: [{ role: 'assistant', content: 'working' }],
        queryCount: 1,
        actionCount: 1,
      },
      4000
    );

    expect(metrics.resolved).toBe(false);
    expect(metrics.timeToVerifyMs).toBeNull();
    expect(metrics.durationMs).toBe(1000);
  });
});
