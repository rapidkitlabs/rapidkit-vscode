import { beforeEach, describe, expect, it, vi } from 'vitest';

const showWarningMessage = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
  window: { showWarningMessage },
}));

import {
  buildStudioToolApprovalDetail,
  requestVSCodeProofCarryingChangeResume,
  resetStudioToolApprovalCacheForTests,
  requestStudioToolApproval,
  requestVSCodeStudioToolApproval,
} from '../core/studioToolApproval.js';
import type { StudioAgentToolApprovalRequest } from '../core/studioAgentToolRegistry.js';

const request: StudioAgentToolApprovalRequest = {
  fingerprint: 'a'.repeat(64),
  title: 'Approve exact workspace command',
  summary: 'The command may update dependency state.',
  displayCommand: 'npm install',
  cwd: '/workspace/api',
  scope: 'project',
  reasons: ['The command may modify source files.'],
  execution: 'once',
  sessionId: 'session-1',
  requestId: 'request-1',
  toolCallId: 'tool-1',
  toolName: 'run-workspace-command',
  modelReason: 'Reconcile dependencies using the repository-native package manager.',
};

describe('Studio exact tool approval', () => {
  beforeEach(() => {
    showWarningMessage.mockReset();
    resetStudioToolApprovalCacheForTests();
  });

  it('shows the exact command, scope, working directory, and immutable boundary', () => {
    expect(buildStudioToolApprovalDetail(request)).toContain('Command: npm install');
    expect(buildStudioToolApprovalDetail(request)).toContain('Working directory: /workspace/api');
    expect(buildStudioToolApprovalDetail(request)).toContain('Scope: project');
    expect(buildStudioToolApprovalDetail(request)).toContain('exact immutable command fingerprint');
  });

  it('returns a matching one-time grant only after the explicit approval label is chosen', async () => {
    showWarningMessage.mockResolvedValueOnce('Run exact command once');

    await expect(requestVSCodeStudioToolApproval(request)).resolves.toEqual({
      approved: true,
      fingerprint: request.fingerprint,
      approvedBy: 'vscode:explicit-once-command-approval',
      execution: 'once',
    });
    expect(showWarningMessage).toHaveBeenCalledWith(
      request.title,
      expect.objectContaining({ modal: true, detail: expect.stringContaining('npm install') }),
      'Run exact command once'
    );
  });

  it('shares exact cache and persistence policy with an inline Studio presenter', async () => {
    const present = vi.fn(async () => 'once' as const);

    await expect(requestStudioToolApproval(request, present)).resolves.toEqual({
      approved: true,
      fingerprint: request.fingerprint,
      approvedBy: 'vscode:explicit-once-command-approval',
      execution: 'once',
    });
    expect(present).toHaveBeenCalledWith(request);
    expect(showWarningMessage).not.toHaveBeenCalled();
  });

  it('rejects an inline execution scope that is outside the immutable request', async () => {
    await expect(requestStudioToolApproval(request, async () => 'project')).resolves.toMatchObject({
      approved: false,
      fingerprint: request.fingerprint,
      approvedBy: 'vscode:invalid-command-approval-scope',
    });
  });

  it('returns a rejection without changing the requested fingerprint', async () => {
    showWarningMessage.mockResolvedValueOnce(undefined);

    await expect(requestVSCodeStudioToolApproval(request)).resolves.toEqual({
      approved: false,
      fingerprint: request.fingerprint,
      approvedBy: 'vscode:user-declined-command',
    });
  });

  it('reuses an exact session approval without showing another prompt', async () => {
    const scopedRequest = {
      ...request,
      allowedExecutions: ['once', 'session', 'project'] as const,
    };
    showWarningMessage.mockResolvedValueOnce('Allow exact command for this session');
    await expect(requestVSCodeStudioToolApproval(scopedRequest)).resolves.toMatchObject({
      approved: true,
      execution: 'session',
    });
    showWarningMessage.mockClear();
    await expect(requestVSCodeStudioToolApproval(scopedRequest)).resolves.toMatchObject({
      approved: true,
      execution: 'session',
      approvedBy: 'vscode:cached-session-command-approval',
    });
    expect(showWarningMessage).not.toHaveBeenCalled();
  });

  it('persists and reuses an exact project approval in workspace state', async () => {
    let values: unknown[] = [];
    const store = {
      get: vi.fn((_key: string, fallback: unknown[]) => values || fallback),
      update: vi.fn(async (_key: string, next: unknown[]) => {
        values = next;
      }),
    };
    const scopedRequest = {
      ...request,
      sessionId: 'project-session-1',
      allowedExecutions: ['once', 'session', 'project'] as const,
    };
    showWarningMessage.mockResolvedValueOnce('Trust exact command for this project');
    await expect(requestVSCodeStudioToolApproval(scopedRequest, store)).resolves.toMatchObject({
      approved: true,
      execution: 'project',
    });
    expect(store.update).toHaveBeenCalled();

    showWarningMessage.mockClear();
    await expect(
      requestVSCodeStudioToolApproval({ ...scopedRequest, sessionId: 'project-session-2' }, store)
    ).resolves.toMatchObject({
      approved: true,
      execution: 'project',
      approvedBy: 'vscode:persisted-project-command-approval',
    });
    expect(showWarningMessage).not.toHaveBeenCalled();
  });

  it('requires a fresh modal decision before resuming a blocked PCC ledger', async () => {
    showWarningMessage.mockResolvedValueOnce('Resume governed change');

    await expect(
      requestVSCodeProofCarryingChangeResume({
        changeId: 'change-extension01',
        state: 'blocked',
      })
    ).resolves.toMatchObject({
      approved: true,
      approvedBy: 'vscode:explicit-pcc-resume',
      reason: expect.stringContaining('explicitly approved'),
    });
    expect(showWarningMessage).toHaveBeenCalledWith(
      'Resume blocked Workspai change?',
      expect.objectContaining({
        modal: true,
        detail: expect.stringContaining('change-extension01'),
      }),
      'Resume governed change'
    );
  });
});
