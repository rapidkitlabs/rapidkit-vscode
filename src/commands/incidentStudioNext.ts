/**
 * Incident Studio (Next) Command
 * Opens the new fullscreen Incident Studio redesign in a separate webview panel
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { IncidentStudioPanel } from '../ui/panels/incidentStudioPanel';

interface WorkspaceExplorerLike {
  getSelectedWorkspace?: () => { path: string; name?: string } | null | undefined;
}

export async function showIncidentStudioNextCommand(
  extensionUri: vscode.Uri,
  workspaceExplorer?: WorkspaceExplorerLike
) {
  const logger = Logger.getInstance();
  logger.info('Incident Studio (Next) command initiated');

  try {
    // Get workspace context from explorer or use defaults
    const selectedWorkspace = workspaceExplorer?.getSelectedWorkspace?.();
    const workspaceContext = selectedWorkspace
      ? {
          workspacePath: selectedWorkspace.path,
          workspaceName: selectedWorkspace.name || path.basename(selectedWorkspace.path),
        }
      : {
          workspacePath: '',
          workspaceName: 'Unknown Workspace',
        };

    IncidentStudioPanel.createOrShow(extensionUri, workspaceContext);
  } catch (error) {
    logger.error('Error in showIncidentStudioNextCommand', error);
    vscode.window.showErrorMessage(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
