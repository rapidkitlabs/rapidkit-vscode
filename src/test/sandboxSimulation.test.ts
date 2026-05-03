import { describe, expect, it, vi } from 'vitest';

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

import { runSandboxSimulation } from '../core/sandboxSimulation';

describe('sandboxSimulation', () => {
  it('runs verify commands, returns pass evidence, and tracks sandbox KPI events', async () => {
    const trackCommandEvent = vi.fn().mockResolvedValue(undefined);
    const commandRunner = vi.fn().mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });

    const evidence = await runSandboxSimulation(
      {
        workspacePath: '/tmp/wsp',
        actionId: 'action-1',
        riskClass: 'guarded-mutating',
        verifyCommands: [{ command: 'npm', args: ['test'], label: 'unit tests' }],
      },
      {
        commandRunner,
        telemetry: { trackCommandEvent },
        now: () => new Date('2026-04-22T12:30:00.000Z'),
      }
    );

    expect(commandRunner).toHaveBeenCalledWith('npm', ['test'], {
      cwd: '/tmp/wsp',
      timeout: 30000,
      reject: false,
    });
    expect(evidence).toMatchObject({
      actionId: 'action-1',
      workspacePath: '/tmp/wsp',
      riskClass: 'guarded-mutating',
      mode: 'verify-pack-simulation',
      status: 'passed',
      safeToApply: true,
      reason: 'All sandbox verify commands passed before apply.',
    });
    expect(evidence.commandResults[0]).toMatchObject({
      label: 'unit tests',
      command: 'npm',
      args: ['test'],
      exitCode: 0,
      stdout: 'ok',
    });
    expect(trackCommandEvent.mock.calls.map((call) => call[0])).toEqual([
      'workspai.studio.sandbox_simulation_started',
      'workspai.studio.sandbox_simulation_passed',
    ]);
  });

  it('blocks apply when a verify command fails', async () => {
    const trackCommandEvent = vi.fn().mockResolvedValue(undefined);
    const commandRunner = vi.fn().mockResolvedValue({
      stdout: '',
      stderr: 'boom',
      exitCode: 1,
    });

    const evidence = await runSandboxSimulation(
      {
        workspacePath: '/tmp/wsp',
        actionId: 'action-2',
        riskClass: 'high-risk-mutating',
        verifyCommands: [{ command: 'pytest', args: ['tests/orders'] }],
        rollbackHint: 'Run git restore for affected files before retry.',
      },
      {
        commandRunner,
        telemetry: { trackCommandEvent },
        now: () => new Date('2026-04-22T12:30:00.000Z'),
      }
    );

    expect(evidence.status).toBe('failed');
    expect(evidence.safeToApply).toBe(false);
    expect(evidence.recommendedRollbackPath).toBe(
      'Run git restore for affected files before retry.'
    );
    expect(trackCommandEvent.mock.calls.map((call) => call[0])).toEqual([
      'workspai.studio.sandbox_simulation_started',
      'workspai.studio.sandbox_simulation_failed',
    ]);
  });

  it('skips safely when no deterministic verify commands are available', async () => {
    const trackCommandEvent = vi.fn().mockResolvedValue(undefined);
    const commandRunner = vi.fn();

    const evidence = await runSandboxSimulation(
      {
        workspacePath: '/tmp/wsp',
        actionId: 'action-3',
        riskClass: 'guarded-mutating',
        verifyCommands: [],
      },
      {
        commandRunner,
        telemetry: { trackCommandEvent },
        now: () => new Date('2026-04-22T12:30:00.000Z'),
      }
    );

    expect(commandRunner).not.toHaveBeenCalled();
    expect(evidence.status).toBe('skipped');
    expect(evidence.safeToApply).toBe(false);
    expect(evidence.reason).toContain('No deterministic verify commands');
    expect(trackCommandEvent.mock.calls.map((call) => call[0])).toEqual([
      'workspai.studio.sandbox_simulation_started',
    ]);
  });

  it('uses disposable sandbox cwd and runs cleanup when prepareSandbox is provided', async () => {
    const trackCommandEvent = vi.fn().mockResolvedValue(undefined);
    const commandRunner = vi.fn().mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });
    const cleanup = vi.fn().mockResolvedValue(undefined);

    const evidence = await runSandboxSimulation(
      {
        workspacePath: '/tmp/wsp',
        actionId: 'action-4',
        riskClass: 'high-risk-mutating',
        verifyCommands: [{ command: 'npm', args: ['run', 'test'] }],
      },
      {
        commandRunner,
        telemetry: { trackCommandEvent },
        now: () => new Date('2026-04-22T12:30:00.000Z'),
        prepareSandbox: async () => ({
          cwd: '/tmp/disposable-wsp',
          mode: 'disposable-sandbox',
          cleanup,
        }),
      }
    );

    expect(commandRunner).toHaveBeenCalledWith('npm', ['run', 'test'], {
      cwd: '/tmp/disposable-wsp',
      timeout: 30000,
      reject: false,
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(evidence.mode).toBe('disposable-sandbox');
    expect(trackCommandEvent.mock.calls[0]?.[2]).toMatchObject({ mode: 'disposable-sandbox' });
  });
});
