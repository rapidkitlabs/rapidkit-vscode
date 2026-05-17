import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registeredCommands, createWorkspaceCommandMock, showErrorMessageMock } = vi.hoisted(() => ({
  registeredCommands: new Map<string, (...args: unknown[]) => unknown>(),
  createWorkspaceCommandMock: vi.fn(),
  showErrorMessageMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
      registeredCommands.set(id, handler);
      return { dispose: vi.fn() };
    },
    executeCommand: vi.fn(),
  },
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: showErrorMessageMock,
  },
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    parse: (value: string) => ({ toString: () => value }),
    file: (targetPath: string) => ({ fsPath: targetPath }),
  },
}));

vi.mock('../commands/createWorkspace', () => ({
  createWorkspaceCommand: createWorkspaceCommandMock,
}));

vi.mock('../commands/createProject', () => ({
  createProjectCommand: vi.fn(),
}));

vi.mock('../commands/importProject', () => ({
  importProjectCommand: vi.fn(),
}));

vi.mock('../commands/addModule', () => ({
  addModuleCommand: vi.fn(),
}));

vi.mock('../commands/previewTemplate', () => ({
  previewTemplateCommand: vi.fn(),
}));

vi.mock('../commands/doctor', () => ({
  doctorCommand: vi.fn(),
}));

vi.mock('../commands/checkSystem', () => ({
  checkSystemCommand: vi.fn(),
}));

vi.mock('../commands/showWelcome', () => ({
  showWelcomeCommand: vi.fn(),
}));

vi.mock('../ui/panels/welcomePanel', () => ({
  WelcomePanel: {
    showModuleInstallModal: vi.fn(),
    openProjectModal: vi.fn(),
    openWorkspaceModal: vi.fn(),
    openIncidentStudio: vi.fn(),
    showAIModal: vi.fn(),
  },
}));

vi.mock('../ui/panels/setupExperiencePanel', () => ({
  SetupPanel: {
    show: vi.fn(),
  },
}));

import { registerCoreCommands } from '../commands/coreCommands';

describe('coreCommands createWorkspace forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredCommands.clear();
    createWorkspaceCommandMock.mockResolvedValue(undefined);
  });

  function setupHarness() {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    } as any;

    const workspaceExplorer = {
      refresh: vi.fn(),
      getSelectedWorkspace: () => ({ path: '/tmp/ws', name: 'ws' }),
    };

    const projectExplorer = {
      refresh: vi.fn(),
      getSelectedProject: () => null,
    };

    registerCoreCommands({
      context: {} as any,
      logger,
      getWorkspaceExplorer: () => workspaceExplorer,
      getProjectExplorer: () => projectExplorer,
    });

    const handler = registeredCommands.get('workspai.createWorkspace');
    expect(handler).toBeTypeOf('function');

    return { handler: handler!, workspaceExplorer, logger };
  }

  it('forwards python-required modal payload without mutation', async () => {
    const { handler, workspaceExplorer } = setupHarness();

    const payload = Object.freeze({
      name: 'ws-python',
      profile: 'python-only',
      installMethod: 'auto',
      initGit: true,
      policyMode: 'warn',
      dependencySharing: 'isolated',
    });

    await handler(payload);

    expect(createWorkspaceCommandMock).toHaveBeenCalledTimes(1);
    expect(createWorkspaceCommandMock).toHaveBeenCalledWith(payload);
    expect(createWorkspaceCommandMock.mock.calls[0]?.[0]).toBe(payload);
    expect(workspaceExplorer.refresh).toHaveBeenCalledTimes(1);
    expect(showErrorMessageMock).not.toHaveBeenCalled();
  });

  it('forwards python-free modal payload without mutation', async () => {
    const { handler, workspaceExplorer } = setupHarness();

    const payload = Object.freeze({
      name: 'ws-node',
      profile: 'node-only',
      installMethod: 'auto',
      initGit: true,
      policyMode: 'warn',
      dependencySharing: 'isolated',
    });

    await handler(payload);

    expect(createWorkspaceCommandMock).toHaveBeenCalledTimes(1);
    expect(createWorkspaceCommandMock).toHaveBeenCalledWith(payload);
    expect(createWorkspaceCommandMock.mock.calls[0]?.[0]).toBe(payload);
    expect(workspaceExplorer.refresh).toHaveBeenCalledTimes(1);
    expect(showErrorMessageMock).not.toHaveBeenCalled();
  });

  it('shows error and skips refresh when createWorkspaceCommand throws', async () => {
    const { handler, workspaceExplorer, logger } = setupHarness();

    const payload = Object.freeze({
      name: 'ws-fail',
      profile: 'python-only',
      installMethod: 'auto',
      initGit: true,
      policyMode: 'warn',
      dependencySharing: 'isolated',
    });

    createWorkspaceCommandMock.mockRejectedValueOnce(new Error('boom'));

    await handler(payload);

    expect(createWorkspaceCommandMock).toHaveBeenCalledTimes(1);
    expect(createWorkspaceCommandMock).toHaveBeenCalledWith(payload);
    expect(workspaceExplorer.refresh).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Failed to create workspace', expect.any(Error));
    expect(showErrorMessageMock).toHaveBeenCalledTimes(1);
    expect(showErrorMessageMock.mock.calls[0]?.[0]).toContain('Failed to create workspace: boom');
  });
});
