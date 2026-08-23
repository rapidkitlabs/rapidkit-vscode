import {
  buildPackageRunnerSubprocessEnv,
  buildRapidkitExecutionSpec,
} from './platformCapabilities';

export type ExecaResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type RunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  stdio?: unknown;
  reject?: boolean;
  shell?: boolean;
} & Record<string, unknown>;

let npmWorkspaiExecutionTail: Promise<void> = Promise.resolve();

function extractWorkspaiCliArgs(command: string, args: string[]): string[] | null {
  if (command !== 'npx') {
    return null;
  }
  if (
    args[0] === '--yes' &&
    args[1] === '--package' &&
    typeof args[2] === 'string' &&
    args[3] === 'workspai'
  ) {
    return args.slice(4);
  }
  return null;
}

async function serializeNpmWorkspaiExecution<T>(operation: () => Promise<T>): Promise<T> {
  const previous = npmWorkspaiExecutionTail;
  let release: (() => void) | undefined;
  npmWorkspaiExecutionTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release?.();
  }
}

export async function run(
  cmd: string,
  args: string[],
  options?: RunOptions
): Promise<ExecaResult & Record<string, unknown>> {
  const { execa } = (await import('execa')) as any;

  const workspaiArgs = extractWorkspaiCliArgs(cmd, args);
  const execution = workspaiArgs ? buildRapidkitExecutionSpec(workspaiArgs) : undefined;
  const effectiveCommand = execution?.command ?? cmd;
  const effectiveArgs = execution?.args ?? args;

  // Auto-detect Windows and set shell option if not explicitly provided
  const isWindows = process.platform === 'win32';
  const mergedEnv = buildPackageRunnerSubprocessEnv({
    ...process.env,
    ...execution?.env,
    ...options?.env,
  });
  const finalOptions = {
    reject: false,
    stdio: 'pipe',
    shell: execution?.shell ?? isWindows,
    ...options,
    env: mergedEnv,
  };

  const invoke = async () =>
    (await (execa as any)(effectiveCommand, effectiveArgs, finalOptions)) as any;
  return execution?.runtime === 'npm'
    ? await serializeNpmWorkspaiExecution(invoke)
    : await invoke();
}
