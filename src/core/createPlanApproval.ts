import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

export type CreatePlanTarget = 'workspace' | 'project';

export type CreatePlanAuthorization = {
  schemaVersion: 'workspai.create-plan-authorization.v1';
  planId: string;
  planHash: string;
  issuedAt: string;
  expiresAt: string;
};

type PendingPlan<TPlan> = {
  authorization: CreatePlanAuthorization;
  sessionId: string;
  target: CreatePlanTarget;
  scopeBinding: string;
  plan: TPlan;
  state: 'pending' | 'executing' | 'retryable' | 'complete';
};

export type CreatePlanApprovalResult<TPlan> =
  | { ok: true; plan: TPlan; authorization: CreatePlanAuthorization }
  | {
      ok: false;
      code:
        | 'authorization-missing'
        | 'authorization-expired'
        | 'authorization-mismatch'
        | 'session-changed'
        | 'target-changed'
        | 'destination-workspace-changed'
        | 'already-executing'
        | 'already-complete'
        | 'integrity-failed';
      reason: string;
    };

export function parseCreatePlanAuthorization(value: unknown): CreatePlanAuthorization | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Partial<CreatePlanAuthorization>;
  if (
    candidate.schemaVersion !== 'workspai.create-plan-authorization.v1' ||
    typeof candidate.planId !== 'string' ||
    !/^create_[a-f0-9]{32}$/.test(candidate.planId) ||
    typeof candidate.planHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(candidate.planHash) ||
    typeof candidate.issuedAt !== 'string' ||
    !Number.isFinite(Date.parse(candidate.issuedAt)) ||
    typeof candidate.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(candidate.expiresAt))
  ) {
    return undefined;
  }
  return candidate as CreatePlanAuthorization;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
}

export function createPlanDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function normalizeWorkspaceBindingPath(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = path.resolve(trimmed);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/**
 * Bind approval only to state that can alter the requested mutation boundary.
 * A new workspace has no dependency on the currently selected workspace or
 * project. A new project is bound to exactly one selected workspace; the
 * selected project is intentionally irrelevant because a new sibling is being
 * created.
 */
export function createScopeBinding(input: {
  target: CreatePlanTarget;
  workspacePath?: string;
}): string {
  return createPlanDigest({
    target: input.target,
    workspacePath:
      input.target === 'project' ? normalizeWorkspaceBindingPath(input.workspacePath) : null,
  });
}

export class CreatePlanApprovalStore<TPlan extends { type: CreatePlanTarget }> {
  private readonly pending = new Map<string, PendingPlan<TPlan>>();

  constructor(private readonly ttlMs = 30 * 60 * 1_000) {}

  issue(input: {
    plan: TPlan;
    sessionId: string;
    scopeBinding: string;
    now?: number;
  }): CreatePlanAuthorization {
    this.prune(input.now);
    for (const [planId, entry] of this.pending) {
      if (
        entry.sessionId === input.sessionId &&
        entry.scopeBinding === input.scopeBinding &&
        entry.state !== 'executing'
      ) {
        this.pending.delete(planId);
      }
    }
    const now = input.now ?? Date.now();
    const authorization: CreatePlanAuthorization = {
      schemaVersion: 'workspai.create-plan-authorization.v1',
      planId: `create_${randomUUID().replace(/-/g, '')}`,
      planHash: createPlanDigest(input.plan),
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlMs).toISOString(),
    };
    this.pending.set(authorization.planId, {
      authorization,
      sessionId: input.sessionId,
      target: input.plan.type,
      scopeBinding: input.scopeBinding,
      plan: structuredClone(input.plan),
      state: 'pending',
    });
    return authorization;
  }

  begin(input: {
    authorization: CreatePlanAuthorization | undefined;
    sessionId: string;
    target: CreatePlanTarget;
    scopeBinding: string;
    now?: number;
  }): CreatePlanApprovalResult<TPlan> {
    this.prune(input.now);
    const authorization = input.authorization;
    if (!authorization) {
      return {
        ok: false,
        code: 'authorization-missing',
        reason: 'The creation plan has no controller authorization. Draft it again.',
      };
    }
    const entry = this.pending.get(authorization.planId);
    if (!entry) {
      return {
        ok: false,
        code: 'authorization-expired',
        reason: 'The creation plan expired or is no longer active. Draft it again.',
      };
    }
    if (
      entry.authorization.planHash !== authorization.planHash ||
      entry.authorization.issuedAt !== authorization.issuedAt ||
      entry.authorization.expiresAt !== authorization.expiresAt
    ) {
      return {
        ok: false,
        code: 'authorization-mismatch',
        reason: 'The creation plan authorization changed. Draft it again.',
      };
    }
    if (entry.sessionId !== input.sessionId) {
      return {
        ok: false,
        code: 'session-changed',
        reason: 'This plan belongs to another Create session. Draft it again in this session.',
      };
    }
    if (entry.target !== input.target) {
      return {
        ok: false,
        code: 'target-changed',
        reason: 'The Create target changed after this plan was drafted. Draft it again.',
      };
    }
    if (entry.scopeBinding !== input.scopeBinding) {
      return {
        ok: false,
        code: 'destination-workspace-changed',
        reason:
          'The active workspace changed after this project plan was drafted. Select the intended workspace and draft the plan again.',
      };
    }
    if (entry.state === 'executing') {
      return {
        ok: false,
        code: 'already-executing',
        reason: 'This creation plan is already executing.',
      };
    }
    if (entry.state === 'complete') {
      return {
        ok: false,
        code: 'already-complete',
        reason: 'This creation plan has already completed.',
      };
    }
    if (createPlanDigest(entry.plan) !== entry.authorization.planHash) {
      this.pending.delete(authorization.planId);
      return {
        ok: false,
        code: 'integrity-failed',
        reason: 'The stored creation plan failed its integrity check. Draft it again.',
      };
    }
    entry.state = 'executing';
    return {
      ok: true,
      plan: structuredClone(entry.plan),
      authorization: entry.authorization,
    };
  }

  markRetryable(planId: string): void {
    const entry = this.pending.get(planId);
    if (entry?.state === 'executing') {
      entry.state = 'retryable';
    }
  }

  complete(planId: string): void {
    const entry = this.pending.get(planId);
    if (entry) {
      entry.state = 'complete';
    }
  }

  private prune(nowValue?: number): void {
    const now = nowValue ?? Date.now();
    for (const [planId, entry] of this.pending) {
      if (Date.parse(entry.authorization.expiresAt) <= now) {
        this.pending.delete(planId);
      }
    }
  }
}
