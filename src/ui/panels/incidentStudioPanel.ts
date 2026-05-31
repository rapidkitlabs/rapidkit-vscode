/**
 * Incident Studio Panel (vNext)
 * Fullscreen webview for the new Incident Studio redesign
 * Opens as a separate tab/panel completely independent from AIIncidentStudio
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../../utils/logger';
import {
  WorkspaceContext,
  analyzeReportExists,
  getAnalyzeReportPath,
  loadAnalyzeReport,
  runWorkspaceAnalyze,
} from './incidentStudioAnalyze';

export class IncidentStudioPanel {
  public static readonly viewType = 'incidentStudioNextPanel';
  private static currentPanel: IncidentStudioPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _workspaceContext: WorkspaceContext;
  private _disposables: vscode.Disposable[] = [];
  private _reportWatcher: vscode.FileSystemWatcher | undefined;
  private readonly _logger = Logger.getInstance();

  public static createOrShow(extensionUri: vscode.Uri, workspaceContext?: WorkspaceContext) {
    const column = vscode.ViewColumn.One;

    // If panel already exists, show it
    if (IncidentStudioPanel.currentPanel) {
      IncidentStudioPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Use provided context or default
    const context = workspaceContext || {
      workspacePath: '',
      workspaceName: 'Unknown Workspace',
    };

    // Otherwise create new panel
    const panel = vscode.window.createWebviewPanel(
      IncidentStudioPanel.viewType,
      'Incident Studio (Next)',
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      }
    );

    IncidentStudioPanel.currentPanel = new IncidentStudioPanel(panel, extensionUri, context);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    workspaceContext: WorkspaceContext
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._workspaceContext = workspaceContext;

    // Update content
    this._update();

    // Listen for when panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'alert':
            vscode.window.showInformationMessage(message.text);
            return;
          case 'runAnalyze':
            this._handleRunAnalyze();
            return;
          case 'checkReportExists':
            this._handleCheckReportExists();
            return;
          case 'loadReport':
            this._handleLoadReport();
            return;
          case 'copyText':
            this._handleCopyText(message.data);
            return;
          case 'revealEvidence':
            this._handleRevealEvidence(message.data);
            return;
        }
      },
      null,
      this._disposables
    );

    // Setup file watcher for auto-reload
    this._setupReportWatcher();
  }

  private async _handleCopyText(data: unknown) {
    const text =
      typeof data === 'object' && data !== null && 'text' in data ? String((data as any).text) : '';

    if (!text.trim()) {
      vscode.window.showWarningMessage('Nothing to copy from analyze report.');
      return;
    }

    try {
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage('Copied enterprise gate command to clipboard.');
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unable to copy command: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async _handleRevealEvidence(data: unknown) {
    const evidencePath =
      typeof data === 'object' && data !== null && 'path' in data ? String((data as any).path) : '';
    const workspacePath =
      typeof data === 'object' && data !== null && 'workspacePath' in data
        ? String((data as any).workspacePath)
        : this._workspaceContext.workspacePath;

    if (!evidencePath.trim() || !workspacePath.trim()) {
      vscode.window.showWarningMessage('Evidence path is not available.');
      return;
    }

    const resolvedEvidence = path.isAbsolute(evidencePath)
      ? evidencePath
      : path.join(workspacePath, evidencePath);

    try {
      const fileUri = vscode.Uri.file(resolvedEvidence);
      await vscode.commands.executeCommand('revealFileInOS', fileUri);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unable to reveal evidence path: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private _setupReportWatcher() {
    if (!this._workspaceContext.workspacePath) {
      return;
    }

    try {
      const reportPath = getAnalyzeReportPath(this._workspaceContext.workspacePath);

      // Use glob pattern for file watcher
      const globPattern = reportPath.replace(/\\/g, '/');
      this._reportWatcher = vscode.workspace.createFileSystemWatcher(globPattern);

      this._reportWatcher.onDidChange(() => {
        this._logger.info('Analyze report updated, reloading...');
        this._handleLoadReport();
      });

      this._reportWatcher.onDidCreate(() => {
        this._logger.info('Analyze report created, loading...');
        this._handleLoadReport();
      });

      this._disposables.push(this._reportWatcher);
    } catch (error) {
      this._logger.warn('Failed to setup report watcher', error);
    }
  }

  private async _handleRunAnalyze() {
    try {
      await runWorkspaceAnalyze(this._workspaceContext);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to run analyze: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private _handleCheckReportExists() {
    const exists = analyzeReportExists(this._workspaceContext.workspacePath);

    this._panel.webview.postMessage({
      command: 'reportExistsResult',
      exists,
      workspacePath: this._workspaceContext.workspacePath,
    });
  }

  private _handleLoadReport() {
    const { report, error } = loadAnalyzeReport(this._workspaceContext);

    this._panel.webview.postMessage({
      command: 'reportLoaded',
      data: report,
      error,
    });

    if (report) {
      this._logger.info('Analyze report loaded successfully');
    }
  }

  private _update() {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview(): string {
    // Get the path to dist assets
    const baseUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Incident Studio (Next)</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { 
            width: 100%; 
            height: 100%; 
            background: var(--vscode-editor-background, #0d0d0f);
            color: var(--vscode-foreground, rgba(255, 255, 255, 0.82));
            font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
        }
        #root {
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script>
        window.INCIDENT_STUDIO_WORKSPACE_PATH = '${this._escapeHtml(this._workspaceContext.workspacePath)}';
        window.INCIDENT_STUDIO_WORKSPACE_NAME = '${this._escapeHtml(this._workspaceContext.workspaceName)}';
    </script>
    <script type="module" src="${baseUri}/incident-studio-next.js"></script>
</body>
</html>`;
  }

  private _escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  public dispose() {
    IncidentStudioPanel.currentPanel = undefined;

    if (this._reportWatcher) {
      this._reportWatcher.dispose();
    }

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
