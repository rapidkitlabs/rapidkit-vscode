import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

const {
  showWarningMessageMock,
  showInformationMessageMock,
  showErrorMessageMock,
  executeCommandMock,
  trackCommandEventMock,
} = vi.hoisted(() => ({
  showWarningMessageMock: vi.fn(),
  showInformationMessageMock: vi.fn(),
  showErrorMessageMock: vi.fn(),
  executeCommandMock: vi.fn(),
  trackCommandEventMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: showWarningMessageMock,
    showInformationMessage: showInformationMessageMock,
    showErrorMessage: showErrorMessageMock,
    withProgress: async (
      _options: unknown,
      task: (progress: { report: (value: unknown) => void }) => Promise<unknown>
    ) => {
      return task({ report: vi.fn() });
    },
  },
  commands: {
    executeCommand: executeCommandMock,
  },
  ProgressLocation: {
    Notification: 15,
  },
}));

vi.mock('../utils/logger', () => ({
  Logger: {
    getInstance: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock('../utils/constants', () => ({
  getExtensionVersion: () => '0.22.0',
}));

vi.mock('../utils/workspaceUsageTracker', () => ({
  WorkspaceUsageTracker: {
    getInstance: () => ({
      trackCommandEvent: trackCommandEventMock,
    }),
  },
}));

import { adoptProjectCommand } from '../commands/adoptProject';

describe('adoptProjectCommand', () => {
  const tempRoots: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    executeCommandMock.mockImplementation(async (command: string) => {
      if (command === 'workspai.getSelectedWorkspace') {
        return { path: '/tmp/workspace' };
      }
      return undefined;
    });
  });

  afterEach(async () => {
    await Promise.all(tempRoots.map((dirPath) => fs.remove(dirPath)));
    tempRoots.length = 0;
  });

  async function createTempProject(projectName = 'demo-project') {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-adopt-'));
    tempRoots.push(root);

    const workspacePath = path.join(root, 'workspace');
    const projectPath = path.join(workspacePath, projectName);

    await fs.ensureDir(projectPath);
    await fs.writeFile(path.join(projectPath, 'README.md'), '# demo\n');

    return { root, workspacePath, projectPath, projectName };
  }

  it('converts generic project to managed markers only after explicit confirmation', async () => {
    const { workspacePath, projectPath, projectName } = await createTempProject();

    showWarningMessageMock.mockResolvedValue('Convert');

    const ok = await adoptProjectCommand({
      workspacePath,
      projectPath,
      projectName,
      projectType: 'unknown',
    });

    expect(ok).toBe(true);

    const projectJsonPath = path.join(projectPath, '.rapidkit', 'project.json');
    const contextJsonPath = path.join(projectPath, '.rapidkit', 'context.json');

    expect(await fs.pathExists(projectJsonPath)).toBe(true);
    expect(await fs.pathExists(contextJsonPath)).toBe(true);

    const projectJson = await fs.readJSON(projectJsonPath);
    const contextJson = await fs.readJSON(contextJsonPath);

    expect(projectJson.kit_name).toBe('generic.imported');
    expect(projectJson.runtime).toBe('unknown');
    expect(projectJson.module_support).toBe(false);
    expect(projectJson.managed_by).toBe('rapidkit-vscode');
    expect(contextJson.engine).toBe('unknown');

    expect(executeCommandMock).toHaveBeenCalledWith('workspai.refreshProjects');
    expect(trackCommandEventMock).toHaveBeenCalledWith(
      'workspai.convertProjectToManaged',
      workspacePath,
      expect.objectContaining({
        result: 'success',
        projectName,
        intent: 'explicit-user-confirmation',
      })
    );
  });

  it('does not write markers when user cancels confirmation', async () => {
    const { workspacePath, projectPath, projectName } = await createTempProject();

    showWarningMessageMock.mockResolvedValue('Cancel');

    const ok = await adoptProjectCommand({
      workspacePath,
      projectPath,
      projectName,
      projectType: 'unknown',
    });

    expect(ok).toBe(false);
    expect(await fs.pathExists(path.join(projectPath, '.rapidkit', 'project.json'))).toBe(false);

    expect(trackCommandEventMock).toHaveBeenCalledWith(
      'workspai.convertProjectToManaged',
      workspacePath,
      expect.objectContaining({
        result: 'cancelled',
        projectName,
      })
    );
  });

  it('returns early when project is already managed', async () => {
    const { workspacePath, projectPath, projectName } = await createTempProject();

    await fs.ensureDir(path.join(projectPath, '.rapidkit'));
    await fs.writeJSON(path.join(projectPath, '.rapidkit', 'project.json'), {
      kit_name: 'fastapi.standard',
      runtime: 'python',
    });

    const ok = await adoptProjectCommand({
      workspacePath,
      projectPath,
      projectName,
      projectType: 'unknown',
    });

    expect(ok).toBe(false);
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      `Project "${projectName}" is already managed by Workspai.`
    );
    expect(trackCommandEventMock).toHaveBeenCalledWith(
      'workspai.convertProjectToManaged',
      workspacePath,
      expect.objectContaining({
        result: 'already-managed',
        projectName,
      })
    );
  });

  it('skips conversion for non-generic projects and does not write markers', async () => {
    const { workspacePath, projectPath, projectName } = await createTempProject();

    const ok = await adoptProjectCommand({
      workspacePath,
      projectPath,
      projectName,
      projectType: 'fastapi',
    });

    expect(ok).toBe(false);
    expect(await fs.pathExists(path.join(projectPath, '.rapidkit', 'project.json'))).toBe(false);
    expect(showWarningMessageMock).not.toHaveBeenCalled();
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      `Project "${projectName}" is FastAPI and does not require generic adoption.`
    );
    expect(trackCommandEventMock).toHaveBeenCalledWith(
      'workspai.convertProjectToManaged',
      workspacePath,
      expect.objectContaining({
        result: 'skipped-non-generic',
        projectName,
        detectedType: 'fastapi',
      })
    );
  });

  it('treats NestJS devDependency as managed framework and skips generic conversion', async () => {
    const { workspacePath, projectPath, projectName } = await createTempProject();

    await fs.writeJSON(path.join(projectPath, 'package.json'), {
      name: projectName,
      version: '1.0.0',
      devDependencies: {
        '@nestjs/core': '^10.0.0',
      },
    });

    const ok = await adoptProjectCommand({
      workspacePath,
      projectPath,
      projectName,
      projectType: 'unknown',
    });

    expect(ok).toBe(false);
    expect(await fs.pathExists(path.join(projectPath, '.rapidkit', 'project.json'))).toBe(false);
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      `Project "${projectName}" is NestJS and does not require generic adoption.`
    );
    expect(trackCommandEventMock).toHaveBeenCalledWith(
      'workspai.convertProjectToManaged',
      workspacePath,
      expect.objectContaining({
        result: 'skipped-non-generic',
        projectName,
        detectedType: 'nestjs',
      })
    );
  });
});
