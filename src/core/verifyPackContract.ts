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
  const commands: VerifyPackCommandContract[] = input.commands.map((item) => ({
    label: item.label,
    command: item.command,
    args: Array.isArray(item.args) ? item.args : [],
    exitCode: item.exitCode,
    durationMs:
      typeof item.durationMs === 'number' && Number.isFinite(item.durationMs) ? item.durationMs : 0,
    status: item.exitCode === 0 ? 'passed' : 'failed',
  }));

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
