import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clearCache, readPlan, resolveExecutionPlan, runCommand, buildCommand } = vi.hoisted(() => ({
  clearCache: vi.fn(),
  readPlan: vi.fn(),
  resolveExecutionPlan: vi.fn(),
  runCommand: vi.fn(),
  buildCommand: vi.fn(),
}));

vi.mock('../core/doctorRemediationPlanReader', () => ({
  clearDoctorRemediationPlanCache: clearCache,
  readDoctorRemediationPlanForStudio: readPlan,
}));
vi.mock('../core/dashboardCommandExecutionPlan', () => ({
  resolveDashboardCommandExecutionPlan: resolveExecutionPlan,
}));
vi.mock('../ui/panels/incidentStudioInlineCommandBridge', () => ({
  runIncidentInlineCommand: runCommand,
}));
vi.mock('../utils/platformCapabilities', () => ({
  buildRapidkitCommand: buildCommand,
}));

import {
  ensureStudioRemediationRecovery,
  selectStudioRemediationRecoveryStep,
} from '../core/studioRemediationRecovery';

const handoff = {
  cardId: 'workspaceVerify',
  blockers: ['Doctor evidence is stale.'],
  workspacePath: '/workspace',
} as any;

function plan(freshness: 'fresh' | 'stale', executable = true) {
  return {
    freshness: { verdict: freshness },
    visibleSteps: [
      {
        id: 'workspaceVerify.project.api.init',
        risk: 'safe',
        studioState: 'ready',
        canApply: executable,
        executable,
      },
    ],
  } as any;
}

describe('Studio remediation recovery preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveExecutionPlan.mockReturnValue({ cliArgs: ['workspace', 'remediation-plan', '--write'] });
    buildCommand.mockReturnValue('embedded remediation plan command');
    runCommand.mockResolvedValue({ success: true, exitCode: 0 });
  });

  it('uses a fresh canonical plan without rerunning a producer', async () => {
    const freshPlan = plan('fresh');
    readPlan.mockResolvedValue(freshPlan);

    const result = await ensureStudioRemediationRecovery({
      workspacePath: '/workspace',
      handoff,
      actionId: 'test-preflight',
    });

    expect(result).toEqual({ plan: freshPlan, refreshed: false });
    expect(runCommand).not.toHaveBeenCalled();
    expect(selectStudioRemediationRecoveryStep(result.plan)?.id).toBe(
      'workspaceVerify.project.api.init'
    );
  });

  it('never selects an executable advisory for an unrelated blocking Doctor finding', () => {
    const mixedPlan = {
      freshness: { verdict: 'fresh' },
      visibleSteps: [
        {
          id: 'doctor.autoresearch.coverage',
          actionId: 'doctor.autoresearch.coverage',
          issueId: 'coverage-advisory',
          causalKey: 'autoresearch:test:coverage',
          findingStatus: 'advisory',
          risk: 'safe',
          studioState: 'ready',
          canApply: true,
          executable: true,
        },
      ],
    } as any;
    const blockingHandoff = {
      ...handoff,
      cardId: 'doctor',
      doctorFindings: [
        {
          id: 'runtime-blocker',
          causalKey: 'autoresearch:unknown:runtime',
          symptom: 'Runtime could not be classified.',
          status: 'blocking',
          repairDisposition: 'unavailable',
        },
      ],
    } as any;

    expect(selectStudioRemediationRecoveryStep(mixedPlan, blockingHandoff)).toBeUndefined();
  });

  it('selects only the exact blocking Doctor finding when aggregate actions are mixed', () => {
    const exactStep = {
      id: 'doctor.api.dependencies',
      actionId: 'doctor.api.dependencies',
      issueId: 'dependency-blocker',
      causalKey: 'api:dependency:missing',
      findingStatus: 'blocking',
      risk: 'guarded',
      studioState: 'ready',
      canApply: true,
      executable: true,
    };
    const mixedPlan = {
      freshness: { verdict: 'fresh' },
      visibleSteps: [
        {
          ...exactStep,
          id: 'doctor.api.coverage',
          actionId: 'doctor.api.coverage',
          issueId: 'coverage-advisory',
          causalKey: 'api:test:coverage',
          findingStatus: 'advisory',
        },
        exactStep,
      ],
    } as any;
    const blockingHandoff = {
      ...handoff,
      cardId: 'doctor',
      doctorFindings: [
        {
          id: 'dependency-blocker',
          causalKey: 'api:dependency:missing',
          symptom: 'Dependencies are not installed.',
          status: 'blocking',
          repairDisposition: 'approval-required',
        },
      ],
    } as any;

    expect(selectStudioRemediationRecoveryStep(mixedPlan, blockingHandoff)?.id).toBe(
      'doctor.api.dependencies'
    );
  });

  it('rebuilds a stale or missing plan before selecting a repair action', async () => {
    const refreshedPlan = plan('fresh');
    readPlan.mockResolvedValueOnce(null).mockResolvedValueOnce(refreshedPlan);

    const result = await ensureStudioRemediationRecovery({
      workspacePath: '/workspace',
      projectPath: '/workspace/api',
      handoff,
      actionId: 'test-preflight',
    });

    expect(runCommand).toHaveBeenCalledWith({
      command: 'embedded remediation plan command',
      workspacePath: '/workspace',
      projectPath: '/workspace/api',
      actionId: 'test-preflight',
    });
    expect(result).toEqual({ plan: refreshedPlan, refreshed: true });
  });

  it('fails closed when the CLI has no remediation-plan capability', async () => {
    readPlan.mockResolvedValue(null);
    resolveExecutionPlan.mockReturnValue({ cliArgs: [] });

    const result = await ensureStudioRemediationRecovery({
      workspacePath: '/workspace',
      handoff,
      actionId: 'test-preflight',
    });

    expect(result).toMatchObject({
      plan: null,
      refreshed: false,
      refreshError: expect.stringContaining('does not advertise'),
    });
    expect(runCommand).not.toHaveBeenCalled();
  });
});
