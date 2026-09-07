import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateFileSystemWatcher,
  watcherRegistrations,
  mockExecuteCommand,
  mockLoadWorkspaces,
  mockTouchWorkspace,
  mockClearCache,
  mockGetVersionInfo,
} = vi.hoisted(() => ({
  mockCreateFileSystemWatcher: vi.fn(),
  watcherRegistrations: [] as Array<{
    onDidCreate?: () => void;
    onDidChange?: () => void;
    onDidDelete?: () => void;
    dispose: ReturnType<typeof vi.fn>;
  }>,
  mockExecuteCommand: vi.fn(),
  mockLoadWorkspaces: vi.fn(),
  mockTouchWorkspace: vi.fn(),
  mockClearCache: vi.fn(),
  mockGetVersionInfo: vi.fn(),
}));

vi.mock('vscode', () => {
  class EventEmitter<T = unknown> {
    private readonly listeners: Array<(value?: T) => void> = [];
    readonly event = (listener: (value?: T) => void) => {
      this.listeners.push(listener);
      return { dispose: vi.fn() };
    };
    fire = vi.fn((value?: T) => {
      for (const listener of this.listeners) {
        listener(value);
      }
    });
    dispose = vi.fn(() => undefined);
  }

  class TreeItem {
    label?: string;
    collapsibleState?: number;

    constructor(label?: string, collapsibleState?: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class ThemeIcon {
    id: string;

    constructor(id: string) {
      this.id = id;
    }
  }

  class RelativePattern {
    constructor(
      public readonly base: { fsPath: string },
      public readonly pattern: string
    ) {}
  }

  const createWatcher = () => {
    const registration = {
      onDidCreate: undefined as (() => void) | undefined,
      onDidChange: undefined as (() => void) | undefined,
      onDidDelete: undefined as (() => void) | undefined,
      dispose: vi.fn(),
    };

    watcherRegistrations.push(registration);

    return {
      onDidCreate: (cb: () => void) => {
        registration.onDidCreate = cb;
      },
      onDidChange: (cb: () => void) => {
        registration.onDidChange = cb;
      },
      onDidDelete: (cb: () => void) => {
        registration.onDidDelete = cb;
      },
      dispose: registration.dispose,
    };
  };

  mockCreateFileSystemWatcher.mockImplementation(createWatcher);

  return {
    window: {
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        clear: vi.fn(),
        dispose: vi.fn(),
      })),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showInformationMessage: vi.fn(),
    },
    workspace: {
      createFileSystemWatcher: mockCreateFileSystemWatcher,
    },
    Uri: { file: (fsPath: string) => ({ fsPath }) },
    RelativePattern,
    commands: {
      executeCommand: mockExecuteCommand,
    },
    EventEmitter,
    TreeItem,
    ThemeIcon,
    CodeActionKind: {
      QuickFix: 'quickfix',
      Refactor: 'refactor',
    },
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
  };
});

vi.mock('../core/workspaceManager', () => ({
  WorkspaceManager: {
    getInstance: () => ({
      loadWorkspaces: mockLoadWorkspaces,
      touchWorkspace: mockTouchWorkspace,
      addWorkspace: vi.fn(),
      removeWorkspace: vi.fn(),
    }),
  },
}));

vi.mock('../core/coreVersionService', () => ({
  CoreVersionService: {
    getInstance: () => ({
      clearCache: mockClearCache,
      getVersionInfo: mockGetVersionInfo,
    }),
  },
}));

import { WorkspaceExplorerProvider } from '../ui/treeviews/workspaceExplorer';
import { DoctorEvidenceProvider } from '../ui/treeviews/doctorEvidenceProvider';

describe('watcher debounce behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    watcherRegistrations.length = 0;

    mockLoadWorkspaces.mockResolvedValue([]);
    mockTouchWorkspace.mockResolvedValue(undefined);
    mockGetVersionInfo.mockResolvedValue({
      coreVersion: null,
      npmVersion: null,
      hasUpdate: false,
    });
  });

  it('debounces workspace explorer watcher refresh events', async () => {
    const provider = new WorkspaceExplorerProvider();
    await provider.whenReady();
    await provider.selectWorkspace({ name: 'workspace', path: '/tmp/workspace' } as never);
    const refreshSpy = vi.spyOn(provider, 'refresh').mockResolvedValue(undefined);

    const watcher = watcherRegistrations[0];
    watcher.onDidCreate?.();
    watcher.onDidChange?.();
    watcher.onDidDelete?.();

    expect(refreshSpy).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(249);
    expect(refreshSpy).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(1);
    await Promise.resolve();

    expect(refreshSpy).toHaveBeenCalledTimes(1);

    provider.dispose();
  });

  it('publishes workspace selection before last-access persistence settles', async () => {
    let settleTouch!: () => void;
    mockTouchWorkspace.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settleTouch = resolve;
        })
    );
    const workspace = { name: 'workspace', path: '/tmp/workspace' };
    mockLoadWorkspaces.mockResolvedValue([workspace]);
    const provider = new WorkspaceExplorerProvider();
    await provider.whenReady();
    const selections: unknown[] = [];
    provider.onDidChangeSelectedWorkspace((selected) => selections.push(selected));

    await expect(provider.selectWorkspace(workspace as never)).resolves.toBeUndefined();
    expect(selections).toEqual([workspace]);
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'setContext',
      'workspai.workspaceSelected',
      true
    );
    expect(mockTouchWorkspace).toHaveBeenCalledWith(workspace.path);

    settleTouch();
    await Promise.resolve();
    provider.dispose();
  });

  it('drops a stale initial publication when the user switches workspaces', async () => {
    const first = { name: 'first', path: '/tmp/first' };
    const second = { name: 'second', path: '/tmp/second' };
    mockLoadWorkspaces.mockResolvedValue([first, second]);

    let releaseInitialContext!: () => void;
    let contextCalls = 0;
    mockExecuteCommand.mockImplementation((command: string) => {
      if (command === 'setContext' && contextCalls++ === 0) {
        return new Promise<void>((resolve) => {
          releaseInitialContext = resolve;
        });
      }
      return Promise.resolve();
    });

    const provider = new WorkspaceExplorerProvider();
    await provider.whenReady();
    const selections: unknown[] = [];
    provider.onDidChangeSelectedWorkspace((selected) => selections.push(selected));
    const initialPublish = provider.publishSelectedWorkspaceContext();
    await Promise.resolve();

    await provider.selectWorkspace(second as never);
    releaseInitialContext();
    await initialPublish;

    expect(selections).toEqual([second]);
    expect(provider.getSelectedWorkspace()?.path).toBe(second.path);
    provider.dispose();
  });

  it('cancels pending workspace explorer refresh timer on dispose', async () => {
    const provider = new WorkspaceExplorerProvider();
    await provider.whenReady();
    await provider.selectWorkspace({ name: 'workspace', path: '/tmp/workspace' } as never);
    const refreshSpy = vi.spyOn(provider, 'refresh').mockResolvedValue(undefined);

    const watcher = watcherRegistrations[0];
    watcher.onDidCreate?.();

    provider.dispose();

    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(refreshSpy).toHaveBeenCalledTimes(0);
  });

  it('debounces doctor evidence reload events', async () => {
    const provider = new DoctorEvidenceProvider(() => '/tmp/workspace');
    provider.setWorkspacePath('/tmp/workspace');
    const reloadSpy = vi.spyOn(provider as any, 'reload').mockResolvedValue(undefined);

    const watcher = watcherRegistrations[0];
    watcher.onDidCreate?.();
    watcher.onDidChange?.();

    expect(reloadSpy).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(199);
    expect(reloadSpy).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(1);
    await Promise.resolve();

    expect(reloadSpy).toHaveBeenCalledTimes(1);

    provider.dispose();
  });

  it('cancels pending doctor evidence timer on dispose', async () => {
    const provider = new DoctorEvidenceProvider(() => '/tmp/workspace');
    provider.setWorkspacePath('/tmp/workspace');
    const reloadSpy = vi.spyOn(provider as any, 'reload').mockResolvedValue(undefined);

    const watcher = watcherRegistrations[0];
    watcher.onDidCreate?.();

    provider.dispose();

    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(reloadSpy).toHaveBeenCalledTimes(0);
  });
});
