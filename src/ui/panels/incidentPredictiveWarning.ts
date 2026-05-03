import type { StudioPredictionKpiStatus } from '../../utils/workspaceUsageTracker';

type IncidentPredictiveRiskLevel = 'low' | 'medium' | 'high' | 'critical';

type IncidentPredictiveActionPolicy = {
  requiresImpactReview: boolean;
  requiresVerifyPath: boolean;
  riskClass:
    | 'informational'
    | 'non-mutating-executable'
    | 'guarded-mutating'
    | 'high-risk-mutating';
};

type IncidentPredictiveImpactAssessment = {
  confidence: number;
  riskLevel: IncidentPredictiveRiskLevel;
  affectedFiles: string[];
  affectedModules: string[];
  affectedTests: string[];
  likelyFailureMode?: string;
  rationale: string[];
  verifyChecklist: string[];
};

type IncidentPredictiveDoctorEvidence = {
  errors?: number;
  warnings?: number;
  passed?: number;
};

type IncidentPredictiveGraphSummary = {
  nodeCount: number;
  edgeCount: number;
  supportedTopology: string;
};

type IncidentPredictiveSignalContext = {
  actionType: string;
  queryText?: string;
};

export type IncidentPredictiveWarningModel = {
  confidence: number;
  confidenceBand: 'low' | 'medium' | 'high';
  predictedFailure: string;
  affectedScopeSummary: string;
  nextSafeAction: string;
  verifyChecklist: string[];
  evidenceSources: string[];
};

export type IncidentPredictiveWarningCalibration = {
  warningConfidenceMin: number;
  falseAlarmRateMax: number;
  telemetrySuppressionBuffer: number;
};

const DEFAULT_PREDICTIVE_WARNING_CALIBRATION: IncidentPredictiveWarningCalibration = {
  warningConfidenceMin: 45,
  falseAlarmRateMax: 35,
  telemetrySuppressionBuffer: 8,
};

type PredictiveIntentSignal = {
  key:
    | 'schema-mutation'
    | 'auth-path'
    | 'refactor-path'
    | 'cache-path'
    | 'async-path'
    | 'config-path'
    | 'destructive-change';
  weight: number;
};

type PredictiveRuntimeSignal = {
  key:
    | 'runtime-exception'
    | 'dependency-connection'
    | 'spring-startup'
    | 'worker-queue'
    | 'migration-engine'
    | 'timeout'
    | 'http-failure'
    | 'memory-pressure';
  weight: number;
};

function uniqueNonEmpty(values: Array<string | undefined>, maxItems: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function derivePredictionConfidenceBand(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 75) {
    return 'high';
  }
  if (confidence >= 50) {
    return 'medium';
  }
  return 'low';
}

function riskWeight(riskLevel: IncidentPredictiveRiskLevel): number {
  switch (riskLevel) {
    case 'critical':
      return 24;
    case 'high':
      return 18;
    case 'medium':
      return 10;
    case 'low':
    default:
      return 2;
  }
}

function buildScopeSummary(input: IncidentPredictiveImpactAssessment): string {
  const moduleSummary =
    input.affectedModules.length > 0
      ? `Modules: ${input.affectedModules.slice(0, 3).join(', ')}`
      : undefined;
  const fileSummary =
    input.affectedFiles.length > 0
      ? `Files: ${Math.min(input.affectedFiles.length, 8)}`
      : undefined;
  const testSummary =
    input.affectedTests.length > 0
      ? `Tests: ${input.affectedTests.slice(0, 2).join(', ')}`
      : 'Tests: no candidate tests yet';

  return uniqueNonEmpty([moduleSummary, fileSummary, testSummary], 3).join(' • ');
}

function normalizeSignalText(values: Array<string | undefined>): string {
  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
    .toLowerCase();
}

function extractIntentSignals(input: {
  actionType: string;
  impactAssessment: IncidentPredictiveImpactAssessment;
  queryText?: string;
}): PredictiveIntentSignal[] {
  const haystack = normalizeSignalText([
    input.actionType,
    input.queryText,
    input.impactAssessment.likelyFailureMode,
    ...input.impactAssessment.rationale,
  ]);
  const signals: PredictiveIntentSignal[] = [];

  const addSignal = (signal: PredictiveIntentSignal) => {
    if (!signals.some((item) => item.key === signal.key)) {
      signals.push(signal);
    }
  };

  if (
    /(\bmigrat(?:e|ed|es|ing|ion|ions)?\b|\bschema\b|\bddl\b|\bcolumn\b|\btable\b|rollback sql|typeorm migration|alembic|flyway|liquibase)/.test(
      haystack
    )
  ) {
    addSignal({ key: 'schema-mutation', weight: 10 });
  }
  if (/auth|token|session|permission|rbac|oauth|jwt|login|identity/.test(haystack)) {
    addSignal({ key: 'auth-path', weight: 9 });
  }
  if (/refactor|rename|extract|move service|split module|reorganize|cleanup/.test(haystack)) {
    addSignal({ key: 'refactor-path', weight: 6 });
  }
  if (/cache|redis|invalidate|ttl|stale/.test(haystack)) {
    addSignal({ key: 'cache-path', weight: 6 });
  }
  if (/queue|worker|job|retry|consumer|background/.test(haystack)) {
    addSignal({ key: 'async-path', weight: 7 });
  }
  if (/config|env|startup|boot|deploy|docker|compose|port|binding/.test(haystack)) {
    addSignal({ key: 'config-path', weight: 6 });
  }
  if (/delete|drop|remove|destructive|truncate/.test(haystack)) {
    addSignal({ key: 'destructive-change', weight: 8 });
  }

  return signals;
}

function extractRuntimeSignals(input: {
  doctorEvidence?: IncidentPredictiveDoctorEvidence;
  queryText?: string;
}): PredictiveRuntimeSignal[] {
  const haystack = normalizeSignalText([input.queryText]);
  const signals: PredictiveRuntimeSignal[] = [];

  const addSignal = (signal: PredictiveRuntimeSignal) => {
    if (!signals.some((item) => item.key === signal.key)) {
      signals.push(signal);
    }
  };

  if ((input.doctorEvidence?.errors ?? 0) > 0) {
    addSignal({ key: 'runtime-exception', weight: 8 });
  }
  if (/traceback|exception|panic|stack trace|nullpointer|typeerror|referenceerror/.test(haystack)) {
    addSignal({ key: 'runtime-exception', weight: 10 });
  }
  if (
    /application failed to start|applicationcontext|beancreationexception|unsatisfieddependencyexception|no qualifying bean|failed to bind properties|embedded web server failed|tomcat.*failed|port \d+ (?:was )?already in use/.test(
      haystack
    )
  ) {
    addSignal({ key: 'spring-startup', weight: 11 });
  }
  if (
    /celery|bullmq|sidekiq|resque|rq worker|worker queue|queue consumer|consumer lag|dead letter|dlq|job failed|retry exhausted|visibility timeout|ack(?:nowledg(e)?ment)? timeout/.test(
      haystack
    )
  ) {
    addSignal({ key: 'worker-queue', weight: 9 });
  }
  if (
    /flyway|liquibase|alembic|prisma migrate|typeorm migration|knex migration|sequelize db:migrate|dbmate|goose migration|migration checksum|checksum mismatch|relation .* already exists|duplicate column|pending migrations|database migration failed/.test(
      haystack
    )
  ) {
    addSignal({ key: 'migration-engine', weight: 11 });
  }
  if (
    /econnrefused|connection refused|could not connect|database is unavailable|broker unavailable/.test(
      haystack
    )
  ) {
    addSignal({ key: 'dependency-connection', weight: 9 });
  }
  if (/timeout|timed out|deadline exceeded|504 gateway timeout/.test(haystack)) {
    addSignal({ key: 'timeout', weight: 8 });
  }
  if (
    /\b500\b|\b502\b|\b503\b|internal server error|bad gateway|service unavailable/.test(haystack)
  ) {
    addSignal({ key: 'http-failure', weight: 7 });
  }
  if (/oom|out of memory|heap limit|memory leak|gc overhead/.test(haystack)) {
    addSignal({ key: 'memory-pressure', weight: 9 });
  }

  return signals;
}

function formatIntentLabel(signal: PredictiveIntentSignal['key']): string {
  switch (signal) {
    case 'schema-mutation':
      return 'schema mutation';
    case 'auth-path':
      return 'auth path';
    case 'refactor-path':
      return 'refactor path';
    case 'cache-path':
      return 'cache path';
    case 'async-path':
      return 'async worker path';
    case 'config-path':
      return 'config/startup path';
    case 'destructive-change':
      return 'destructive change';
  }
}

function formatRuntimeLabel(signal: PredictiveRuntimeSignal['key']): string {
  switch (signal) {
    case 'runtime-exception':
      return 'runtime exceptions';
    case 'dependency-connection':
      return 'dependency connectivity';
    case 'spring-startup':
      return 'Spring startup failures';
    case 'worker-queue':
      return 'worker queue failures';
    case 'migration-engine':
      return 'migration engine failures';
    case 'timeout':
      return 'timeout symptoms';
    case 'http-failure':
      return 'HTTP failure responses';
    case 'memory-pressure':
      return 'memory pressure';
  }
}

function buildPredictedFailure(input: {
  impactAssessment: IncidentPredictiveImpactAssessment;
  doctorEvidence?: IncidentPredictiveDoctorEvidence;
  graphSummary: IncidentPredictiveGraphSummary;
  intentSignals: PredictiveIntentSignal[];
  runtimeSignals: PredictiveRuntimeSignal[];
}): string {
  if (input.impactAssessment.likelyFailureMode) {
    return input.impactAssessment.likelyFailureMode;
  }

  if (input.runtimeSignals.length > 0) {
    return `Pre-failure runtime anomalies detected: ${input.runtimeSignals
      .slice(0, 2)
      .map((signal) => formatRuntimeLabel(signal.key))
      .join(', ')}.`;
  }

  if (input.intentSignals.length > 0) {
    return `This ${input.intentSignals
      .slice(0, 2)
      .map((signal) => formatIntentLabel(signal.key))
      .join(' + ')} change is likely to break downstream behavior without early verification.`;
  }

  const doctorErrors = input.doctorEvidence?.errors ?? 0;
  if (doctorErrors > 0) {
    return `${doctorErrors} unresolved doctor error(s) plus ${input.graphSummary.supportedTopology} dependency signals indicate likely runtime regression.`;
  }

  if (input.impactAssessment.affectedTests.length === 0) {
    return 'Silent regression risk is elevated because affected scope has no deterministic candidate tests yet.';
  }

  if (input.impactAssessment.affectedModules.length > 0) {
    return `Cross-module regression is likely around ${input.impactAssessment.affectedModules.slice(0, 2).join(', ')} if this lands without early verification.`;
  }

  return `Pre-failure risk is elevated in ${input.graphSummary.supportedTopology} and should be checked before mutation.`;
}

function buildNextSafeAction(input: {
  impactAssessment: IncidentPredictiveImpactAssessment;
  actionPolicy: IncidentPredictiveActionPolicy;
  doctorEvidence?: IncidentPredictiveDoctorEvidence;
  telemetryStatus?: StudioPredictionKpiStatus | null;
  intentSignals: PredictiveIntentSignal[];
  runtimeSignals: PredictiveRuntimeSignal[];
}): string {
  const doctorErrors = input.doctorEvidence?.errors ?? 0;
  if (doctorErrors > 0) {
    return 'Run doctor remediation first, then re-check change impact and verify before apply.';
  }

  if (input.runtimeSignals.some((signal) => signal.key === 'dependency-connection')) {
    return 'Re-run the failing dependency path, verify the backing service is reachable, then capture a deterministic verify result.';
  }

  if (input.runtimeSignals.some((signal) => signal.key === 'spring-startup')) {
    return 'Re-run Spring startup with focused logs, verify bean/config binding, then capture the first deterministic boot failure.';
  }

  if (input.runtimeSignals.some((signal) => signal.key === 'worker-queue')) {
    return 'Pause mutation, replay the failed worker job or queue consumer path, and capture retry/dead-letter evidence before apply.';
  }

  if (input.runtimeSignals.some((signal) => signal.key === 'migration-engine')) {
    return 'Run the migration engine dry-run/status command, inspect ordering drift, then capture the deterministic migration outcome.';
  }

  if (input.intentSignals.some((signal) => signal.key === 'schema-mutation')) {
    return 'Review migration order, run a schema diff or dry-run, then execute the deterministic verify command before apply.';
  }

  if (input.intentSignals.some((signal) => signal.key === 'auth-path')) {
    return 'Run the auth-critical integration path first, then confirm doctor stays clean before apply.';
  }

  if (input.impactAssessment.affectedTests.length > 0) {
    return `Run ${input.impactAssessment.affectedTests[0]} and confirm doctor stays clean before apply.`;
  }

  if ((input.telemetryStatus?.metrics.falseAlarmRate ?? 0) > 35) {
    return 'Reduce claim confidence, run deterministic verification, and capture outcome to recalibrate prediction quality.';
  }

  if (input.actionPolicy.requiresImpactReview) {
    return 'Run change-impact-lite, inspect affected scope, and execute deterministic verification before apply.';
  }

  return 'Run the verify command and confirm no new doctor errors before closing the loop.';
}

function buildVerifyChecklist(input: {
  impactAssessment: IncidentPredictiveImpactAssessment;
  doctorEvidence?: IncidentPredictiveDoctorEvidence;
  telemetryStatus?: StudioPredictionKpiStatus | null;
  intentSignals: PredictiveIntentSignal[];
  runtimeSignals: PredictiveRuntimeSignal[];
}): string[] {
  const doctorErrors = input.doctorEvidence?.errors ?? 0;
  const checklist = uniqueNonEmpty(input.impactAssessment.verifyChecklist, 4);

  if (doctorErrors > 0) {
    checklist.push(
      `Run doctor checks and confirm ${doctorErrors} unresolved error(s) are cleared before apply.`
    );
  }

  if (input.impactAssessment.affectedTests.length > 0) {
    checklist.push(
      `Run candidate tests: ${input.impactAssessment.affectedTests.slice(0, 2).join(', ')}.`
    );
  } else {
    checklist.push(
      'No candidate tests were found; run the nearest deterministic smoke check before apply.'
    );
  }

  if (input.runtimeSignals.length > 0) {
    checklist.push(
      'Reproduce the failing runtime path and capture the first deterministic error lines before apply.'
    );
  }

  if (input.runtimeSignals.some((signal) => signal.key === 'spring-startup')) {
    checklist.push(
      'Run Spring boot/startup verification and capture bean/config binding failure evidence.'
    );
  }

  if (input.runtimeSignals.some((signal) => signal.key === 'worker-queue')) {
    checklist.push(
      'Replay the affected worker queue job or consumer path and capture retry/dead-letter outcome.'
    );
  }

  if (input.runtimeSignals.some((signal) => signal.key === 'migration-engine')) {
    checklist.push(
      'Run migration status/dry-run and capture ordering, checksum, or schema drift evidence.'
    );
  }

  if (input.intentSignals.some((signal) => signal.key === 'schema-mutation')) {
    checklist.push(
      'Run migration dry-run or schema diff before applying a schema-affecting change.'
    );
  }

  if (input.intentSignals.some((signal) => signal.key === 'auth-path')) {
    checklist.push(
      'Run auth and permission verification for the affected path before completion claim.'
    );
  }

  if (input.telemetryStatus?.gates.telemetryEvidencePass) {
    checklist.push('Capture verify outcome so predictive KPI evidence stays calibrated.');
  }

  return uniqueNonEmpty(checklist, 8);
}

function buildEvidenceSources(input: {
  evidenceSources: string[];
  doctorEvidence?: IncidentPredictiveDoctorEvidence;
  telemetryStatus?: StudioPredictionKpiStatus | null;
  verifyReady: boolean;
  verifySuccess: boolean;
  graphSummary: IncidentPredictiveGraphSummary;
  intentSignals: PredictiveIntentSignal[];
  runtimeSignals: PredictiveRuntimeSignal[];
  signalContext: IncidentPredictiveSignalContext;
}): string[] {
  const sources = [...input.evidenceSources];

  if (
    ((input.doctorEvidence?.errors ?? 0) > 0 || (input.doctorEvidence?.warnings ?? 0) > 0) &&
    !sources.includes('doctor')
  ) {
    sources.push('doctor-health');
  }

  if (
    (input.graphSummary.nodeCount > 0 || input.graphSummary.edgeCount > 0) &&
    !sources.includes('graph')
  ) {
    sources.push('graph-topology');
  }

  if (input.intentSignals.length > 0) {
    sources.push('change-intent');
  }

  if (input.runtimeSignals.length > 0) {
    sources.push('runtime-anomaly');
  }

  if (
    input.signalContext.actionType === 'terminal-bridge' ||
    /terminal output|traceback|stack trace|logs?/.test(
      (input.signalContext.queryText || '').toLowerCase()
    )
  ) {
    sources.push('terminal-logs');
  }

  if (input.telemetryStatus?.gates.telemetryEvidencePass) {
    sources.push('prediction-telemetry');
  }

  if (input.verifyReady) {
    sources.push('verify-ready');
  }

  if (!input.verifySuccess) {
    sources.push('verify-pending');
  }

  return uniqueNonEmpty(sources, 8);
}

function resolvePredictiveWarningCalibration(
  calibration?: Partial<IncidentPredictiveWarningCalibration>
): IncidentPredictiveWarningCalibration {
  return {
    warningConfidenceMin:
      typeof calibration?.warningConfidenceMin === 'number'
        ? Math.max(0, Math.min(100, calibration.warningConfidenceMin))
        : DEFAULT_PREDICTIVE_WARNING_CALIBRATION.warningConfidenceMin,
    falseAlarmRateMax:
      typeof calibration?.falseAlarmRateMax === 'number'
        ? Math.max(0, Math.min(100, calibration.falseAlarmRateMax))
        : DEFAULT_PREDICTIVE_WARNING_CALIBRATION.falseAlarmRateMax,
    telemetrySuppressionBuffer:
      typeof calibration?.telemetrySuppressionBuffer === 'number'
        ? Math.max(0, Math.min(30, calibration.telemetrySuppressionBuffer))
        : DEFAULT_PREDICTIVE_WARNING_CALIBRATION.telemetrySuppressionBuffer,
  };
}

export function buildIncidentPredictiveWarning(input: {
  impactAssessment: IncidentPredictiveImpactAssessment;
  actionPolicy: IncidentPredictiveActionPolicy;
  doctorEvidence?: IncidentPredictiveDoctorEvidence;
  graphSummary: IncidentPredictiveGraphSummary;
  evidenceSources: string[];
  telemetryStatus?: StudioPredictionKpiStatus | null;
  verifyReady: boolean;
  verifySuccess: boolean;
  signalContext: IncidentPredictiveSignalContext;
  calibration?: Partial<IncidentPredictiveWarningCalibration>;
}): IncidentPredictiveWarningModel | null {
  const doctorErrors = input.doctorEvidence?.errors ?? 0;
  const doctorWarnings = input.doctorEvidence?.warnings ?? 0;
  const telemetryMetrics = input.telemetryStatus?.metrics;
  const intentSignals = extractIntentSignals({
    actionType: input.signalContext.actionType,
    impactAssessment: input.impactAssessment,
    queryText: input.signalContext.queryText,
  });
  const runtimeSignals = extractRuntimeSignals({
    doctorEvidence: input.doctorEvidence,
    queryText: input.signalContext.queryText,
  });
  const calibration = resolvePredictiveWarningCalibration(input.calibration);

  let confidence = Math.round(input.impactAssessment.confidence * 0.5);
  confidence += riskWeight(input.impactAssessment.riskLevel);
  confidence += Math.min(20, doctorErrors * 8);
  confidence += Math.min(10, doctorWarnings * 3);
  confidence += input.graphSummary.nodeCount > 0 ? 8 : 0;
  confidence += input.graphSummary.edgeCount > 0 ? 6 : 0;
  confidence +=
    input.impactAssessment.affectedModules.length > 0 ||
    input.impactAssessment.affectedFiles.length > 0 ||
    input.impactAssessment.affectedTests.length > 0
      ? 8
      : 0;
  confidence += input.verifyReady ? 5 : 0;
  confidence -= input.verifySuccess ? 18 : 0;
  confidence += intentSignals.reduce((sum, signal) => sum + signal.weight, 0);
  confidence += runtimeSignals.reduce((sum, signal) => sum + signal.weight, 0);

  if (input.telemetryStatus?.gates.telemetryEvidencePass) {
    confidence += 5;
  }
  if ((telemetryMetrics?.predictivePrecision ?? 0) >= 65) {
    confidence += 8;
  } else if (
    telemetryMetrics?.predictivePrecision !== null &&
    telemetryMetrics?.predictivePrecision !== undefined &&
    telemetryMetrics.predictivePrecision < 50
  ) {
    confidence -= 8;
  }
  if ((telemetryMetrics?.falseAlarmRate ?? 0) > 35) {
    confidence -= 10;
  }
  if ((telemetryMetrics?.preventedIncidentRate ?? 0) >= 20) {
    confidence += 6;
  }

  confidence = Math.max(0, Math.min(100, confidence));

  const falseAlarmRate = telemetryMetrics?.falseAlarmRate ?? null;
  const hasStrongSignals =
    doctorErrors > 0 ||
    input.impactAssessment.riskLevel === 'high' ||
    input.impactAssessment.riskLevel === 'critical' ||
    input.actionPolicy.requiresImpactReview ||
    runtimeSignals.length > 0;
  const shouldSuppressForFalseAlarms =
    falseAlarmRate !== null &&
    falseAlarmRate > calibration.falseAlarmRateMax &&
    confidence < calibration.warningConfidenceMin + calibration.telemetrySuppressionBuffer &&
    !hasStrongSignals;

  const shouldWarn =
    !input.verifySuccess &&
    !shouldSuppressForFalseAlarms &&
    (confidence >= calibration.warningConfidenceMin || hasStrongSignals);

  if (!shouldWarn) {
    return null;
  }

  return {
    confidence,
    confidenceBand: derivePredictionConfidenceBand(confidence),
    predictedFailure: buildPredictedFailure({
      impactAssessment: input.impactAssessment,
      doctorEvidence: input.doctorEvidence,
      graphSummary: input.graphSummary,
      intentSignals,
      runtimeSignals,
    }),
    affectedScopeSummary: buildScopeSummary(input.impactAssessment),
    nextSafeAction: buildNextSafeAction({
      impactAssessment: input.impactAssessment,
      actionPolicy: input.actionPolicy,
      doctorEvidence: input.doctorEvidence,
      telemetryStatus: input.telemetryStatus,
      intentSignals,
      runtimeSignals,
    }),
    verifyChecklist: buildVerifyChecklist({
      impactAssessment: input.impactAssessment,
      doctorEvidence: input.doctorEvidence,
      telemetryStatus: input.telemetryStatus,
      intentSignals,
      runtimeSignals,
    }),
    evidenceSources: buildEvidenceSources({
      evidenceSources: input.evidenceSources,
      doctorEvidence: input.doctorEvidence,
      telemetryStatus: input.telemetryStatus,
      verifyReady: input.verifyReady,
      verifySuccess: input.verifySuccess,
      graphSummary: input.graphSummary,
      intentSignals,
      runtimeSignals,
      signalContext: input.signalContext,
    }),
  };
}
