import { beforeEach, describe, expect, it, vi } from 'vitest';

const { bundledRuntimeMock, createdTerminals, createTerminalMock } = vi.hoisted(() => ({
  bundledRuntimeMock: vi.fn(),
  createdTerminals: [] as any[],
  createTerminalMock: vi.fn((options: { name: string; env?: Record<string, string> }) => {
    const terminal = {
      name: options.name,
      env: options.env,
      show: vi.fn(),
      sendText: vi.fn(),
    };
    createdTerminals.push(terminal);
    return terminal;
  }),
}));

vi.mock('../core/bundledCliRuntime', () => ({
  resolveBundledCliRuntime: bundledRuntimeMock,
}));

vi.mock('vscode', () => ({
  window: {
    createTerminal: createTerminalMock,
  },
}));

import { resolveWorkspacePathForEvidenceTerminal } from '../core/evidenceTerminalTracker';
import { runRapidkitCommandsInTerminal } from '../utils/terminalExecutor';

describe('terminalExecutor evidence tracking', () => {
  beforeEach(() => {
    createdTerminals.length = 0;
    createTerminalMock.mockClear();
    bundledRuntimeMock.mockReset();
    bundledRuntimeMock.mockReturnValue(null);
  });

  it('records workspace path for workspace evidence commands created through the executor', () => {
    const terminal = runRapidkitCommandsInTerminal({
      name: 'Workspai: Readiness — team-ws',
      cwd: '/workspaces/team-ws',
      commands: [['readiness', '--json']],
    });

    expect(terminal).toBe(createdTerminals[0]);
    expect(createdTerminals[0].env).toEqual({ RAPIDKIT_LOG_FORMAT: 'json' });
    expect(createdTerminals[0].sendText).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/workspaces/team-ws')
    );
    expect(resolveWorkspacePathForEvidenceTerminal(terminal)).toBe('/workspaces/team-ws');
  });

  it('does not record project-scoped doctor terminals as workspace evidence terminals', () => {
    const terminal = runRapidkitCommandsInTerminal({
      name: 'Workspai: Doctor - api',
      cwd: '/workspaces/team-ws/api',
      commands: [['doctor', 'project']],
    });

    expect(createdTerminals[0].env).toBeUndefined();
    expect(createdTerminals[0].sendText).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/workspaces/team-ws/api')
    );
    expect(resolveWorkspacePathForEvidenceTerminal(terminal)).toBeUndefined();
  });

  it('shows a short Workspai command while binding the terminal to the embedded runtime', () => {
    bundledRuntimeMock.mockReturnValue({
      command: '/opt/vscode/code',
      entry: '/opt/workspai/runtime/launcher.cjs',
      terminalBin: '/opt/workspai/runtime/terminal-bin',
      terminalCommand: 'workspai',
    });

    runRapidkitCommandsInTerminal({
      name: 'Workspai: Doctor - team-ws',
      cwd: '/workspaces/team-ws',
      env: { PATH: '/usr/local/bin:/usr/bin' },
      commands: [['doctor', 'workspace', '--fix']],
    });

    expect(createdTerminals[0].env).toEqual({
      PATH: '/opt/workspai/runtime/terminal-bin:/usr/local/bin:/usr/bin',
      RAPIDKIT_LOG_FORMAT: 'json',
      WORKSPAI_EXTENSION_CLI_ENTRY: '/opt/workspai/runtime/launcher.cjs',
      WORKSPAI_EXTENSION_NODE: '/opt/vscode/code',
    });
    expect(createdTerminals[0].sendText).toHaveBeenNthCalledWith(
      2,
      'workspai doctor workspace --fix'
    );
    expect(createdTerminals[0].sendText).not.toHaveBeenCalledWith(
      expect.stringContaining('npx --yes --package')
    );
  });
});
