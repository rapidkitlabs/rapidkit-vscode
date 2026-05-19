import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

type ProjectExplorerLike = {
  refresh: () => void;
};

type FileCommandItem = {
  filePath?: unknown;
  project?: {
    path?: unknown;
  };
};

function asFileCommandItem(item: unknown): FileCommandItem | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  return item as FileCommandItem;
}

function toNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function resolveTargetPath(item: unknown): string | undefined {
  const parsed = asFileCommandItem(item);
  return toNonEmptyString(parsed?.filePath) ?? toNonEmptyString(parsed?.project?.path);
}

function resolveFilePath(item: unknown): string | undefined {
  const parsed = asFileCommandItem(item);
  return toNonEmptyString(parsed?.filePath);
}

export function registerFileManagementCommands(options: {
  logger: Logger;
  getProjectExplorer: () => ProjectExplorerLike | undefined;
}): vscode.Disposable[] {
  const { logger, getProjectExplorer } = options;

  const isValidName = (value: string, type: 'File' | 'Folder' | 'Name'): string | null => {
    if (!value || value.trim() === '') {
      return `${type} cannot be empty`;
    }
    if (/[<>:"/\\|?*]/.test(value)) {
      return `${type} contains invalid characters`;
    }
    return null;
  };

  return [
    vscode.commands.registerCommand('workspai.newFile', async (item: unknown) => {
      const targetPath = resolveTargetPath(item);
      if (!targetPath) {
        vscode.window.showErrorMessage('No target path selected');
        return;
      }

      const fileName = await vscode.window.showInputBox({
        prompt: 'Enter file name',
        placeHolder: 'example.py',
        validateInput: (value) => isValidName(value, 'File'),
      });

      if (fileName) {
        const fs = await import('fs/promises');
        const path = await import('path');
        const filePath = path.join(targetPath, fileName);

        try {
          await fs.writeFile(filePath, '', 'utf-8');
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc);
          getProjectExplorer()?.refresh();
          logger.info(`Created new file: ${filePath}`);
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to create file: ${err}`);
        }
      }
    }),

    vscode.commands.registerCommand('workspai.newFolder', async (item: unknown) => {
      const targetPath = resolveTargetPath(item);
      if (!targetPath) {
        vscode.window.showErrorMessage('No target path selected');
        return;
      }

      const folderName = await vscode.window.showInputBox({
        prompt: 'Enter folder name',
        placeHolder: 'new_folder',
        validateInput: (value) => isValidName(value, 'Folder'),
      });

      if (folderName) {
        const fs = await import('fs/promises');
        const path = await import('path');
        const folderPath = path.join(targetPath, folderName);

        try {
          await fs.mkdir(folderPath, { recursive: true });
          getProjectExplorer()?.refresh();
          logger.info(`Created new folder: ${folderPath}`);
          vscode.window.showInformationMessage(`Created folder: ${folderName}`, 'OK');
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to create folder: ${err}`);
        }
      }
    }),

    vscode.commands.registerCommand('workspai.deleteFile', async (item: unknown) => {
      const targetPath = resolveFilePath(item);
      if (!targetPath) {
        vscode.window.showErrorMessage('No file/folder selected');
        return;
      }

      const fs = await import('fs/promises');
      const path = await import('path');
      const name = path.basename(targetPath);

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${name}"?`,
        { modal: true },
        'Delete'
      );

      if (confirm === 'Delete') {
        try {
          const stats = await fs.stat(targetPath);
          if (stats.isDirectory()) {
            await fs.rm(targetPath, { recursive: true, force: true });
          } else {
            await fs.unlink(targetPath);
          }
          getProjectExplorer()?.refresh();
          logger.info(`Deleted: ${targetPath}`);
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to delete: ${err}`);
        }
      }
    }),

    vscode.commands.registerCommand('workspai.renameFile', async (item: unknown) => {
      const targetPath = resolveFilePath(item);
      if (!targetPath) {
        vscode.window.showErrorMessage('No file/folder selected');
        return;
      }

      const path = await import('path');
      const fs = await import('fs/promises');
      const oldName = path.basename(targetPath);
      const dirPath = path.dirname(targetPath);

      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new name',
        value: oldName,
        validateInput: (value) => isValidName(value, 'Name'),
      });

      if (newName && newName !== oldName) {
        const newPath = path.join(dirPath, newName);
        try {
          await fs.rename(targetPath, newPath);
          getProjectExplorer()?.refresh();
          logger.info(`Renamed: ${oldName} → ${newName}`);
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to rename: ${err}`);
        }
      }
    }),

    vscode.commands.registerCommand('workspai.revealInExplorer', async (item: unknown) => {
      const targetPath = resolveTargetPath(item);
      if (targetPath) {
        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(targetPath));
      }
    }),
  ];
}
