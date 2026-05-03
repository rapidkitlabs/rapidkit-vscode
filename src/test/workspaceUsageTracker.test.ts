import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('vscode', () => ({
  window: {
    activeTextEditor: undefined,
    createOutputChannel: () => ({
      appendLine: () => undefined,
      show: () => undefined,
      hide: () => undefined,
      clear: () => undefined,
      dispose: () => undefined,
    }),
  },
  workspace: {
    workspaceFolders: undefined,
    getWorkspaceFolder: () => undefined,
  },
}));

import { WorkspaceUsageTracker } from '../utils/workspaceUsageTracker';
import { readWorkspaceMarker } from '../utils/workspaceMarker';

function createWorkspaceMarker(
  workspacePath: string,
  customTelemetry?: Record<string, unknown>
): void {
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(
    path.join(workspacePath, '.rapidkit-workspace'),
    JSON.stringify(
      {
        signature: 'RAPIDKIT_WORKSPACE',
        createdBy: 'rapidkit-vscode',
        version: '0.20.0',
        createdAt: '2026-04-20T00:00:00.000Z',
        name: path.basename(workspacePath),
        metadata: {
          custom: customTelemetry ? { workspaiTelemetry: customTelemetry } : {},
        },
      },
      null,
      2
    )
  );
}

describe('workspaceUsageTracker telemetry stability', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-usage-tracker-'));
    (WorkspaceUsageTracker as any).instance = undefined;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T12:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('uses hourly buckets for last24h instead of being capped by recentEvents length', async () => {
    const workspacePath = path.join(tempRoot, 'ws-hourly');
    const hourBucket = '2026-04-22T12:00:00.000Z';

    createWorkspaceMarker(workspacePath, {
      commandUsage: {
        'workspai.aiQuickActions': 520,
      },
      recentEvents: Array.from({ length: 500 }, () => ({
        command: 'workspai.aiQuickActions',
        at: '2026-04-22T12:15:00.000Z',
      })),
      hourlyUsage: [
        {
          hour: hourBucket,
          usage: {
            'workspai.aiQuickActions': 520,
          },
        },
      ],
      lastCommand: 'workspai.aiQuickActions',
      lastCommandAt: '2026-04-22T12:15:00.000Z',
    });

    const summary = await WorkspaceUsageTracker.getInstance().getCommandTelemetrySummary(
      workspacePath,
      'last24h'
    );

    expect(summary).not.toBeNull();
    expect(summary?.totalEvents).toBe(520);
    expect(summary?.commandUsage[0]).toEqual({ command: 'workspai.aiQuickActions', count: 520 });
    expect(summary?.surfaceBreakdown.actionEvents).toBe(520);
  });

  it('serializes telemetry writes to avoid concurrent event loss', async () => {
    const workspacePath = path.join(tempRoot, 'ws-queue');
    createWorkspaceMarker(workspacePath);

    await Promise.all(
      Array.from({ length: 30 }, () =>
        WorkspaceUsageTracker.getInstance().trackCommandEvent(
          'workspai.aiQuickActions',
          workspacePath
        )
      )
    );

    const summary = await WorkspaceUsageTracker.getInstance().getCommandTelemetrySummary(
      workspacePath,
      'all'
    );

    expect(summary).not.toBeNull();
    expect(summary?.totalEvents).toBe(30);
    expect(summary?.commandUsage).toEqual([{ command: 'workspai.aiQuickActions', count: 30 }]);

    const marker = await readWorkspaceMarker(workspacePath);
    const telemetry = marker?.metadata?.custom?.workspaiTelemetry as
      | { recentEvents?: unknown[]; hourlyUsage?: unknown[] }
      | undefined;

    expect(Array.isArray(telemetry?.recentEvents)).toBe(true);
    expect((telemetry?.recentEvents ?? []).length).toBe(30);
    expect(Array.isArray(telemetry?.hourlyUsage)).toBe(true);
    expect((telemetry?.hourlyUsage ?? []).length).toBe(1);
  });

  it('calculates stable action-vs-ask surface breakdown', async () => {
    const workspacePath = path.join(tempRoot, 'ws-breakdown');

    createWorkspaceMarker(workspacePath, {
      commandUsage: {
        'workspai.aiQuickActions': 6,
        'workspai.chat.ask': 3,
        'workspai.aimodal.ask': 1,
        'workspai.onboarding.primary.shown': 2,
      },
      recentEvents: [
        { command: 'workspai.aiQuickActions', at: '2026-04-22T12:10:00.000Z' },
        { command: 'workspai.chat.ask', at: '2026-04-22T12:11:00.000Z' },
      ],
      lastCommand: 'workspai.chat.ask',
      lastCommandAt: '2026-04-22T12:11:00.000Z',
    });

    const summary = await WorkspaceUsageTracker.getInstance().getCommandTelemetrySummary(
      workspacePath,
      'all'
    );

    expect(summary).not.toBeNull();
    expect(summary?.surfaceBreakdown.actionEvents).toBe(6);
    expect(summary?.surfaceBreakdown.askEvents).toBe(4);
    expect(summary?.surfaceBreakdown.actionVsAskShare).toBe(60);

    const bySurface = summary?.surfaceBreakdown.bySurface ?? [];
    expect(bySurface.find((entry) => entry.surface === 'action')?.count).toBe(6);
    expect(bySurface.find((entry) => entry.surface === 'chat')?.count).toBe(3);
    expect(bySurface.find((entry) => entry.surface === 'aimodal')?.count).toBe(1);
    expect(bySurface.find((entry) => entry.surface === 'onboarding')?.count).toBe(2);
  });

  it('counts clarification-gate telemetry under ask surfaces for rate analysis', async () => {
    const workspacePath = path.join(tempRoot, 'ws-clarification-gates');

    createWorkspaceMarker(workspacePath, {
      commandUsage: {
        'workspai.chat.ask': 2,
        'workspai.chat.clarification_gate': 3,
        'workspai.aimodal.ask': 1,
        'workspai.aimodal.clarification_gate': 4,
        'workspai.aiQuickActions': 5,
      },
      recentEvents: [
        { command: 'workspai.chat.clarification_gate', at: '2026-04-22T12:10:00.000Z' },
        { command: 'workspai.aimodal.clarification_gate', at: '2026-04-22T12:11:00.000Z' },
      ],
      lastCommand: 'workspai.aimodal.clarification_gate',
      lastCommandAt: '2026-04-22T12:11:00.000Z',
    });

    const summary = await WorkspaceUsageTracker.getInstance().getCommandTelemetrySummary(
      workspacePath,
      'all'
    );

    expect(summary).not.toBeNull();
    expect(summary?.surfaceBreakdown.askEvents).toBe(10);
    expect(summary?.surfaceBreakdown.actionEvents).toBe(5);

    const bySurface = summary?.surfaceBreakdown.bySurface ?? [];
    expect(bySurface.find((entry) => entry.surface === 'chat')?.count).toBe(5);
    expect(bySurface.find((entry) => entry.surface === 'aimodal')?.count).toBe(5);
  });

  it('preserves incident studio loop sequencing and classifies the full loop as action telemetry', async () => {
    const workspacePath = path.join(tempRoot, 'ws-studio-loop');
    createWorkspaceMarker(workspacePath);

    const tracker = WorkspaceUsageTracker.getInstance();
    const sequence = [
      {
        command: 'workspai.studio.loop_started',
        at: '2026-04-22T12:30:00.000Z',
        props: { framework: 'fastapi' },
      },
      {
        command: 'workspai.studio.next_action_clicked',
        at: '2026-04-22T12:30:03.000Z',
        props: { framework: 'fastapi', actionType: 'doctor-fix' },
      },
      {
        command: 'workspai.studio.action_executed',
        at: '2026-04-22T12:30:08.000Z',
        props: { framework: 'fastapi', actionType: 'doctor-fix', durationMs: 5100 },
      },
      {
        command: 'workspai.studio.verify_passed',
        at: '2026-04-22T12:30:11.000Z',
        props: { framework: 'fastapi', actionType: 'doctor-fix', durationMs: 3000 },
      },
      {
        command: 'workspai.studio.loop_completed',
        at: '2026-04-22T12:30:12.000Z',
        props: { framework: 'fastapi', actionCount: 1, queryCount: 1, timeToVerifyMs: 11000 },
      },
    ] as const;

    for (const event of sequence) {
      vi.setSystemTime(new Date(event.at));
      await tracker.trackCommandEvent(event.command, workspacePath, event.props);
    }

    const summary = await tracker.getCommandTelemetrySummary(workspacePath, 'all');

    expect(summary).not.toBeNull();
    expect(summary?.totalEvents).toBe(sequence.length);
    expect(summary?.surfaceBreakdown.actionEvents).toBe(sequence.length);
    expect(summary?.surfaceBreakdown.askEvents).toBe(0);
    expect(summary?.lastCommand).toBe('workspai.studio.loop_completed');
    expect(summary?.lastCommandProps).toEqual({
      framework: 'fastapi',
      actionCount: 1,
      queryCount: 1,
      timeToVerifyMs: 11000,
    });

    const marker = await readWorkspaceMarker(workspacePath);
    const telemetry = marker?.metadata?.custom?.workspaiTelemetry as
      | { recentEvents?: Array<{ command: string }>; commandUsage?: Record<string, number> }
      | undefined;

    expect(telemetry?.recentEvents?.map((entry) => entry.command)).toEqual(
      sequence.map((event) => event.command)
    );
    expect(telemetry?.commandUsage).toMatchObject({
      'workspai.studio.loop_started': 1,
      'workspai.studio.next_action_clicked': 1,
      'workspai.studio.action_executed': 1,
      'workspai.studio.verify_passed': 1,
      'workspai.studio.loop_completed': 1,
    });
  });

  it('classifies studio prediction events as action telemetry surface', async () => {
    const workspacePath = path.join(tempRoot, 'ws-prediction-surface');

    createWorkspaceMarker(workspacePath, {
      commandUsage: {
        'workspai.studio.prediction_shown': 3,
        'workspai.studio.prediction_accepted': 2,
        'workspai.studio.prediction_verified': 1,
        'workspai.studio.prediction_falsified': 1,
        'workspai.chat.ask': 2,
      },
      recentEvents: [
        { command: 'workspai.studio.prediction_shown', at: '2026-04-22T12:10:00.000Z' },
        { command: 'workspai.chat.ask', at: '2026-04-22T12:12:00.000Z' },
      ],
      lastCommand: 'workspai.chat.ask',
      lastCommandAt: '2026-04-22T12:12:00.000Z',
    });

    const summary = await WorkspaceUsageTracker.getInstance().getCommandTelemetrySummary(
      workspacePath,
      'all'
    );

    expect(summary).not.toBeNull();
    expect(summary?.surfaceBreakdown.actionEvents).toBe(7);
    expect(summary?.surfaceBreakdown.askEvents).toBe(2);
    expect(summary?.surfaceBreakdown.actionVsAskShare).toBe(77.78);
  });

  it('treats non-allowlisted ai commands as other surface to prevent drift', async () => {
    const workspacePath = path.join(tempRoot, 'ws-allowlist');

    createWorkspaceMarker(workspacePath, {
      commandUsage: {
        'workspai.aiQuickActions': 6,
        'workspai.aiFutureMagic': 4,
        'workspai.chat.ask': 2,
      },
      recentEvents: [
        { command: 'workspai.aiFutureMagic', at: '2026-04-22T12:20:00.000Z' },
        { command: 'workspai.chat.ask', at: '2026-04-22T12:21:00.000Z' },
      ],
      lastCommand: 'workspai.aiFutureMagic',
      lastCommandAt: '2026-04-22T12:20:00.000Z',
    });

    const summary = await WorkspaceUsageTracker.getInstance().getCommandTelemetrySummary(
      workspacePath,
      'all'
    );

    expect(summary).not.toBeNull();
    expect(summary?.surfaceBreakdown.actionEvents).toBe(6);
    expect(summary?.surfaceBreakdown.askEvents).toBe(2);

    const bySurface = summary?.surfaceBreakdown.bySurface ?? [];
    expect(bySurface.find((entry) => entry.surface === 'other')?.count).toBe(4);
  });

  it('computes studio hard-gate metrics from loop/action/verify events', async () => {
    const workspacePath = path.join(tempRoot, 'ws-hard-gate-pass');
    createWorkspaceMarker(workspacePath);

    const tracker = WorkspaceUsageTracker.getInstance();
    const sequence = [
      'workspai.studio.loop_started',
      'workspai.studio.next_action_clicked',
      'workspai.studio.action_executed',
      'workspai.studio.verify_passed',
      'workspai.studio.loop_completed',
    ] as const;

    for (let i = 0; i < 20; i += 1) {
      for (const command of sequence) {
        await tracker.trackCommandEvent(command, workspacePath, {
          ctaVariant: i % 2 === 0 ? 'single' : 'multi',
        });
      }
    }

    const gateStatus = await tracker.getStudioHardGateStatus(workspacePath, 'all');
    expect(gateStatus).not.toBeNull();
    expect(gateStatus?.metrics.loopStarted).toBe(20);
    expect(gateStatus?.metrics.actionExecuted).toBe(20);
    expect(gateStatus?.metrics.verifyOutcomes).toBe(20);
    expect(gateStatus?.metrics.verifyPhaseReach).toBe(100);
    expect(gateStatus?.metrics.bridgeRouteCompletionRate).toBe(100);
    expect(gateStatus?.gates.verifyPhaseReachPass).toBe(true);
    expect(gateStatus?.gates.bridgeRouteCompletionPass).toBe(true);
    expect(gateStatus?.gates.telemetryEvidencePass).toBe(true);
    expect(gateStatus?.gates.overallPass).toBe(true);
  });

  it('fails studio hard-gate thresholds when verify and bridge rates drop below limits', async () => {
    const workspacePath = path.join(tempRoot, 'ws-hard-gate-fail');
    createWorkspaceMarker(workspacePath);

    const tracker = WorkspaceUsageTracker.getInstance();

    for (let i = 0; i < 10; i += 1) {
      await tracker.trackCommandEvent('workspai.studio.loop_started', workspacePath, {
        ctaVariant: 'single',
      });
    }

    for (let i = 0; i < 5; i += 1) {
      await tracker.trackCommandEvent('workspai.studio.action_executed', workspacePath, {
        ctaVariant: 'single',
      });
    }

    await tracker.trackCommandEvent('workspai.studio.verify_passed', workspacePath, {
      ctaVariant: 'single',
    });

    const gateStatus = await tracker.getStudioHardGateStatus(workspacePath, 'all');
    expect(gateStatus).not.toBeNull();
    expect(gateStatus?.metrics.loopStarted).toBe(10);
    expect(gateStatus?.metrics.actionExecuted).toBe(5);
    expect(gateStatus?.metrics.verifyOutcomes).toBe(1);
    expect(gateStatus?.metrics.verifyPhaseReach).toBe(20);
    expect(gateStatus?.metrics.bridgeRouteCompletionRate).toBe(50);
    expect(gateStatus?.gates.verifyPhaseReachPass).toBe(false);
    expect(gateStatus?.gates.bridgeRouteCompletionPass).toBe(false);
    expect(gateStatus?.gates.overallPass).toBe(false);
  });

  it('computes predictive KPI metrics from studio prediction lifecycle events', async () => {
    const workspacePath = path.join(tempRoot, 'ws-prediction-kpi-pass');
    createWorkspaceMarker(workspacePath);

    const tracker = WorkspaceUsageTracker.getInstance();

    for (let i = 0; i < 10; i += 1) {
      await tracker.trackCommandEvent('workspai.studio.prediction_shown', workspacePath, {
        framework: 'fastapi',
      });
    }

    for (let i = 0; i < 7; i += 1) {
      await tracker.trackCommandEvent('workspai.studio.prediction_accepted', workspacePath, {
        framework: 'fastapi',
      });
    }

    for (let i = 0; i < 5; i += 1) {
      await tracker.trackCommandEvent('workspai.studio.prediction_verified', workspacePath, {
        framework: 'fastapi',
      });
    }

    for (let i = 0; i < 2; i += 1) {
      await tracker.trackCommandEvent('workspai.studio.prediction_falsified', workspacePath, {
        framework: 'fastapi',
      });
    }

    const status = await tracker.getStudioPredictionKpiStatus(workspacePath, 'all', {
      predictivePrecisionMin: 70,
      falseAlarmRateMax: 30,
      preventedIncidentRateMin: 40,
    });

    expect(status).not.toBeNull();
    expect(status?.metrics.predictionShown).toBe(10);
    expect(status?.metrics.predictionAccepted).toBe(7);
    expect(status?.metrics.predictionVerified).toBe(5);
    expect(status?.metrics.predictionFalsified).toBe(2);
    expect(status?.metrics.predictionIgnored).toBe(3);
    expect(status?.metrics.predictivePrecision).toBe(71.43);
    expect(status?.metrics.falseAlarmRate).toBe(28.57);
    expect(status?.metrics.preventedIncidentRate).toBe(50);
    expect(status?.aggregation.prevented_incident_rate).toMatchObject({
      numerator: 5,
      denominator: 10,
      value: 50,
      unit: 'percent',
    });
    expect(status?.aggregation.predictive_precision).toMatchObject({
      numerator: 5,
      denominator: 7,
      value: 71.43,
      unit: 'percent',
    });
    expect(status?.aggregation.false_alarm_rate).toMatchObject({
      numerator: 2,
      denominator: 7,
      value: 28.57,
      unit: 'percent',
    });
    expect(status?.metrics.acceptanceRate).toBe(70);
    expect(status?.metrics.verificationCoverage).toBe(100);
    expect(status?.gates.telemetryEvidencePass).toBe(true);
    expect(status?.gates.predictivePrecisionPass).toBe(true);
    expect(status?.gates.falseAlarmRatePass).toBe(true);
    expect(status?.gates.preventedIncidentRatePass).toBe(true);
    expect(status?.gates.overallPass).toBe(true);
  });

  it('uses all-time command aggregates for predictive KPI status when recent event history is capped', async () => {
    const workspacePath = path.join(tempRoot, 'ws-prediction-command-aggregate');
    createWorkspaceMarker(workspacePath, {
      commandUsage: {
        'workspai.studio.prediction_shown': 120,
        'workspai.studio.prediction_accepted': 90,
        'workspai.studio.prediction_verified': 72,
        'workspai.studio.prediction_falsified': 18,
      },
      recentEvents: [
        { command: 'workspai.studio.prediction_shown', at: '2026-04-22T12:10:00.000Z' },
        { command: 'workspai.studio.prediction_verified', at: '2026-04-22T12:11:00.000Z' },
      ],
    });

    const status = await WorkspaceUsageTracker.getInstance().getStudioPredictionKpiStatus(
      workspacePath,
      'all'
    );

    expect(status).not.toBeNull();
    expect(status?.metrics.predictionShown).toBe(120);
    expect(status?.metrics.predictionAccepted).toBe(90);
    expect(status?.metrics.predictionVerified).toBe(72);
    expect(status?.metrics.predictionFalsified).toBe(18);
    expect(status?.metrics.preventedIncidentRate).toBe(60);
    expect(status?.metrics.predictivePrecision).toBe(80);
    expect(status?.metrics.falseAlarmRate).toBe(20);
    expect(status?.aggregation.prevented_incident_rate.denominator).toBe(120);
    expect(status?.aggregation.predictive_precision.denominator).toBe(90);
    expect(status?.aggregation.false_alarm_rate.denominator).toBe(90);
  });

  it('aggregates predictive KPI status across multiple workspace markers without actor identifiers', async () => {
    const workspaceA = path.join(tempRoot, 'ws-portfolio-a');
    const workspaceB = path.join(tempRoot, 'ws-portfolio-b');

    createWorkspaceMarker(workspaceA, {
      commandUsage: {
        'workspai.studio.prediction_shown': 10,
        'workspai.studio.prediction_accepted': 7,
        'workspai.studio.prediction_verified': 5,
        'workspai.studio.prediction_falsified': 2,
      },
    });
    createWorkspaceMarker(workspaceB, {
      commandUsage: {
        'workspai.studio.prediction_shown': 5,
        'workspai.studio.prediction_accepted': 3,
        'workspai.studio.prediction_verified': 2,
        'workspai.studio.prediction_falsified': 1,
      },
    });

    const status = await WorkspaceUsageTracker.getInstance().getStudioPredictionPortfolioKpiStatus(
      [workspaceA, workspaceB, workspaceA],
      'all'
    );

    expect(status).not.toBeNull();
    expect(status?.scope).toBe('explicit-workspaces');
    expect(status?.evaluatedWorkspaceCount).toBe(2);
    expect(status?.telemetryWorkspaceCount).toBe(2);
    expect(status?.workspacePaths).toEqual([workspaceA, workspaceB]);
    expect(status?.metrics.predictionShown).toBe(15);
    expect(status?.metrics.predictionAccepted).toBe(10);
    expect(status?.metrics.predictionVerified).toBe(7);
    expect(status?.metrics.predictionFalsified).toBe(3);
    expect(status?.metrics.predictionIgnored).toBe(5);
    expect(status?.metrics.predictivePrecision).toBe(70);
    expect(status?.metrics.falseAlarmRate).toBe(30);
    expect(status?.metrics.preventedIncidentRate).toBe(46.67);
    expect(status?.metrics.workspacePassCount).toBe(2);
    expect(status?.metrics.workspaceFailCount).toBe(0);
    expect(status?.aggregation.prevented_incident_rate).toMatchObject({
      numerator: 7,
      denominator: 15,
      value: 46.67,
    });
    expect(status?.aggregation.predictive_precision).toMatchObject({
      numerator: 7,
      denominator: 10,
      value: 70,
    });
    expect(status?.aggregation.false_alarm_rate).toMatchObject({
      numerator: 3,
      denominator: 10,
      value: 30,
    });
    expect(status?.privacy).toEqual({
      actorModel: 'workspace-marker-only',
      actorIdPresent: false,
    });
    expect(status?.gates.overallPass).toBe(true);
  });

  it('computes repeat-rate actor model from pseudonymous workspace actors', async () => {
    const workspaceA = path.join(tempRoot, 'ws-repeat-a');
    const workspaceB = path.join(tempRoot, 'ws-repeat-b');
    const workspaceC = path.join(tempRoot, 'ws-repeat-c');

    createWorkspaceMarker(workspaceA, {
      recentEvents: [
        { command: 'workspai.chat.ask', at: '2026-04-22T10:05:00.000Z' },
        { command: 'workspai.studio.loop_started', at: '2026-04-22T12:05:00.000Z' },
      ],
      hourlyUsage: [
        {
          hour: '2026-04-22T10:00:00.000Z',
          usage: { 'workspai.chat.ask': 1 },
        },
        {
          hour: '2026-04-22T12:00:00.000Z',
          usage: { 'workspai.studio.loop_started': 1 },
        },
      ],
    });
    createWorkspaceMarker(workspaceB, {
      recentEvents: [{ command: 'workspai.chat.ask', at: '2026-04-22T12:10:00.000Z' }],
      hourlyUsage: [
        {
          hour: '2026-04-22T12:00:00.000Z',
          usage: { 'workspai.chat.ask': 1 },
        },
      ],
    });
    createWorkspaceMarker(workspaceC, {
      recentEvents: [],
      hourlyUsage: [],
    });

    const status = await WorkspaceUsageTracker.getInstance().getRepeatRateActorModelStatus(
      [workspaceA, workspaceB, workspaceC],
      'last24h'
    );

    expect(status).not.toBeNull();
    expect(status?.scope).toBe('explicit-workspaces');
    expect(status?.workspaceCount).toBe(3);
    expect(status?.activeActorCount).toBe(2);
    expect(status?.repeatActorCount).toBe(1);
    expect(status?.repeatRate).toBe(50);
    expect(status?.actors).toHaveLength(2);
    expect(status?.actors[0].actorKey).toMatch(/^[a-f0-9]{16}$/);
    expect(status?.actors.some((actor) => actor.repeated && actor.activeHourCount === 2)).toBe(
      true
    );
    expect(status?.actors.every((actor) => !actor.actorKey.includes(tempRoot))).toBe(true);
    expect(status?.privacy).toEqual({
      actorModel: 'pseudonymous-workspace-marker',
      rawUserIdPresent: false,
      rawWorkspacePathInActorKey: false,
    });
  });

  it('computes architecture reasoning KPI metrics from impact warning outcome events', async () => {
    const workspacePath = path.join(tempRoot, 'ws-architecture-kpi');
    createWorkspaceMarker(workspacePath);

    const tracker = WorkspaceUsageTracker.getInstance();
    for (let i = 0; i < 8; i += 1) {
      await tracker.trackCommandEvent('workspai.studio.architecture_warning_shown', workspacePath);
    }
    for (let i = 0; i < 5; i += 1) {
      await tracker.trackCommandEvent(
        'workspai.studio.architecture_warning_accepted',
        workspacePath
      );
    }
    for (let i = 0; i < 3; i += 1) {
      await tracker.trackCommandEvent(
        'workspai.studio.architecture_breakage_prevented',
        workspacePath
      );
    }
    await tracker.trackCommandEvent(
      'workspai.studio.architecture_warning_falsified',
      workspacePath
    );
    for (let i = 0; i < 2; i += 1) {
      await tracker.trackCommandEvent(
        'workspai.studio.architecture_unknown_scope_blocked',
        workspacePath
      );
    }

    const status = await tracker.getArchitectureReasoningKpiStatus(workspacePath, 'all', {
      architectureBreakagePreventedRateMin: 30,
      architectureFalseAlarmRateMax: 30,
    });

    expect(status).not.toBeNull();
    expect(status?.metrics.architectureWarningShown).toBe(8);
    expect(status?.metrics.architectureWarningAccepted).toBe(5);
    expect(status?.metrics.architectureBreakagePrevented).toBe(3);
    expect(status?.metrics.architectureWarningFalsified).toBe(1);
    expect(status?.metrics.architectureUnknownScopeBlocked).toBe(2);
    expect(status?.metrics.architectureBreakagePreventedRate).toBe(37.5);
    expect(status?.metrics.architectureFalseAlarmRate).toBe(25);
    expect(status?.metrics.architectureAcceptanceRate).toBe(62.5);
    expect(status?.gates.telemetryEvidencePass).toBe(true);
    expect(status?.gates.architectureBreakagePreventedRatePass).toBe(true);
    expect(status?.gates.architectureFalseAlarmRatePass).toBe(true);
    expect(status?.gates.overallPass).toBe(true);

    const summary = await tracker.getCommandTelemetrySummary(workspacePath, 'all');
    expect(summary?.surfaceBreakdown.actionEvents).toBe(19);
  });

  it('computes sandbox KPI metrics from simulation and escape outcome events', async () => {
    const workspacePath = path.join(tempRoot, 'ws-sandbox-kpi');
    createWorkspaceMarker(workspacePath);

    const tracker = WorkspaceUsageTracker.getInstance();
    for (let i = 0; i < 5; i += 1) {
      await tracker.trackCommandEvent('workspai.studio.sandbox_simulation_started', workspacePath);
    }
    for (let i = 0; i < 4; i += 1) {
      await tracker.trackCommandEvent('workspai.studio.sandbox_simulation_passed', workspacePath);
    }
    await tracker.trackCommandEvent('workspai.studio.sandbox_simulation_failed', workspacePath);

    const status = await tracker.getSandboxKpiStatus(workspacePath, 'all', {
      sandboxSimulationPassRateMin: 75,
      unsafeApplyEscapeRateMax: 5,
    });

    expect(status).not.toBeNull();
    expect(status?.metrics.sandboxSimulationStarted).toBe(5);
    expect(status?.metrics.sandboxSimulationPassed).toBe(4);
    expect(status?.metrics.sandboxSimulationFailed).toBe(1);
    expect(status?.metrics.unsafeApplyEscaped).toBe(0);
    expect(status?.metrics.sandboxSimulationPassRate).toBe(80);
    expect(status?.metrics.unsafeApplyEscapeRate).toBe(0);
    expect(status?.gates.telemetryEvidencePass).toBe(true);
    expect(status?.gates.sandboxSimulationPassRatePass).toBe(true);
    expect(status?.gates.unsafeApplyEscapeRatePass).toBe(true);
    expect(status?.gates.overallPass).toBe(true);
  });

  it('computes rollback KPI metrics from verify-failed and rollback events', async () => {
    const workspacePath = path.join(tempRoot, 'ws-rollback-kpi-pass');
    createWorkspaceMarker(workspacePath);

    const tracker = WorkspaceUsageTracker.getInstance();

    for (let i = 0; i < 5; i += 1) {
      await tracker.trackCommandEvent('workspai.studio.verify_failed', workspacePath, {
        framework: 'fastapi',
      });
    }

    for (let i = 0; i < 5; i += 1) {
      await tracker.trackCommandEvent('workspai.studio.rollback_attempted', workspacePath, {
        framework: 'fastapi',
      });
    }

    for (let i = 0; i < 4; i += 1) {
      await tracker.trackCommandEvent('workspai.studio.rollback_succeeded', workspacePath, {
        framework: 'fastapi',
      });
    }

    await tracker.trackCommandEvent('workspai.studio.rollback_failed', workspacePath, {
      framework: 'fastapi',
    });

    const status = await tracker.getStudioRollbackKpiStatus(workspacePath, 'all', {
      verifyAutoRollbackSuccessRateMin: 75,
      falseConfidenceRateMax: 30,
    });

    expect(status).not.toBeNull();
    expect(status?.metrics.verifyFailed).toBe(5);
    expect(status?.metrics.rollbackAttempted).toBe(5);
    expect(status?.metrics.rollbackSucceeded).toBe(4);
    expect(status?.metrics.verifyAutoRollbackSuccessRate).toBe(80);
    expect(status?.metrics.falseConfidenceRate).toBe(20);
    expect(status?.gates.telemetryEvidencePass).toBe(true);
    expect(status?.gates.verifyAutoRollbackSuccessRatePass).toBe(true);
    expect(status?.gates.falseConfidenceRatePass).toBe(true);
    expect(status?.gates.overallPass).toBe(true);

    const summary = await tracker.getCommandTelemetrySummary(workspacePath, 'all');
    expect(summary?.surfaceBreakdown.actionEvents).toBe(15);
  });

  it('computes repro pack KPI metrics from capture/export/import/replay-learning events', async () => {
    const workspacePath = path.join(tempRoot, 'ws-repro-pack-kpi-pass');
    createWorkspaceMarker(workspacePath);

    const tracker = WorkspaceUsageTracker.getInstance();

    for (let i = 0; i < 4; i += 1) {
      await tracker.trackCommandEvent(
        'workspai.studio.incident_repro_pack_captured',
        workspacePath,
        {
          framework: 'fastapi',
        }
      );
    }

    for (let i = 0; i < 3; i += 1) {
      await tracker.trackCommandEvent(
        'workspai.studio.incident_repro_pack_exported',
        workspacePath,
        {
          framework: 'fastapi',
        }
      );
    }

    for (let i = 0; i < 2; i += 1) {
      await tracker.trackCommandEvent(
        'workspai.studio.incident_repro_pack_imported',
        workspacePath,
        {
          framework: 'fastapi',
        }
      );
      await tracker.trackCommandEvent('workspai.studio.incident_replay_ready', workspacePath, {
        framework: 'fastapi',
      });
      await tracker.trackCommandEvent(
        'workspai.studio.incident_replay_memory_enriched',
        workspacePath,
        {
          framework: 'fastapi',
        }
      );
    }

    const status = await tracker.getStudioReproPackKpiStatus(workspacePath, 'all', {
      reproPackShareRateMin: 50,
      replayToResolutionRateMin: 60,
    });

    expect(status).not.toBeNull();
    expect(status?.metrics.reproPackCaptured).toBe(4);
    expect(status?.metrics.reproPackExported).toBe(3);
    expect(status?.metrics.reproPackImported).toBe(2);
    expect(status?.metrics.incidentReplayReady).toBe(2);
    expect(status?.metrics.incidentReplayMemoryEnriched).toBe(2);
    expect(status?.metrics.reproPackShareRate).toBe(75);
    expect(status?.metrics.replayToResolutionRate).toBe(100);
    expect(status?.gates.telemetryEvidencePass).toBe(true);
    expect(status?.gates.reproPackShareRatePass).toBe(true);
    expect(status?.gates.replayToResolutionRatePass).toBe(true);
    expect(status?.gates.overallPass).toBe(true);

    const summary = await tracker.getCommandTelemetrySummary(workspacePath, 'all');
    expect(summary?.surfaceBreakdown.actionEvents).toBe(13);
  });

  it('uses onboarding hourly buckets for last24h stats instead of recentEvents cap', async () => {
    const workspacePath = path.join(tempRoot, 'ws-onboarding-hourly');

    createWorkspaceMarker(workspacePath, {
      recentEvents: Array.from({ length: 500 }, () => ({
        command: 'workspai.onboarding.followup.shown',
        at: '2026-04-22T12:15:00.000Z',
        props: { variant: 'control' },
      })),
      onboardingHourlyUsage: [
        {
          hour: '2026-04-22T12:00:00.000Z',
          aggregate: {
            primaryShown: 520,
            primaryActionUsage: {
              'open-ai-flows': 300,
              'open-telemetry': 220,
            },
            followupShownByVariant: {
              control: 300,
              compact: 220,
            },
            followupClickedByVariant: {
              control: 120,
              compact: 140,
            },
            followupDismissedByVariant: {
              control: 80,
              compact: 50,
            },
          },
        },
      ],
    });

    const stats = await WorkspaceUsageTracker.getInstance().getOnboardingExperimentStats(
      workspacePath,
      'last24h'
    );

    expect(stats).not.toBeNull();
    expect(stats?.primaryShown).toBe(520);
    expect(stats?.primaryActionCounts).toEqual([
      { action: 'open-ai-flows', count: 300 },
      { action: 'open-telemetry', count: 220 },
    ]);
    expect(stats?.followupShown).toBe(520);
    expect(stats?.followupClicked).toBe(260);
    expect(stats?.followupDismissed).toBe(130);
    expect(stats?.overallFollowupClickThroughRate).toBe(50);
    expect(stats?.variants).toEqual([
      {
        variant: 'control',
        shown: 300,
        clicked: 120,
        dismissed: 80,
        clickThroughRate: 40,
      },
      {
        variant: 'compact',
        shown: 220,
        clicked: 140,
        dismissed: 50,
        clickThroughRate: 63.64,
      },
    ]);
  });

  it('uses onboarding all-time aggregate for all window stats', async () => {
    const workspacePath = path.join(tempRoot, 'ws-onboarding-all');

    createWorkspaceMarker(workspacePath, {
      recentEvents: Array.from({ length: 500 }, () => ({
        command: 'workspai.onboarding.primary.shown',
        at: '2026-04-22T12:10:00.000Z',
      })),
      onboardingAggregate: {
        primaryShown: 900,
        primaryActionUsage: {
          'open-ai-flows': 500,
          'open-dashboard': 400,
        },
        followupShownByVariant: {
          control: 450,
          compact: 450,
        },
        followupClickedByVariant: {
          control: 180,
          compact: 240,
        },
        followupDismissedByVariant: {
          control: 120,
          compact: 140,
        },
      },
    });

    const stats = await WorkspaceUsageTracker.getInstance().getOnboardingExperimentStats(
      workspacePath,
      'all'
    );

    expect(stats).not.toBeNull();
    expect(stats?.primaryShown).toBe(900);
    expect(stats?.primaryActionCounts).toEqual([
      { action: 'open-ai-flows', count: 500 },
      { action: 'open-dashboard', count: 400 },
    ]);
    expect(stats?.followupShown).toBe(900);
    expect(stats?.followupClicked).toBe(420);
    expect(stats?.followupDismissed).toBe(260);
    expect(stats?.overallFollowupClickThroughRate).toBe(46.67);
  });

  it('getClarificationGateKpiStatus reports gate count and rate vs ask for all/last24h/last7d', async () => {
    const workspacePath = path.join(tempRoot, 'ws-gate-kpi');
    const hour = '2026-04-22T12:00:00.000Z';

    createWorkspaceMarker(workspacePath, {
      commandUsage: {
        'workspai.chat.ask': 10,
        'workspai.aimodal.ask': 6,
        'workspai.chat.clarification_gate': 3,
        'workspai.aimodal.clarification_gate': 2,
      },
      recentEvents: [
        { command: 'workspai.chat.ask', at: '2026-04-22T12:05:00.000Z' },
        { command: 'workspai.chat.clarification_gate', at: '2026-04-22T12:06:00.000Z' },
        { command: 'workspai.aimodal.ask', at: '2026-04-22T12:07:00.000Z' },
        { command: 'workspai.aimodal.clarification_gate', at: '2026-04-22T12:08:00.000Z' },
      ],
      hourlyUsage: [
        {
          hour,
          usage: {
            'workspai.chat.ask': 10,
            'workspai.aimodal.ask': 6,
            'workspai.chat.clarification_gate': 3,
            'workspai.aimodal.clarification_gate': 2,
          },
        },
      ],
    });

    const tracker = WorkspaceUsageTracker.getInstance();

    // all-time: uses commandUsage totals
    const statusAll = await tracker.getClarificationGateKpiStatus(workspacePath, 'all');
    expect(statusAll).not.toBeNull();
    expect(statusAll?.metrics.chatAskCount).toBe(10);
    expect(statusAll?.metrics.aimodalAskCount).toBe(6);
    expect(statusAll?.metrics.totalAskCount).toBe(16);
    expect(statusAll?.metrics.chatClarificationGateCount).toBe(3);
    expect(statusAll?.metrics.aimodalClarificationGateCount).toBe(2);
    expect(statusAll?.metrics.clarificationGateCount).toBe(5);
    expect(statusAll?.metrics.clarificationRateVsAsk).toBe(31.25);
    expect(statusAll?.gates.telemetryEvidencePass).toBe(true);
    expect(statusAll?.gates.clarificationRateVsAskPass).toBe(true); // 31.25 <= 40 default
    expect(statusAll?.gates.overallPass).toBe(true);

    // last24h/last7d: uses hourly buckets (same data in bucket)
    const statusLast7d = await tracker.getClarificationGateKpiStatus(workspacePath, 'last7d');
    expect(statusLast7d).not.toBeNull();
    expect(statusLast7d?.metrics.totalAskCount).toBe(16);
    expect(statusLast7d?.metrics.clarificationGateCount).toBe(5);
    expect(statusLast7d?.timeWindow).toBe('last7d');

    // custom threshold that would fail
    const statusFail = await tracker.getClarificationGateKpiStatus(workspacePath, 'all', {
      clarificationRateVsAskMax: 20,
    });
    expect(statusFail?.gates.clarificationRateVsAskPass).toBe(false); // 31.25 > 20
    expect(statusFail?.gates.overallPass).toBe(false);
    expect(statusFail?.thresholds.clarificationRateVsAskMax).toBe(20);
  });
});
