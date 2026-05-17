import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ModulesCatalogService } from '../core/modulesCatalogService';
import { WelcomePanel } from '../ui/panels/welcomePanel';
import { openWorkspace, openWorkspaceFolder, copyWorkspacePath } from './workspaceContextMenu';

type WorkspaceLike = { path: string; name?: string };
type ProjectLike = { path: string; name: string; type: string; workspacePath?: string };
type WorkspaceTreeItemLike = { path?: unknown; workspace?: { path?: unknown } };

type WorkspaceExplorerLike = {
  refresh: () => void;
  getWorkspaceByPath: (workspacePath: string) => WorkspaceLike | null | undefined;
  selectWorkspace: (...args: any[]) => Promise<void>;
  getSelectedWorkspace?: () => WorkspaceLike | null | undefined;
  addWorkspace: () => Promise<void>;
  importWorkspace: () => Promise<void>;
  removeWorkspace: (...args: any[]) => Promise<void>;
  exportWorkspace: (...args: any[]) => Promise<void>;
  autoDiscover: () => Promise<void>;
};

type ProjectExplorerLike = {
  refresh: () => void;
  setWorkspace: (...args: any[]) => void;
  setSelectedProject: (...args: any[]) => void;
  getSelectedProject?: () => ProjectLike | null | undefined;
};

type ModuleExplorerLike = {
  refresh: () => void;
  setProjectPath: (projectPath: string, projectType: string) => void;
};

function resolveWorkspacePathFromItem(item: unknown): string | undefined {
  if (typeof item === 'string') {
    return item;
  }

  if (!item || typeof item !== 'object') {
    return undefined;
  }

  const treeItem = item as WorkspaceTreeItemLike;
  const candidate = treeItem.workspace?.path ?? treeItem.path;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

export function registerWorkspaceSelectionCommands(options: {
  logger: Logger;
  getWorkspaceExplorer: () => WorkspaceExplorerLike | undefined;
  getProjectExplorer: () => ProjectExplorerLike | undefined;
  getModuleExplorer: () => ModuleExplorerLike | undefined;
}): vscode.Disposable[] {
  const { logger, getWorkspaceExplorer, getProjectExplorer, getModuleExplorer } = options;

  return [
    vscode.commands.registerCommand('workspai.refreshWorkspaces', () => {
      getWorkspaceExplorer()?.refresh();
    }),

    vscode.commands.registerCommand('workspai.refreshProjects', () => {
      const projectExplorer = getProjectExplorer();
      const moduleExplorer = getModuleExplorer();

      projectExplorer?.refresh();
      moduleExplorer?.refresh();

      if (WelcomePanel.currentPanel) {
        const selectedProject = projectExplorer?.getSelectedProject?.();
        if (selectedProject) {
          const selectedWorkspace = getWorkspaceExplorer()?.getSelectedWorkspace?.();
          const workspacePath =
            (typeof selectedProject.workspacePath === 'string' && selectedProject.workspacePath) ||
            selectedWorkspace?.path;
          const workspaceName =
            (workspacePath
              ? getWorkspaceExplorer()?.getWorkspaceByPath(workspacePath)?.name
              : undefined) || selectedWorkspace?.name;

          WelcomePanel.updateWithProject(selectedProject.path, selectedProject.name, {
            workspacePath,
            workspaceName,
          });
        }
      }
    }),

    vscode.commands.registerCommand('workspai.selectWorkspace', async (workspacePath: string) => {
      logger.info('selectWorkspace command with path:', workspacePath);

      if (!workspacePath) {
        vscode.window.showErrorMessage('Invalid workspace path');
        return;
      }

      const workspaceExplorer = getWorkspaceExplorer();
      const projectExplorer = getProjectExplorer();

      if (workspaceExplorer) {
        const selectedWorkspace = workspaceExplorer.getWorkspaceByPath(workspacePath);
        if (selectedWorkspace) {
          await workspaceExplorer.selectWorkspace(selectedWorkspace);
        } else {
          logger.warn('Workspace not found for path:', workspacePath);
          vscode.window.showWarningMessage('Workspace not found');
        }
      }

      if (projectExplorer && workspaceExplorer) {
        const selectedWorkspace = workspaceExplorer.getWorkspaceByPath(workspacePath);
        if (selectedWorkspace) {
          projectExplorer.setWorkspace(selectedWorkspace);
        }
      }

      try {
        const catalogService = ModulesCatalogService.getInstance();
        await catalogService.invalidateCache(workspacePath);
      } catch (error) {
        logger.warn('Workspace catalog cache invalidation failed', {
          code: 'WORKSPACE_CATALOG_INVALIDATE_FAILED',
          workspacePath,
          error: error instanceof Error ? error.message : String(error),
          isRecoverable: true,
        });
      }

      await vscode.commands.executeCommand('setContext', 'workspai.workspaceSelected', true);
      await vscode.commands.executeCommand('setContext', 'workspai:noProjects', false);

      if (WelcomePanel.currentPanel) {
        await WelcomePanel.refreshWorkspaceStatus();
        WelcomePanel.refreshRecentWorkspaces();
      }
    }),

    vscode.commands.registerCommand('workspai.addWorkspace', async () => {
      await getWorkspaceExplorer()?.addWorkspace();
    }),

    vscode.commands.registerCommand('workspai.importWorkspace', async () => {
      await getWorkspaceExplorer()?.importWorkspace();
    }),

    vscode.commands.registerCommand('workspai.removeWorkspace', async (item: any) => {
      const workspacePath = resolveWorkspacePathFromItem(item);
      if (workspacePath && typeof workspacePath === 'string') {
        const workspaceExplorer = getWorkspaceExplorer();
        if (workspaceExplorer) {
          const workspace = workspaceExplorer.getWorkspaceByPath(workspacePath);
          if (workspace) {
            await workspaceExplorer.removeWorkspace(workspace);
            WelcomePanel.refreshRecentWorkspaces();
          }
        }
      }
    }),

    vscode.commands.registerCommand('workspai.exportWorkspace', async (item: any) => {
      const workspaceExplorer = getWorkspaceExplorer();
      let workspace = item?.workspace;

      const workspacePath = resolveWorkspacePathFromItem(item);
      if (!workspace && workspacePath && workspaceExplorer) {
        workspace = workspaceExplorer.getWorkspaceByPath(workspacePath);
      }

      if (workspace && workspaceExplorer) {
        await workspaceExplorer.exportWorkspace(workspace);
      }
    }),

    vscode.commands.registerCommand('workspai.discoverWorkspaces', async () => {
      await getWorkspaceExplorer()?.autoDiscover();
    }),

    vscode.commands.registerCommand('workspai.selectProject', async (item: any) => {
      const projectExplorer = getProjectExplorer();
      const moduleExplorer = getModuleExplorer();
      const workspaceExplorer = getWorkspaceExplorer();
      const project = item?.project ?? item;

      if (project?.path && projectExplorer) {
        projectExplorer.setSelectedProject(project);
        logger.info('Project selected:', project.name);

        const workspacePathFromProject =
          typeof project?.workspacePath === 'string' ? project.workspacePath : undefined;
        const selectedWorkspace = workspaceExplorer?.getSelectedWorkspace?.();
        const resolvedWorkspacePath = workspacePathFromProject || selectedWorkspace?.path;
        const resolvedWorkspaceName =
          (resolvedWorkspacePath
            ? workspaceExplorer?.getWorkspaceByPath(resolvedWorkspacePath)?.name
            : undefined) || selectedWorkspace?.name;

        WelcomePanel.updateWithProject(project.path, project.name, {
          workspacePath: resolvedWorkspacePath,
          workspaceName: resolvedWorkspaceName,
        });
        moduleExplorer?.setProjectPath(project.path, project.type);
      }
    }),

    vscode.commands.registerCommand('workspai.openWorkspaceFolder', async (item: any) => {
      const workspacePath = resolveWorkspacePathFromItem(item);
      if (workspacePath && typeof workspacePath === 'string') {
        await openWorkspaceFolder(workspacePath);
      }
    }),

    vscode.commands.registerCommand('workspai.openWorkspace', async (item: any) => {
      const workspacePath = resolveWorkspacePathFromItem(item);
      if (workspacePath && typeof workspacePath === 'string') {
        await openWorkspace(workspacePath);
      }
    }),

    vscode.commands.registerCommand('workspai.copyWorkspacePath', async (item: any) => {
      const workspacePath = resolveWorkspacePathFromItem(item);
      if (workspacePath && typeof workspacePath === 'string') {
        await copyWorkspacePath(workspacePath);
      }
    }),
  ];
}
