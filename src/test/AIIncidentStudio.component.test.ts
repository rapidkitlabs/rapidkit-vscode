import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AIIncidentStudio } from '../../webview-ui/src/components/AIIncidentStudio';

function renderStudio(overrides: Partial<ComponentProps<typeof AIIncidentStudio>> = {}): string {
  const props: ComponentProps<typeof AIIncidentStudio> = {
    workspaceName: 'Acme Workspace',
    isAnalyzing: false,
    conversationTurns: 0,
    studioDisplayMode: 'full',
    telemetry: null,
    chatBrainStreamText: '',
    chatBrainHistory: [],
    chatBrainSuggestedQuestions: [],
    chatBrainBoard: null,
    chatBrainActionProgress: null,
    chatBrainActionResult: null,
    chatBrainSystemGraphSnapshot: null,
    chatBrainImpactAssessment: null,
    chatBrainPredictiveWarning: null,
    chatBrainReleaseGateEvidence: null,
    chatBrainError: null,
    incidentResume: null,
    onRunTerminalBridge: () => {},
    onRunFixPreview: () => {},
    onRunChangeImpact: () => {},
    onRunMemoryWizard: () => {},
    onRunDoctorChecks: () => {},
    ...overrides,
  };

  return renderToStaticMarkup(createElement(AIIncidentStudio, props));
}

describe('AIIncidentStudio component presentation', () => {
  it('shows HOLD parity and blocker investigation CTA in lite mode for advisory-only stabilization blockers', () => {
    const html = renderStudio({
      studioDisplayMode: 'lite',
      telemetry: {
        commandSummary: null,
        onboardingSummary: null,
        studioStabilizationKpiStatus: {
          workspacePath: '/workspace/acme',
          timeWindow: 'last7d',
          windowStartAt: '2026-05-01T00:00:00Z',
          windowEndAt: '2026-05-08T00:00:00Z',
          thresholds: {
            routePrecisionMin: 80,
            routeFallbackNonSuccessShareMax: 20,
            verifyPathCompletionRateMin: 70,
            verifyIncompleteWarningRateMax: 10,
            topVerifyPathMissReasonShareMax: 30,
            falseConfidenceRateMax: 15,
            rollbackRecoverySuccessRateMin: 70,
            repeatVerifiedResolutionRateMin: 70,
          },
          metrics: {
            nextActionClicked: 24,
            routeMatchedWithoutFallback: 21,
            routeFallbackCount: 3,
            routePrecision: 88,
            routeFallbackNonSuccessShare: 33,
            verifyRequired: 20,
            verifyPathPresent: 17,
            verifyPathCompletionRate: 85,
            verifyIncompleteWarningCount: 3,
            verifyIncompleteWarningRate: 15,
            verifyFailed: 2,
            rollbackAttempted: 2,
            rollbackSucceeded: 2,
            falseConfidenceRate: 5,
            rollbackRecoverySuccessRate: 100,
            repeatedIncidentDetected: 4,
            repeatVerifiedResolved: 4,
            repeatVerifiedResolutionRate: 100,
            repeatVerifiedWithArtifactReady: 4,
            repeatVerifiedWithArtifactRate: 100,
            fallbackReasonBreakdown: {
              success: 2,
              bare_keyword_only: 1,
              fix_preview_fallback: 0,
              orchestrate_default: 0,
              other: 0,
            },
            verifyPathReasonTop: [{ reason: 'Checklist drift', count: 2 }],
            topVerifyPathMissReasonShare: 25,
            recoveryClassBreakdown: {
              auto_rollback: 2,
              manual_recovery: 0,
              unspecified: 0,
            },
          },
          gates: {
            telemetryEvidencePass: true,
            routePrecisionPass: true,
            routeFallbackNonSuccessSharePass: false,
            verifyPathCompletionRatePass: true,
            verifyIncompleteWarningRatePass: false,
            falseConfidenceRatePass: true,
            rollbackRecoverySuccessRatePass: true,
            repeatVerifiedResolutionRatePass: true,
            topVerifyPathMissReasonSharePass: true,
            overallPass: true,
          },
        },
      },
    });

    expect(html).toContain('HOLD');
    expect(html).toContain('Hold: 2 stabilization signals need review');
    expect(html).toContain('Investigate blocker');
    expect(html).toContain('Run blocker check');
  });

  it('shows HOLD claim state when advisory stabilization blockers fail even if overallPass remains true', () => {
    const html = renderStudio({
      telemetry: {
        commandSummary: null,
        onboardingSummary: null,
        studioStabilizationKpiStatus: {
          workspacePath: '/workspace/acme',
          timeWindow: 'last7d',
          windowStartAt: '2026-05-01T00:00:00Z',
          windowEndAt: '2026-05-08T00:00:00Z',
          thresholds: {
            routePrecisionMin: 80,
            routeFallbackNonSuccessShareMax: 20,
            verifyPathCompletionRateMin: 70,
            verifyIncompleteWarningRateMax: 10,
            topVerifyPathMissReasonShareMax: 30,
            falseConfidenceRateMax: 15,
            rollbackRecoverySuccessRateMin: 70,
            repeatVerifiedResolutionRateMin: 70,
          },
          metrics: {
            nextActionClicked: 24,
            routeMatchedWithoutFallback: 21,
            routeFallbackCount: 3,
            routePrecision: 88,
            routeFallbackNonSuccessShare: 33,
            verifyRequired: 20,
            verifyPathPresent: 17,
            verifyPathCompletionRate: 85,
            verifyIncompleteWarningCount: 3,
            verifyIncompleteWarningRate: 15,
            verifyFailed: 2,
            rollbackAttempted: 2,
            rollbackSucceeded: 2,
            falseConfidenceRate: 5,
            rollbackRecoverySuccessRate: 100,
            repeatedIncidentDetected: 4,
            repeatVerifiedResolved: 4,
            repeatVerifiedResolutionRate: 100,
            repeatVerifiedWithArtifactReady: 4,
            repeatVerifiedWithArtifactRate: 100,
            fallbackReasonBreakdown: {
              success: 2,
              bare_keyword_only: 1,
              fix_preview_fallback: 0,
              orchestrate_default: 0,
              other: 0,
            },
            verifyPathReasonTop: [{ reason: 'Checklist drift', count: 2 }],
            topVerifyPathMissReasonShare: 25,
            recoveryClassBreakdown: {
              auto_rollback: 2,
              manual_recovery: 0,
              unspecified: 0,
            },
          },
          gates: {
            telemetryEvidencePass: true,
            routePrecisionPass: true,
            routeFallbackNonSuccessSharePass: false,
            verifyPathCompletionRatePass: true,
            verifyIncompleteWarningRatePass: false,
            falseConfidenceRatePass: true,
            rollbackRecoverySuccessRatePass: true,
            repeatVerifiedResolutionRatePass: true,
            topVerifyPathMissReasonSharePass: true,
            overallPass: true,
          },
        },
      },
    });

    expect(html).toContain('Stabilization KPI gate');
    expect(html).toContain('HOLD');
    expect(html).toContain('verify warnings: 3 (15%)');
    expect(html).toContain('enterprise claim: hold');
  });

  it('renders evidence links and de-duplicates next action wording from the verify command', () => {
    const html = renderStudio({
      chatBrainActionResult: {
        success: false,
        outputSummary: 'Orders write path failed after config change.',
        diagnosis: {
          confidence: 78,
          confidenceBand: 'high',
          signalSources: ['doctor-evidence', 'system-graph'],
          relatedFiles: ['src/orders/service.ts'],
          recommendedFocus: 'Dependency chain changed in persistence layer.',
        },
        decisionClarity: {
          situation: 'Orders write path failed after config change.',
          reason: 'Dependency chain changed in persistence layer.',
          impactScope: ['src/orders/service.ts'],
          risk: {
            confidenceBand: 'high',
            confidence: 78,
            mutating: true,
          },
          nextStep: 'npm run test:integration',
          verifyPlan: ['npm run test:integration'],
          rollbackPlan: 'git checkout src/orders/service.ts',
          evidenceLinks: ['doctor-evidence', 'system-graph'],
          requiredMissingFields: [],
          mutationReady: true,
        },
      },
    });

    expect(html).toContain(
      'Next action: Run the primary verify step and inspect the result before claiming completion.'
    );
    expect(html).not.toContain('Next action: npm run test:integration');
    expect(html).toContain('Verify: npm run test:integration');
    expect(html).toContain('Evidence: doctor-evidence | system-graph');
  });

  it('guided mode shows deterministic next + verify actions and hides dense action board panel', () => {
    const html = renderStudio({
      studioDisplayMode: 'full',
      userMode: 'guided',
      chatBrainBoard: {
        id: 'board-guided-1',
        type: 'incident-actions',
        title: 'Action Board',
        actions: [
          {
            id: 'a1',
            label: 'Patch failing contract test',
            actionType: 'doctor-fix',
            riskLevel: 'high',
            requiresImpactReview: true,
            requiresVerifyPath: true,
          },
          {
            id: 'a2',
            label: 'Generate release decision',
            actionType: 'release-readiness-commander',
            riskLevel: 'critical',
          },
        ],
      },
      chatBrainActionResult: {
        success: false,
        verifyCommandPack: {
          qualityScore: 88,
          readiness: 'ready',
          rationale: 'Deterministic verify path is available.',
          commands: [
            {
              label: 'Verify workspace health',
              command: 'rapidkit doctor workspace',
              scope: 'workspace',
              required: true,
            },
          ],
          blockedReasons: [],
        },
      } as any,
    });

    // Guided should keep the dock to deterministic actions only.
    expect(html).toContain('Proof this worked');
    expect(html).not.toContain('Chat Brain action board');
    expect(html).not.toContain('incident-patch-option incident-patch-option--chat');

    // Quick actions panel should render exactly two items (next + verify).
    const quickActionCount = (html.match(/incident-chat-quick-action(?:\s|\")/g) || []).length;
    expect(quickActionCount).toBe(2);
  });

  it('suppresses Verification passed claim when latest release evidence is NO-GO', () => {
    const html = renderStudio({
      studioDisplayMode: 'full',
      chatBrainActionResult: {
        success: true,
        outputSummary: 'All checks passed locally.',
        verifyCommandPack: {
          qualityScore: 91,
          readiness: 'ready',
          rationale: 'Verify path is generated.',
          commands: [
            {
              label: 'Verify workspace',
              command: 'rapidkit doctor workspace',
              scope: 'workspace',
              required: true,
            },
          ],
          blockedReasons: [],
        },
        releaseReadinessCommander: {
          artifactId: 'artifact-no-go-1',
          decision: 'no-go',
          confidence: 82,
          generatedAt: '2026-05-12T10:00:00Z',
          blockingReasons: ['Rollback path is missing'],
          evidence: {
            verifyPackContractStatus: 'blocked',
            sandboxStatus: 'blocked',
            scopeKnown: true,
            verifyPathPresent: true,
            rollbackPathPresent: false,
          },
          summary: {
            goNoGoRationale: 'NO-GO because rollback evidence is incomplete.',
            recommendedNextStep: 'Define rollback path and rerun verification.',
          },
        },
      } as any,
    });

    expect(html).toContain('Release blocked (NO-GO evidence)');
    expect(html).not.toContain('Verification passed');
  });

  it('keeps GO evidence in HOLD state when verify completion gates are blocking', () => {
    const html = renderStudio({
      studioDisplayMode: 'full',
      telemetry: {
        studioHardGateStatus: {
          workspacePath: '/workspace/acme',
          timeWindow: 'last7d',
          windowStartAt: '2026-05-10T00:00:00Z',
          windowEndAt: '2026-05-12T00:00:00Z',
          thresholds: {
            verifyPhaseReachMin: 70,
            bridgeRouteCompletionRateMin: 75,
          },
          metrics: {
            verifyPhaseReach: 45,
            bridgeRouteCompletionRate: 50,
          },
          gates: {
            verifyPhaseReachPass: false,
            bridgeRouteCompletionPass: false,
            overallPass: false,
          },
        },
      } as any,
      chatBrainActionResult: {
        success: true,
        outputSummary: 'Latest execution returned successfully.',
        releaseReadinessCommander: {
          artifactId: 'artifact-go-1',
          decision: 'go',
          confidence: 79,
          generatedAt: '2026-05-12T10:05:00Z',
          blockingReasons: [],
          evidence: {
            verifyPackContractStatus: 'ready',
            sandboxStatus: 'pass',
            scopeKnown: true,
            verifyPathPresent: true,
            rollbackPathPresent: true,
          },
          summary: {
            goNoGoRationale: 'GO after deterministic checks.',
            recommendedNextStep: 'Proceed with staged rollout.',
          },
        },
      } as any,
    });

    expect(html).toContain('GO evidence, HOLD by verify gates');
    expect(html).toContain('Verification pending gate compliance');
    expect(html).not.toContain('Verification passed');
  });
});
