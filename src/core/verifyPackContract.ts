export type VerifyPackCommandStatus = 'passed' | 'failed';

export interface VerifyPackCommandContract {
  label: string;
  command: string;
  args: string[];
  exitCode: number;
  durationMs: number;
  status: VerifyPackCommandStatus;
}

export interface VerifyPackOutputSummary {
  totalCommands: number;
  passedCommands: number;
  failedCommands: number;
  totalDurationMs: number;
}

export interface VerifyPackOutputContract {
  schemaVersion: 'v1';
  producer: 'sandbox-simulation' | 'verify-pack-runner';
  generatedAt: string;
  overallStatus: 'passed' | 'failed' | 'skipped';
  summary: VerifyPackOutputSummary;
  commands: VerifyPackCommandContract[];
}

export function buildVerifyPackOutputContract(input: {
  producer: VerifyPackOutputContract['producer'];
  generatedAt: string;
  commands: Array<{
    label: string;
    command: string;
    args?: string[];
    exitCode: number;
    durationMs?: number;
  }>;
}): VerifyPackOutputContract {
  const commands: VerifyPackCommandContract[] = input.commands.map((item) => {
    const command = typeof item.command === 'string' ? item.command.trim() : '';
    const exitCode =
      typeof item.exitCode === 'number' && Number.isFinite(item.exitCode)
        ? Math.trunc(item.exitCode)
        : 1;

    return {
      label:
        typeof item.label === 'string' && item.label.trim() ? item.label.trim() : 'verify command',
      command,
      args: Array.isArray(item.args)
        ? item.args.filter((arg): arg is string => typeof arg === 'string')
        : [],
      exitCode,
      durationMs:
        typeof item.durationMs === 'number' && Number.isFinite(item.durationMs)
          ? Math.max(0, Math.round(item.durationMs))
          : 0,
      status: command.length > 0 && exitCode === 0 ? 'passed' : 'failed',
    };
  });

  const passedCommands = commands.filter((item) => item.status === 'passed').length;
  const failedCommands = commands.length - passedCommands;
  const totalDurationMs = commands.reduce((acc, item) => acc + item.durationMs, 0);

  return {
    schemaVersion: 'v1',
    producer: input.producer,
    generatedAt: input.generatedAt,
    overallStatus: commands.length === 0 ? 'skipped' : failedCommands === 0 ? 'passed' : 'failed',
    summary: {
      totalCommands: commands.length,
      passedCommands,
      failedCommands,
      totalDurationMs,
    },
    commands,
  };
}
