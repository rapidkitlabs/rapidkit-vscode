/**
 * Code Actions Provider
 * Provides quick fixes and refactorings for Workspai files
 */

import * as vscode from 'vscode';
import {
  buildMissingFrameworkDocumentText,
  isWorkspaiConfigurationFile,
} from './workspaiConfigFiles';

type DiagnosticSeed = {
  severity: string;
  line: number;
  column: number;
  fileLineLabel: string;
  message: string;
};

export function buildAIDiagnosticSeed(input: {
  intent: 'debug' | 'fix-preview' | 'explain';
  fileName: string;
  languageId: string;
  diagnostics: DiagnosticSeed[];
  snippet?: string;
}): string {
  const intentLabel =
    input.intent === 'debug'
      ? 'Debug with Workspai AI'
      : input.intent === 'fix-preview'
        ? 'Preview fix with Workspai AI'
        : 'Explain error with Workspai AI';
  const diagnosticsBlock =
    input.diagnostics.length > 0
      ? input.diagnostics
          .slice(0, 8)
          .map(
            (diagnostic) =>
              `- [${diagnostic.severity}] ${diagnostic.fileLineLabel}: ${diagnostic.message}`
          )
          .join('\n')
      : '- No diagnostic supplied; use the selected code snippet as evidence.';

  return [
    `${intentLabel}: analyze this editor issue with evidence-first output.`,
    `File: ${input.fileName}`,
    `Language: ${input.languageId}`,
    '',
    'Diagnostics:',
    diagnosticsBlock,
    input.snippet ? ['', 'Selected/current code evidence:', '```', input.snippet, '```'] : '',
    '',
    'Required output:',
    '- Diagnosis or explanation grounded in the diagnostic and file context.',
    '- Smallest safe next step; do not claim the fix is applied.',
    '- Exact verify command and execution directory.',
    '- Rollback or undo note for any proposed mutation.',
  ]
    .flat()
    .filter(Boolean)
    .join('\n');
}

export class WorkspaiCodeActionsProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor,
  ];
  private static readonly AI_DEBUG_LANGUAGES = new Set([
    'python',
    'typescript',
    'javascript',
    'go',
    'java',
    'csharp',
    'php',
    'ruby',
    'rust',
    'kotlin',
    'scala',
    'sql',
    'yaml',
    'json',
    'jsonc',
    'toml',
    'shellscript',
    'dockerfile',
    'typescriptreact',
    'javascriptreact',
  ]);

  private getRangeSnippet(document: vscode.TextDocument, range: vscode.Range): string | undefined {
    const text = document.getText(document.validateRange(range)).trim();
    if (!text) {
      return undefined;
    }
    if (text.length <= 800) {
      return text;
    }
    return `${text.slice(0, 800)}\n... [truncated]`;
  }

  private buildDiagnosticSeed(
    intent: 'debug' | 'fix-preview' | 'explain',
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): string {
    const diagnostics = context.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity === vscode.DiagnosticSeverity.Error ? 'ERROR' : 'WARN',
      line: diagnostic.range.start.line + 1,
      column: diagnostic.range.start.character + 1,
      fileLineLabel: `${vscode.workspace.asRelativePath(document.fileName)}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`,
      message: diagnostic.message,
    }));

    return buildAIDiagnosticSeed({
      intent,
      fileName: vscode.workspace.asRelativePath(document.fileName),
      languageId: document.languageId,
      diagnostics,
      snippet: this.getRangeSnippet(document, range),
    });
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] | undefined {
    const actions: vscode.CodeAction[] = [];

    // Quick fixes for configuration files
    if (isWorkspaiConfigurationFile(document.fileName)) {
      actions.push(...this.getConfigurationQuickFixes(document, range, context));
    }

    // Quick fixes for module.yaml files
    if (document.fileName.endsWith('module.yaml')) {
      actions.push(...this.getModuleQuickFixes(document, range, context));
    }

    // AI debug actions are available for any editable document that has diagnostics or selection.
    actions.push(...this.getAIDebugActions(document, range, context));

    return actions.length > 0 ? actions : undefined;
  }

  /** "Debug with AI" action shown when there are diagnostics or a selection. */
  private getAIDebugActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    if (!WorkspaiCodeActionsProvider.AI_DEBUG_LANGUAGES.has(document.languageId)) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    const hasErrors = context.diagnostics.some(
      (d) => d.severity === vscode.DiagnosticSeverity.Error
    );
    const selectionSnippet = this.getRangeSnippet(document, range);
    const hasSelection = Boolean(selectionSnippet);

    if (hasErrors || hasSelection) {
      const action = new vscode.CodeAction(
        '✦ Debug with Workspai AI',
        vscode.CodeActionKind.QuickFix
      );
      action.command = {
        command: 'workspai.debugWithAI',
        title: 'Debug with Workspai AI',
        arguments: [
          {
            seed: this.buildDiagnosticSeed('debug', document, range, context),
            source: 'code-action',
            trigger: 'debug-with-ai',
          },
        ],
      };
      action.isPreferred = false;
      actions.push(action);

      const fixPreviewAction = new vscode.CodeAction(
        '✦ Preview fix with Workspai AI',
        vscode.CodeActionKind.QuickFix
      );
      fixPreviewAction.command = {
        command: 'workspai.aiFixPreviewLite',
        title: 'Preview fix with Workspai AI',
        arguments: [
          {
            seed: this.buildDiagnosticSeed('fix-preview', document, range, context),
            source: 'code-action',
            trigger: 'preview-fix',
          },
        ],
      };
      actions.push(fixPreviewAction);
    }

    if (hasErrors) {
      const errorMessages = context.diagnostics
        .filter((d) => d.severity === vscode.DiagnosticSeverity.Error)
        .map((d) => d.message)
        .join('; ');

      const explainAction = new vscode.CodeAction(
        `✦ Explain error with AI: "${errorMessages.slice(0, 60)}${errorMessages.length > 60 ? '…' : ''}"`,
        vscode.CodeActionKind.QuickFix
      );
      explainAction.command = {
        command: 'workspai.explainErrorWithAI',
        title: 'Explain error with AI',
        arguments: [
          {
            seed: this.buildDiagnosticSeed('explain', document, range, context),
            source: 'code-action',
            trigger: 'explain-error',
          },
        ],
      };
      actions.push(explainAction);
    }

    if (hasSelection) {
      const impactAction = new vscode.CodeAction(
        '✦ Analyze change impact with AI',
        vscode.CodeActionKind.Refactor
      );
      impactAction.command = {
        command: 'workspai.aiChangeImpactLite',
        title: 'Analyze change impact with AI',
        arguments: [selectionSnippet],
      };
      actions.push(impactAction);
    }

    return actions;
  }

  private getConfigurationQuickFixes(
    document: vscode.TextDocument,
    _range: vscode.Range,
    _context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Add missing fields
    const text = document.getText();
    if (!text.includes('"framework"')) {
      const action = new vscode.CodeAction(
        'Add missing framework field',
        vscode.CodeActionKind.QuickFix
      );
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(0), document.positionAt(text.length)),
        buildMissingFrameworkDocumentText(text)
      );
      actions.push(action);
    }

    return actions;
  }

  private getModuleQuickFixes(
    document: vscode.TextDocument,
    _range: vscode.Range,
    _context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Add missing metadata
    const text = document.getText();
    if (!text.includes('version:')) {
      const action = new vscode.CodeAction('Add version field', vscode.CodeActionKind.QuickFix);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.insert(document.uri, new vscode.Position(1, 0), 'version: "1.0.0"\n');
      actions.push(action);
    }

    return actions;
  }
}
