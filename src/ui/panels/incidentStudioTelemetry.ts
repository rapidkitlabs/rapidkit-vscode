export type IncidentStudioCommandSummary = {
  totalEvents: number;
  lastCommand: string | null;
  lastCommandAt: string | null;
  commandUsage: Array<{ command: string; count: number }>;
  surfaceBreakdown: {
    actionEvents: number;
    askEvents: number;
    actionVsAskShare: number | null;
  };
};

export type IncidentStudioOnboardingSummary = {
  followupShown: number;
  followupClicked: number;
  overallFollowupClickThroughRate: number;
};

export type IncidentStudioCtaVariantBreakdown = {
  workspacePath: string;
  timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
  windowStartAt: string | null;
  windowEndAt: string;
  variants: Array<{
    variant: string;
    loopStarted: number;
    nextActionClicked: number;
    actionExecuted: number;
    verifyPassed: number;
    verifyFailed: number;
    verifyCompletionRate: number | null;
    actionVsAskShare: number | null;
    loopCompleted: number;
    abandoned: number;
  }>;
};

export type IncidentStudioTelemetryPayload = {
  commandSummary: IncidentStudioCommandSummary | null;
  onboardingSummary: IncidentStudioOnboardingSummary | null;
  ctaVariantBreakdown?: IncidentStudioCtaVariantBreakdown | null;
  studioHardGateStatus?: {
    workspacePath: string;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt: string | null;
    windowEndAt: string;
    thresholds: {
      verifyPhaseReachMin: number;
      bridgeRouteCompletionMin: number;
    };
    metrics: {
      loopStarted: number;
      nextActionClicked: number;
      actionExecuted: number;
      verifyOutcomes: number;
      verifyPhaseReach: number | null;
      bridgeRouteCompletionRate: number | null;
    };
    gates: {
      verifyPhaseReachPass: boolean;
      bridgeRouteCompletionPass: boolean;
      telemetryEvidencePass: boolean;
      overallPass: boolean;
    };
  } | null;
  studioRollbackKpiStatus?: {
    workspacePath: string;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt: string | null;
    windowEndAt: string;
    thresholds: {
      verifyAutoRollbackSuccessRateMin: number;
      falseConfidenceRateMax: number;
    };
    metrics: {
      verifyFailed: number;
      rollbackAttempted: number;
      rollbackSucceeded: number;
      verifyAutoRollbackSuccessRate: number | null;
      falseConfidenceRate: number | null;
    };
    gates: {
      telemetryEvidencePass: boolean;
      verifyAutoRollbackSuccessRatePass: boolean;
      falseConfidenceRatePass: boolean;
      overallPass: boolean;
    };
  } | null;
  studioStabilizationKpiStatus?: {
    workspacePath: string;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt: string | null;
    windowEndAt: string;
    thresholds: {
      routePrecisionMin: number;
      verifyPathCompletionRateMin: number;
      falseConfidenceRateMax: number;
      rollbackRecoverySuccessRateMin: number;
      repeatVerifiedResolutionRateMin: number;
    };
    metrics: {
      nextActionClicked: number;
      routeMatchedWithoutFallback: number;
      routeFallbackCount: number;
      routePrecision: number | null;
      verifyRequired: number;
      verifyPathPresent: number;
      verifyPathCompletionRate: number | null;
      verifyFailed: number;
      rollbackAttempted: number;
      rollbackSucceeded: number;
      falseConfidenceRate: number | null;
      rollbackRecoverySuccessRate: number | null;
      repeatedIncidentDetected: number;
      repeatVerifiedResolved: number;
      repeatVerifiedResolutionRate: number | null;
      repeatVerifiedWithArtifactReady?: number;
      repeatVerifiedWithArtifactRate?: number | null;
      fallbackReasonBreakdown?: {
        success: number;
        bare_keyword_only: number;
        fix_preview_fallback: number;
        orchestrate_default: number;
        other: number;
      };
      verifyPathReasonTop?: Array<{
        reason: string;
        count: number;
      }>;
      recoveryClassBreakdown?: {
        auto_rollback: number;
        manual_recovery: number;
        unspecified: number;
      };
    };
    gates: {
      telemetryEvidencePass: boolean;
      routePrecisionPass: boolean;
      verifyPathCompletionRatePass: boolean;
      falseConfidenceRatePass: boolean;
      rollbackRecoverySuccessRatePass: boolean;
      repeatVerifiedResolutionRatePass: boolean;
      overallPass: boolean;
    };
  } | null;
  studioReproPackKpiStatus?: {
    workspacePath: string;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt: string | null;
    windowEndAt: string;
    thresholds: {
      reproPackShareRateMin: number;
      replayToResolutionRateMin: number;
    };
    metrics: {
      reproPackCaptured: number;
      reproPackExported: number;
      reproPackImported: number;
      incidentReplayReady: number;
      incidentReplayMemoryEnriched: number;
      reproPackShareRate: number | null;
      replayToResolutionRate: number | null;
    };
    gates: {
      telemetryEvidencePass: boolean;
      reproPackShareRatePass: boolean;
      replayToResolutionRatePass: boolean;
      overallPass: boolean;
    };
  } | null;
  releaseReadinessValidationKpiStatus?: {
    workspacePath: string;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt: string | null;
    windowEndAt: string;
    metrics: {
      releaseReadinessArtifactsExported: number;
      goDecisionsExported: number;
      noGoDecisionsExported: number;
      decisionsValidated: number;
      decisionsCorrect: number;
      noGoDecisionsValidated: number;
      noGoPreventedIncident: number;
      releaseReadinessDecisionAccuracy: number | null;
      noGoPreventedIncidentRate: number | null;
    };
    gates: {
      telemetryEvidencePass: boolean;
      releaseReadinessDecisionAccuracyAvailable: boolean;
      noGoPreventedIncidentRateAvailable: boolean;
      overallPass: boolean;
    };
  } | null;
  verifiedOutcomeLoopStatus?: {
    workspacePath: string | null;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d' | null;
    verifiedOutcomes: number;
    reusableArtifacts: {
      reproPacksExported: number;
      replayReady: number;
      memoryEnriched: number;
      releaseArtifactsExported: number;
    };
    conversionRates: {
      replayToResolutionRate: number | null;
      releaseDecisionAccuracy: number | null;
      noGoPreventedIncidentRate: number | null;
    };
    gates: {
      reproEvidencePass: boolean;
      releaseEvidencePass: boolean;
      overallPass: boolean;
    };
  } | null;
  doctorSummary?: unknown | null;
};

export type CachedIncidentStudioTelemetry = IncidentStudioTelemetryPayload & {
  timestamp: number;
};

function attachCtaVariantBreakdownToDoctorSummary(
  doctorSummary: unknown | null,
  ctaVariantBreakdown: IncidentStudioCtaVariantBreakdown | null | undefined
): unknown | null {
  if (!doctorSummary || typeof doctorSummary !== 'object' || Array.isArray(doctorSummary)) {
    return doctorSummary;
  }

  return {
    ...(doctorSummary as Record<string, unknown>),
    ctaVariantBreakdown: ctaVariantBreakdown ?? null,
  };
}

function buildVerifiedOutcomeLoopStatus(
  ctaVariantBreakdown: IncidentStudioCtaVariantBreakdown | null | undefined,
  studioReproPackKpiStatus: IncidentStudioTelemetryPayload['studioReproPackKpiStatus'],
  releaseReadinessValidationKpiStatus: IncidentStudioTelemetryPayload['releaseReadinessValidationKpiStatus']
): IncidentStudioTelemetryPayload['verifiedOutcomeLoopStatus'] {
  const verifiedOutcomes =
    ctaVariantBreakdown?.variants.reduce((sum, variant) => sum + variant.verifyPassed, 0) ?? 0;

  if (!ctaVariantBreakdown && !studioReproPackKpiStatus && !releaseReadinessValidationKpiStatus) {
    return null;
  }

  const workspacePath =
    ctaVariantBreakdown?.workspacePath ||
    studioReproPackKpiStatus?.workspacePath ||
    releaseReadinessValidationKpiStatus?.workspacePath ||
    null;
  const timeWindow =
    ctaVariantBreakdown?.timeWindow ||
    studioReproPackKpiStatus?.timeWindow ||
    releaseReadinessValidationKpiStatus?.timeWindow ||
    null;

  return {
    workspacePath,
    timeWindow,
    verifiedOutcomes,
    reusableArtifacts: {
      reproPacksExported: studioReproPackKpiStatus?.metrics.reproPackExported ?? 0,
      replayReady: studioReproPackKpiStatus?.metrics.incidentReplayReady ?? 0,
      memoryEnriched: studioReproPackKpiStatus?.metrics.incidentReplayMemoryEnriched ?? 0,
      releaseArtifactsExported:
        releaseReadinessValidationKpiStatus?.metrics.releaseReadinessArtifactsExported ?? 0,
    },
    conversionRates: {
      replayToResolutionRate: studioReproPackKpiStatus?.metrics.replayToResolutionRate ?? null,
      releaseDecisionAccuracy:
        releaseReadinessValidationKpiStatus?.metrics.releaseReadinessDecisionAccuracy ?? null,
      noGoPreventedIncidentRate:
        releaseReadinessValidationKpiStatus?.metrics.noGoPreventedIncidentRate ?? null,
    },
    gates: {
      reproEvidencePass: Boolean(studioReproPackKpiStatus?.gates.overallPass),
      releaseEvidencePass: Boolean(releaseReadinessValidationKpiStatus?.gates.overallPass),
      overallPass: Boolean(
        studioReproPackKpiStatus?.gates.overallPass &&
        releaseReadinessValidationKpiStatus?.gates.overallPass
      ),
    },
  };
}

export function shouldUseIncidentStudioTelemetryCache(
  cachedData: CachedIncidentStudioTelemetry | undefined,
  now: number,
  ttlMs: number
): boolean {
  return Boolean(cachedData && now - cachedData.timestamp < ttlMs);
}

export function buildIncidentStudioTelemetryFromCache(
  cachedData: CachedIncidentStudioTelemetry,
  doctorSummary: unknown | null
): IncidentStudioTelemetryPayload {
  const releaseReadinessValidationKpiStatus =
    cachedData.releaseReadinessValidationKpiStatus ?? null;
  const verifiedOutcomeLoopStatus =
    cachedData.verifiedOutcomeLoopStatus ??
    buildVerifiedOutcomeLoopStatus(
      cachedData.ctaVariantBreakdown ?? null,
      cachedData.studioReproPackKpiStatus ?? null,
      releaseReadinessValidationKpiStatus
    );

  return {
    commandSummary: cachedData.commandSummary,
    onboardingSummary: cachedData.onboardingSummary,
    ctaVariantBreakdown: cachedData.ctaVariantBreakdown ?? null,
    studioHardGateStatus: cachedData.studioHardGateStatus ?? null,
    studioRollbackKpiStatus: cachedData.studioRollbackKpiStatus ?? null,
    studioStabilizationKpiStatus: cachedData.studioStabilizationKpiStatus ?? null,
    studioReproPackKpiStatus: cachedData.studioReproPackKpiStatus ?? null,
    releaseReadinessValidationKpiStatus,
    verifiedOutcomeLoopStatus,
    // Always prefer the doctor snapshot freshly read from disk.
    doctorSummary: attachCtaVariantBreakdownToDoctorSummary(
      doctorSummary,
      cachedData.ctaVariantBreakdown ?? null
    ),
  };
}

export function buildIncidentStudioTelemetryPayload(
  commandSummary: {
    totalEvents: number;
    lastCommand: string | null;
    lastCommandAt: string | null;
    commandUsage: Array<{ command: string; count: number }>;
    surfaceBreakdown: {
      actionEvents: number;
      askEvents: number;
      actionVsAskShare: number | null;
    };
  } | null,
  onboardingSummary: {
    followupShown: number;
    followupClicked: number;
    overallFollowupClickThroughRate: number;
  } | null,
  ctaVariantBreakdown: {
    workspacePath: string;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt: string | null;
    windowEndAt: string;
    variants: Array<{
      variant: string;
      loopStarted: number;
      nextActionClicked: number;
      actionExecuted: number;
      verifyPassed: number;
      verifyFailed: number;
      verifyCompletionRate: number | null;
      actionVsAskShare: number | null;
      loopCompleted: number;
      abandoned: number;
    }>;
  } | null,
  doctorSummary: unknown | null,
  studioHardGateStatus?: IncidentStudioTelemetryPayload['studioHardGateStatus'],
  studioRollbackKpiStatus?: IncidentStudioTelemetryPayload['studioRollbackKpiStatus'],
  studioStabilizationKpiStatus?: IncidentStudioTelemetryPayload['studioStabilizationKpiStatus'],
  studioReproPackKpiStatus?: IncidentStudioTelemetryPayload['studioReproPackKpiStatus'],
  releaseReadinessValidationKpiStatus?: IncidentStudioTelemetryPayload['releaseReadinessValidationKpiStatus']
): IncidentStudioTelemetryPayload {
  const nextCtaVariantBreakdown = ctaVariantBreakdown
    ? {
        workspacePath: ctaVariantBreakdown.workspacePath,
        timeWindow: ctaVariantBreakdown.timeWindow,
        windowStartAt: ctaVariantBreakdown.windowStartAt,
        windowEndAt: ctaVariantBreakdown.windowEndAt,
        variants: ctaVariantBreakdown.variants,
      }
    : null;
  const nextVerifiedOutcomeLoopStatus = buildVerifiedOutcomeLoopStatus(
    nextCtaVariantBreakdown,
    studioReproPackKpiStatus ?? null,
    releaseReadinessValidationKpiStatus ?? null
  );

  return {
    commandSummary: commandSummary
      ? {
          totalEvents: commandSummary.totalEvents,
          lastCommand: commandSummary.lastCommand,
          lastCommandAt: commandSummary.lastCommandAt,
          commandUsage: commandSummary.commandUsage,
          surfaceBreakdown: {
            actionEvents: commandSummary.surfaceBreakdown.actionEvents,
            askEvents: commandSummary.surfaceBreakdown.askEvents,
            actionVsAskShare: commandSummary.surfaceBreakdown.actionVsAskShare,
          },
        }
      : null,
    onboardingSummary: onboardingSummary
      ? {
          followupShown: onboardingSummary.followupShown,
          followupClicked: onboardingSummary.followupClicked,
          overallFollowupClickThroughRate: onboardingSummary.overallFollowupClickThroughRate,
        }
      : null,
    ctaVariantBreakdown: nextCtaVariantBreakdown,
    studioHardGateStatus: studioHardGateStatus ?? null,
    studioRollbackKpiStatus: studioRollbackKpiStatus ?? null,
    studioStabilizationKpiStatus: studioStabilizationKpiStatus ?? null,
    studioReproPackKpiStatus: studioReproPackKpiStatus ?? null,
    releaseReadinessValidationKpiStatus: releaseReadinessValidationKpiStatus ?? null,
    verifiedOutcomeLoopStatus: nextVerifiedOutcomeLoopStatus,
    doctorSummary: attachCtaVariantBreakdownToDoctorSummary(doctorSummary, nextCtaVariantBreakdown),
  };
}
