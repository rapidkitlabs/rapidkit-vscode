import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  registeredCommands,
  showQuickPickMock,
  showWarningMessageMock,
  showInformationMessageMock,
  openTextDocumentMock,
  showTextDocumentMock,
  writeTextMock,
  executeCommandMock,
  trackerMock,
} = vi.hoisted(() => ({
  registeredCommands: new Map<string, (...args: unknown[]) => unknown>(),
  showQuickPickMock: vi.fn(),
  showWarningMessageMock: vi.fn(),
  showInformationMessageMock: vi.fn(),
  openTextDocumentMock: vi.fn(),
  showTextDocumentMock: vi.fn(),
  writeTextMock: vi.fn(),
  executeCommandMock: vi.fn(),
  trackerMock: {
    getCommandTelemetrySummary: vi.fn(),
    getStudioHardGateStatus: vi.fn(),
    getStudioPredictionKpiStatus: vi.fn(),
    getStudioPredictionPortfolioKpiStatus: vi.fn(),
    getRepeatRateActorModelStatus: vi.fn(),
    getArchitectureReasoningKpiStatus: vi.fn(),
    getSandboxKpiStatus: vi.fn(),
    getStudioRollbackKpiStatus: vi.fn(),
    getOnboardingExperimentStats: vi.fn(),
    clearCommandTelemetry: vi.fn(),
  },
}));

vi.mock('vscode', () => ({
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
      registeredCommands.set(id, handler);
      return { dispose: vi.fn() };
    },
    executeCommand: executeCommandMock,
  },
  window: {
    showQuickPick: showQuickPickMock,
    showWarningMessage: showWarningMessageMock,
    showInformationMessage: showInformationMessageMock,
    showTextDocument: showTextDocumentMock,
  },
  workspace: {
    openTextDocument: openTextDocumentMock,
  },
  env: {
    clipboard: {
      writeText: writeTextMock,
    },
  },
  Uri: {
    file: (targetPath: string) => ({ fsPath: targetPath, path: targetPath }),
  },
}));

vi.mock('../utils/workspaceUsageTracker', () => ({
  WorkspaceUsageTracker: {
    getInstance: () => trackerMock,
  },
}));

vi.mock('../commands/projectContextMenu', () => ({
  openProjectFolder: vi.fn(),
  copyProjectPath: vi.fn(),
  deleteProject: vi.fn(),
}));

import { registerProjectContextAndLogCommands } from '../commands/projectContextAndLogs';

describe('projectContextAndLogs telemetry summary contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredCommands.clear();

    showQuickPickMock.mockResolvedValue({ value: 'last24h' });
    showInformationMessageMock
      .mockResolvedValueOnce('Copy quick summary')
      .mockResolvedValue(undefined);
    openTextDocumentMock.mockImplementation(async ({ content }: { content: string }) => ({
      uri: { path: '/tmp/telemetry.json' },
      getText: () => content,
    }));
    showTextDocumentMock.mockResolvedValue(undefined);
    writeTextMock.mockResolvedValue(undefined);
    executeCommandMock.mockImplementation(async (commandId: string) => {
      if (commandId === 'workspai.getSelectedWorkspace') {
        return { path: '/tmp/demo-workspace', name: 'demo-workspace' };
      }
      return undefined;
    });

    trackerMock.getCommandTelemetrySummary.mockResolvedValue({
      workspacePath: '/tmp/demo-workspace',
      timeWindow: 'last24h',
      windowStartAt: '2026-04-21T12:30:00.000Z',
      windowEndAt: '2026-04-22T12:30:00.000Z',
      totalEvents: 10,
      lastCommand: 'workspai.aiQuickActions',
      lastCommandAt: '2026-04-22T12:29:00.000Z',
      lastCommandProps: {},
      commandUsage: [
        { command: 'workspai.aiQuickActions', count: 6 },
        { command: 'workspai.chat.ask', count: 3 },
        { command: 'workspai.aimodal.ask', count: 1 },
      ],
      surfaceBreakdown: {
        actionEvents: 6,
        askEvents: 4,
        actionVsAskShare: 60,
        bySurface: [
          { surface: 'action', count: 6, share: 60 },
          { surface: 'chat', count: 3, share: 30 },
          { surface: 'aimodal', count: 1, share: 10 },
          { surface: 'onboarding', count: 0, share: 0 },
          { surface: 'other', count: 0, share: 0 },
        ],
      },
    });

    trackerMock.getStudioHardGateStatus.mockResolvedValue({
      workspacePath: '/tmp/demo-workspace',
      timeWindow: 'last24h',
      windowStartAt: '2026-04-21T12:30:00.000Z',
      windowEndAt: '2026-04-22T12:30:00.000Z',
      thresholds: {
        verifyPhaseReachMin: 80,
        bridgeRouteCompletionMin: 95,
      },
      metrics: {
        loopStarted: 5,
        nextActionClicked: 3,
        actionExecuted: 4,
        verifyOutcomes: 4,
        verifyPhaseReach: 100,
        bridgeRouteCompletionRate: 80,
      },
      gates: {
        verifyPhaseReachPass: true,
        bridgeRouteCompletionPass: false,
        telemetryEvidencePass: true,
        overallPass: false,
      },
    });

    trackerMock.getStudioPredictionKpiStatus.mockResolvedValue({
      workspacePath: '/tmp/demo-workspace',
      timeWindow: 'last24h',
      windowStartAt: '2026-04-21T12:30:00.000Z',
      windowEndAt: '2026-04-22T12:30:00.000Z',
      thresholds: {
        predictivePrecisionMin: 65,
        falseAlarmRateMax: 35,
        preventedIncidentRateMin: 20,
      },
      aggregation: {
        prevented_incident_rate: {
          key: 'prevented_incident_rate',
          numerator: 5,
          denominator: 10,
          value: 50,
          unit: 'percent',
          eventCommands: [
            'workspai.studio.prediction_verified',
            'workspai.studio.prediction_shown',
          ],
        },
        predictive_precision: {
          key: 'predictive_precision',
          numerator: 5,
          denominator: 7,
          value: 71.43,
          unit: 'percent',
          eventCommands: [
            'workspai.studio.prediction_verified',
            'workspai.studio.prediction_falsified',
          ],
        },
        false_alarm_rate: {
          key: 'false_alarm_rate',
          numerator: 2,
          denominator: 7,
          value: 28.57,
          unit: 'percent',
          eventCommands: [
            'workspai.studio.prediction_falsified',
            'workspai.studio.prediction_verified',
          ],
        },
      },
      metrics: {
        predictionShown: 10,
        predictionAccepted: 7,
        predictionVerified: 5,
        predictionFalsified: 2,
        predictionIgnored: 3,
        predictivePrecision: 71.43,
        falseAlarmRate: 28.57,
        preventedIncidentRate: 50,
        acceptanceRate: 70,
        verificationCoverage: 100,
      },
      gates: {
        telemetryEvidencePass: true,
        predictivePrecisionPass: true,
        falseAlarmRatePass: true,
        preventedIncidentRatePass: true,
        overallPass: true,
      },
    });

    trackerMock.getStudioPredictionPortfolioKpiStatus.mockResolvedValue({
      scope: 'registered-workspaces',
      workspacePaths: ['/tmp/demo-workspace', '/tmp/other-workspace'],
      evaluatedWorkspaceCount: 2,
      telemetryWorkspaceCount: 2,
      timeWindow: 'last24h',
      windowStartAt: '2026-04-21T12:30:00.000Z',
      windowEndAt: '2026-04-22T12:30:00.000Z',
      thresholds: {
        predictivePrecisionMin: 65,
        falseAlarmRateMax: 35,
        preventedIncidentRateMin: 20,
      },
      aggregation: {
        prevented_incident_rate: {
          key: 'prevented_incident_rate',
          numerator: 8,
          denominator: 15,
          value: 53.33,
          unit: 'percent',
          eventCommands: [
            'workspai.studio.prediction_verified',
            'workspai.studio.prediction_shown',
          ],
        },
        predictive_precision: {
          key: 'predictive_precision',
          numerator: 8,
          denominator: 10,
          value: 80,
          unit: 'percent',
          eventCommands: [
            'workspai.studio.prediction_verified',
            'workspai.studio.prediction_falsified',
          ],
        },
        false_alarm_rate: {
          key: 'false_alarm_rate',
          numerator: 2,
          denominator: 10,
          value: 20,
          unit: 'percent',
          eventCommands: [
            'workspai.studio.prediction_falsified',
            'workspai.studio.prediction_verified',
          ],
        },
      },
      metrics: {
        predictionShown: 15,
        predictionAccepted: 12,
        predictionVerified: 8,
        predictionFalsified: 2,
        predictionIgnored: 3,
        predictivePrecision: 80,
        falseAlarmRate: 20,
        preventedIncidentRate: 53.33,
        acceptanceRate: 80,
        verificationCoverage: 83.33,
        workspacePassCount: 2,
        workspaceFailCount: 0,
      },
      gates: {
        telemetryEvidencePass: true,
        predictivePrecisionPass: true,
        falseAlarmRatePass: true,
        preventedIncidentRatePass: true,
        overallPass: true,
      },
      workspaceStatuses: [],
      privacy: {
        actorModel: 'workspace-marker-only',
        actorIdPresent: false,
      },
    });

    trackerMock.getRepeatRateActorModelStatus.mockResolvedValue({
      scope: 'registered-workspaces',
      workspaceCount: 2,
      timeWindow: 'last24h',
      windowStartAt: '2026-04-21T12:30:00.000Z',
      windowEndAt: '2026-04-22T12:30:00.000Z',
      activeActorCount: 2,
      repeatActorCount: 1,
      repeatRate: 50,
      actors: [
        {
          actorKey: 'abcd1234abcd1234',
          eventCount: 8,
          activeHourCount: 2,
          repeated: true,
          lastEventAt: '2026-04-22T12:20:00.000Z',
        },
        {
          actorKey: 'efgh5678efgh5678',
          eventCount: 1,
          activeHourCount: 1,
          repeated: false,
          lastEventAt: '2026-04-22T12:25:00.000Z',
        },
      ],
      privacy: {
        actorModel: 'pseudonymous-workspace-marker',
        rawUserIdPresent: false,
        rawWorkspacePathInActorKey: false,
      },
    });

    trackerMock.getArchitectureReasoningKpiStatus.mockResolvedValue({
      workspacePath: '/tmp/demo-workspace',
      timeWindow: 'last24h',
      windowStartAt: '2026-04-21T12:30:00.000Z',
      windowEndAt: '2026-04-22T12:30:00.000Z',
      thresholds: {
        architectureBreakagePreventedRateMin: 20,
        architectureFalseAlarmRateMax: 35,
      },
      metrics: {
        architectureWarningShown: 8,
        architectureWarningAccepted: 5,
        architectureBreakagePrevented: 3,
        architectureWarningFalsified: 1,
        architectureUnknownScopeBlocked: 2,
        architectureBreakagePreventedRate: 37.5,
        architectureFalseAlarmRate: 25,
        architectureAcceptanceRate: 62.5,
      },
      gates: {
        telemetryEvidencePass: true,
        architectureBreakagePreventedRatePass: true,
        architectureFalseAlarmRatePass: true,
        overallPass: true,
      },
    });

    trackerMock.getSandboxKpiStatus.mockResolvedValue({
      workspacePath: '/tmp/demo-workspace',
      timeWindow: 'last24h',
      windowStartAt: '2026-04-21T12:30:00.000Z',
      windowEndAt: '2026-04-22T12:30:00.000Z',
      thresholds: {
        sandboxSimulationPassRateMin: 70,
        unsafeApplyEscapeRateMax: 5,
      },
      metrics: {
        sandboxSimulationStarted: 5,
        sandboxSimulationPassed: 4,
        sandboxSimulationFailed: 1,
        unsafeApplyEscaped: 0,
        sandboxSimulationPassRate: 80,
        unsafeApplyEscapeRate: 0,
      },
      gates: {
        telemetryEvidencePass: true,
        sandboxSimulationPassRatePass: true,
        unsafeApplyEscapeRatePass: true,
        overallPass: true,
      },
    });

    trackerMock.getStudioRollbackKpiStatus.mockResolvedValue({
      workspacePath: '/tmp/demo-workspace',
      timeWindow: 'last24h',
      windowStartAt: '2026-04-21T12:30:00.000Z',
      windowEndAt: '2026-04-22T12:30:00.000Z',
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
    });
  });

  it('includes action-vs-ask and surface mix in copied quick summary', async () => {
    registerProjectContextAndLogCommands();
    const showTelemetrySummary = registeredCommands.get('workspai.showTelemetrySummary');

    expect(showTelemetrySummary).toBeDefined();
    await showTelemetrySummary?.();

    expect(trackerMock.getCommandTelemetrySummary).toHaveBeenCalledWith(
      '/tmp/demo-workspace',
      'last24h'
    );
    expect(trackerMock.getStudioHardGateStatus).toHaveBeenCalledWith(
      '/tmp/demo-workspace',
      'last24h'
    );
    expect(trackerMock.getStudioPredictionKpiStatus).toHaveBeenCalledWith(
      '/tmp/demo-workspace',
      'last24h'
    );
    expect(trackerMock.getStudioPredictionPortfolioKpiStatus).toHaveBeenCalledWith(
      undefined,
      'last24h'
    );
    expect(trackerMock.getRepeatRateActorModelStatus).toHaveBeenCalledWith(undefined, 'last24h');
    expect(trackerMock.getArchitectureReasoningKpiStatus).toHaveBeenCalledWith(
      '/tmp/demo-workspace',
      'last24h'
    );
    expect(trackerMock.getSandboxKpiStatus).toHaveBeenCalledWith('/tmp/demo-workspace', 'last24h');
    expect(trackerMock.getStudioRollbackKpiStatus).toHaveBeenCalledWith(
      '/tmp/demo-workspace',
      'last24h'
    );

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const quickSummary = writeTextMock.mock.calls[0][0] as string;
    expect(quickSummary).toContain('Action vs Ask share: 60% action (6 action / 4 ask)');
    expect(quickSummary).toContain('Surface mix:');
    expect(quickSummary).toContain('action: 6 (60%)');
    expect(quickSummary).toContain('chat: 3 (30%)');
    expect(quickSummary).toContain('aimodal: 1 (10%)');
    expect(quickSummary).toContain('Predictive KPI overall: PASS');
    expect(quickSummary).toContain('Predictive precision: 71.43%');
    expect(quickSummary).toContain('Predictive portfolio overall: PASS');
    expect(quickSummary).toContain('Predictive portfolio workspaces: 2/2 with telemetry');
    expect(quickSummary).toContain(
      'Predictive portfolio privacy: workspace-marker-only, actor id present: false'
    );
    expect(quickSummary).toContain('Repeat actor rate: 50% (1 repeat / 2 active)');
    expect(quickSummary).toContain(
      'Repeat actor privacy: pseudonymous-workspace-marker, raw user id present: false'
    );
    expect(quickSummary).toContain('Architecture KPI overall: PASS');
    expect(quickSummary).toContain('Architecture breakage prevented rate: 37.5%');
    expect(quickSummary).toContain('Sandbox KPI overall: PASS');
    expect(quickSummary).toContain('Sandbox simulation pass rate: 80%');
    expect(quickSummary).toContain('Unsafe apply escape rate: 0%');
    expect(quickSummary).toContain('Rollback KPI overall: FAIL');
    expect(quickSummary).toContain('Rollback auto success rate: 66.67%');
    expect(quickSummary).toContain('Rollback false-confidence rate: 50%');

    expect(openTextDocumentMock).toHaveBeenCalledTimes(1);
    const openDocArgs = openTextDocumentMock.mock.calls[0][0] as { content: string };
    expect(openDocArgs.content).toContain('"surfaceBreakdown"');
    expect(openDocArgs.content).toContain('"actionVsAskShare": 60');
    expect(openDocArgs.content).toContain('"studioPredictionKpiStatus"');
    expect(openDocArgs.content).toContain('"studioPredictionPortfolioKpiStatus"');
    expect(openDocArgs.content).toContain('"repeatRateActorStatus"');
    expect(openDocArgs.content).toContain('"architectureReasoningKpiStatus"');
    expect(openDocArgs.content).toContain('"sandboxKpiStatus"');
    expect(openDocArgs.content).toContain('"studioRollbackKpiStatus"');
  });
});
