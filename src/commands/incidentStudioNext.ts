/**
 * Incident Studio (Next) Command
 * Opens the new fullscreen Incident Studio redesign in a separate webview panel
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { IncidentStudioPanel } from '../ui/panels/incidentStudioPanel';

export async function showIncidentStudioNextCommand(extensionUri: vscode.Uri) {
  const logger = Logger.getInstance();
  logger.info('Incident Studio (Next) command initiated');

  try {
    IncidentStudioPanel.createOrShow(extensionUri);
  } catch (error) {
    logger.error('Error in showIncidentStudioNextCommand', error);
    vscode.window.showErrorMessage(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
