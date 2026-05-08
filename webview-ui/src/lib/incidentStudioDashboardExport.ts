export type DashboardFallbackReason =
  | 'success'
  | 'bare_keyword_only'
  | 'fix_preview_fallback'
  | 'orchestrate_default'
  | 'other';

export type DashboardFallbackRow = {
  reason: DashboardFallbackReason;
  count: number;
  share: number;
};

export type DashboardMissReason = {
  reason: string;
  count: number;
  share: number;
};

export type ParsedStabilizationSnapshot = {
  windowLabel: string;
  windowStartAt: string;
  windowEndAt: string;
  fallbackRows: DashboardFallbackRow[];
  nonSuccessShare: number | null;
  verifyRequired: number | null;
  verifyPathPresent: number | null;
  verifyIncompleteWarnings: number | null;
  verifyPathCompletionRate: number | null;
  missReasons: DashboardMissReason[];
  verifyFailed: number | null;
  falseConfidenceRate: number | null;
  rollbackAttempted: number | null;
  rollbackRecoverySuccessRate: number | null;
  recoveryAutoRollback: number | null;
  recoveryAutoRollbackShare: number | null;
  recoveryManual: number | null;
  recoveryManualShare: number | null;
  recoveryUnspecified: number | null;
  recoveryUnspecifiedShare: number | null;
  repeatedIncidentsDetected: number | null;
  repeatVerifiedResolved: number | null;
  repeatWithArtifactReady: number | null;
  s05ResolutionRate: number | null;
  s05CohortRate: number | null;
  cohortValidationStatus: string;
};

const DEFAULT_FALLBACK_ROWS: DashboardFallbackRow[] = [
  { reason: 'success', count: 0, share: 0 },
  { reason: 'bare_keyword_only', count: 0, share: 0 },
  { reason: 'fix_preview_fallback', count: 0, share: 0 },
  { reason: 'orchestrate_default', count: 0, share: 0 },
  { reason: 'other', count: 0, share: 0 },
];

function toInt(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function extractIntByLabel(markdownText: string, label: string): number | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdownText.match(new RegExp(`^- ${escaped}:\\s*(\\d+)\\s*$`, 'm'));
  return toInt(match?.[1]);
}

function extractPercentByLabel(markdownText: string, label: string): number | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdownText.match(new RegExp(`^- ${escaped}:\\s*([0-9]+)%\\s*$`, 'm'));
  return toInt(match?.[1]);
}

function toDisplayValue(value: number | null): string {
  return value === null ? 'N/A' : String(value);
}

function toDisplayPercent(value: number | null): string {
  return value === null ? 'N/A' : `${value}%`;
}

function normalizeFallbackReason(raw: string): DashboardFallbackReason | null {
  const normalized = raw.toLowerCase().trim();
  if (normalized.startsWith('success')) {
    return 'success';
  }
  if (normalized.startsWith('bare_keyword_only')) {
    return 'bare_keyword_only';
  }
  if (normalized.startsWith('fix_preview_fallback')) {
    return 'fix_preview_fallback';
  }
  if (normalized.startsWith('orchestrate_default')) {
    return 'orchestrate_default';
  }
  if (normalized === 'other') {
    return 'other';
  }
  return null;
}

function buildCohortValidationStatus(
  detected: number | null,
  artifactReady: number | null
): string {
  if (!detected || detected <= 0) {
    return 'No repeated incidents detected in this window';
  }

  const artifactCount = artifactReady ?? 0;
  const coverage = Math.round((artifactCount / detected) * 100);

  if (coverage >= 70) {
    return `GREEN (${coverage}% coverage)`;
  }
  if (coverage >= 50) {
    return `YELLOW (${coverage}% coverage)`;
  }
  return `RED (${coverage}% coverage)`;
}

export function parseStabilizationSnapshotMarkdown(
  markdownText: string,
  fallbackWindowLabel?: string | null
): ParsedStabilizationSnapshot {
  const fallbackRows = [...DEFAULT_FALLBACK_ROWS];

  const tableRowRegex = /^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)%\s*\|$/gm;
  let tableRowMatch: RegExpExecArray | null = tableRowRegex.exec(markdownText);
  while (tableRowMatch) {
    const reason = normalizeFallbackReason(tableRowMatch[1]);
    if (reason) {
      const current = fallbackRows.find((entry) => entry.reason === reason);
      if (current) {
        current.count = Number.parseInt(tableRowMatch[2], 10);
        current.share = Number.parseInt(tableRowMatch[3], 10);
      }
    }
    tableRowMatch = tableRowRegex.exec(markdownText);
  }

  const missReasons: DashboardMissReason[] = [];
  const missReasonRegex = /^- (.+?):\s*(\d+) misses? \((\d+)% of misses\)$/gm;
  let missReasonMatch: RegExpExecArray | null = missReasonRegex.exec(markdownText);
  while (missReasonMatch) {
    missReasons.push({
      reason: missReasonMatch[1],
      count: Number.parseInt(missReasonMatch[2], 10),
      share: Number.parseInt(missReasonMatch[3], 10),
    });
    missReasonMatch = missReasonRegex.exec(markdownText);
  }

  const windowLabelMatch = markdownText.match(/^- Window:\s*(.+)$/m);
  const windowStartAtMatch = markdownText.match(/^- Window start:\s*(.+)$/m);
  const windowEndAtMatch = markdownText.match(/^- Window end:\s*(.+)$/m);
  const nonSuccessShareMatch = markdownText.match(/\*\*Non-success share:\s*([0-9]+)%\*\*/i);

  const recoveryAutoMatch = markdownText.match(
    /\|\s*auto_rollback[^|]*\|\s*(\d+)\s*\|\s*(\d+)%\s*\|/i
  );
  const recoveryManualMatch = markdownText.match(
    /\|\s*manual_recovery[^|]*\|\s*(\d+)\s*\|\s*(\d+)%\s*\|/i
  );
  const recoveryUnspecifiedMatch = markdownText.match(
    /\|\s*unspecified[^|]*\|\s*(\d+)\s*\|\s*(\d+)%\s*\|/i
  );

  const repeatedIncidentsDetected = extractIntByLabel(markdownText, 'Repeated incidents detected');
  const repeatVerifiedResolved = extractIntByLabel(
    markdownText,
    'Repeat incidents verified-resolved'
  );
  const repeatWithArtifactReady = extractIntByLabel(
    markdownText,
    'Repeat incidents with artifact ready'
  );

  return {
    windowLabel: fallbackWindowLabel || windowLabelMatch?.[1]?.trim() || 'N/A',
    windowStartAt: windowStartAtMatch?.[1]?.trim() || 'N/A',
    windowEndAt: windowEndAtMatch?.[1]?.trim() || 'N/A',
    fallbackRows,
    nonSuccessShare: toInt(nonSuccessShareMatch?.[1]),
    verifyRequired: extractIntByLabel(markdownText, 'Verify-required actions'),
    verifyPathPresent: extractIntByLabel(markdownText, 'Verify-path present'),
    verifyIncompleteWarnings: extractIntByLabel(markdownText, 'Verify-incomplete warnings'),
    verifyPathCompletionRate: extractPercentByLabel(markdownText, 'Verify-path completion rate'),
    missReasons,
    verifyFailed: extractIntByLabel(markdownText, 'Verify failures'),
    falseConfidenceRate: extractPercentByLabel(markdownText, 'False confidence rate'),
    rollbackAttempted: extractIntByLabel(markdownText, 'Rollback attempts'),
    rollbackRecoverySuccessRate: extractPercentByLabel(
      markdownText,
      'Rollback recovery success rate'
    ),
    recoveryAutoRollback: toInt(recoveryAutoMatch?.[1]),
    recoveryAutoRollbackShare: toInt(recoveryAutoMatch?.[2]),
    recoveryManual: toInt(recoveryManualMatch?.[1]),
    recoveryManualShare: toInt(recoveryManualMatch?.[2]),
    recoveryUnspecified: toInt(recoveryUnspecifiedMatch?.[1]),
    recoveryUnspecifiedShare: toInt(recoveryUnspecifiedMatch?.[2]),
    repeatedIncidentsDetected,
    repeatVerifiedResolved,
    repeatWithArtifactReady,
    s05ResolutionRate: extractPercentByLabel(markdownText, 'S05 resolution rate'),
    s05CohortRate: extractPercentByLabel(markdownText, 'S05-Cohort artifact rate'),
    cohortValidationStatus: buildCohortValidationStatus(
      repeatedIncidentsDetected,
      repeatWithArtifactReady
    ),
  };
}

export function formatDashboardSection51Markdown(parsed: ParsedStabilizationSnapshot): string {
  const missReasonSummary =
    parsed.missReasons.length > 0
      ? parsed.missReasons
          .map((entry) => `${entry.reason} (${entry.count}, ${entry.share}%)`)
          .join(', ')
      : 'No miss data available.';

  const topTwoMissReasons =
    parsed.missReasons.length > 0
      ? parsed.missReasons
          .slice(0, 2)
          .map(
            (entry) =>
              `- ${entry.reason} (${entry.share}% of misses) - Owner: TBD - Mitigation: TBD`
          )
          .join('\n')
      : '- None captured in snapshot - Owner: TBD - Mitigation: TBD';

  const recoveryClassMix =
    parsed.recoveryAutoRollbackShare === null &&
    parsed.recoveryManualShare === null &&
    parsed.recoveryUnspecifiedShare === null
      ? 'N/A'
      : `auto_rollback ${toDisplayPercent(parsed.recoveryAutoRollbackShare)}, manual_recovery ${toDisplayPercent(parsed.recoveryManualShare)}, unspecified ${toDisplayPercent(parsed.recoveryUnspecifiedShare)}`;

  const fallbackRow = (reason: DashboardFallbackReason) =>
    parsed.fallbackRows.find((entry) => entry.reason === reason) || { reason, count: 0, share: 0 };

  return [
    '## 5.1 Stabilization Drilldown',
    '',
    '### Route Precision Breakdown',
    '',
    `- Operational window label (from Incident Studio card): ${parsed.windowLabel}`,
    `- Window start (windowStartAt): ${parsed.windowStartAt}`,
    `- Window end (windowEndAt): ${parsed.windowEndAt}`,
    '',
    '| Fallback Reason | Count | Share | Target Note |',
    '|---|---:|---:|---|',
    `| success | ${fallbackRow('success').count} | ${fallbackRow('success').share}% | should dominate (higher is better) |`,
    `| bare_keyword_only | ${fallbackRow('bare_keyword_only').count} | ${fallbackRow('bare_keyword_only').share}% | reduce by clarifying intent prompts |`,
    `| fix_preview_fallback | ${fallbackRow('fix_preview_fallback').count} | ${fallbackRow('fix_preview_fallback').share}% | reduce via code-context nudges |`,
    `| orchestrate_default | ${fallbackRow('orchestrate_default').count} | ${fallbackRow('orchestrate_default').share}% | reduce with better route vocabulary |`,
    `| other | ${fallbackRow('other').count} | ${fallbackRow('other').share}% | investigate telemetry edge-cases and reclassify if recurring |`,
    '',
    `- Fallback non-success share: ${toDisplayPercent(parsed.nonSuccessShare)} ${parsed.nonSuccessShare !== null && parsed.nonSuccessShare > 20 ? '(above 20% target)' : '(within target)'}`,
    '',
    '### Verify Path Quality',
    '',
    '| Metric | Value | Notes |',
    '|---|---:|---|',
    `| verify-required actions (verifyRequired=true) | ${toDisplayValue(parsed.verifyRequired)} | denominator |`,
    `| verify-path present (verifyPathPresent=true) | ${toDisplayValue(parsed.verifyPathPresent)} | numerator |`,
    `| verify-incomplete warnings | ${toDisplayValue(parsed.verifyIncompleteWarnings)} | track spike causes |`,
    `| top verifyPathReason values (misses) | ${missReasonSummary} | copy from Stabilization snapshot verify-path misses |`,
    `| top-2 miss reasons selected for next week | ${
      parsed.missReasons
        .slice(0, 2)
        .map((entry) => entry.reason)
        .join('; ') || 'None'
    } | must have owner and mitigation action |`,
    '',
    topTwoMissReasons,
    '',
    '### False Confidence & Recovery Class Breakdown',
    '',
    '| Metric | Value | Notes |',
    '|---|---:|---|',
    `| verify failures | ${toDisplayValue(parsed.verifyFailed)} | false confidence denominator |`,
    `| false confidence rate | ${toDisplayPercent(parsed.falseConfidenceRate)} | target <=40% |`,
    `| rollback attempts | ${toDisplayValue(parsed.rollbackAttempted)} | recovery denominator |`,
    `| rollback success (auto_rollback) | ${toDisplayValue(parsed.recoveryAutoRollback)} | count from recovery class breakdown |`,
    `| rollback success (manual_recovery) | ${toDisplayValue(parsed.recoveryManual)} | count from recovery class breakdown |`,
    `| recovery class mix | ${recoveryClassMix} | copy from Stabilization snapshot recovery class mix |`,
    `| rollback recovery success rate | ${toDisplayPercent(parsed.rollbackRecoverySuccessRate)} | target >=60% |`,
    '',
    '### Repeat Resolution & Artifact Cohort',
    '',
    '| Metric | Value | Notes |',
    '|---|---:|---|',
    `| repeated incidents detected | ${toDisplayValue(parsed.repeatedIncidentsDetected)} | from repeated_incident_detected events |`,
    `| repeat incidents verified-resolved | ${toDisplayValue(parsed.repeatVerifiedResolved)} | from verify_passed where repeatedIncident=true |`,
    `| repeat verified resolution rate | ${toDisplayPercent(parsed.s05ResolutionRate)} | target >=50% |`,
    `| repeat incidents with artifact ready | ${toDisplayValue(parsed.repeatWithArtifactReady)} | from verified_outcome_ready_for_artifact with replayReady=true |`,
    `| repeat with artifact rate (cohort) | ${toDisplayPercent(parsed.s05CohortRate)} | target >= base repeat resolution; if gap >20%, debug artifact capture |`,
    `| cohort validation status | ${parsed.cohortValidationStatus} | green if S05-Cohort >=70% of detected repeats |`,
  ].join('\n');
}

export function buildDashboardSection51FromSnapshotMarkdown(
  markdownText: string,
  fallbackWindowLabel?: string | null
): string {
  const parsed = parseStabilizationSnapshotMarkdown(markdownText, fallbackWindowLabel);
  return formatDashboardSection51Markdown(parsed);
}

type GenericRecord = Record<string, unknown>;

function asRecord(value: unknown): GenericRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as GenericRecord;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseFallbackRowsFromBreakdown(breakdown: GenericRecord | null): DashboardFallbackRow[] {
  const success = asNumber(breakdown?.success) ?? 0;
  const bareKeywordOnly = asNumber(breakdown?.bare_keyword_only) ?? 0;
  const fixPreviewFallback = asNumber(breakdown?.fix_preview_fallback) ?? 0;
  const orchestrateDefault = asNumber(breakdown?.orchestrate_default) ?? 0;
  const other = asNumber(breakdown?.other) ?? 0;
  const total = success + bareKeywordOnly + fixPreviewFallback + orchestrateDefault + other;
  const share = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  return [
    { reason: 'success', count: Math.round(success), share: share(success) },
    {
      reason: 'bare_keyword_only',
      count: Math.round(bareKeywordOnly),
      share: share(bareKeywordOnly),
    },
    {
      reason: 'fix_preview_fallback',
      count: Math.round(fixPreviewFallback),
      share: share(fixPreviewFallback),
    },
    {
      reason: 'orchestrate_default',
      count: Math.round(orchestrateDefault),
      share: share(orchestrateDefault),
    },
    { reason: 'other', count: Math.round(other), share: share(other) },
  ];
}

export function parseStabilizationSnapshotJson(
  jsonText: string,
  fallbackWindowLabel?: string | null
): ParsedStabilizationSnapshot {
  let parsedJson: GenericRecord = {};
  try {
    const maybeParsed = JSON.parse(jsonText);
    parsedJson = asRecord(maybeParsed) || {};
  } catch {
    parsedJson = {};
  }

  const window = asRecord(parsedJson.window);
  const metrics = asRecord(parsedJson.metrics);
  const operationalMetrics = asRecord(parsedJson.operationalMetrics);

  const routePrecisionFallbackMix =
    asRecord(operationalMetrics?.routePrecisionFallbackMix) ||
    asRecord(operationalMetrics?.s01_fallbackMix);
  const verifyPathMisses =
    asRecord(operationalMetrics?.verifyPathMisses) ||
    asRecord(operationalMetrics?.s02_verifyPathMisses);
  const recoveryClassMix =
    asRecord(operationalMetrics?.recoveryClassMix) ||
    asRecord(operationalMetrics?.s04_recoveryClassMix);
  const repeatResolutionCohort =
    asRecord(operationalMetrics?.repeatResolutionCohort) ||
    asRecord(operationalMetrics?.s05_repeatResolutionCohort);

  const verifyTopReasonsRaw = verifyPathMisses?.topReasons;
  const verifyTopReasons = Array.isArray(verifyTopReasonsRaw)
    ? verifyTopReasonsRaw
        .map((item) => {
          const row = asRecord(item);
          const reason = typeof row?.reason === 'string' ? row.reason : null;
          const count = asNumber(row?.count);
          if (!reason || count === null) {
            return null;
          }
          return { reason, count: Math.round(count) };
        })
        .filter((item): item is { reason: string; count: number } => item !== null)
    : [];

  const verifyMissTotal = verifyTopReasons.reduce((sum, item) => sum + item.count, 0);
  const missReasons: DashboardMissReason[] = verifyTopReasons.map((entry) => ({
    reason: entry.reason,
    count: entry.count,
    share: verifyMissTotal > 0 ? Math.round((entry.count / verifyMissTotal) * 100) : 0,
  }));

  const recoveryBreakdown = asRecord(recoveryClassMix?.breakdown);
  const recoveryAutoRollback = asNumber(recoveryBreakdown?.auto_rollback) ?? 0;
  const recoveryManual = asNumber(recoveryBreakdown?.manual_recovery) ?? 0;
  const recoveryUnspecified = asNumber(recoveryBreakdown?.unspecified) ?? 0;
  const recoveryTotal = recoveryAutoRollback + recoveryManual + recoveryUnspecified;
  const recoveryShare = (value: number) =>
    recoveryTotal > 0 ? Math.round((value / recoveryTotal) * 100) : 0;

  const repeatedIncidentsDetected =
    asNumber(metrics?.repeatedIncidentDetected) ??
    asNumber(repeatResolutionCohort?.repeatedIncidentsDetected);
  const repeatVerifiedResolved =
    asNumber(metrics?.repeatVerifiedResolved) ??
    asNumber(repeatResolutionCohort?.repeatVerifiedResolved);
  const repeatWithArtifactReady =
    asNumber(metrics?.repeatVerifiedWithArtifactReady) ??
    asNumber(repeatResolutionCohort?.repeatWithArtifactReady);

  const roundedRepeatedDetected =
    repeatedIncidentsDetected === null ? null : Math.round(repeatedIncidentsDetected);
  const roundedRepeatVerifiedResolved =
    repeatVerifiedResolved === null ? null : Math.round(repeatVerifiedResolved);
  const roundedRepeatWithArtifactReady =
    repeatWithArtifactReady === null ? null : Math.round(repeatWithArtifactReady);

  return {
    windowLabel:
      fallbackWindowLabel || (typeof window?.timeWindow === 'string' ? window.timeWindow : 'N/A'),
    windowStartAt: typeof window?.windowStartAt === 'string' ? window.windowStartAt : 'N/A',
    windowEndAt: typeof window?.windowEndAt === 'string' ? window.windowEndAt : 'N/A',
    fallbackRows: parseFallbackRowsFromBreakdown(asRecord(routePrecisionFallbackMix?.breakdown)),
    nonSuccessShare: asNumber(routePrecisionFallbackMix?.nonSuccessShare),
    verifyRequired: asNumber(metrics?.verifyRequired),
    verifyPathPresent: asNumber(metrics?.verifyPathPresent),
    verifyIncompleteWarnings:
      asNumber(metrics?.verifyRequired) !== null && asNumber(metrics?.verifyPathPresent) !== null
        ? Math.max(
            Math.round(
              (asNumber(metrics?.verifyRequired) ?? 0) - (asNumber(metrics?.verifyPathPresent) ?? 0)
            ),
            0
          )
        : null,
    verifyPathCompletionRate: asNumber(metrics?.verifyPathCompletionRate),
    missReasons,
    verifyFailed: asNumber(metrics?.verifyFailed),
    falseConfidenceRate: asNumber(metrics?.falseConfidenceRate),
    rollbackAttempted: asNumber(metrics?.rollbackAttempted),
    rollbackRecoverySuccessRate: asNumber(metrics?.rollbackRecoverySuccessRate),
    recoveryAutoRollback: Math.round(recoveryAutoRollback),
    recoveryAutoRollbackShare: recoveryShare(recoveryAutoRollback),
    recoveryManual: Math.round(recoveryManual),
    recoveryManualShare: recoveryShare(recoveryManual),
    recoveryUnspecified: Math.round(recoveryUnspecified),
    recoveryUnspecifiedShare: recoveryShare(recoveryUnspecified),
    repeatedIncidentsDetected: roundedRepeatedDetected,
    repeatVerifiedResolved: roundedRepeatVerifiedResolved,
    repeatWithArtifactReady: roundedRepeatWithArtifactReady,
    s05ResolutionRate: asNumber(metrics?.repeatVerifiedResolutionRate),
    s05CohortRate: asNumber(metrics?.repeatVerifiedWithArtifactRate),
    cohortValidationStatus: buildCohortValidationStatus(
      roundedRepeatedDetected,
      roundedRepeatWithArtifactReady
    ),
  };
}

export function buildDashboardSection51FromSnapshotJson(
  jsonText: string,
  fallbackWindowLabel?: string | null
): string {
  const parsed = parseStabilizationSnapshotJson(jsonText, fallbackWindowLabel);
  return formatDashboardSection51Markdown(parsed);
}
