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
  timeWindow: 'all' | 'last24h' | 'last7d';
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
    timeWindow: 'all' | 'last24h' | 'last7d';
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
    timeWindow: 'all' | 'last24h' | 'last7d';
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
  studioReproPackKpiStatus?: {
    workspacePath: string;
    timeWindow: 'all' | 'last24h' | 'last7d';
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
  return {
    commandSummary: cachedData.commandSummary,
    onboardingSummary: cachedData.onboardingSummary,
    ctaVariantBreakdown: cachedData.ctaVariantBreakdown ?? null,
    studioHardGateStatus: cachedData.studioHardGateStatus ?? null,
    studioRollbackKpiStatus: cachedData.studioRollbackKpiStatus ?? null,
    studioReproPackKpiStatus: cachedData.studioReproPackKpiStatus ?? null,
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
    timeWindow: 'all' | 'last24h' | 'last7d';
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
  studioReproPackKpiStatus?: IncidentStudioTelemetryPayload['studioReproPackKpiStatus']
): IncidentStudioTelemetryPayload {
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
    ctaVariantBreakdown: ctaVariantBreakdown
      ? {
          workspacePath: ctaVariantBreakdown.workspacePath,
          timeWindow: ctaVariantBreakdown.timeWindow,
          windowStartAt: ctaVariantBreakdown.windowStartAt,
          windowEndAt: ctaVariantBreakdown.windowEndAt,
          variants: ctaVariantBreakdown.variants,
        }
      : null,
    studioHardGateStatus: studioHardGateStatus ?? null,
    studioRollbackKpiStatus: studioRollbackKpiStatus ?? null,
    studioReproPackKpiStatus: studioReproPackKpiStatus ?? null,
    doctorSummary: attachCtaVariantBreakdownToDoctorSummary(doctorSummary, ctaVariantBreakdown),
  };
}
