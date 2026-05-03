import { run, type ExecaResult } from '../utils/exec';
import { WorkspaceUsageTracker } from '../utils/workspaceUsageTracker';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

export type SandboxSimulationRiskClass =
  | 'informational'
  | 'non-mutating-executable'
  | 'guarded-mutating'
  | 'high-risk-mutating';

export interface SandboxVerifyCommand {
  command: string;
  args?: string[];
  label?: string;
  timeoutMs?: number;
}

export interface SandboxSimulationInput {
  workspacePath: string;
  actionId: string;
  riskClass: SandboxSimulationRiskClass;
  verifyCommands: SandboxVerifyCommand[];
  rollbackHint?: string;
  defaultTimeoutMs?: number;
}

export interface SandboxSimulationCommandResult {
  label: string;
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface SandboxSimulationEvidence {
  actionId: string;
  workspacePath: string;
  riskClass: SandboxSimulationRiskClass;
  mode: 'verify-pack-simulation' | 'disposable-sandbox';
  status: 'passed' | 'failed' | 'skipped';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  commandResults: SandboxSimulationCommandResult[];
  recommendedRollbackPath: string;
  safeToApply: boolean;
  reason: string;
}

export type SandboxCommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeout: number; reject: false }
) => Promise<ExecaResult>;

export interface SandboxSimulationDeps {
  commandRunner?: SandboxCommandRunner;
  telemetry?: {
    trackCommandEvent: (
      command: string,
      workspacePath?: string,
      properties?: Record<string, unknown>
    ) => Promise<void>;
  };
  now?: () => Date;
  prepareSandbox?: (
    input: SandboxSimulationInput,
    runner: SandboxCommandRunner
  ) => Promise<{
    cwd: string;
    mode: SandboxSimulationEvidence['mode'];
    cleanup?: () => Promise<void>;
  }>;
}

async function createDisposableGitWorktreeSandbox(
  input: SandboxSimulationInput,
  runner: SandboxCommandRunner
): Promise<{
  cwd: string;
  mode: SandboxSimulationEvidence['mode'];
  cleanup: () => Promise<void>;
} | null> {
  const repoProbe = await runner('git', ['rev-parse', '--show-toplevel'], {
    cwd: input.workspacePath,
    timeout: 4000,
    reject: false,
  });
  if (repoProbe.exitCode !== 0) {
    return null;
  }

  const repoRoot = repoProbe.stdout.trim();
  if (!repoRoot) {
    return null;
  }

  const uniqueToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sandboxDir = path.join(os.tmpdir(), `workspai-sandbox-${input.actionId}-${uniqueToken}`);

  await fs.ensureDir(sandboxDir);
  const worktreeAdd = await runner('git', ['worktree', 'add', '--detach', sandboxDir, 'HEAD'], {
    cwd: repoRoot,
    timeout: 15000,
    reject: false,
  });

  if (worktreeAdd.exitCode !== 0) {
    await fs.remove(sandboxDir).catch(() => undefined);
    return null;
  }

  return {
    cwd: sandboxDir,
    mode: 'disposable-sandbox',
    cleanup: async () => {
      await runner('git', ['worktree', 'remove', '--force', sandboxDir], {
        cwd: repoRoot,
        timeout: 15000,
        reject: false,
      }).catch(() => undefined);
      await fs.remove(sandboxDir).catch(() => undefined);
    },
  };
}

async function prepareDefaultSandbox(
  input: SandboxSimulationInput,
  runner: SandboxCommandRunner,
  allowDisposableSandbox: boolean
): Promise<{
  cwd: string;
  mode: SandboxSimulationEvidence['mode'];
  cleanup?: () => Promise<void>;
}> {
  if (
    allowDisposableSandbox &&
    (input.riskClass === 'guarded-mutating' || input.riskClass === 'high-risk-mutating')
  ) {
    const disposable = await createDisposableGitWorktreeSandbox(input, runner);
    if (disposable) {
      return disposable;
    }
  }

  return {
    cwd: input.workspacePath,
    mode: 'verify-pack-simulation',
  };
}

function sanitizeCommand(input: SandboxVerifyCommand): SandboxVerifyCommand | null {
  const command = typeof input.command === 'string' ? input.command.trim() : '';
  if (!command) {
    return null;
  }

  const args = Array.isArray(input.args)
    ? input.args
        .filter((arg): arg is string => typeof arg === 'string')
        .map((arg) => arg.trim())
        .filter((arg) => arg.length > 0)
    : [];

  return {
    command,
    args,
    label: typeof input.label === 'string' && input.label.trim() ? input.label.trim() : command,
    timeoutMs:
      typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs)
        ? Math.max(1000, Math.min(120000, Math.round(input.timeoutMs)))
        : undefined,
  };
}

function defaultRollbackHint(riskClass: SandboxSimulationRiskClass): string {
  if (riskClass === 'high-risk-mutating' || riskClass === 'guarded-mutating') {
    return 'Keep apply blocked until verify passes; use the existing rollback policy for affected files if apply is attempted.';
  }
  return 'No mutation should be applied from simulation; re-run verify before any later apply.';
}

async function trackSandboxEvent(
  deps: SandboxSimulationDeps,
  command: string,
  workspacePath: string,
  properties: Record<string, unknown>
): Promise<void> {
  const telemetry = deps.telemetry ?? WorkspaceUsageTracker.getInstance();
  await telemetry.trackCommandEvent(command, workspacePath, properties);
}

export async function runSandboxSimulation(
  input: SandboxSimulationInput,
  deps: SandboxSimulationDeps = {}
): Promise<SandboxSimulationEvidence> {
  const now = deps.now ?? (() => new Date());
  const runner: SandboxCommandRunner =
    deps.commandRunner ??
    ((command, args, options) =>
      run(command, args, {
        cwd: options.cwd,
        timeout: options.timeout,
        reject: options.reject,
      }));
  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();
  const defaultTimeout =
    typeof input.defaultTimeoutMs === 'number' && Number.isFinite(input.defaultTimeoutMs)
      ? Math.max(1000, Math.min(120000, Math.round(input.defaultTimeoutMs)))
      : 30000;
  const verifyCommands = input.verifyCommands
    .map((command) => sanitizeCommand(command))
    .filter((command): command is SandboxVerifyCommand => command !== null);
  const sandboxRuntime = deps.prepareSandbox
    ? await deps.prepareSandbox(input, runner)
    : await prepareDefaultSandbox(input, runner, !deps.commandRunner);
  const cleanupSandbox = sandboxRuntime.cleanup;

  await trackSandboxEvent(deps, 'workspai.studio.sandbox_simulation_started', input.workspacePath, {
    actionId: input.actionId,
    riskClass: input.riskClass,
    verifyCommandCount: verifyCommands.length,
    mode: sandboxRuntime.mode,
  });

  try {
    if (verifyCommands.length === 0) {
      const completedAt = now().toISOString();
      return {
        actionId: input.actionId,
        workspacePath: input.workspacePath,
        riskClass: input.riskClass,
        mode: sandboxRuntime.mode,
        status: 'skipped',
        startedAt,
        completedAt,
        durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
        commandResults: [],
        recommendedRollbackPath: input.rollbackHint ?? defaultRollbackHint(input.riskClass),
        safeToApply: false,
        reason: 'No deterministic verify commands were provided for sandbox simulation.',
      };
    }

    const commandResults: SandboxSimulationCommandResult[] = [];
    for (const verifyCommand of verifyCommands) {
      const commandStartedAt = now().getTime();
      const result = await runner(verifyCommand.command, verifyCommand.args ?? [], {
        cwd: sandboxRuntime.cwd,
        timeout: verifyCommand.timeoutMs ?? defaultTimeout,
        reject: false,
      });
      const commandCompletedAt = now().getTime();
      commandResults.push({
        label: verifyCommand.label ?? verifyCommand.command,
        command: verifyCommand.command,
        args: verifyCommand.args ?? [],
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: Math.max(0, commandCompletedAt - commandStartedAt),
      });
    }

    const failedCommands = commandResults.filter((result) => result.exitCode !== 0);
    const status: SandboxSimulationEvidence['status'] =
      failedCommands.length === 0 ? 'passed' : 'failed';
    await trackSandboxEvent(
      deps,
      status === 'passed'
        ? 'workspai.studio.sandbox_simulation_passed'
        : 'workspai.studio.sandbox_simulation_failed',
      input.workspacePath,
      {
        actionId: input.actionId,
        riskClass: input.riskClass,
        verifyCommandCount: verifyCommands.length,
        failedCommandCount: failedCommands.length,
        mode: sandboxRuntime.mode,
      }
    );

    const completedAt = now().toISOString();
    return {
      actionId: input.actionId,
      workspacePath: input.workspacePath,
      riskClass: input.riskClass,
      mode: sandboxRuntime.mode,
      status,
      startedAt,
      completedAt,
      durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
      commandResults,
      recommendedRollbackPath: input.rollbackHint ?? defaultRollbackHint(input.riskClass),
      safeToApply: status === 'passed',
      reason:
        status === 'passed'
          ? 'All sandbox verify commands passed before apply.'
          : 'One or more sandbox verify commands failed; keep apply blocked and inspect evidence.',
    };
  } finally {
    if (cleanupSandbox) {
      await cleanupSandbox();
    }
  }
}
