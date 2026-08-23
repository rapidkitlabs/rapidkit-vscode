import { beforeEach, describe, expect, it, vi } from 'vitest';

const { watcherRecords } = vi.hoisted(() => ({
  watcherRecords: [] as Array<{
    pattern: unknown;
    create?: (uri: { fsPath: string }) => void;
    change?: (uri: { fsPath: string }) => void;
    delete?: (uri: { fsPath: string }) => void;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('vscode', () => ({
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  RelativePattern: class RelativePattern {
    constructor(
      public readonly base: { fsPath: string },
      public readonly pattern: string
    ) {}
  },
  workspace: {
    createFileSystemWatcher: (pattern: unknown) => {
      const record = { pattern, dispose: vi.fn() } as (typeof watcherRecords)[number];
      watcherRecords.push(record);
      return {
        onDidCreate: (callback: (uri: { fsPath: string }) => void) => {
          record.create = callback;
          return { dispose: vi.fn() };
        },
        onDidChange: (callback: (uri: { fsPath: string }) => void) => {
          record.change = callback;
          return { dispose: vi.fn() };
        },
        onDidDelete: (callback: (uri: { fsPath: string }) => void) => {
          record.delete = callback;
          return { dispose: vi.fn() };
        },
        dispose: record.dispose,
      };
    },
  },
}));

import { registerWelcomePanelDoctorEvidenceWatcher } from '../ui/panels/welcomePanelDoctorEvidenceWatcher';

describe('welcomePanelEvidenceWatcher', () => {
  beforeEach(() => {
    watcherRecords.splice(0);
  });

  it('watches every governed artifact for open, managed, and linked project scopes', () => {
    const scheduled: Array<{ filePath?: string; workspacePathHint?: string }> = [];
    const disposables: Array<{ dispose: () => void }> = [];
    const controller = registerWelcomePanelDoctorEvidenceWatcher(
      disposables,
      (filePath, workspacePathHint) => scheduled.push({ filePath, workspacePathHint })
    );

    expect(watcherRecords).toHaveLength(1);
    controller.watchWorkspace('/tmp/managed-workspace', ['/external/linked-project']);
    expect(watcherRecords).toHaveLength(3);

    watcherRecords[1].change?.({
      fsPath: '/tmp/managed-workspace/.workspai/reports/workspace-explain-last-run.json',
    });
    watcherRecords[2].delete?.({
      fsPath: '/external/linked-project/.workspai/adopt-readiness.json',
    });

    expect(scheduled).toEqual([
      {
        filePath: '/tmp/managed-workspace/.workspai/reports/workspace-explain-last-run.json',
        workspacePathHint: '/tmp/managed-workspace',
      },
      {
        filePath: '/external/linked-project/.workspai/adopt-readiness.json',
        workspacePathHint: '/tmp/managed-workspace',
      },
    ]);

    controller.watchWorkspace('/tmp/managed-workspace', ['/external/linked-project']);
    expect(watcherRecords).toHaveLength(3);
    controller.watchWorkspace('/tmp/another-workspace');
    expect(watcherRecords).toHaveLength(4);
    expect(watcherRecords[1].dispose).toHaveBeenCalledTimes(1);
    expect(watcherRecords[2].dispose).toHaveBeenCalledTimes(1);

    controller.dispose();
    expect(watcherRecords[0].dispose).toHaveBeenCalledTimes(1);
    expect(watcherRecords[3].dispose).toHaveBeenCalledTimes(1);
  });
});
