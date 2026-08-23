import { describe, expect, it } from 'vitest';

import { shouldAcceptWorkspaceGraphLiveUpdate } from '../../webview-ui/src/lib/workspaceGraphLiveGuard';

const cursor = {
  workspacePath: 'C:\\workspaces\\demo',
  sessionId: 'session:1',
  generation: 2,
  revision: 4,
};

describe('workspace graph live update guard', () => {
  it('accepts the current workspace and monotonic revisions across path separators', () => {
    expect(
      shouldAcceptWorkspaceGraphLiveUpdate({
        activeWorkspacePath: 'c:/workspaces/demo/',
        current: cursor,
        incoming: { ...cursor, workspacePath: 'c:/workspaces/demo', revision: 5 },
      })
    ).toBe(true);
  });

  it('rejects cross-workspace and out-of-order updates', () => {
    expect(
      shouldAcceptWorkspaceGraphLiveUpdate({
        activeWorkspacePath: '/workspaces/other',
        current: null,
        incoming: { ...cursor, workspacePath: '/workspaces/demo' },
      })
    ).toBe(false);
    expect(
      shouldAcceptWorkspaceGraphLiveUpdate({
        activeWorkspacePath: 'c:/workspaces/demo',
        current: cursor,
        incoming: { ...cursor, revision: 3 },
      })
    ).toBe(false);
  });

  it('preserves case-sensitive POSIX workspace identity', () => {
    expect(
      shouldAcceptWorkspaceGraphLiveUpdate({
        activeWorkspacePath: '/workspaces/Demo',
        current: null,
        incoming: { ...cursor, workspacePath: '/workspaces/demo' },
      })
    ).toBe(false);
  });
});
