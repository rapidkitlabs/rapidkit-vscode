/**
 * CLC5 — Outcome-based KPI computation for Incident Studio.
 *
 * Computes six outcome-quality KPIs from incident resolution records:
 *   1. time_to_first_confident_action     — p50 ms from open to first non-downgraded phase action
 *   2. first_action_success_rate          — fraction of first actions that verified successfully
 *   3. reopen_rate_after_suggested_fix    — fraction of incidents reopened after a suggested fix
 *   4. override_rate_on_recommendations   — fraction of actions where user overrode the recommendation
 *   5. verify_path_completion_rate        — fraction of mutating actions that reached verify phase
 *   6. rollback_recovery_success_rate     — fraction of rollback attempts that succeeded
 *
 * Release gate integration:
 *   computeIncidentOutcomeKpiGate() evaluates the KPIs against configurable thresholds and
 *   returns a machine-readable gate result with per-metric pass/fail status.
 */

// ---------------------------------------------------------------------------
// Input record shape
// ---------------------------------------------------------------------------

export type IncidentOutcomeRecord = {
  /** Milliseconds from incident open to first non-downgraded primary action. Null if never reached. */
  timeToFirstConfidentActionMs: number | null;
  /** True when the first suggested action verified successfully. */
  firstActionSucceeded: boolean;
  /** True when the incident was reopened after a suggested fix was accepted. */
  reopenedAfterSuggestedFix: boolean;
  /** True when the user overrode (rejected or replaced) a recommended action. */
  recommendationOverridden: boolean;
  /**
   * True when the action was mutating (requiresVerifyPath or requiresImpactReview)
   * and the user reached the verify phase.
   */
  mutatingActionReachedVerify: boolean | null; // null = non-mutating action, skip for this metric
  /**
   * When rollback was attempted: true if it succeeded, false if it failed.
   * Null when no rollback was attempted.
   */
  rollbackAttemptResult: boolean | null;
};

// ---------------------------------------------------------------------------
// Computed KPI shape
// ---------------------------------------------------------------------------

export type IncidentOutcomeKpis = {
  /** p50 time-to-first-confident-action in ms. Null when no valid samples. */
  timeToFirstConfidentActionP50Ms: number | null;
  /** 0..1 fraction. Null when no samples. */
  firstActionSuccessRate: number | null;
  /** 0..1 fraction. Null when no samples. */
  reopenRateAfterSuggestedFix: number | null;
  /** 0..1 fraction. Null when no samples. */
  overrideRateOnRecommendations: number | null;
  /** 0..1 fraction. Null when no mutating-action samples. */
  verifyPathCompletionRate: number | null;
  /** 0..1 fraction. Null when no rollback-attempt samples. */
  rollbackRecoverySuccessRate: number | null;
  /** Total records included in this computation. */
  sampleCount: number;
};

// ---------------------------------------------------------------------------
// KPI thresholds shape
// ---------------------------------------------------------------------------

export type IncidentOutcomeKpiThresholds = {
  /** Maximum acceptable p50 in ms. Null to skip gate. */
  maxTimeToFirstConfidentActionP50Ms?: number | null;
  /** Minimum acceptable rate 0..1. Null to skip gate. */
  minFirstActionSuccessRate?: number | null;
  /** Maximum acceptable rate 0..1. Null to skip gate. */
  maxReopenRateAfterSuggestedFix?: number | null;
  /** Maximum acceptable rate 0..1. Null to skip gate. */
  maxOverrideRateOnRecommendations?: number | null;
  /** Minimum acceptable rate 0..1. Null to skip gate. */
  minVerifyPathCompletionRate?: number | null;
  /** Minimum acceptable rate 0..1. Null to skip gate. */
  minRollbackRecoverySuccessRate?: number | null;
};

// ---------------------------------------------------------------------------
// Gate result shape
// ---------------------------------------------------------------------------

export type IncidentOutcomeKpiGateMetricResult = {
  metric: string;
  value: number | null;
  threshold: number | null;
  direction: 'max' | 'min';
  passed: boolean;
  /** True when the metric had no samples and was skipped. */
  skipped: boolean;
};

export type IncidentOutcomeKpiGateResult = {
  schemaVersion: 'v1';
  overallPass: boolean;
  sampleCount: number;
  metrics: IncidentOutcomeKpiGateMetricResult[];
};

// ---------------------------------------------------------------------------
// Default production thresholds (CLC5 baseline)
// ---------------------------------------------------------------------------

export const INCIDENT_OUTCOME_KPI_DEFAULT_THRESHOLDS: IncidentOutcomeKpiThresholds = {
  maxTimeToFirstConfidentActionP50Ms: 30_000, // 30 s p50
  minFirstActionSuccessRate: 0.6, // >= 60%
  maxReopenRateAfterSuggestedFix: 0.25, // <= 25%
  maxOverrideRateOnRecommendations: 0.35, // <= 35%
  minVerifyPathCompletionRate: 0.8, // >= 80%
  minRollbackRecoverySuccessRate: 0.7, // >= 70%
};

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function rate(truths: boolean[], total: number): number | null {
  if (total === 0) {
    return null;
  }
  return truths.filter(Boolean).length / total;
}

/**
 * Compute outcome KPIs from a batch of incident resolution records.
 * Records are expected to cover a single release window (e.g. last 7 days).
 */
export function computeIncidentOutcomeKpis(records: IncidentOutcomeRecord[]): IncidentOutcomeKpis {
  const ttfcaSamples = records
    .map((r) => r.timeToFirstConfidentActionMs)
    .filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0);

  const mutatingRecords = records.filter((r) => r.mutatingActionReachedVerify !== null);
  const rollbackRecords = records.filter((r) => r.rollbackAttemptResult !== null);

  return {
    timeToFirstConfidentActionP50Ms: median(ttfcaSamples),
    firstActionSuccessRate: rate(
      records.map((r) => r.firstActionSucceeded),
      records.length
    ),
    reopenRateAfterSuggestedFix: rate(
      records.map((r) => r.reopenedAfterSuggestedFix),
      records.length
    ),
    overrideRateOnRecommendations: rate(
      records.map((r) => r.recommendationOverridden),
      records.length
    ),
    verifyPathCompletionRate: rate(
      mutatingRecords.map((r) => r.mutatingActionReachedVerify as boolean),
      mutatingRecords.length
    ),
    rollbackRecoverySuccessRate: rate(
      rollbackRecords.map((r) => r.rollbackAttemptResult as boolean),
      rollbackRecords.length
    ),
    sampleCount: records.length,
  };
}

// ---------------------------------------------------------------------------
// Gate evaluation
// ---------------------------------------------------------------------------

/**
 * CLC5 Release Gate — evaluates computed KPIs against thresholds.
 * Returns machine-readable pass/fail per metric and overall gate result.
 * A metric with null value and null threshold is skipped (not a failure).
 */
export function computeIncidentOutcomeKpiGate(
  kpis: IncidentOutcomeKpis,
  thresholds: IncidentOutcomeKpiThresholds = INCIDENT_OUTCOME_KPI_DEFAULT_THRESHOLDS
): IncidentOutcomeKpiGateResult {
  const metrics: IncidentOutcomeKpiGateMetricResult[] = [];

  function evaluate(opts: {
    metric: string;
    value: number | null;
    threshold: number | null | undefined;
    direction: 'max' | 'min';
  }): void {
    const t = opts.threshold ?? null;
    const skipped = opts.value === null || t === null;
    let passed = true;
    if (!skipped) {
      passed = opts.direction === 'max' ? opts.value! <= t! : opts.value! >= t!;
    }
    metrics.push({
      metric: opts.metric,
      value: opts.value,
      threshold: t,
      direction: opts.direction,
      passed: skipped || passed,
      skipped,
    });
  }

  evaluate({
    metric: 'time_to_first_confident_action_p50_ms',
    value: kpis.timeToFirstConfidentActionP50Ms,
    threshold: thresholds.maxTimeToFirstConfidentActionP50Ms,
    direction: 'max',
  });

  evaluate({
    metric: 'first_action_success_rate',
    value: kpis.firstActionSuccessRate,
    threshold: thresholds.minFirstActionSuccessRate,
    direction: 'min',
  });

  evaluate({
    metric: 'reopen_rate_after_suggested_fix',
    value: kpis.reopenRateAfterSuggestedFix,
    threshold: thresholds.maxReopenRateAfterSuggestedFix,
    direction: 'max',
  });

  evaluate({
    metric: 'override_rate_on_recommendations',
    value: kpis.overrideRateOnRecommendations,
    threshold: thresholds.maxOverrideRateOnRecommendations,
    direction: 'max',
  });

  evaluate({
    metric: 'verify_path_completion_rate',
    value: kpis.verifyPathCompletionRate,
    threshold: thresholds.minVerifyPathCompletionRate,
    direction: 'min',
  });

  evaluate({
    metric: 'rollback_recovery_success_rate',
    value: kpis.rollbackRecoverySuccessRate,
    threshold: thresholds.minRollbackRecoverySuccessRate,
    direction: 'min',
  });

  const overallPass = metrics.every((m) => m.passed);

  return {
    schemaVersion: 'v1',
    overallPass,
    sampleCount: kpis.sampleCount,
    metrics,
  };
}
