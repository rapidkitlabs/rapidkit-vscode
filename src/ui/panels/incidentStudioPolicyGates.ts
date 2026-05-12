/**
 * Incident Studio Policy Gate Enforcement
 *
 * Enforces deterministic gates per WORKSPAI_INCIDENT_STUDIO_ENTERPRISE_PRODUCT_UX_SPEC.md § Policy Gates
 *
 * Gates:
 * 1. Verify Phase Reach: Must achieve minimum telemetry confidence before claiming verify completion
 * 2. Bridge Route Completion: Must complete deterministic execution path before allowing completion
 * 3. False Confidence Threshold: Must stay below false-positive rate before finalizing decisions
 */

export interface PolicyGateStatus {
  verifyPhaseReachPass: boolean;
  bridgeRouteCompletionPass: boolean;
  verifyPathCompletionPass?: boolean;
  falseConfidenceThresholdPass?: boolean;
  rollbackRecoveryThresholdPass?: boolean;
  overallPass: boolean;
}

export interface PolicyGateViolation {
  gate: string;
  severity: 'warning' | 'error';
  reason: string;
  guidance: string;
}

export interface PolicyGateEnforcementResult {
  canCompleteVerify: boolean;
  violations: PolicyGateViolation[];
  blockedReasons: string[];
  fallbackGuidance: string | null;
}

/**
 * Enforce policy gates for verify phase completion
 * Prevents false claims of completion when telemetry or execution gates are not satisfied
 */
export function enforceVerifyCompletionGates(
  gateStatus: PolicyGateStatus | null | undefined,
  _metrics?: {
    verifyPhaseReach?: number | null;
    bridgeRouteCompletionRate?: number | null;
  }
): PolicyGateEnforcementResult {
  const violations: PolicyGateViolation[] = [];
  const blockedReasons: string[] = [];

  // If gates are not yet available (warming up), don't fail with violations
  // Just indicate that completion cannot proceed
  if (!gateStatus) {
    return {
      canCompleteVerify: false,
      violations: [],
      blockedReasons: [],
      fallbackGuidance: null,
    };
  }

  // Gate 1: Verify Phase Reach
  if (!gateStatus.verifyPhaseReachPass) {
    violations.push({
      gate: 'VERIFY_PHASE_REACH',
      severity: 'error',
      reason: 'Verify phase telemetry confidence is insufficient to claim completion',
      guidance:
        'Continue running verification steps to build confidence (minimum threshold not yet reached)',
    });
    blockedReasons.push('Verify phase reach < minimum threshold');
  }

  // Gate 2: Bridge Route Completion
  if (!gateStatus.bridgeRouteCompletionPass) {
    violations.push({
      gate: 'BRIDGE_ROUTE_COMPLETION',
      severity: 'error',
      reason: 'Deterministic execution path incomplete; cannot finalize decision',
      guidance:
        'Run the remaining verification commands from the suggested action board before claiming completion',
    });
    blockedReasons.push('Bridge route completion < minimum threshold');
  }

  if (gateStatus.verifyPathCompletionPass === false) {
    violations.push({
      gate: 'VERIFY_PATH_COMPLETION',
      severity: 'error',
      reason: 'Required verify-path completion is not satisfied',
      guidance: 'Complete the full verify path before claiming the incident is verified',
    });
    blockedReasons.push('Verify-path completion < minimum threshold');
  }

  if (gateStatus.falseConfidenceThresholdPass === false) {
    violations.push({
      gate: 'FALSE_CONFIDENCE_THRESHOLD',
      severity: 'error',
      reason: 'False-confidence threshold exceeded for completion claim',
      guidance:
        'Do not claim completion until the false-confidence rate is reduced below the allowed threshold',
    });
    blockedReasons.push('False-confidence threshold not satisfied');
  }

  if (gateStatus.rollbackRecoveryThresholdPass === false) {
    violations.push({
      gate: 'ROLLBACK_RECOVERY_THRESHOLD',
      severity: 'error',
      reason: 'Rollback recovery threshold is not satisfied',
      guidance: 'Validate rollback recovery before issuing any completion claim',
    });
    blockedReasons.push('Rollback recovery threshold not satisfied');
  }

  // Overall: All gates must pass
  const canComplete = gateStatus.overallPass === true && violations.length === 0;

  // Generate fallback guidance if gates are blocked
  let fallbackGuidance: string | null = null;
  if (!canComplete && blockedReasons.length > 0) {
    fallbackGuidance = [
      '**Verify completion blocked by policy gates:**',
      '',
      blockedReasons.map((r) => `- ${r}`).join('\n'),
      '',
      'Suggested next steps:',
      violations.map((v) => `- ${v.guidance}`).join('\n'),
    ].join('\n');
  }

  return {
    canCompleteVerify: canComplete,
    violations,
    blockedReasons,
    fallbackGuidance,
  };
}

/**
 * Create a human-readable summary of gate status
 */
export function formatGateStatus(gateStatus: PolicyGateStatus | null | undefined): string {
  if (!gateStatus) {
    return 'Gates warming up — not enough telemetry data yet';
  }

  const checks = [
    `Verify Phase Reach: ${gateStatus.verifyPhaseReachPass ? '✓ pass' : '✗ fail'}`,
    `Bridge Route Completion: ${gateStatus.bridgeRouteCompletionPass ? '✓ pass' : '✗ fail'}`,
    `Verify Path Completion: ${
      gateStatus.verifyPathCompletionPass === undefined
        ? 'n/a'
        : gateStatus.verifyPathCompletionPass
          ? '✓ pass'
          : '✗ fail'
    }`,
    `False-Confidence Threshold: ${
      gateStatus.falseConfidenceThresholdPass === undefined
        ? 'n/a'
        : gateStatus.falseConfidenceThresholdPass
          ? '✓ pass'
          : '✗ fail'
    }`,
    `Rollback Recovery Threshold: ${
      gateStatus.rollbackRecoveryThresholdPass === undefined
        ? 'n/a'
        : gateStatus.rollbackRecoveryThresholdPass
          ? '✓ pass'
          : '✗ fail'
    }`,
  ];

  return (
    checks.join(' | ') +
    ` → ${gateStatus.overallPass ? '✓ All gates healthy' : '✗ Verify blocked by gates'}`
  );
}

/**
 * Check if verify completion claim is premature (gates not satisfied)
 */
export function isVerifyCompletionPremature(gateStatus: PolicyGateStatus | null | undefined): {
  isPremature: boolean;
  reason: string | null;
} {
  if (!gateStatus) {
    return {
      isPremature: true,
      reason: 'Telemetry gates still warming up; verify completion cannot be claimed yet',
    };
  }

  if (!gateStatus.overallPass) {
    const failedGates: string[] = [];
    if (!gateStatus.verifyPhaseReachPass) {
      failedGates.push('verify phase reach');
    }
    if (!gateStatus.bridgeRouteCompletionPass) {
      failedGates.push('bridge route completion');
    }
    if (gateStatus.verifyPathCompletionPass === false) {
      failedGates.push('verify path completion');
    }
    if (gateStatus.falseConfidenceThresholdPass === false) {
      failedGates.push('false-confidence threshold');
    }
    if (gateStatus.rollbackRecoveryThresholdPass === false) {
      failedGates.push('rollback recovery threshold');
    }

    return {
      isPremature: true,
      reason: `Verify completion blocked: ${failedGates.join(' and ')} gate(s) not satisfied`,
    };
  }

  return {
    isPremature: false,
    reason: null,
  };
}

/**
 * Extract all blocked reason strings for telemetry and user feedback
 */
export function extractGateBlockedReasons(result: PolicyGateEnforcementResult): {
  reasons: string[];
  summary: string;
} {
  const reasons = result.blockedReasons;
  const summary =
    reasons.length === 0 ? 'No gates blocked' : `Gates blocked: ${reasons.join('; ')}`;

  return { reasons, summary };
}
