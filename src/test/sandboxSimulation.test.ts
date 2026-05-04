import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs-extra';
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
    expect(evidence.verifyPackContract).toMatchObject({
      schemaVersion: 'v1',
      producer: 'sandbox-simulation',
      overallStatus: 'passed',
      summary: {
        totalCommands: 1,
        passedCommands: 1,
        failedCommands: 0,
      },
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
    expect(evidence.verifyPackContract.overallStatus).toBe('failed');
    expect(evidence.verifyPackContract.summary.failedCommands).toBe(1);
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
    expect(evidence.verifyPackContract.overallStatus).toBe('skipped');
    expect(evidence.verifyPackContract.summary.totalCommands).toBe(0);
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

  it('falls back to disposable filesystem sandbox when git worktree is unavailable', async () => {
    const trackCommandEvent = vi.fn().mockResolvedValue(undefined);
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-sandbox-test-'));
    await fs.writeFile(path.join(workspacePath, 'README.md'), 'sandbox fixture', 'utf-8');

    const commandRunner = vi.fn(async (command: string, args: string[], _options: any) => {
      if (command === 'git' && args[0] === 'rev-parse') {
        return {
          stdout: '',
          stderr: 'fatal: not a git repository',
          exitCode: 1,
        };
      }

      return {
        stdout: 'ok',
        stderr: '',
        exitCode: 0,
      };
    });

    try {
      const evidence = await runSandboxSimulation(
        {
          workspacePath,
          actionId: 'action-5',
          riskClass: 'high-risk-mutating',
          verifyCommands: [{ command: 'npm', args: ['test'] }],
        },
        {
          commandRunner,
          allowDefaultDisposableSandbox: true,
          telemetry: { trackCommandEvent },
          now: () => new Date('2026-04-22T12:30:00.000Z'),
        }
      );

      const npmCall = commandRunner.mock.calls.find((call) => call[0] === 'npm');
      expect(npmCall).toBeDefined();
      expect(npmCall?.[2]).toMatchObject({ reject: false });
      expect(npmCall?.[2]?.cwd).toContain('workspai-sandbox-copy-action-5-');
      expect(npmCall?.[2]?.cwd).not.toBe(workspacePath);
      expect(evidence.mode).toBe('disposable-sandbox');
      expect(evidence.status).toBe('passed');
      expect(trackCommandEvent.mock.calls[0]?.[2]).toMatchObject({ mode: 'disposable-sandbox' });
    } finally {
      await fs.remove(workspacePath).catch(() => undefined);
    }
  });
});
