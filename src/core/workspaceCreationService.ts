import * as fs from 'fs-extra';

import { createWorkspaceCommand } from '../commands/createWorkspace';
import { Logger } from '../utils/logger';
import { hasWorkspaceRootMarkers, resolveNewWorkspacePath } from './workspacePaths';

export type ManagedWorkspaceCreationInput = {
  name: string;
  profile:
    | 'minimal'
    | 'python-only'
    | 'node-only'
    | 'go-only'
    | 'java-only'
    | 'dotnet-only'
    | 'polyglot'
    | 'enterprise';
  installMethod?: 'poetry' | 'venv' | 'pipx' | 'auto';
  skipPythonEngine?: boolean;
  initGit?: boolean;
  policyMode?: 'warn' | 'strict' | 'disabled';
  dependencySharing?: 'isolated' | 'shared';
};

export type WorkspaceCreationFailureCode =
  | 'runtime-unavailable'
  | 'runtime-integrity-failed'
  | 'runtime-cache-conflict'
  | 'permission-denied'
  | 'partial-workspace'
  | 'workspace-invalid'
  | 'creation-failed';

export type WorkspaceCreationFailure = {
  ok: false;
  code: WorkspaceCreationFailureCode;
  message: string;
  technicalMessage: string;
  retryable: boolean;
  phase: 'preflight' | 'runtime' | 'create' | 'verify';
};

export type WorkspaceCreationSuccess = {
  ok: true;
  workspacePath: string;
  workspaceName: string;
  reused: boolean;
};

export type WorkspaceCreationResult = WorkspaceCreationSuccess | WorkspaceCreationFailure;

const activeCreations = new Map<string, Promise<WorkspaceCreationResult>>();

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function portableFailure(
  error: unknown,
  workspaceName: string,
  phase: WorkspaceCreationFailure['phase']
): WorkspaceCreationFailure {
  const technicalMessage = errorText(error);
  const normalized = technicalMessage.toLowerCase();
  const errorCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toLowerCase()
      : '';

  if (
    errorCode === 'runtime-missing' ||
    errorCode === 'runtime-unsupported-host' ||
    (normalized.includes('bundled workspai cli') && normalized.includes('missing'))
  ) {
    return {
      ok: false,
      code: 'runtime-unavailable',
      message:
        'The verified Workspai runtime is unavailable. Reload VS Code, then retry this creation.',
      technicalMessage,
      retryable: true,
      phase: 'runtime',
    };
  }
  if (
    errorCode === 'python-runtime-unavailable' ||
    errorCode === 'python-version-unsupported' ||
    errorCode === 'python-venv-unavailable' ||
    normalized.includes('python venv support') ||
    normalized.includes('python venv package') ||
    normalized.includes('pipx is not installed') ||
    normalized.includes('poetry is not installed')
  ) {
    return {
      ok: false,
      code: 'runtime-unavailable',
      message: technicalMessage,
      technicalMessage,
      retryable: false,
      phase: 'preflight',
    };
  }
  if (
    errorCode === 'runtime-corrupt' ||
    errorCode === 'runtime-incompatible' ||
    normalized.includes('integrity verification')
  ) {
    return {
      ok: false,
      code: 'runtime-integrity-failed',
      message:
        'The bundled Workspai runtime failed its integrity check. Reinstall the extension before retrying.',
      technicalMessage,
      retryable: false,
      phase: 'runtime',
    };
  }
  if (normalized.includes('enotempty') && normalized.includes('_npx')) {
    return {
      ok: false,
      code: 'runtime-cache-conflict',
      message:
        'The legacy npm runtime cache was busy. Retry once; the extension will reuse one serialized runtime operation.',
      technicalMessage,
      retryable: true,
      phase: 'runtime',
    };
  }
  if (
    errorCode === 'eacces' ||
    errorCode === 'eperm' ||
    /\b(eacces|eperm)\b/i.test(technicalMessage)
  ) {
    return {
      ok: false,
      code: 'permission-denied',
      message: `Workspai could not create “${workspaceName}” with the current filesystem permissions.`,
      technicalMessage,
      retryable: false,
      phase,
    };
  }
  return {
    ok: false,
    code: 'creation-failed',
    message: `Workspai could not finish creating “${workspaceName}”. Review any partial output, then start a fresh creation plan.`,
    technicalMessage,
    retryable: false,
    phase,
  };
}

async function runCreation(input: ManagedWorkspaceCreationInput): Promise<WorkspaceCreationResult> {
  const logger = Logger.getInstance();
  const workspaceName = input.name.trim();
  const workspacePath = resolveNewWorkspacePath(workspaceName);
  const existed = hasWorkspaceRootMarkers(workspacePath);

  if ((await fs.pathExists(workspacePath)) && !existed) {
    return {
      ok: false,
      code: 'partial-workspace',
      message:
        `A directory named “${workspaceName}” already exists but is not a valid Workspai workspace. ` +
        'Review or remove that partial directory, then retry.',
      technicalMessage: `Partial workspace directory detected at ${workspacePath}`,
      retryable: false,
      phase: 'preflight',
    };
  }

  try {
    await createWorkspaceCommand({
      ...input,
      name: workspaceName,
      suppressPostCreatePrompt: true,
      silent: true,
    });
  } catch (error) {
    logger.error(`Managed workspace creation failed for ${workspaceName}`, error);
    return portableFailure(error, workspaceName, 'create');
  }

  if (!hasWorkspaceRootMarkers(workspacePath)) {
    const technicalMessage = `Workspace creation returned without canonical markers at ${workspacePath}`;
    logger.error(technicalMessage);
    return {
      ok: false,
      code: 'workspace-invalid',
      message:
        `Workspai created files for “${workspaceName}”, but canonical workspace verification did not pass. ` +
        'No project scaffolding was started.',
      technicalMessage,
      retryable: false,
      phase: 'verify',
    };
  }

  return { ok: true, workspacePath, workspaceName, reused: existed };
}

/**
 * Create one canonical workspace per target at a time.
 *
 * All chat and AI creation paths use this operation instead of nesting a VS Code
 * command. The caller therefore receives the real failure and cannot continue
 * into project scaffolding after a swallowed workspace error.
 */
export function createManagedWorkspace(
  input: ManagedWorkspaceCreationInput
): Promise<WorkspaceCreationResult> {
  const workspacePath = resolveNewWorkspacePath(input.name.trim());
  const active = activeCreations.get(workspacePath);
  if (active) {
    return active;
  }
  const operation = runCreation(input).finally(() => {
    if (activeCreations.get(workspacePath) === operation) {
      activeCreations.delete(workspacePath);
    }
  });
  activeCreations.set(workspacePath, operation);
  return operation;
}

export function describePortableCreationFailure(
  error: unknown,
  resourceName: string
): WorkspaceCreationFailure {
  return portableFailure(error, resourceName, 'create');
}
