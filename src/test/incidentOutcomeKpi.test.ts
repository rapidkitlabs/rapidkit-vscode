import { describe, it, expect } from 'vitest';
import {
  computeIncidentOutcomeKpis,
  computeIncidentOutcomeKpiGate,
  INCIDENT_OUTCOME_KPI_DEFAULT_THRESHOLDS,
  type IncidentOutcomeRecord,
  type IncidentOutcomeKpis,
} from '../../src/core/incidentOutcomeKpi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<IncidentOutcomeRecord> = {}): IncidentOutcomeRecord {
  return {
    timeToFirstConfidentActionMs: 10_000,
    firstActionSucceeded: true,
    reopenedAfterSuggestedFix: false,
    recommendationOverridden: false,
    mutatingActionReachedVerify: true,
    rollbackAttemptResult: null,
    ...overrides,
  };
}

const ALL_GREEN_KPI: IncidentOutcomeKpis = {
  timeToFirstConfidentActionP50Ms: 10_000,
  firstActionSuccessRate: 0.9,
  reopenRateAfterSuggestedFix: 0.05,
  overrideRateOnRecommendations: 0.1,
  verifyPathCompletionRate: 0.95,
  rollbackRecoverySuccessRate: 0.9,
  sampleCount: 20,
};

// ---------------------------------------------------------------------------
// computeIncidentOutcomeKpis — core computation
// ---------------------------------------------------------------------------

describe('CLC5 computeIncidentOutcomeKpis', () => {
  it('returns all-null metrics for empty record set', () => {
    const kpis = computeIncidentOutcomeKpis([]);
    expect(kpis.timeToFirstConfidentActionP50Ms).toBeNull();
    expect(kpis.firstActionSuccessRate).toBeNull();
    expect(kpis.reopenRateAfterSuggestedFix).toBeNull();
    expect(kpis.overrideRateOnRecommendations).toBeNull();
    expect(kpis.verifyPathCompletionRate).toBeNull();
    expect(kpis.rollbackRecoverySuccessRate).toBeNull();
    expect(kpis.sampleCount).toBe(0);
  });

  it('computes p50 time-to-first-confident-action correctly (odd count)', () => {
    const records = [
      makeRecord({ timeToFirstConfidentActionMs: 5_000 }),
      makeRecord({ timeToFirstConfidentActionMs: 10_000 }),
      makeRecord({ timeToFirstConfidentActionMs: 30_000 }),
    ];
    const kpis = computeIncidentOutcomeKpis(records);
    expect(kpis.timeToFirstConfidentActionP50Ms).toBe(10_000);
  });

  it('computes p50 time-to-first-confident-action correctly (even count)', () => {
    const records = [
      makeRecord({ timeToFirstConfidentActionMs: 5_000 }),
      makeRecord({ timeToFirstConfidentActionMs: 15_000 }),
    ];
    const kpis = computeIncidentOutcomeKpis(records);
    expect(kpis.timeToFirstConfidentActionP50Ms).toBe(10_000); // (5000 + 15000) / 2
  });

  it('skips null timeToFirstConfidentActionMs values from p50 calculation', () => {
    const records = [
      makeRecord({ timeToFirstConfidentActionMs: null }),
      makeRecord({ timeToFirstConfidentActionMs: 10_000 }),
      makeRecord({ timeToFirstConfidentActionMs: 20_000 }),
    ];
    const kpis = computeIncidentOutcomeKpis(records);
    // Only [10000, 20000] → p50 = 15000
    expect(kpis.timeToFirstConfidentActionP50Ms).toBe(15_000);
  });

  it('computes first_action_success_rate correctly', () => {
    const records = [
      makeRecord({ firstActionSucceeded: true }),
      makeRecord({ firstActionSucceeded: true }),
      makeRecord({ firstActionSucceeded: false }),
      makeRecord({ firstActionSucceeded: false }),
    ];
    const kpis = computeIncidentOutcomeKpis(records);
    expect(kpis.firstActionSuccessRate).toBeCloseTo(0.5);
  });

  it('computes reopen_rate_after_suggested_fix correctly', () => {
    const records = [
      makeRecord({ reopenedAfterSuggestedFix: false }),
      makeRecord({ reopenedAfterSuggestedFix: false }),
      makeRecord({ reopenedAfterSuggestedFix: false }),
      makeRecord({ reopenedAfterSuggestedFix: true }),
    ];
    const kpis = computeIncidentOutcomeKpis(records);
    expect(kpis.reopenRateAfterSuggestedFix).toBeCloseTo(0.25);
  });

  it('computes override_rate_on_recommendations correctly', () => {
    const records = [
      makeRecord({ recommendationOverridden: true }),
      makeRecord({ recommendationOverridden: false }),
    ];
    const kpis = computeIncidentOutcomeKpis(records);
    expect(kpis.overrideRateOnRecommendations).toBeCloseTo(0.5);
  });

  it('computes verify_path_completion_rate only for mutating-action records', () => {
    const records = [
      makeRecord({ mutatingActionReachedVerify: true }),
      makeRecord({ mutatingActionReachedVerify: true }),
      makeRecord({ mutatingActionReachedVerify: false }),
      makeRecord({ mutatingActionReachedVerify: null }), // non-mutating, excluded
    ];
    const kpis = computeIncidentOutcomeKpis(records);
    // Only 3 mutating-action records → 2/3
    expect(kpis.verifyPathCompletionRate).toBeCloseTo(2 / 3);
  });

  it('returns null verifyPathCompletionRate when all records are non-mutating', () => {
    const records = [
      makeRecord({ mutatingActionReachedVerify: null }),
      makeRecord({ mutatingActionReachedVerify: null }),
    ];
    const kpis = computeIncidentOutcomeKpis(records);
    expect(kpis.verifyPathCompletionRate).toBeNull();
  });

  it('computes rollback_recovery_success_rate only for rollback-attempt records', () => {
    const records = [
      makeRecord({ rollbackAttemptResult: true }),
      makeRecord({ rollbackAttemptResult: true }),
      makeRecord({ rollbackAttemptResult: false }),
      makeRecord({ rollbackAttemptResult: null }), // no rollback, excluded
    ];
    const kpis = computeIncidentOutcomeKpis(records);
    expect(kpis.rollbackRecoverySuccessRate).toBeCloseTo(2 / 3);
  });

  it('returns null rollbackRecoverySuccessRate when no rollback attempts occurred', () => {
    const records = [
      makeRecord({ rollbackAttemptResult: null }),
      makeRecord({ rollbackAttemptResult: null }),
    ];
    const kpis = computeIncidentOutcomeKpis(records);
    expect(kpis.rollbackRecoverySuccessRate).toBeNull();
  });

  it('counts sampleCount as total records including non-mutating', () => {
    const records = [
      makeRecord({ mutatingActionReachedVerify: null }),
      makeRecord({ mutatingActionReachedVerify: true }),
      makeRecord({ mutatingActionReachedVerify: false }),
    ];
    const kpis = computeIncidentOutcomeKpis(records);
    expect(kpis.sampleCount).toBe(3);
  });

  it('computes all metrics in one shot for representative batch', () => {
    const records: IncidentOutcomeRecord[] = [
      {
        timeToFirstConfidentActionMs: 8_000,
        firstActionSucceeded: true,
        reopenedAfterSuggestedFix: false,
        recommendationOverridden: false,
        mutatingActionReachedVerify: true,
        rollbackAttemptResult: null,
      },
      {
        timeToFirstConfidentActionMs: 12_000,
        firstActionSucceeded: true,
        reopenedAfterSuggestedFix: false,
        recommendationOverridden: false,
        mutatingActionReachedVerify: true,
        rollbackAttemptResult: true,
      },
      {
        timeToFirstConfidentActionMs: 20_000,
        firstActionSucceeded: false,
        reopenedAfterSuggestedFix: true,
        recommendationOverridden: true,
        mutatingActionReachedVerify: false,
        rollbackAttemptResult: false,
      },
      {
        timeToFirstConfidentActionMs: 5_000,
        firstActionSucceeded: true,
        reopenedAfterSuggestedFix: false,
        recommendationOverridden: false,
        mutatingActionReachedVerify: null,
        rollbackAttemptResult: null,
      },
    ];
    const kpis = computeIncidentOutcomeKpis(records);
    expect(kpis.sampleCount).toBe(4);
    expect(kpis.timeToFirstConfidentActionP50Ms).toBe(10_000); // sorted [5000,8000,12000,20000] → (8000+12000)/2
    expect(kpis.firstActionSuccessRate).toBeCloseTo(0.75); // 3/4
    expect(kpis.reopenRateAfterSuggestedFix).toBeCloseTo(0.25); // 1/4
    expect(kpis.overrideRateOnRecommendations).toBeCloseTo(0.25); // 1/4
    expect(kpis.verifyPathCompletionRate).toBeCloseTo(2 / 3); // 3 mutating records → 2 reached verify
    expect(kpis.rollbackRecoverySuccessRate).toBeCloseTo(0.5); // 2 rollback records → 1 success
  });
});

// ---------------------------------------------------------------------------
// computeIncidentOutcomeKpiGate — gate evaluation
// ---------------------------------------------------------------------------

describe('CLC5 computeIncidentOutcomeKpiGate', () => {
  it('passes overall when all metrics satisfy default thresholds', () => {
    const gate = computeIncidentOutcomeKpiGate(ALL_GREEN_KPI);
    expect(gate.overallPass).toBe(true);
    expect(gate.schemaVersion).toBe('v1');
    expect(gate.sampleCount).toBe(20);
    expect(gate.metrics.every((m) => m.passed)).toBe(true);
  });

  it('fails gate when time_to_first_confident_action_p50_ms exceeds max threshold', () => {
    const gate = computeIncidentOutcomeKpiGate({
      ...ALL_GREEN_KPI,
      timeToFirstConfidentActionP50Ms: 50_000, // exceeds 30s threshold
    });
    expect(gate.overallPass).toBe(false);
    const m = gate.metrics.find((x) => x.metric === 'time_to_first_confident_action_p50_ms')!;
    expect(m.passed).toBe(false);
    expect(m.direction).toBe('max');
  });

  it('fails gate when first_action_success_rate is below min threshold', () => {
    const gate = computeIncidentOutcomeKpiGate({
      ...ALL_GREEN_KPI,
      firstActionSuccessRate: 0.4, // below 0.6 threshold
    });
    expect(gate.overallPass).toBe(false);
    const m = gate.metrics.find((x) => x.metric === 'first_action_success_rate')!;
    expect(m.passed).toBe(false);
    expect(m.direction).toBe('min');
  });

  it('fails gate when reopen_rate_after_suggested_fix exceeds max threshold', () => {
    const gate = computeIncidentOutcomeKpiGate({
      ...ALL_GREEN_KPI,
      reopenRateAfterSuggestedFix: 0.4, // exceeds 0.25 threshold
    });
    expect(gate.overallPass).toBe(false);
    const m = gate.metrics.find((x) => x.metric === 'reopen_rate_after_suggested_fix')!;
    expect(m.passed).toBe(false);
  });

  it('fails gate when override_rate_on_recommendations exceeds max threshold', () => {
    const gate = computeIncidentOutcomeKpiGate({
      ...ALL_GREEN_KPI,
      overrideRateOnRecommendations: 0.5, // exceeds 0.35 threshold
    });
    expect(gate.overallPass).toBe(false);
    const m = gate.metrics.find((x) => x.metric === 'override_rate_on_recommendations')!;
    expect(m.passed).toBe(false);
  });

  it('fails gate when verify_path_completion_rate is below min threshold', () => {
    const gate = computeIncidentOutcomeKpiGate({
      ...ALL_GREEN_KPI,
      verifyPathCompletionRate: 0.5, // below 0.8 threshold
    });
    expect(gate.overallPass).toBe(false);
    const m = gate.metrics.find((x) => x.metric === 'verify_path_completion_rate')!;
    expect(m.passed).toBe(false);
  });

  it('fails gate when rollback_recovery_success_rate is below min threshold', () => {
    const gate = computeIncidentOutcomeKpiGate({
      ...ALL_GREEN_KPI,
      rollbackRecoverySuccessRate: 0.3, // below 0.7 threshold
    });
    expect(gate.overallPass).toBe(false);
    const m = gate.metrics.find((x) => x.metric === 'rollback_recovery_success_rate')!;
    expect(m.passed).toBe(false);
  });

  it('skips a metric when its threshold is set to null (not a failure)', () => {
    const gate = computeIncidentOutcomeKpiGate(ALL_GREEN_KPI, {
      ...INCIDENT_OUTCOME_KPI_DEFAULT_THRESHOLDS,
      minRollbackRecoverySuccessRate: null,
    });
    expect(gate.overallPass).toBe(true);
    const m = gate.metrics.find((x) => x.metric === 'rollback_recovery_success_rate')!;
    expect(m.skipped).toBe(true);
    expect(m.passed).toBe(true); // skipped ≡ not-a-failure
  });

  it('skips a metric when its KPI value is null (no samples)', () => {
    const gate = computeIncidentOutcomeKpiGate({
      ...ALL_GREEN_KPI,
      rollbackRecoverySuccessRate: null, // no samples
    });
    expect(gate.overallPass).toBe(true);
    const m = gate.metrics.find((x) => x.metric === 'rollback_recovery_success_rate')!;
    expect(m.skipped).toBe(true);
    expect(m.passed).toBe(true);
  });

  it('gate result contains exactly 6 metric entries', () => {
    const gate = computeIncidentOutcomeKpiGate(ALL_GREEN_KPI);
    expect(gate.metrics).toHaveLength(6);
  });

  it('gate fails when exactly one metric is below threshold (not multiple required)', () => {
    // Verify gate is not lenient — single violation is enough to fail
    const gate = computeIncidentOutcomeKpiGate({
      ...ALL_GREEN_KPI,
      firstActionSuccessRate: 0.55, // just below 0.6
    });
    expect(gate.overallPass).toBe(false);
    const passed = gate.metrics.filter((m) => m.passed).length;
    const failed = gate.metrics.filter((m) => !m.passed).length;
    expect(failed).toBe(1);
    expect(passed).toBe(5);
  });

  it('invariant: gate with custom thresholds relaxed to all-null always passes regardless of values', () => {
    const gate = computeIncidentOutcomeKpiGate(
      {
        timeToFirstConfidentActionP50Ms: 999_999,
        firstActionSuccessRate: 0,
        reopenRateAfterSuggestedFix: 1,
        overrideRateOnRecommendations: 1,
        verifyPathCompletionRate: 0,
        rollbackRecoverySuccessRate: 0,
        sampleCount: 5,
      },
      {
        maxTimeToFirstConfidentActionP50Ms: null,
        minFirstActionSuccessRate: null,
        maxReopenRateAfterSuggestedFix: null,
        maxOverrideRateOnRecommendations: null,
        minVerifyPathCompletionRate: null,
        minRollbackRecoverySuccessRate: null,
      }
    );
    expect(gate.overallPass).toBe(true);
    expect(gate.metrics.every((m) => m.skipped)).toBe(true);
  });

  it('invariant: gate computed from real records end-to-end with all-green data', () => {
    const records: IncidentOutcomeRecord[] = Array.from({ length: 10 }, (_, i) => ({
      timeToFirstConfidentActionMs: 5_000 + i * 1_000, // 5k–14k → p50 ≈ 9500
      firstActionSucceeded: true,
      reopenedAfterSuggestedFix: false,
      recommendationOverridden: i === 9, // 1 override → 10%
      mutatingActionReachedVerify: true,
      rollbackAttemptResult: null,
    }));
    const kpis = computeIncidentOutcomeKpis(records);
    const gate = computeIncidentOutcomeKpiGate(kpis);
    expect(gate.overallPass).toBe(true);
    expect(gate.sampleCount).toBe(10);
  });

  it('invariant: gate computed from real records end-to-end with degraded data fails', () => {
    const records: IncidentOutcomeRecord[] = Array.from({ length: 10 }, (_, i) => ({
      timeToFirstConfidentActionMs: 60_000, // all 60s → p50 = 60s > 30s threshold
      firstActionSucceeded: i % 2 === 0, // 50% success < 60% threshold
      reopenedAfterSuggestedFix: false,
      recommendationOverridden: false,
      mutatingActionReachedVerify: true,
      rollbackAttemptResult: null,
    }));
    const kpis = computeIncidentOutcomeKpis(records);
    const gate = computeIncidentOutcomeKpiGate(kpis);
    expect(gate.overallPass).toBe(false);
    const failedMetrics = gate.metrics.filter((m) => !m.passed).map((m) => m.metric);
    expect(failedMetrics).toContain('time_to_first_confident_action_p50_ms');
    expect(failedMetrics).toContain('first_action_success_rate');
  });
});
