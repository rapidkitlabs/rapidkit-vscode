import path from 'node:path';

import fs from 'fs-extra';
import * as vscode from 'vscode';

import { studioSourcePathDenialReason } from './studioWorkspacePathPolicy.js';
import type { StudioAgentToolResult } from './studioAgentToolRegistry.js';

export type StudioCodeIntelligenceOperation =
  | 'definition'
  | 'references'
  | 'implementation'
  | 'hover'
  | 'document-symbols'
  | 'workspace-symbols';

export type StudioCodeIntelligenceRequest = {
  operation: StudioCodeIntelligenceOperation;
  path?: string;
  line?: number;
  column?: number;
  query?: string;
  workspacePath: string;
  projectPath?: string;
};

type PortableLocation = {
  path: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
};

type PortableSymbol = PortableLocation & {
  name: string;
  detail?: string;
  kind: number;
};

export type StudioCodeIntelligenceResult = {
  operation: StudioCodeIntelligenceOperation;
  source?: { path: string; line: number; column: number };
  query?: string;
  locations: PortableLocation[];
  symbols: PortableSymbol[];
  hover: string[];
  truncated: boolean;
};

const MAX_CODE_INTELLIGENCE_RESULTS = 100;

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function portablePath(root: string, uri: vscode.Uri): string | undefined {
  if (uri.scheme !== 'file' || !isInside(root, uri.fsPath)) {
    return undefined;
  }
  return path.relative(root, uri.fsPath).replace(/\\/g, '/') || '.';
}

function portableLocation(
  root: string,
  location: vscode.Location | vscode.LocationLink
): PortableLocation | undefined {
  const uri = 'targetUri' in location ? location.targetUri : location.uri;
  const range = 'targetRange' in location ? location.targetRange : location.range;
  const relativePath = portablePath(root, uri);
  return relativePath
    ? {
        path: relativePath,
        line: range.start.line + 1,
        column: range.start.character + 1,
        endLine: range.end.line + 1,
        endColumn: range.end.character + 1,
      }
    : undefined;
}

function markdownText(value: vscode.MarkedString | vscode.MarkdownString): string {
  if (typeof value === 'string') {
    return value;
  }
  return 'language' in value ? value.value : value.value;
}

function flattenDocumentSymbols(
  root: string,
  uri: vscode.Uri,
  symbols: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[],
  output: PortableSymbol[]
): void {
  for (const symbol of symbols) {
    if (output.length >= MAX_CODE_INTELLIGENCE_RESULTS) {
      return;
    }
    const location =
      'location' in symbol
        ? portableLocation(root, symbol.location)
        : portableLocation(root, new vscode.Location(uri, symbol.range));
    if (location) {
      output.push({
        ...location,
        name: symbol.name,
        ...('detail' in symbol && symbol.detail ? { detail: symbol.detail } : {}),
        kind: symbol.kind,
      });
    }
    if ('children' in symbol && symbol.children.length > 0) {
      flattenDocumentSymbols(root, uri, symbol.children, output);
    }
  }
}

export async function inspectStudioCodeIntelligence(
  input: StudioCodeIntelligenceRequest
): Promise<StudioCodeIntelligenceResult> {
  const root = path.resolve(input.projectPath ?? input.workspacePath);
  const result: StudioCodeIntelligenceResult = {
    operation: input.operation,
    locations: [],
    symbols: [],
    hover: [],
    truncated: false,
  };

  if (input.operation === 'workspace-symbols') {
    const query = input.query?.trim();
    if (!query) {
      throw new Error('Workspace symbol lookup requires a non-empty query.');
    }
    result.query = query;
    const symbols =
      (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        query
      )) ?? [];
    flattenDocumentSymbols(
      root,
      vscode.Uri.file(root),
      symbols.slice(0, MAX_CODE_INTELLIGENCE_RESULTS + 1),
      result.symbols
    );
    result.truncated = symbols.length > result.symbols.length;
    return result;
  }

  const relativePath = input.path?.trim().replace(/\\/g, '/');
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error('Code intelligence requires one workspace-relative source path.');
  }
  const denial = studioSourcePathDenialReason(relativePath);
  if (denial) {
    throw new Error(`Code intelligence source path is blocked: ${relativePath} (${denial}).`);
  }
  const absolutePath = path.resolve(root, relativePath);
  const sourceStat = isInside(root, absolutePath)
    ? await fs.stat(absolutePath).catch(() => undefined)
    : undefined;
  if (!sourceStat?.isFile()) {
    throw new Error(`Code intelligence source path is unavailable: ${relativePath}`);
  }
  const line = Math.max(1, Math.trunc(input.line ?? 1));
  const column = Math.max(1, Math.trunc(input.column ?? 1));
  const uri = vscode.Uri.file(absolutePath);
  const position = new vscode.Position(line - 1, column - 1);
  result.source = { path: relativePath, line, column };

  if (input.operation === 'hover') {
    const hovers =
      (await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        uri,
        position
      )) ?? [];
    result.hover = hovers
      .flatMap((hover) => hover.contents.map(markdownText))
      .filter(Boolean)
      .slice(0, 20);
    result.truncated = hovers.length > 20;
    return result;
  }

  if (input.operation === 'document-symbols') {
    const symbols =
      (await vscode.commands.executeCommand<
        Array<vscode.DocumentSymbol | vscode.SymbolInformation>
      >('vscode.executeDocumentSymbolProvider', uri)) ?? [];
    flattenDocumentSymbols(root, uri, symbols, result.symbols);
    result.truncated = result.symbols.length >= MAX_CODE_INTELLIGENCE_RESULTS;
    return result;
  }

  const command =
    input.operation === 'definition'
      ? 'vscode.executeDefinitionProvider'
      : input.operation === 'references'
        ? 'vscode.executeReferenceProvider'
        : 'vscode.executeImplementationProvider';
  const locations =
    (await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
      command,
      uri,
      position
    )) ?? [];
  result.locations = locations
    .map((location) => portableLocation(root, location))
    .filter((location): location is PortableLocation => Boolean(location))
    .slice(0, MAX_CODE_INTELLIGENCE_RESULTS);
  result.truncated = locations.length > result.locations.length;
  return result;
}

export async function runStudioCodeIntelligenceTool(
  input: StudioCodeIntelligenceRequest
): Promise<StudioAgentToolResult<StudioCodeIntelligenceResult>> {
  try {
    return { ok: true, changed: false, output: await inspectStudioCodeIntelligence(input) };
  } catch (error) {
    return {
      ok: false,
      changed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
