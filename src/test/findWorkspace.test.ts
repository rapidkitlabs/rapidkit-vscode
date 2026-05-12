import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

let registryFilePath = '';

vi.mock('vscode', () => ({
  extensions: {
    getExtension: () => ({ packageJSON: { version: '0.27.3' } }),
  },
}));

vi.mock('../utils/registryPath', () => ({
  getRegistryFilePath: () => registryFilePath,
}));

import { findWorkspaceRoot, isProjectInWorkspace } from '../utils/findWorkspace';

describe('findWorkspaceRoot', () => {
  const tempRoots: string[] = [];

  async function createTempDir(prefix: string): Promise<string> {
    const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempRoots.push(dirPath);
    return dirPath;
  }

  afterEach(async () => {
    await Promise.all(tempRoots.map((dirPath) => fs.remove(dirPath)));
    tempRoots.length = 0;
    registryFilePath = '';
  });

  it('matches nested paths in registered workspaces with boundary-safe logic', async () => {
    const rootDir = await createTempDir('rk-find-workspace-');
    const workspacePath = path.join(rootDir, 'workspace-alpha');
    const nestedProjectPath = path.join(workspacePath, 'services', 'api');
    const registryDir = path.join(rootDir, '.rapidkit-registry');

    await fs.ensureDir(nestedProjectPath);
    await fs.ensureDir(registryDir);

    registryFilePath = path.join(registryDir, 'workspaces.json');
    await fs.writeJSON(
      registryFilePath,
      {
        workspaces: [{ path: workspacePath, name: 'workspace-alpha' }],
      },
      { spaces: 2 }
    );

    const resolved = await findWorkspaceRoot(nestedProjectPath);
    expect(resolved).toBe(path.resolve(workspacePath));
  });

  it('does not treat prefix-collision paths as inside a registered workspace', async () => {
    const rootDir = await createTempDir('rk-find-workspace-prefix-');
    const workspacePath = path.join(rootDir, 'workspace');
    const collidingPath = path.join(rootDir, 'workspace-other', 'service');
    const registryDir = path.join(rootDir, '.rapidkit-registry');

    await fs.ensureDir(workspacePath);
    await fs.ensureDir(collidingPath);
    await fs.ensureDir(registryDir);

    registryFilePath = path.join(registryDir, 'workspaces.json');
    await fs.writeJSON(
      registryFilePath,
      {
        workspaces: [{ path: workspacePath, name: 'workspace' }],
      },
      { spaces: 2 }
    );

    const resolved = await findWorkspaceRoot(collidingPath);
    expect(resolved).toBeNull();

    const inWorkspace = await isProjectInWorkspace(collidingPath);
    expect(inWorkspace).toBe(false);
  });
});
