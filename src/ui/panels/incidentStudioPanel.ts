/**
 * Incident Studio Panel (vNext)
 * Fullscreen webview for the new Incident Studio redesign
 * Opens as a separate tab/panel completely independent from AIIncidentStudio
 */

import * as vscode from 'vscode';

export class IncidentStudioPanel {
  public static readonly viewType = 'incidentStudioNextPanel';
  private static currentPanel: IncidentStudioPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.ViewColumn.One;

    // If panel already exists, show it
    if (IncidentStudioPanel.currentPanel) {
      IncidentStudioPanel.currentPanel._panel.reveal(column);
      return;
    }

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

    IncidentStudioPanel.currentPanel = new IncidentStudioPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

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
        }
      },
      null,
      this._disposables
    );
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
        window.INCIDENT_STUDIO_WORKSPACE_NAME = 'rapidkit-core';
    </script>
    <script type="module" src="${baseUri}/incident-studio-next.js"></script>
</body>
</html>`;
  }

  public dispose() {
    IncidentStudioPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
