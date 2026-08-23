import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createWorkspaceCommandMock, loggerErrorMock } = vi.hoisted(() => ({
  createWorkspaceCommandMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('../commands/createWorkspace', () => ({
  createWorkspaceCommand: createWorkspaceCommandMock,
}));

vi.mock('../utils/logger', () => ({
  Logger: {
    getInstance: () => ({ error: loggerErrorMock }),
  },
}));

import { createManagedWorkspace } from '../core/workspaceCreationService';

const originalHome = process.env.HOME;
const roots: string[] = [];

function workspacePath(home: string, name: string): string {
  return path.join(home, '.workspai', 'workspaces', name);
}

function writeCanonicalMarker(target: string): void {
  fs.ensureDirSync(path.join(target, '.workspai'));
  fs.writeJsonSync(path.join(target, '.workspai', 'workspace.json'), {
    name: path.basename(target),
  });
}

beforeEach(() => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-create-service-'));
  roots.push(home);
  process.env.HOME = home;
  createWorkspaceCommandMock.mockReset();
  loggerErrorMock.mockReset();
});

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  for (const root of roots.splice(0)) {
    fs.removeSync(root);
  }
});

describe('managed workspace creation service', () => {
  it('returns success only after canonical workspace markers exist', async () => {
    const home = process.env.HOME as string;
    const target = workspacePath(home, 'first-run');
    createWorkspaceCommandMock.mockImplementation(async () => writeCanonicalMarker(target));

    const result = await createManagedWorkspace({
      name: 'first-run',
      profile: 'minimal',
      skipPythonEngine: true,
    });

    expect(result).toEqual({
      ok: true,
      workspacePath: target,
      workspaceName: 'first-run',
      reused: false,
    });
    expect(createWorkspaceCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'first-run', silent: true, suppressPostCreatePrompt: true })
    );
  });

  it('does not invoke creation over a partial workspace directory', async () => {
    const target = workspacePath(process.env.HOME as string, 'partial');
    fs.ensureDirSync(target);
    fs.writeFileSync(path.join(target, 'leftover.txt'), 'incomplete');

    const result = await createManagedWorkspace({ name: 'partial', profile: 'minimal' });

    expect(result).toMatchObject({
      ok: false,
      code: 'partial-workspace',
      retryable: false,
      phase: 'preflight',
    });
    expect(result.ok ? '' : result.message).not.toContain(target);
    expect(createWorkspaceCommandMock).not.toHaveBeenCalled();
  });

  it('maps runtime integrity failures to a portable non-retryable result', async () => {
    createWorkspaceCommandMock.mockRejectedValue(
      Object.assign(new Error('local runtime integrity verification failed'), {
        code: 'runtime-corrupt',
      })
    );

    const result = await createManagedWorkspace({ name: 'secure', profile: 'enterprise' });

    expect(result).toMatchObject({
      ok: false,
      code: 'runtime-integrity-failed',
      retryable: false,
      phase: 'runtime',
    });
    expect(result.ok ? '' : result.message).not.toContain(process.env.HOME as string);
  });

  it('returns actionable Python setup evidence instead of a generic creation failure', async () => {
    createWorkspaceCommandMock.mockRejectedValue(
      Object.assign(
        new Error(
          'Python venv support is missing. Install the Python venv package for this interpreter, then create a fresh plan.'
        ),
        { code: 'python-venv-unavailable' }
      )
    );

    const result = await createManagedWorkspace({
      name: 'python-platform',
      profile: 'python-only',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'runtime-unavailable',
      retryable: false,
      phase: 'preflight',
      message: expect.stringContaining('Install the Python venv package'),
    });
    expect(result.ok ? '' : result.message).not.toContain(process.env.HOME as string);
  });

  it('coalesces concurrent creation requests for the same canonical target', async () => {
    const target = workspacePath(process.env.HOME as string, 'single-flight');
    let complete: (() => void) | undefined;
    createWorkspaceCommandMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = () => {
            writeCanonicalMarker(target);
            resolve();
          };
        })
    );

    const first = createManagedWorkspace({ name: 'single-flight', profile: 'minimal' });
    const second = createManagedWorkspace({ name: 'single-flight', profile: 'minimal' });
    await vi.waitFor(() => expect(createWorkspaceCommandMock).toHaveBeenCalledTimes(1));
    complete?.();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toEqual(secondResult);
    expect(firstResult).toMatchObject({ ok: true, workspacePath: target });
  });
});
