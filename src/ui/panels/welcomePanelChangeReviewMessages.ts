import * as vscode from 'vscode';
import type { RepositoryAnalysisMessageHost } from './welcomePanelRepositoryAnalysisMessages.js';
import { getWebviewMessageDataRecord, readStringField } from '../../contracts/webviewProtocol.js';
import {
  buildChangeReview,
  observeReviewTree,
  changeReviewMarkdown,
} from '../../core/changeReview.js';
import type { ChangeReview } from '../../contracts/changeReview.js';

const reviews = new WeakMap<vscode.ExtensionContext, ChangeReview>();
const busy = new WeakSet<vscode.ExtensionContext>();
const commands = new Set([
  'reviewLocalChanges',
  'refreshChangeReview',
  'checkChangeReviewFreshness',
  'copyChangeReview',
]);

export async function tryDispatchChangeReviewMessage(
  host: RepositoryAnalysisMessageHost,
  command: string,
  data: unknown
): Promise<boolean> {
  if (!commands.has(command)) {
    return false;
  }
  const payload = getWebviewMessageDataRecord({ command, data });
  const requestId = readStringField(payload, 'requestId') ?? '';
  if (busy.has(host.context)) {
    host.postWebviewMessage('changeReviewFailed', {
      requestId,
      error: 'A review is already running.',
    });
    return true;
  }
  busy.add(host.context);
  try {
    if (!vscode.workspace.isTrusted) {
      throw new Error('Trust the workspace before running local Git and CLI analysis.');
    }
    const previous = reviews.get(host.context);
    if (command === 'checkChangeReviewFreshness' || command === 'copyChangeReview') {
      if (!previous || previous.id !== readStringField(payload, 'reviewId')) {
        throw new Error('This review is no longer active. Run it again.');
      }
      // Resolve the original ref again: a moved branch invalidates the comparison too.
      const current = await observeReviewTree(previous.repositoryPath, previous.requestedBase);
      const stale = current.fingerprint !== previous.fingerprint;
      if (command === 'checkChangeReviewFreshness' || stale) {
        host.postWebviewMessage('changeReviewFreshness', {
          requestId,
          reviewId: previous.id,
          stale,
        });
      }
      if (command === 'copyChangeReview') {
        if (stale) {
          throw new Error('The review is outdated. Refresh before copying.');
        }
        await vscode.env.clipboard.writeText(changeReviewMarkdown(previous));
        host.postWebviewMessage('changeReviewCopied', { requestId });
      }
      return true;
    }
    let repositoryPath: string;
    if (command === 'refreshChangeReview') {
      if (!previous || previous.id !== readStringField(payload, 'reviewId')) {
        throw new Error('This review is no longer active. Choose the repository again.');
      }
      repositoryPath = previous.repositoryPath;
    } else {
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Select a Git-rooted Workspai workspace to review',
        openLabel: 'Review changes',
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
      });
      if (!selection?.[0]) {
        host.postWebviewMessage('changeReviewCancelled', { requestId });
        return true;
      }
      repositoryPath = selection[0].fsPath;
    }
    // Directory authority comes from the native picker, never arbitrary webview paths.
    const base = readStringField(payload, 'base')?.trim() || 'HEAD';
    host.postWebviewMessage('changeReviewProgress', {
      requestId,
      message: 'Reading Git changes and CLI impact. No project tests or install scripts are run.',
    });
    const report = await buildChangeReview(repositoryPath, base);
    reviews.set(host.context, report);
    host.postWebviewMessage('changeReviewCompleted', { requestId, report });
  } catch (error) {
    host.postWebviewMessage('changeReviewFailed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    busy.delete(host.context);
  }
  return true;
}
