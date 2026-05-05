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
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-sandbox-pass-'));

    try {
      const evidence = await runSandboxSimulation(
        {
          workspacePath,
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
        cwd: workspacePath,
        timeout: 30000,
        reject: false,
      });
      expect(evidence).toMatchObject({
        actionId: 'action-1',
        workspacePath,
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
    } finally {
      await fs.remove(workspacePath).catch(() => undefined);
    }
  });

  it('blocks apply when a verify command fails', async () => {
    const trackCommandEvent = vi.fn().mockResolvedValue(undefined);
    const commandRunner = vi.fn().mockResolvedValue({
      stdout: '',
      stderr: 'boom',
      exitCode: 1,
    });
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-sandbox-fail-'));

    try {
      const evidence = await runSandboxSimulation(
        {
          workspacePath,
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
    } finally {
      await fs.remove(workspacePath).catch(() => undefined);
    }
  });

  it('skips safely when no deterministic verify commands are available', async () => {
    const trackCommandEvent = vi.fn().mockResolvedValue(undefined);
    const commandRunner = vi.fn();
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-sandbox-skip-'));

    try {
      const evidence = await runSandboxSimulation(
        {
          workspacePath,
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
    } finally {
      await fs.remove(workspacePath).catch(() => undefined);
    }
  });

  it('uses disposable sandbox cwd and runs cleanup when prepareSandbox is provided', async () => {
    const trackCommandEvent = vi.fn().mockResolvedValue(undefined);
    const commandRunner = vi.fn().mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-sandbox-disposable-'));

    try {
      const evidence = await runSandboxSimulation(
        {
          workspacePath,
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
    } finally {
      await fs.remove(workspacePath).catch(() => undefined);
    }
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

  it('blocks apply when cumulative verify duration exceeds max total timeout budget', async () => {
    const trackCommandEvent = vi.fn().mockResolvedValue(undefined);
    const commandRunner = vi.fn().mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-sandbox-timeout-'));

    const timeline = [
      new Date('2026-04-22T12:30:00.000Z'),
      new Date('2026-04-22T12:30:00.000Z'),
      new Date('2026-04-22T12:31:10.000Z'),
      new Date('2026-04-22T12:31:10.000Z'),
      new Date('2026-04-22T12:32:10.000Z'),
      new Date('2026-04-22T12:32:10.000Z'),
    ];
    let nowIndex = 0;

    try {
      const evidence = await runSandboxSimulation(
        {
          workspacePath,
          actionId: 'action-6',
          riskClass: 'high-risk-mutating',
          verifyCommands: [
            { command: 'npm', args: ['run', 'test:unit'] },
            { command: 'npm', args: ['run', 'test:integration'] },
            { command: 'npm', args: ['run', 'test:e2e'] },
          ],
          maxTotalDurationMs: 60000,
        },
        {
          commandRunner,
          telemetry: { trackCommandEvent },
          now: () => {
            const value = timeline[Math.min(nowIndex, timeline.length - 1)];
            nowIndex += 1;
            return value;
          },
        }
      );

      expect(commandRunner).toHaveBeenCalledTimes(1);
      expect(evidence.status).toBe('failed');
      expect(evidence.safeToApply).toBe(false);
      expect(evidence.reason).toContain('cumulative timeout budget');
      expect(evidence.verifyPackContract.overallStatus).toBe('failed');
      expect(trackCommandEvent.mock.calls.map((call) => call[0])).toEqual([
        'workspai.studio.sandbox_simulation_started',
        'workspai.studio.sandbox_simulation_failed',
      ]);
    } finally {
      await fs.remove(workspacePath).catch(() => undefined);
    }
  });

  it('fails early when workspace path is missing', async () => {
    const trackCommandEvent = vi.fn().mockResolvedValue(undefined);
    const commandRunner = vi.fn();

    const evidence = await runSandboxSimulation(
      {
        workspacePath: '/tmp/workspai-does-not-exist-sandbox',
        actionId: 'action-7',
        riskClass: 'guarded-mutating',
        verifyCommands: [{ command: 'npm', args: ['test'] }],
      },
      {
        commandRunner,
        telemetry: { trackCommandEvent },
        now: () => new Date('2026-04-22T12:30:00.000Z'),
      }
    );

    expect(commandRunner).not.toHaveBeenCalled();
    expect(evidence.status).toBe('failed');
    expect(evidence.safeToApply).toBe(false);
    expect(evidence.reason).toContain('Workspace path is missing');
    expect(evidence.verifyPackContract.overallStatus).toBe('failed');
    expect(trackCommandEvent.mock.calls.map((call) => call[0])).toEqual([
      'workspai.studio.sandbox_simulation_failed',
    ]);
  });

  it('fails when verify command pack exceeds configured command limit', async () => {
    const trackCommandEvent = vi.fn().mockResolvedValue(undefined);
    const commandRunner = vi.fn();
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-sandbox-limit-'));

    try {
      const evidence = await runSandboxSimulation(
        {
          workspacePath,
          actionId: 'action-8',
          riskClass: 'high-risk-mutating',
          verifyCommands: [
            { command: 'npm', args: ['run', 'check:1'] },
            { command: 'npm', args: ['run', 'check:2'] },
            { command: 'npm', args: ['run', 'check:3'] },
          ],
          maxVerifyCommands: 2,
        },
        {
          commandRunner,
          telemetry: { trackCommandEvent },
          now: () => new Date('2026-04-22T12:30:00.000Z'),
          prepareSandbox: async () => ({
            cwd: '/tmp/disposable-wsp',
            mode: 'disposable-sandbox',
          }),
        }
      );

      expect(commandRunner).not.toHaveBeenCalled();
      expect(evidence.status).toBe('failed');
      expect(evidence.safeToApply).toBe(false);
      expect(evidence.reason).toContain('exceeds limit');
      expect(evidence.verifyPackContract.overallStatus).toBe('failed');
      expect(trackCommandEvent.mock.calls.map((call) => call[0])).toEqual([
        'workspai.studio.sandbox_simulation_failed',
      ]);
    } finally {
      await fs.remove(workspacePath).catch(() => undefined);
    }
  });

  it('stops verify execution on first command failure by default', async () => {
    const trackCommandEvent = vi.fn().mockResolvedValue(undefined);
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-sandbox-fast-fail-'));
    const commandRunner = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: '',
        stderr: 'first failed',
        exitCode: 1,
      })
      .mockResolvedValue({
        stdout: 'ok',
        stderr: '',
        exitCode: 0,
      });

    try {
      const evidence = await runSandboxSimulation(
        {
          workspacePath,
          actionId: 'action-9',
          riskClass: 'high-risk-mutating',
          verifyCommands: [
            { command: 'npm', args: ['run', 'check:1'] },
            { command: 'npm', args: ['run', 'check:2'] },
          ],
        },
        {
          commandRunner,
          telemetry: { trackCommandEvent },
          now: () => new Date('2026-04-22T12:30:00.000Z'),
        }
      );

      const npmCalls = commandRunner.mock.calls.filter((call) => call[0] === 'npm');
      expect(npmCalls).toHaveLength(1);
      expect(evidence.status).toBe('failed');
      expect(evidence.safeToApply).toBe(false);
      expect(evidence.commandResults).toHaveLength(1);
      expect(trackCommandEvent.mock.calls.map((call) => call[0])).toEqual([
        'workspai.studio.sandbox_simulation_started',
        'workspai.studio.sandbox_simulation_failed',
      ]);
    } finally {
      await fs.remove(workspacePath).catch(() => undefined);
    }
  });
});
