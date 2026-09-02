import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { describe, expect, it, vi } from 'vitest';

import { loadProofCarryingChangeProjection } from '../core/proofCarryingChangeProjection';

const changeId = 'change-pccdemo01';
const generatedAt = '2026-08-30T12:00:00.000Z';

function listResult() {
  return {
    schemaVersion: 'workspai.proof-carrying-change-list.v1',
    generatedAt,
    workspace: { name: 'demo' },
    changes: [
      {
        changeId,
        goalId: 'goal-demo',
        state: 'verifying',
        status: 'verified',
        createdAt: generatedAt,
        updatedAt: generatedAt,
        scope: { kind: 'workspace', values: ['demo'] },
        assurance: { passed: 4, total: 5 },
        blockers: [],
        capsuleArtifact: `.workspai/changes/${changeId}/capsule.json`,
        valid: true,
        errors: [],
      },
    ],
    summary: { total: 1, open: 1, blocked: 0, sealed: 0, aborted: 0, invalid: 0 },
  };
}

function statusResult() {
  return {
    schemaVersion: 'workspai.change-operation-result.v1',
    operation: 'status',
    changeId,
    state: 'verifying',
    capsule: {
      schemaVersion: 'workspai.proof-carrying-change-capsule.v1',
      changeId,
      goalId: 'goal-demo',
      generatedAt,
      status: 'verified',
      assurances: [
        { id: 'intent-bound', status: 'passed', summary: 'Intent is bound.' },
        { id: 'baseline-pinned', status: 'passed', summary: 'Baseline is pinned.' },
        { id: 'effects-receipted', status: 'passed', summary: 'Effects are receipted.' },
        {
          id: 'architecture-reobserved',
          status: 'passed',
          summary: 'Architecture was re-observed.',
        },
        {
          id: 'independently-verified',
          status: 'pending',
          summary: 'Independent verification is pending.',
        },
      ],
      remainingUncertainty: ['One Goal criterion is pending.'],
      deletedArtifacts: [
        {
          artifact: 'src/obsolete.ts',
          observedAt: generatedAt,
          digest: {
            algorithm: 'sha256',
            semantics: 'deletion-tombstone-v1',
            value: 'd'.repeat(64),
          },
        },
      ],
    },
    artifacts: {
      capsule: `.workspai/changes/${changeId}/capsule.json`,
      lease: `.workspai/changes/${changeId}/lease.json`,
      prediction: `.workspai/changes/${changeId}/prediction.json`,
      actualOverlay: `.workspai/changes/${changeId}/actual-overlay.json`,
      surpriseReport: `.workspai/changes/${changeId}/surprise-report.json`,
      transaction: `.workspai/decisions/${changeId}/transaction.json`,
      events: `.workspai/decisions/${changeId}/events.jsonl`,
    },
    nextActions: [`workspai change verify --change ${changeId} --json`],
  };
}

describe('Proof-Carrying Change extension projection', () => {
  it('loads the canonical list before opening the selected ledger-derived capsule', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ failed: false, result: listResult(), stdout: '', stderr: '' })
      .mockResolvedValueOnce({ failed: false, result: statusResult(), stdout: '', stderr: '' });

    const projection = await loadProofCarryingChangeProjection({
      workspacePath: '/workspace',
      run,
    });

    expect(run).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ command: ['change', 'list', '--json'] })
    );
    expect(run).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        command: ['change', 'status', '--change', changeId, '--json'],
      })
    );
    expect(projection.selected).toMatchObject({
      changeId,
      status: 'verified',
      artifacts: {
        capsule: `.workspai/changes/${changeId}/capsule.json`,
        actualOverlay: `.workspai/changes/${changeId}/actual-overlay.json`,
        surpriseReport: `.workspai/changes/${changeId}/surprise-report.json`,
        transaction: `.workspai/decisions/${changeId}/transaction.json`,
      },
      assurances: expect.arrayContaining([
        expect.objectContaining({ id: 'independently-verified', status: 'pending' }),
      ]),
      deletedArtifacts: [
        expect.objectContaining({ artifact: 'src/obsolete.ts', digest: 'd'.repeat(64) }),
      ],
    });
    expect(projection.availability).toBe('available');
  });

  it('fails closed instead of opening an invalid discovered capsule', async () => {
    const invalid = listResult();
    invalid.changes[0].valid = false;
    invalid.changes[0].status = 'invalid';
    invalid.changes[0].errors = ['Capsule digest mismatch.'];
    invalid.summary.invalid = 1;
    const run = vi.fn().mockResolvedValue({
      failed: false,
      result: invalid,
      stdout: '',
      stderr: '',
    });

    const projection = await loadProofCarryingChangeProjection({
      workspacePath: '/workspace',
      run,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(projection.selected).toBeNull();
    expect(projection.diagnostics).toContain(
      `${changeId} failed integrity validation and was not opened.`
    );
  });

  it('loads a bounded visual-only prediction, actual delta, and surprise projection', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-pcc-projection-'));
    try {
      const changeRoot = path.join(workspace, '.workspai', 'changes', changeId);
      await fs.ensureDir(changeRoot);
      await fs.writeJson(path.join(changeRoot, 'prediction.json'), {
        schemaVersion: 'workspai.predicted-architecture-change.v1',
        changeId,
        nonCanonical: true,
        proofEligible: false,
        predictedRisk: 'medium',
        operations: [{ operation: 'change', targetKind: 'entity', targetId: 'service:checkout' }],
      });
      await fs.writeJson(path.join(changeRoot, 'actual-overlay.json'), {
        schemaVersion: 'workspace-knowledge-graph-change-overlay.v1',
        impactedEntityIds: ['service:checkout', 'api:checkout'],
        summary: { risk: 'low', changedArtifacts: 2 },
      });
      await fs.writeJson(path.join(changeRoot, 'surprise-report.json'), {
        schemaVersion: 'workspai.architecture-surprise-report.v1',
        changeId,
        matched: [{ operation: 'change', targetKind: 'entity', targetId: 'service:checkout' }],
        unpredicted: [{ operation: 'add', targetKind: 'entity', targetId: 'api:checkout' }],
        missing: [],
        summary: { verdict: 'within-expectation' },
      });
      const run = vi
        .fn()
        .mockResolvedValueOnce({ failed: false, result: listResult(), stdout: '', stderr: '' })
        .mockResolvedValueOnce({ failed: false, result: statusResult(), stdout: '', stderr: '' });

      const projection = await loadProofCarryingChangeProjection({ workspacePath: workspace, run });

      expect(projection.selected?.graphChange).toEqual({
        prediction: {
          risk: 'medium',
          operations: [{ operation: 'change', targetKind: 'entity', targetId: 'service:checkout' }],
        },
        actual: {
          risk: 'low',
          impactedEntityIds: ['service:checkout', 'api:checkout'],
          changedArtifactCount: 2,
        },
        surprise: {
          verdict: 'within-expectation',
          matched: [{ operation: 'change', targetKind: 'entity', targetId: 'service:checkout' }],
          unpredicted: [{ operation: 'add', targetKind: 'entity', targetId: 'api:checkout' }],
          missing: [],
        },
      });
    } finally {
      await fs.remove(workspace);
    }
  });

  it('fails closed for graph artifacts that are not bound to the selected PCC contract', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-pcc-projection-invalid-'));
    try {
      const changeRoot = path.join(workspace, '.workspai', 'changes', changeId);
      await fs.ensureDir(changeRoot);
      await fs.writeJson(path.join(changeRoot, 'prediction.json'), {
        schemaVersion: 'workspai.predicted-architecture-change.v1',
        changeId: 'change-unrelated01',
        nonCanonical: true,
        proofEligible: false,
        predictedRisk: 'high',
        operations: [{ operation: 'change', targetKind: 'entity', targetId: 'service:wrong' }],
      });
      await fs.writeJson(path.join(changeRoot, 'actual-overlay.json'), {
        schemaVersion: 'unexpected.overlay.v0',
        impactedEntityIds: ['service:wrong'],
        summary: { risk: 'high', changedArtifacts: 99 },
      });
      await fs.writeJson(path.join(changeRoot, 'surprise-report.json'), {
        schemaVersion: 'workspai.architecture-surprise-report.v1',
        changeId: 'change-unrelated01',
        matched: [],
        unpredicted: [{ operation: 'change', targetKind: 'entity', targetId: 'service:wrong' }],
        missing: [],
        summary: { verdict: 'surprising' },
      });
      const run = vi
        .fn()
        .mockResolvedValueOnce({ failed: false, result: listResult(), stdout: '', stderr: '' })
        .mockResolvedValueOnce({ failed: false, result: statusResult(), stdout: '', stderr: '' });

      const projection = await loadProofCarryingChangeProjection({ workspacePath: workspace, run });

      expect(projection.selected?.graphChange).toEqual({
        prediction: null,
        actual: null,
        surprise: null,
      });
    } finally {
      await fs.remove(workspace);
    }
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a PCC graph artifact whose symlink resolves outside the workspace',
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-pcc-projection-link-'));
      const workspace = path.join(root, 'workspace');
      try {
        const changeRoot = path.join(workspace, '.workspai', 'changes', changeId);
        await fs.ensureDir(changeRoot);
        const escaped = path.join(root, 'escaped-prediction.json');
        await fs.writeJson(escaped, {
          schemaVersion: 'workspai.predicted-architecture-change.v1',
          changeId,
          nonCanonical: true,
          proofEligible: false,
          predictedRisk: 'high',
          operations: [{ operation: 'change', targetKind: 'entity', targetId: 'service:escaped' }],
        });
        await fs.symlink(escaped, path.join(changeRoot, 'prediction.json'));
        const run = vi
          .fn()
          .mockResolvedValueOnce({ failed: false, result: listResult(), stdout: '', stderr: '' })
          .mockResolvedValueOnce({ failed: false, result: statusResult(), stdout: '', stderr: '' });

        const projection = await loadProofCarryingChangeProjection({
          workspacePath: workspace,
          run,
        });

        expect(projection.selected?.graphChange.prediction).toBeNull();
      } finally {
        await fs.remove(root);
      }
    }
  );

  it('reports incompatible CLI output without reconstructing lifecycle from disk', async () => {
    const run = vi.fn().mockResolvedValue({
      failed: false,
      result: { schemaVersion: 'legacy.change-list.v0' },
      stdout: '',
      stderr: '',
    });

    const projection = await loadProofCarryingChangeProjection({
      workspacePath: '/workspace',
      run,
    });

    expect(projection.changes).toEqual([]);
    expect(projection.diagnostics[0]).toContain('published PCC v1 contract');
  });

  it('stays silent and unsupported when the bundled CLI predates PCC', async () => {
    const run = vi.fn().mockResolvedValue({
      failed: true,
      result: null,
      stdout: '',
      stderr: "error: unknown command 'change'",
    });

    const projection = await loadProofCarryingChangeProjection({
      workspacePath: '/workspace',
      run,
    });

    expect(projection.availability).toBe('unsupported');
    expect(projection.diagnostics).toEqual([]);
  });
});
