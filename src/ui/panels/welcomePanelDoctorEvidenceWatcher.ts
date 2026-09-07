import * as vscode from 'vscode';
import path from 'path';

const GOVERNED_EVIDENCE_GLOB =
  '{.workspai/reports/**,.rapidkit/reports/**,.workspai/*.json,.rapidkit/*.json}';

export type WelcomePanelEvidenceWatcher = vscode.Disposable & {
  watchWorkspace: (workspacePath?: string, projectPaths?: readonly string[]) => void;
};

export function registerWelcomePanelDoctorEvidenceWatcher(
  disposables: vscode.Disposable[],
  scheduleRefresh: (filePath?: string, workspacePathHint?: string) => void
): WelcomePanelEvidenceWatcher {
  const scopedDisposables: vscode.Disposable[] = [];
  let watchedScopeKey: string | undefined;

  const isTransientEvidencePath = (filePath: string): boolean => {
    const normalized = filePath.replace(/\\/g, '/');
    return (
      /(?:^|\/)\.[^/]+\.tmp$/i.test(normalized) ||
      /\.json\.\d+\.[0-9a-f-]+\.tmp$/i.test(normalized) ||
      /(?:^|\/)repair\/inbox(?:\/|$)/i.test(normalized) ||
      /(?:^|\/)repair\/engine\.lock$/i.test(normalized)
    );
  };

  const bindWatcher = (
    watcher: vscode.FileSystemWatcher,
    target: vscode.Disposable[],
    workspacePathHint?: string
  ) => {
    const onFileSystemEvent = (uri?: vscode.Uri) => {
      if (!uri || isTransientEvidencePath(uri.fsPath)) {
        return;
      }
      scheduleRefresh(uri.fsPath, workspacePathHint);
    };
    target.push(watcher);
    target.push(watcher.onDidCreate(onFileSystemEvent));
    target.push(watcher.onDidChange(onFileSystemEvent));
    target.push(watcher.onDidDelete(onFileSystemEvent));
  };

  const controller: WelcomePanelEvidenceWatcher = {
    watchWorkspace(workspacePath?: string, projectPaths: readonly string[] = []) {
      const normalized = workspacePath?.trim();
      const roots = [normalized, ...projectPaths.map((item) => item.trim())]
        .filter((item): item is string => Boolean(item))
        .map((item) => path.resolve(item))
        .filter(
          (item, index, values) =>
            values.findIndex((candidate) => candidate === item) === index &&
            !values.some((candidate) => {
              if (candidate === item) {
                return false;
              }
              const relative = path.relative(candidate, item);
              return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
            })
        );
      const scopeKey = roots.slice().sort().join('\n');
      if (scopeKey === watchedScopeKey) {
        return;
      }
      for (const disposable of scopedDisposables.splice(0)) {
        disposable.dispose();
      }
      watchedScopeKey = scopeKey;
      if (!normalized) {
        return;
      }
      for (const root of roots) {
        bindWatcher(
          vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.file(root), GOVERNED_EVIDENCE_GLOB),
            false,
            false,
            false
          ),
          scopedDisposables,
          normalized
        );
      }
    },
    dispose() {
      for (const disposable of scopedDisposables.splice(0)) {
        disposable.dispose();
      }
      watchedScopeKey = undefined;
    },
  };

  disposables.push(controller);
  return controller;
}
