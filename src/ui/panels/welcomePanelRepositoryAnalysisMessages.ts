import * as vscode from 'vscode';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RepositoryAnalysisReport } from '../../contracts/repositoryAnalysis';

import fs from 'fs-extra';

import { getWebviewMessageDataRecord, readStringField } from '../../contracts/webviewProtocol.js';
import {
  analyzeRemoteRepository,
  deleteRepositoryAnalysis,
  searchRepositoryAnalysis,
} from '../../core/repositoryAnalysis.js';
import releasePolicy from '../../../contracts/extension-cli-release-policy.v1.json';

export type RepositoryAnalysisMessageHost = {
  context: vscode.ExtensionContext;
  postWebviewMessage: (command: string, data?: unknown, options?: { error?: unknown }) => void;
};

const COMMANDS = new Set([
  'analyzeRemoteRepository',
  'cancelRemoteRepositoryAnalysis',
  'deleteRemoteRepositoryAnalysis',
  'exportRepositoryAnalysisGif',
  'openAnalyzedRepository',
  'openRepositoryAnalysisArtifact',
  'searchRepositoryAnalysis',
  'openRepositorySearchProof',
]);
const investigation = new WeakMap<
  vscode.ExtensionContext,
  {
    report: RepositoryAnalysisReport;
    graphHash: string;
    proofs: Map<string, { artifact: string; line?: number; contentHash?: string }>;
  }
>();
const searchBusy = new WeakSet<vscode.ExtensionContext>();
const digestGraph = async (file: string) =>
  crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
const activeAnalyses = new Map<string, AbortController>();

async function requireContainedAnalysisPath(
  storagePath: string,
  candidate: string
): Promise<string> {
  const root = path.resolve(storagePath, 'repository-analysis');
  const resolved = path.resolve(candidate);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('The requested path is outside local repository-analysis storage.');
  }
  const [realRoot, realCandidate] = await Promise.all([fs.realpath(root), fs.realpath(resolved)]);
  const realRelative = path.relative(realRoot, realCandidate);
  if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error('The requested path resolves outside local repository-analysis storage.');
  }
  return realCandidate;
}

export async function tryDispatchRepositoryAnalysisWebviewMessage(
  host: RepositoryAnalysisMessageHost,
  command: string,
  data: unknown
): Promise<boolean> {
  if (!COMMANDS.has(command)) {
    return false;
  }
  const payload = getWebviewMessageDataRecord({ command, data });
  const repositoryUrl = readStringField(payload, 'repositoryUrl') ?? '';
  const requestId = readStringField(payload, 'requestId') ?? `${Date.now()}`;

  try {
    if (command === 'searchRepositoryAnalysis' || command === 'openRepositorySearchProof') {
      const session = investigation.get(host.context);
      if (!session || session.report.requestId !== readStringField(payload, 'analysisId')) {
        throw new Error('This analysis is no longer active. Analyze the repository again.');
      }
      const graph = await requireContainedAnalysisPath(
        host.context.globalStorageUri.fsPath,
        session.report.artifacts.graph
      );
      if ((await digestGraph(graph)) !== session.graphHash) {
        throw new Error('Graph evidence changed. Analyze again before investigating.');
      }
      if (command === 'searchRepositoryAnalysis') {
        if (searchBusy.has(host.context)) {
          throw new Error('A graph search is already running.');
        }
        searchBusy.add(host.context);
        try {
          const result = await searchRepositoryAnalysis(
            session.report,
            readStringField(payload, 'query') ?? ''
          );
          if (
            investigation.get(host.context) !== session ||
            (await digestGraph(graph)) !== session.graphHash
          ) {
            throw new Error('Analysis changed during search. Try again.');
          }
          session.proofs.clear();
          for (const item of result.proofs as Array<Record<string, unknown>>) {
            if (typeof item.id === 'string' && typeof item.artifact === 'string') {
              session.proofs.set(item.id, {
                artifact: item.artifact,
                line:
                  typeof item.line === 'number' && Number.isInteger(item.line) && item.line > 0
                    ? item.line
                    : undefined,
                contentHash: typeof item.contentHash === 'string' ? item.contentHash : undefined,
              });
            }
          }
          host.postWebviewMessage('repositorySearchCompleted', { requestId, result });
        } finally {
          searchBusy.delete(host.context);
        }
      } else {
        const proof = session.proofs.get(readStringField(payload, 'proofId') ?? '');
        if (!proof || path.isAbsolute(proof.artifact)) {
          throw new Error('Select a proof from the current search results.');
        }
        const file = await requireContainedAnalysisPath(
          host.context.globalStorageUri.fsPath,
          path.resolve(session.report.artifacts.workspacePath, proof.artifact)
        );
        const sourceRoot = await fs.realpath(session.report.repository.localPath);
        const relative = path.relative(sourceRoot, file);
        if (
          !relative ||
          relative === '..' ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        ) {
          throw new Error('This evidence is not a source file in the analyzed repository.');
        }
        const stat = await fs.stat(file);
        if (!stat.isFile() || stat.size > 2 * 1024 * 1024) {
          throw new Error('Source preview requires a file smaller than 2 MiB.');
        }
        if (proof.contentHash && (await digestGraph(file)) !== proof.contentHash) {
          throw new Error(
            'Source changed since this proof was captured. Analyze again before using its line reference.'
          );
        }
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
        const line = Math.min((proof.line ?? 1) - 1, Math.max(0, doc.lineCount - 1));
        await vscode.window.showTextDocument(doc, {
          preview: true,
          preserveFocus: false,
          selection: new vscode.Range(line, 0, line, 0),
        });
      }
      return true;
    }
    if (command === 'cancelRemoteRepositoryAnalysis') {
      activeAnalyses.get(requestId)?.abort();
      activeAnalyses.delete(requestId);
      host.postWebviewMessage('repositoryAnalysisCancelled', { requestId });
      return true;
    }

    if (command === 'analyzeRemoteRepository') {
      investigation.delete(host.context);
      const controller = new AbortController();
      activeAnalyses.set(requestId, controller);
      try {
        const report = await analyzeRemoteRepository({
          repositoryUrl,
          requestId,
          storagePath: host.context.globalStorageUri.fsPath,
          cliVersion: releasePolicy.verifiedCliVersion,
          cancelSignal: controller.signal,
          onProgress: (progress) => host.postWebviewMessage('repositoryAnalysisProgress', progress),
        });
        if (!controller.signal.aborted) {
          investigation.set(host.context, {
            report,
            graphHash: await digestGraph(report.artifacts.graph),
            proofs: new Map(),
          });
          host.postWebviewMessage('repositoryAnalysisCompleted', report);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          throw error;
        }
      } finally {
        activeAnalyses.delete(requestId);
      }
      return true;
    }

    if (command === 'deleteRemoteRepositoryAnalysis') {
      investigation.delete(host.context);
      await deleteRepositoryAnalysis(host.context.globalStorageUri.fsPath, repositoryUrl);
      host.postWebviewMessage('repositoryAnalysisDeleted', { requestId, repositoryUrl });
      return true;
    }

    if (command === 'exportRepositoryAnalysisGif') {
      const gifDataUrl = readStringField(payload, 'gifDataUrl') ?? '';
      const prefix = 'data:image/gif;base64,';
      if (!gifDataUrl.startsWith(prefix)) {
        throw new Error('The Webview did not provide a valid GIF payload.');
      }
      const gif = Buffer.from(gifDataUrl.slice(prefix.length), 'base64');
      if (gif.length < 14 || gif.subarray(0, 6).toString('ascii') !== 'GIF89a') {
        throw new Error('The generated repository analysis export is not a valid GIF89a stream.');
      }
      if (gif.length > 32 * 1024 * 1024) {
        throw new Error('The generated repository analysis GIF exceeds the 32 MB export limit.');
      }
      const repositoryName = (readStringField(payload, 'repositoryName') ?? 'repository')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .slice(0, 64);
      const commit = (readStringField(payload, 'commit') ?? 'latest')
        .replace(/[^a-fA-F0-9]/g, '')
        .slice(0, 12);
      const requestedKind = readStringField(payload, 'kind');
      const kind =
        requestedKind === 'graph'
          ? 'graph-360'
          : requestedKind === 'recording'
            ? 'analysis-recording'
            : 'analysis-summary';
      const outputUri = await vscode.window.showSaveDialog({
        title: kind === 'graph-360' ? 'Export Repository Graph GIF' : 'Export Analysis Story GIF',
        saveLabel: 'Export GIF',
        defaultUri: vscode.Uri.file(
          path.join(
            host.context.globalStorageUri.fsPath,
            `${repositoryName}-${kind}-${commit || 'latest'}.gif`
          )
        ),
        filters: { 'Animated GIF': ['gif'] },
      });
      if (outputUri) {
        await vscode.workspace.fs.writeFile(outputUri, gif);
        host.postWebviewMessage('repositoryAnalysisExported', {
          requestId,
          kind,
          path: outputUri.fsPath,
        });
      } else {
        host.postWebviewMessage('repositoryAnalysisExported', {
          requestId,
          kind: 'cancelled',
          path: '',
        });
      }
      return true;
    }

    const requestedPath = readStringField(payload, 'path') ?? '';
    if (!requestedPath) {
      throw new Error('The local analysis path is unavailable.');
    }
    const localPath = await requireContainedAnalysisPath(
      host.context.globalStorageUri.fsPath,
      requestedPath
    );
    if (command === 'openAnalyzedRepository') {
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(localPath), {
        forceNewWindow: true,
      });
    } else {
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(localPath));
    }
  } catch (error) {
    if (command === 'searchRepositoryAnalysis' || command === 'openRepositorySearchProof') {
      host.postWebviewMessage('repositorySearchFailed', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
    if (command === 'exportRepositoryAnalysisGif') {
      host.postWebviewMessage(
        'repositoryAnalysisExported',
        { requestId, kind: 'failed', path: '' },
        { error }
      );
    } else {
      host.postWebviewMessage('repositoryAnalysisFailed', { requestId }, { error });
    }
  }
  return true;
}
