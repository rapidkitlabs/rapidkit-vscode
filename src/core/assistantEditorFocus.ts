import path from 'node:path';

import { studioSourcePathDenialReason } from './studioWorkspacePathPolicy.js';

export type AssistantEditorDiagnostic = {
  severity: string;
  message: string;
  line: number;
  column: number;
  source?: string;
  code?: string | number;
};

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Build a bounded, portable pointer to the user's active editor context.
 * This is navigation context only: the Agent must still call inspect-source
 * before any SHA-bound source proposal is authorized.
 */
export function buildAssistantEditorFocus(input: {
  workspacePath: string;
  projectPath?: string;
  filePath: string;
  languageId?: string;
  selection?: { text: string; startLine: number; endLine: number };
  diagnostics?: AssistantEditorDiagnostic[];
}): string {
  const sourceRoot = input.projectPath?.trim() || input.workspacePath;
  if (!sourceRoot || !input.filePath || !isInside(sourceRoot, input.filePath)) {
    return '';
  }
  const relativePath = path.relative(sourceRoot, input.filePath).replace(/\\/g, '/');
  if (!relativePath || studioSourcePathDenialReason(relativePath)) {
    return '';
  }
  const selectionText = input.selection?.text.trim().slice(0, 4_000) ?? '';
  const diagnostics = (input.diagnostics ?? []).slice(0, 20).map((diagnostic) => ({
    severity: diagnostic.severity.slice(0, 24),
    message: diagnostic.message.trim().slice(0, 500),
    line: Math.max(1, Math.trunc(diagnostic.line)),
    column: Math.max(1, Math.trunc(diagnostic.column)),
    ...(diagnostic.source ? { source: diagnostic.source.slice(0, 80) } : {}),
    ...(diagnostic.code !== undefined ? { code: diagnostic.code } : {}),
  }));
  return [
    '## Active editor focus (navigation context, never mutation authority)',
    `File: ${relativePath}${input.languageId ? ` (${input.languageId})` : ''}`,
    selectionText
      ? `Selected lines ${input.selection!.startLine}-${input.selection!.endLine}:\n${selectionText}`
      : 'Selection: none. Inspect the file through inspect-source before relying on its contents.',
    diagnostics.length > 0
      ? `Current file diagnostics: ${JSON.stringify(diagnostics)}`
      : 'Current file diagnostics: none.',
    'Use this focus only when relevant to the user request. Re-inspect the source file before editing; this focus does not provide a source hash or write authorization.',
  ].join('\n');
}
