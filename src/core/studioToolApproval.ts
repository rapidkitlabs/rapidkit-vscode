import * as vscode from 'vscode';

import type {
  StudioAgentApprovalExecution,
  StudioAgentToolApprovalDecision,
  StudioAgentToolApprovalRequest,
} from './studioAgentToolRegistry.js';
import type { StudioProofCarryingChangeResumeDecision } from './studioProofCarryingChange.js';

const APPROVE_ONCE_LABEL = 'Run exact command once';
const APPROVE_SESSION_LABEL = 'Allow exact command for this session';
const APPROVE_PROJECT_LABEL = 'Trust exact command for this project';
const PROJECT_APPROVAL_STORAGE_KEY = 'workspai.studio.project-command-approvals.v1';
const PROJECT_APPROVAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const sessionApprovals = new Set<string>();
const RESUME_CHANGE_LABEL = 'Resume governed change';

export function resetStudioToolApprovalCacheForTests(): void {
  sessionApprovals.clear();
}

type StoredProjectApproval = {
  fingerprint: string;
  approvedAt: string;
  displayCommand?: string;
  cwd?: string;
};

type StudioToolApprovalStore = Pick<vscode.Memento, 'get' | 'update'>;

export type StudioToolApprovalPresenter = (
  request: StudioAgentToolApprovalRequest
) => Promise<StudioAgentApprovalExecution | undefined>;

function approvalCacheKey(request: StudioAgentToolApprovalRequest): string {
  return `${request.sessionId}:${request.fingerprint}`;
}

function allowedExecution(
  request: StudioAgentToolApprovalRequest,
  execution: StudioAgentApprovalExecution
): boolean {
  return (request.allowedExecutions ?? [request.execution]).includes(execution);
}

function storedProjectApprovals(store?: StudioToolApprovalStore): StoredProjectApproval[] {
  const cutoff = Date.now() - PROJECT_APPROVAL_MAX_AGE_MS;
  return (store?.get<StoredProjectApproval[]>(PROJECT_APPROVAL_STORAGE_KEY, []) ?? []).filter(
    (entry) =>
      Number.isFinite(Date.parse(entry.approvedAt)) && Date.parse(entry.approvedAt) >= cutoff
  );
}

export async function clearStoredStudioToolApprovals(
  store: StudioToolApprovalStore
): Promise<void> {
  sessionApprovals.clear();
  await store.update(PROJECT_APPROVAL_STORAGE_KEY, []);
}

/**
 * Human boundary for a durable PCC state transition. This decision is never
 * cached: each blocked ledger head requires a fresh, visible acknowledgement.
 */
export async function requestVSCodeProofCarryingChangeResume(input: {
  changeId: string;
  state: 'blocked' | 'awaiting-human';
}): Promise<StudioProofCarryingChangeResumeDecision> {
  const selection = await vscode.window.showWarningMessage(
    'Resume blocked Workspai change?',
    {
      modal: true,
      detail: [
        `Change: ${input.changeId}`,
        `Decision state: ${input.state}`,
        '',
        'The existing tamper-evident ledger will be resumed. Prior history is preserved, and every later effect must still be receipted and independently verified before the change can be sealed.',
      ].join('\n'),
    },
    RESUME_CHANGE_LABEL
  );
  return {
    approved: selection === RESUME_CHANGE_LABEL,
    approvedBy:
      selection === RESUME_CHANGE_LABEL
        ? 'vscode:explicit-pcc-resume'
        : 'vscode:user-declined-pcc-resume',
    ...(selection === RESUME_CHANGE_LABEL
      ? {
          reason:
            'User explicitly approved resuming the blocked governed change from Workspai Studio.',
        }
      : {}),
  };
}

export function buildStudioToolApprovalDetail(request: StudioAgentToolApprovalRequest): string {
  return [
    request.summary,
    '',
    `Command: ${request.displayCommand ?? request.toolName}`,
    ...(request.cwd ? [`Working directory: ${request.cwd}`] : []),
    `Scope: ${request.scope}`,
    `Requested because: ${request.modelReason}`,
    '',
    ...request.reasons.map((reason) => `• ${reason}`),
    '',
    'Every option remains bound to the exact immutable command fingerprint shown here. Session approval expires with this Studio session; project approval is stored in VS Code workspace state. Shell execution, privilege escalation, secret forwarding, and workspace escapes remain blocked.',
  ].join('\n');
}

/**
 * VS Code-owned approval boundary for dynamically classified Studio tools.
 * Returning the request fingerprint is deliberate: StudioAgentSession rejects
 * any decision that does not authorize the exact immutable proposal.
 */
export async function requestStudioToolApproval(
  request: StudioAgentToolApprovalRequest,
  present: StudioToolApprovalPresenter,
  store?: StudioToolApprovalStore
): Promise<StudioAgentToolApprovalDecision> {
  if (allowedExecution(request, 'session') && sessionApprovals.has(approvalCacheKey(request))) {
    return {
      approved: true,
      fingerprint: request.fingerprint,
      approvedBy: 'vscode:cached-session-command-approval',
      execution: 'session',
    };
  }
  if (
    allowedExecution(request, 'project') &&
    storedProjectApprovals(store).some((entry) => entry.fingerprint === request.fingerprint)
  ) {
    return {
      approved: true,
      fingerprint: request.fingerprint,
      approvedBy: 'vscode:persisted-project-command-approval',
      execution: 'project',
    };
  }
  const execution = await present(request);
  if (execution && (!allowedExecution(request, execution) || (execution === 'project' && !store))) {
    return {
      approved: false,
      fingerprint: request.fingerprint,
      approvedBy: 'vscode:invalid-command-approval-scope',
    };
  }
  if (execution === 'session') {
    sessionApprovals.add(approvalCacheKey(request));
  } else if (execution === 'project' && store) {
    const retained = storedProjectApprovals(store)
      .filter((entry) => entry.fingerprint !== request.fingerprint)
      .slice(-99);
    await store.update(PROJECT_APPROVAL_STORAGE_KEY, [
      ...retained,
      {
        fingerprint: request.fingerprint,
        approvedAt: new Date().toISOString(),
        ...(request.displayCommand ? { displayCommand: request.displayCommand } : {}),
        ...(request.cwd ? { cwd: request.cwd } : {}),
      },
    ] satisfies StoredProjectApproval[]);
  }
  return {
    approved: Boolean(execution),
    fingerprint: request.fingerprint,
    approvedBy: execution
      ? `vscode:explicit-${execution}-command-approval`
      : 'vscode:user-declined-command',
    ...(execution ? { execution } : {}),
  };
}

/**
 * Native VS Code fallback for hosts that cannot render the approval request in
 * their own conversation surface. Workspai Studio uses the same policy/cache
 * owner with an inline presenter instead of opening this modal.
 */
export async function requestVSCodeStudioToolApproval(
  request: StudioAgentToolApprovalRequest,
  store?: StudioToolApprovalStore
): Promise<StudioAgentToolApprovalDecision> {
  return requestStudioToolApproval(
    request,
    async (approvalRequest) => {
      const choices = [
        ...(allowedExecution(request, 'once') ? [APPROVE_ONCE_LABEL] : []),
        ...(allowedExecution(request, 'session') ? [APPROVE_SESSION_LABEL] : []),
        ...(allowedExecution(request, 'project') && store ? [APPROVE_PROJECT_LABEL] : []),
      ];
      const selection = await vscode.window.showWarningMessage(
        approvalRequest.title,
        {
          modal: true,
          detail: buildStudioToolApprovalDetail(approvalRequest),
        },
        ...choices
      );
      return selection === APPROVE_ONCE_LABEL
        ? 'once'
        : selection === APPROVE_SESSION_LABEL
          ? 'session'
          : selection === APPROVE_PROJECT_LABEL
            ? 'project'
            : undefined;
    },
    store
  );
}
