import { describe, expect, it } from 'vitest';

import {
  buildDashboardSection51FromSnapshotJson,
  buildDashboardSection51FromSnapshotMarkdown,
  formatDashboardSection51Markdown,
  parseStabilizationSnapshotJson,
  parseStabilizationSnapshotMarkdown,
} from '../../webview-ui/src/lib/incidentStudioDashboardExport';

const SNAPSHOT_MARKDOWN = `# Workspai Stabilization KPI Snapshot

## Metadata

- Generated at: 2026-05-07T14:30:00Z
- Workspace: /home/user/myproject
- Window: last7d
- Window start: 2026-04-30T00:00:00Z
- Window end: 2026-05-07T00:00:00Z

## S01: Route Precision Breakdown

**Non-success share: 15%**

| Reason | Count | Share |
| --- | ---: | ---: |
| success (correct route) | 85 | 85% |
| bare_keyword_only | 8 | 8% |
| fix_preview_fallback | 4 | 4% |
| orchestrate_default | 2 | 2% |
| other | 1 | 1% |

## S02: Verify-Path Miss Reasons

- Verify-required actions: 50
- Verify-path present: 32
- Verify-incomplete warnings: 18
- Verify-path completion rate: 64%

- Incomplete checklist wording: 45 misses (45% of misses)
- Missing context in step 3: 28 misses (28% of misses)
- Ambiguous success criteria: 15 misses (15% of misses)

**Top miss reason: Incomplete checklist wording (45% of misses)**

## S04: Recovery Class Breakdown

- Verify failures: 40
- False confidence rate: 38%
- Rollback attempts: 35
- Rollback recovery success rate: 66%

Total recovery attempts: 50

| Recovery Class | Count | Share |
| --- | ---: | ---: |
| auto_rollback (high confidence) | 35 | 70% |
| manual_recovery (assisted) | 12 | 24% |
| unspecified (unknown) | 3 | 6% |

## S05: Repeat Resolution & Artifact Readiness

- Repeated incidents detected: 50
- Repeat incidents verified-resolved: 40
- Repeat incidents with artifact ready: 38
- S05 resolution rate: 80%
- S05-Cohort artifact rate: 76%`;

describe('incidentStudioDashboardExport', () => {
  it('parses fallback mix rows and non-success share from snapshot markdown', () => {
    const parsed = parseStabilizationSnapshotMarkdown(SNAPSHOT_MARKDOWN);

    expect(parsed.nonSuccessShare).toBe(15);
    expect(parsed.fallbackRows.find((row) => row.reason === 'success')?.count).toBe(85);
    expect(parsed.fallbackRows.find((row) => row.reason === 'bare_keyword_only')?.share).toBe(8);
  });

  it('parses S02 metrics and top verify-path miss reasons', () => {
    const parsed = parseStabilizationSnapshotMarkdown(SNAPSHOT_MARKDOWN);

    expect(parsed.verifyRequired).toBe(50);
    expect(parsed.verifyPathPresent).toBe(32);
    expect(parsed.verifyIncompleteWarnings).toBe(18);
    expect(parsed.verifyPathCompletionRate).toBe(64);
    expect(parsed.missReasons[0]).toEqual({
      reason: 'Incomplete checklist wording',
      count: 45,
      share: 45,
    });
  });

  it('parses S03 and S04 metrics including recovery class mix', () => {
    const parsed = parseStabilizationSnapshotMarkdown(SNAPSHOT_MARKDOWN);

    expect(parsed.verifyFailed).toBe(40);
    expect(parsed.falseConfidenceRate).toBe(38);
    expect(parsed.rollbackAttempted).toBe(35);
    expect(parsed.rollbackRecoverySuccessRate).toBe(66);
    expect(parsed.recoveryAutoRollback).toBe(35);
    expect(parsed.recoveryManual).toBe(12);
    expect(parsed.recoveryUnspecified).toBe(3);
  });

  it('parses S05 metrics and computes cohort validation status', () => {
    const parsed = parseStabilizationSnapshotMarkdown(SNAPSHOT_MARKDOWN);

    expect(parsed.repeatedIncidentsDetected).toBe(50);
    expect(parsed.repeatVerifiedResolved).toBe(40);
    expect(parsed.repeatWithArtifactReady).toBe(38);
    expect(parsed.s05ResolutionRate).toBe(80);
    expect(parsed.s05CohortRate).toBe(76);
    expect(parsed.cohortValidationStatus).toContain('GREEN');
  });

  it('formats dashboard section 5.1 markdown with all required subsections', () => {
    const parsed = parseStabilizationSnapshotMarkdown(SNAPSHOT_MARKDOWN);
    const section = formatDashboardSection51Markdown(parsed);

    expect(section).toContain('## 5.1 Stabilization Drilldown');
    expect(section).toContain('### Route Precision Breakdown');
    expect(section).toContain('### Verify Path Quality');
    expect(section).toContain('### False Confidence & Recovery Class Breakdown');
    expect(section).toContain('### Repeat Resolution & Artifact Cohort');
  });

  it('includes window boundaries and fallback non-success guidance', () => {
    const parsed = parseStabilizationSnapshotMarkdown(SNAPSHOT_MARKDOWN);
    const section = formatDashboardSection51Markdown(parsed);

    expect(section).toContain('Window start (windowStartAt): 2026-04-30T00:00:00Z');
    expect(section).toContain('Window end (windowEndAt): 2026-05-07T00:00:00Z');
    expect(section).toContain('Fallback non-success share: 15% (within target)');
  });

  it('builds section 5.1 directly from snapshot markdown with card window label override', () => {
    const section = buildDashboardSection51FromSnapshotMarkdown(
      SNAPSHOT_MARKDOWN,
      'last7d - 2026-04-30T00:00:00Z -> 2026-05-07T00:00:00Z'
    );

    expect(section).toContain(
      'Operational window label (from Incident Studio card): last7d - 2026-04-30T00:00:00Z -> 2026-05-07T00:00:00Z'
    );
    expect(section).toContain('top-2 miss reasons selected for next week');
  });

  it('handles sparse snapshots with N/A values without throwing', () => {
    const sparse = `# Workspai Stabilization KPI Snapshot\n\n## Metadata\n\n- Window: last7d`;
    const section = buildDashboardSection51FromSnapshotMarkdown(sparse);

    expect(section).toContain('verify-required actions (verifyRequired=true) | N/A');
    expect(section).toContain(
      'cohort validation status | No repeated incidents detected in this window'
    );
  });

  it('parses JSON snapshot with new operational metric keys', () => {
    const jsonSnapshot = JSON.stringify({
      window: {
        timeWindow: 'last7d',
        windowStartAt: '2026-04-30T00:00:00Z',
        windowEndAt: '2026-05-07T00:00:00Z',
      },
      metrics: {
        verifyRequired: 50,
        verifyPathPresent: 32,
        verifyPathCompletionRate: 64,
        verifyFailed: 40,
        rollbackAttempted: 35,
        falseConfidenceRate: 38,
        rollbackRecoverySuccessRate: 66,
        repeatedIncidentDetected: 50,
        repeatVerifiedResolved: 40,
        repeatVerifiedWithArtifactReady: 38,
        repeatVerifiedResolutionRate: 80,
        repeatVerifiedWithArtifactRate: 76,
      },
      operationalMetrics: {
        routePrecisionFallbackMix: {
          breakdown: {
            success: 85,
            bare_keyword_only: 8,
            fix_preview_fallback: 4,
            orchestrate_default: 2,
            other: 1,
          },
          nonSuccessShare: 15,
        },
        verifyPathMisses: {
          topReasons: [
            { reason: 'Incomplete checklist wording', count: 45 },
            { reason: 'Missing context in step 3', count: 28 },
          ],
        },
        recoveryClassMix: {
          breakdown: {
            auto_rollback: 35,
            manual_recovery: 12,
            unspecified: 3,
          },
        },
        repeatResolutionCohort: {
          repeatedIncidentsDetected: 50,
          repeatVerifiedResolved: 40,
          repeatWithArtifactReady: 38,
        },
      },
    });

    const parsed = parseStabilizationSnapshotJson(jsonSnapshot);

    expect(parsed.nonSuccessShare).toBe(15);
    expect(parsed.fallbackRows.find((row) => row.reason === 'success')?.count).toBe(85);
    expect(parsed.verifyIncompleteWarnings).toBe(18);
    expect(parsed.missReasons[0]?.reason).toBe('Incomplete checklist wording');
    expect(parsed.recoveryAutoRollback).toBe(35);
  });

  it('parses JSON snapshot with legacy operational metric keys (backward compatible)', () => {
    const jsonSnapshot = JSON.stringify({
      window: {
        timeWindow: 'last7d',
        windowStartAt: '2026-04-30T00:00:00Z',
        windowEndAt: '2026-05-07T00:00:00Z',
      },
      metrics: {
        verifyRequired: 50,
        verifyPathPresent: 32,
        verifyPathCompletionRate: 64,
        verifyFailed: 40,
        rollbackAttempted: 35,
        falseConfidenceRate: 38,
        rollbackRecoverySuccessRate: 66,
        repeatedIncidentDetected: 50,
        repeatVerifiedResolved: 40,
        repeatVerifiedWithArtifactReady: 38,
        repeatVerifiedResolutionRate: 80,
        repeatVerifiedWithArtifactRate: 76,
      },
      operationalMetrics: {
        s01_fallbackMix: {
          breakdown: {
            success: 85,
            bare_keyword_only: 8,
            fix_preview_fallback: 4,
            orchestrate_default: 2,
            other: 1,
          },
          nonSuccessShare: 15,
        },
        s02_verifyPathMisses: {
          topReasons: [
            { reason: 'Incomplete checklist wording', count: 45 },
            { reason: 'Missing context in step 3', count: 28 },
          ],
        },
        s04_recoveryClassMix: {
          breakdown: {
            auto_rollback: 35,
            manual_recovery: 12,
            unspecified: 3,
          },
        },
        s05_repeatResolutionCohort: {
          repeatedIncidentsDetected: 50,
          repeatVerifiedResolved: 40,
          repeatWithArtifactReady: 38,
        },
      },
    });

    const parsed = parseStabilizationSnapshotJson(jsonSnapshot);
    const section = buildDashboardSection51FromSnapshotJson(jsonSnapshot);

    expect(parsed.nonSuccessShare).toBe(15);
    expect(parsed.missReasons[0]?.reason).toBe('Incomplete checklist wording');
    expect(parsed.recoveryManual).toBe(12);
    expect(section).toContain('## 5.1 Stabilization Drilldown');
    expect(section).toContain('Fallback non-success share: 15% (within target)');
  });

  it('handles invalid JSON snapshots gracefully without throwing', () => {
    const brokenJson = '{ not-valid-json';

    const parsed = parseStabilizationSnapshotJson(brokenJson, 'last7d');
    const section = buildDashboardSection51FromSnapshotJson(brokenJson, 'last7d');

    expect(parsed.windowLabel).toBe('last7d');
    expect(parsed.nonSuccessShare).toBeNull();
    expect(section).toContain('## 5.1 Stabilization Drilldown');
    expect(section).toContain('Operational window label (from Incident Studio card): last7d');
    expect(section).toContain('Fallback non-success share: N/A (within target)');
  });
});
