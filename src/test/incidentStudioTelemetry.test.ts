import { describe, expect, it } from 'vitest';

import {
  type CachedIncidentStudioTelemetry,
  buildIncidentStudioTelemetryFromCache,
  buildIncidentStudioTelemetryPayload,
  shouldUseIncidentStudioTelemetryCache,
} from '../ui/panels/incidentStudioTelemetry';

describe('incidentStudioTelemetry', () => {
  it('uses cached command/onboarding summaries but always overrides doctor summary with fresh evidence', () => {
    const cachedData: CachedIncidentStudioTelemetry = {
      commandSummary: {
        totalEvents: 12,
        lastCommand: 'workspai.aiQuickActions',
        lastCommandAt: '2026-04-25T04:00:00.000Z',
        commandUsage: [{ command: 'workspai.aiQuickActions', count: 12 }],
        surfaceBreakdown: {
          actionEvents: 10,
          askEvents: 2,
          actionVsAskShare: 83.33,
        },
      },
      onboardingSummary: {
        followupShown: 4,
        followupClicked: 2,
        overallFollowupClickThroughRate: 50,
      },
      ctaVariantBreakdown: {
        workspacePath: '/tmp/demo',
        timeWindow: 'last7d',
        windowStartAt: '2026-04-18T04:00:00.000Z',
        windowEndAt: '2026-04-25T04:00:00.000Z',
        variants: [
          {
            variant: 'single',
            loopStarted: 5,
            nextActionClicked: 3,
            actionExecuted: 2,
            verifyPassed: 1,
            verifyFailed: 1,
            verifyCompletionRate: 100,
            actionVsAskShare: 40,
            loopCompleted: 1,
            abandoned: 2,
          },
        ],
      },
      studioHardGateStatus: {
        workspacePath: '/tmp/demo',
        timeWindow: 'last7d',
        windowStartAt: '2026-04-18T04:00:00.000Z',
        windowEndAt: '2026-04-25T04:00:00.000Z',
        thresholds: {
          verifyPhaseReachMin: 80,
          bridgeRouteCompletionMin: 95,
        },
        metrics: {
          loopStarted: 5,
          nextActionClicked: 3,
          actionExecuted: 2,
          verifyOutcomes: 2,
          verifyPhaseReach: 100,
          bridgeRouteCompletionRate: 40,
        },
        gates: {
          verifyPhaseReachPass: true,
          bridgeRouteCompletionPass: false,
          telemetryEvidencePass: true,
          overallPass: false,
        },
      },
      studioRollbackKpiStatus: {
        workspacePath: '/tmp/demo',
        timeWindow: 'last7d',
        windowStartAt: '2026-04-18T04:00:00.000Z',
        windowEndAt: '2026-04-25T04:00:00.000Z',
        thresholds: {
          verifyAutoRollbackSuccessRateMin: 60,
          falseConfidenceRateMax: 40,
        },
        metrics: {
          verifyFailed: 3,
          rollbackAttempted: 2,
          rollbackSucceeded: 1,
          verifyAutoRollbackSuccessRate: 50,
          falseConfidenceRate: 66.67,
        },
        gates: {
          telemetryEvidencePass: true,
          verifyAutoRollbackSuccessRatePass: false,
          falseConfidenceRatePass: false,
          overallPass: false,
        },
      },
      studioReproPackKpiStatus: {
        workspacePath: '/tmp/demo',
        timeWindow: 'last7d',
        windowStartAt: '2026-04-18T04:00:00.000Z',
        windowEndAt: '2026-04-25T04:00:00.000Z',
        thresholds: {
          reproPackShareRateMin: 20,
          replayToResolutionRateMin: 60,
        },
        metrics: {
          reproPackCaptured: 5,
          reproPackExported: 2,
          reproPackImported: 2,
          incidentReplayReady: 4,
          incidentReplayMemoryEnriched: 1,
          reproPackShareRate: 40,
          replayToResolutionRate: 50,
        },
        gates: {
          telemetryEvidencePass: true,
          reproPackShareRatePass: true,
          replayToResolutionRatePass: false,
          overallPass: false,
        },
      },
      doctorSummary: {
        workspaceName: 'stale-workspace',
        generatedAt: '2026-04-25T03:55:00.000Z',
      },
      timestamp: Date.now(),
    };

    const freshDoctorSummary = {
      workspaceName: 'fresh-workspace',
      generatedAt: '2026-04-25T04:05:00.000Z',
      issueCount: 1,
    };

    expect(buildIncidentStudioTelemetryFromCache(cachedData, freshDoctorSummary)).toEqual({
      commandSummary: cachedData.commandSummary,
      onboardingSummary: cachedData.onboardingSummary,
      ctaVariantBreakdown: cachedData.ctaVariantBreakdown,
      studioHardGateStatus: cachedData.studioHardGateStatus,
      studioRollbackKpiStatus: cachedData.studioRollbackKpiStatus,
      studioReproPackKpiStatus: cachedData.studioReproPackKpiStatus,
      doctorSummary: {
        ...freshDoctorSummary,
        ctaVariantBreakdown: cachedData.ctaVariantBreakdown,
      },
    });
  });

  it('accepts cache only inside ttl and rejects expired entries', () => {
    const now = 1000;
    const ttlMs = 250;

    expect(
      shouldUseIncidentStudioTelemetryCache(
        {
          commandSummary: null,
          onboardingSummary: null,
          doctorSummary: null,
          timestamp: 751,
        },
        now,
        ttlMs
      )
    ).toBe(true);

    expect(
      shouldUseIncidentStudioTelemetryCache(
        {
          commandSummary: null,
          onboardingSummary: null,
          doctorSummary: null,
          timestamp: 750,
        },
        now,
        ttlMs
      )
    ).toBe(false);
  });

  it('builds a stable telemetry payload contract from tracker summaries', () => {
    expect(
      buildIncidentStudioTelemetryPayload(
        {
          totalEvents: 9,
          lastCommand: 'workspai.studio.verify_passed',
          lastCommandAt: '2026-04-25T04:10:00.000Z',
          commandUsage: [{ command: 'workspai.studio.verify_passed', count: 1 }],
          surfaceBreakdown: {
            actionEvents: 9,
            askEvents: 0,
            actionVsAskShare: 100,
          },
        },
        {
          followupShown: 3,
          followupClicked: 1,
          overallFollowupClickThroughRate: 33.33,
        },
        {
          workspacePath: '/tmp/demo',
          timeWindow: 'last7d',
          windowStartAt: '2026-04-18T04:00:00.000Z',
          windowEndAt: '2026-04-25T04:10:00.000Z',
          variants: [
            {
              variant: 'multi',
              loopStarted: 6,
              nextActionClicked: 1,
              actionExecuted: 4,
              verifyPassed: 3,
              verifyFailed: 1,
              verifyCompletionRate: 100,
              actionVsAskShare: 80,
              loopCompleted: 2,
              abandoned: 1,
            },
          ],
        },
        { workspaceName: 'demo' },
        {
          workspacePath: '/tmp/demo',
          timeWindow: 'last7d',
          windowStartAt: '2026-04-18T04:00:00.000Z',
          windowEndAt: '2026-04-25T04:10:00.000Z',
          thresholds: {
            verifyPhaseReachMin: 80,
            bridgeRouteCompletionMin: 95,
          },
          metrics: {
            loopStarted: 6,
            nextActionClicked: 1,
            actionExecuted: 4,
            verifyOutcomes: 4,
            verifyPhaseReach: 100,
            bridgeRouteCompletionRate: 66.67,
          },
          gates: {
            verifyPhaseReachPass: true,
            bridgeRouteCompletionPass: false,
            telemetryEvidencePass: true,
            overallPass: false,
          },
        },
        {
          workspacePath: '/tmp/demo',
          timeWindow: 'last7d',
          windowStartAt: '2026-04-18T04:00:00.000Z',
          windowEndAt: '2026-04-25T04:10:00.000Z',
          thresholds: {
            verifyAutoRollbackSuccessRateMin: 60,
            falseConfidenceRateMax: 40,
          },
          metrics: {
            verifyFailed: 4,
            rollbackAttempted: 3,
            rollbackSucceeded: 2,
            verifyAutoRollbackSuccessRate: 66.67,
            falseConfidenceRate: 50,
          },
          gates: {
            telemetryEvidencePass: true,
            verifyAutoRollbackSuccessRatePass: true,
            falseConfidenceRatePass: false,
            overallPass: false,
          },
        },
        {
          workspacePath: '/tmp/demo',
          timeWindow: 'last7d',
          windowStartAt: '2026-04-18T04:00:00.000Z',
          windowEndAt: '2026-04-25T04:10:00.000Z',
          thresholds: {
            reproPackShareRateMin: 20,
            replayToResolutionRateMin: 60,
          },
          metrics: {
            reproPackCaptured: 5,
            reproPackExported: 3,
            reproPackImported: 2,
            incidentReplayReady: 4,
            incidentReplayMemoryEnriched: 2,
            reproPackShareRate: 60,
            replayToResolutionRate: 100,
          },
          gates: {
            telemetryEvidencePass: true,
            reproPackShareRatePass: true,
            replayToResolutionRatePass: true,
            overallPass: true,
          },
        }
      )
    ).toEqual({
      commandSummary: {
        totalEvents: 9,
        lastCommand: 'workspai.studio.verify_passed',
        lastCommandAt: '2026-04-25T04:10:00.000Z',
        commandUsage: [{ command: 'workspai.studio.verify_passed', count: 1 }],
        surfaceBreakdown: {
          actionEvents: 9,
          askEvents: 0,
          actionVsAskShare: 100,
        },
      },
      onboardingSummary: {
        followupShown: 3,
        followupClicked: 1,
        overallFollowupClickThroughRate: 33.33,
      },
      ctaVariantBreakdown: {
        workspacePath: '/tmp/demo',
        timeWindow: 'last7d',
        windowStartAt: '2026-04-18T04:00:00.000Z',
        windowEndAt: '2026-04-25T04:10:00.000Z',
        variants: [
          {
            variant: 'multi',
            loopStarted: 6,
            nextActionClicked: 1,
            actionExecuted: 4,
            verifyPassed: 3,
            verifyFailed: 1,
            verifyCompletionRate: 100,
            actionVsAskShare: 80,
            loopCompleted: 2,
            abandoned: 1,
          },
        ],
      },
      studioHardGateStatus: {
        workspacePath: '/tmp/demo',
        timeWindow: 'last7d',
        windowStartAt: '2026-04-18T04:00:00.000Z',
        windowEndAt: '2026-04-25T04:10:00.000Z',
        thresholds: {
          verifyPhaseReachMin: 80,
          bridgeRouteCompletionMin: 95,
        },
        metrics: {
          loopStarted: 6,
          nextActionClicked: 1,
          actionExecuted: 4,
          verifyOutcomes: 4,
          verifyPhaseReach: 100,
          bridgeRouteCompletionRate: 66.67,
        },
        gates: {
          verifyPhaseReachPass: true,
          bridgeRouteCompletionPass: false,
          telemetryEvidencePass: true,
          overallPass: false,
        },
      },
      studioRollbackKpiStatus: {
        workspacePath: '/tmp/demo',
        timeWindow: 'last7d',
        windowStartAt: '2026-04-18T04:00:00.000Z',
        windowEndAt: '2026-04-25T04:10:00.000Z',
        thresholds: {
          verifyAutoRollbackSuccessRateMin: 60,
          falseConfidenceRateMax: 40,
        },
        metrics: {
          verifyFailed: 4,
          rollbackAttempted: 3,
          rollbackSucceeded: 2,
          verifyAutoRollbackSuccessRate: 66.67,
          falseConfidenceRate: 50,
        },
        gates: {
          telemetryEvidencePass: true,
          verifyAutoRollbackSuccessRatePass: true,
          falseConfidenceRatePass: false,
          overallPass: false,
        },
      },
      studioReproPackKpiStatus: {
        workspacePath: '/tmp/demo',
        timeWindow: 'last7d',
        windowStartAt: '2026-04-18T04:00:00.000Z',
        windowEndAt: '2026-04-25T04:10:00.000Z',
        thresholds: {
          reproPackShareRateMin: 20,
          replayToResolutionRateMin: 60,
        },
        metrics: {
          reproPackCaptured: 5,
          reproPackExported: 3,
          reproPackImported: 2,
          incidentReplayReady: 4,
          incidentReplayMemoryEnriched: 2,
          reproPackShareRate: 60,
          replayToResolutionRate: 100,
        },
        gates: {
          telemetryEvidencePass: true,
          reproPackShareRatePass: true,
          replayToResolutionRatePass: true,
          overallPass: true,
        },
      },
      doctorSummary: {
        workspaceName: 'demo',
        ctaVariantBreakdown: {
          workspacePath: '/tmp/demo',
          timeWindow: 'last7d',
          windowStartAt: '2026-04-18T04:00:00.000Z',
          windowEndAt: '2026-04-25T04:10:00.000Z',
          variants: [
            {
              variant: 'multi',
              loopStarted: 6,
              nextActionClicked: 1,
              actionExecuted: 4,
              verifyPassed: 3,
              verifyFailed: 1,
              verifyCompletionRate: 100,
              actionVsAskShare: 80,
              loopCompleted: 2,
              abandoned: 1,
            },
          ],
        },
      },
    });
  });

  it('preserves clarification-gate command usage entries in commandSummary payload', () => {
    const payload = buildIncidentStudioTelemetryPayload(
      {
        totalEvents: 4,
        lastCommand: 'workspai.aimodal.clarification_gate',
        lastCommandAt: '2026-04-25T04:10:00.000Z',
        commandUsage: [
          { command: 'workspai.aimodal.clarification_gate', count: 3 },
          { command: 'workspai.chat.clarification_gate', count: 1 },
        ],
        surfaceBreakdown: {
          actionEvents: 0,
          askEvents: 4,
          actionVsAskShare: 0,
        },
      },
      null,
      null,
      null,
      null,
      null,
      null
    );

    expect(payload.commandSummary?.lastCommand).toBe('workspai.aimodal.clarification_gate');
    expect(payload.commandSummary?.commandUsage).toEqual([
      { command: 'workspai.aimodal.clarification_gate', count: 3 },
      { command: 'workspai.chat.clarification_gate', count: 1 },
    ]);
  });

  it('preserves null verify completion rate so incomplete verify paths are not shown as completed', () => {
    const payload = buildIncidentStudioTelemetryPayload(
      null,
      null,
      {
        workspacePath: '/tmp/demo',
        timeWindow: 'last7d',
        windowStartAt: '2026-04-18T04:00:00.000Z',
        windowEndAt: '2026-04-25T04:10:00.000Z',
        variants: [
          {
            variant: 'single',
            loopStarted: 4,
            nextActionClicked: 2,
            actionExecuted: 1,
            verifyPassed: 0,
            verifyFailed: 0,
            verifyCompletionRate: null,
            actionVsAskShare: 25,
            loopCompleted: 0,
            abandoned: 1,
          },
        ],
      },
      { workspaceName: 'demo' }
    );

    expect(payload.ctaVariantBreakdown?.variants[0]?.verifyCompletionRate).toBeNull();
    expect(
      (
        payload.doctorSummary as {
          ctaVariantBreakdown?: { variants: Array<{ verifyCompletionRate: number | null }> };
        }
      ).ctaVariantBreakdown?.variants[0]?.verifyCompletionRate
    ).toBeNull();
  });
});
