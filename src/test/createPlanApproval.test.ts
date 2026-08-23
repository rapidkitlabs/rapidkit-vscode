import { describe, expect, it } from 'vitest';

import {
  CreatePlanApprovalStore,
  createPlanDigest,
  createScopeBinding,
  parseCreatePlanAuthorization,
} from '../core/createPlanApproval.js';

const plan = {
  type: 'project' as const,
  workspaceName: 'platform-wsp',
  framework: 'nextjs',
  kit: 'frontend.nextjs',
  projectName: 'storefront-app',
};

describe('Create plan approval boundary', () => {
  it('produces deterministic plan and scope digests', () => {
    expect(createPlanDigest({ b: 2, a: 1 })).toBe(createPlanDigest({ a: 1, b: 2 }));
    expect(createScopeBinding({ target: 'project', workspacePath: '$WORKSPACE_A' })).not.toBe(
      createScopeBinding({ target: 'project', workspacePath: '$WORKSPACE_B' })
    );
  });

  it('does not bind a new workspace plan to volatile sidebar scope', () => {
    expect(createScopeBinding({ target: 'workspace' })).toBe(
      createScopeBinding({ target: 'workspace', workspacePath: '$WORKSPACE_A' })
    );
    expect(createScopeBinding({ target: 'workspace', workspacePath: '$WORKSPACE_A' })).toBe(
      createScopeBinding({ target: 'workspace', workspacePath: '$WORKSPACE_B' })
    );

    const workspacePlan = { ...plan, type: 'workspace' as const };
    const store = new CreatePlanApprovalStore<typeof workspacePlan>();
    const authorization = store.issue({
      plan: workspacePlan,
      sessionId: 'session-1',
      scopeBinding: createScopeBinding({
        target: 'workspace',
        workspacePath: '$WORKSPACE_A',
      }),
    });
    expect(
      store.begin({
        authorization,
        sessionId: 'session-1',
        target: 'workspace',
        scopeBinding: createScopeBinding({
          target: 'workspace',
          workspacePath: '$WORKSPACE_B',
        }),
      })
    ).toMatchObject({ ok: true, plan: workspacePlan });
  });

  it('binds a project plan to its selected workspace', () => {
    expect(createScopeBinding({ target: 'project', workspacePath: '$WORKSPACE_A' })).toBe(
      createScopeBinding({ target: 'project', workspacePath: '$WORKSPACE_A/' })
    );
    expect(createScopeBinding({ target: 'project', workspacePath: '$WORKSPACE_A' })).not.toBe(
      createScopeBinding({ target: 'workspace', workspacePath: '$WORKSPACE_A' })
    );
  });

  it('binds execution to the immutable plan, session, and scope', () => {
    const store = new CreatePlanApprovalStore<typeof plan>();
    const scopeBinding = createScopeBinding({
      target: 'project',
      workspacePath: '$WORKSPACE_A',
    });
    const authorization = store.issue({
      plan,
      sessionId: 'session-1',
      scopeBinding,
      now: 1_000,
    });

    expect(parseCreatePlanAuthorization(authorization)).toEqual(authorization);
    expect(
      store.begin({
        authorization,
        sessionId: 'session-2',
        target: 'project',
        scopeBinding,
        now: 2_000,
      })
    ).toMatchObject({ ok: false, code: 'session-changed' });
    expect(
      store.begin({
        authorization,
        sessionId: 'session-1',
        target: 'project',
        scopeBinding: createScopeBinding({
          target: 'project',
          workspacePath: '$WORKSPACE_B',
        }),
        now: 2_000,
      })
    ).toMatchObject({ ok: false, code: 'destination-workspace-changed' });

    const accepted = store.begin({
      authorization,
      sessionId: 'session-1',
      target: 'project',
      scopeBinding,
      now: 2_000,
    });
    expect(accepted).toMatchObject({ ok: true, plan });
    if (accepted.ok) {
      accepted.plan.projectName = 'tampered';
    }
    expect(
      store.begin({
        authorization,
        sessionId: 'session-1',
        target: 'project',
        scopeBinding,
        now: 2_000,
      })
    ).toMatchObject({ ok: false, reason: 'This creation plan is already executing.' });
  });

  it('rejects changing a workspace plan into a project plan', () => {
    const workspacePlan = { ...plan, type: 'workspace' as const };
    const store = new CreatePlanApprovalStore<typeof workspacePlan>();
    const scopeBinding = createScopeBinding({ target: 'workspace' });
    const authorization = store.issue({
      plan: workspacePlan,
      sessionId: 'session-1',
      scopeBinding,
    });

    expect(
      store.begin({
        authorization,
        sessionId: 'session-1',
        target: 'project',
        scopeBinding: createScopeBinding({
          target: 'project',
          workspacePath: '$WORKSPACE_A',
        }),
      })
    ).toMatchObject({ ok: false, code: 'target-changed' });
  });

  it('permits a controlled retry but prevents replay after completion', () => {
    const store = new CreatePlanApprovalStore<typeof plan>();
    const scopeBinding = createScopeBinding({ target: 'project' });
    const authorization = store.issue({ plan, sessionId: 'session-1', scopeBinding });

    expect(
      store.begin({ authorization, sessionId: 'session-1', target: 'project', scopeBinding }).ok
    ).toBe(true);
    store.markRetryable(authorization.planId);
    expect(
      store.begin({ authorization, sessionId: 'session-1', target: 'project', scopeBinding }).ok
    ).toBe(true);
    store.complete(authorization.planId);
    expect(
      store.begin({ authorization, sessionId: 'session-1', target: 'project', scopeBinding })
    ).toMatchObject({ ok: false, reason: 'This creation plan has already completed.' });
  });

  it('invalidates older pending plans for the same session and scope', () => {
    const store = new CreatePlanApprovalStore<typeof plan>();
    const scopeBinding = createScopeBinding({
      target: 'project',
      workspacePath: '$WORKSPACE_A',
    });
    const first = store.issue({ plan, sessionId: 'session-1', scopeBinding, now: 1_000 });
    const second = store.issue({
      plan: { ...plan, projectName: 'storefront-v2' },
      sessionId: 'session-1',
      scopeBinding,
      now: 2_000,
    });

    expect(
      store.begin({
        authorization: first,
        sessionId: 'session-1',
        target: 'project',
        scopeBinding,
        now: 2_500,
      })
    ).toMatchObject({ ok: false, reason: expect.stringContaining('no longer active') });
    expect(
      store.begin({
        authorization: second,
        sessionId: 'session-1',
        target: 'project',
        scopeBinding,
        now: 2_500,
      }).ok
    ).toBe(true);
  });

  it('expires stale approvals and rejects malformed metadata', () => {
    const store = new CreatePlanApprovalStore<typeof plan>(1_000);
    const scopeBinding = createScopeBinding({ target: 'project' });
    const authorization = store.issue({
      plan,
      sessionId: 'session-1',
      scopeBinding,
      now: 1_000,
    });

    expect(
      store.begin({
        authorization,
        sessionId: 'session-1',
        target: 'project',
        scopeBinding,
        now: 2_001,
      })
    ).toMatchObject({ ok: false, reason: expect.stringContaining('expired') });
    expect(parseCreatePlanAuthorization({ ...authorization, planHash: 'invalid' })).toBeUndefined();
  });
});
