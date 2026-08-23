import { describe, expect, it } from 'vitest';

import {
  hashWorkspaceModelForGraphBinding,
  validateWorkspaceGraphArtifact,
} from '../core/workspaceGraphArtifactValidation.js';

function fixture() {
  const model = {
    schemaVersion: 'workspace-model.v1',
    generatedAt: '2026-08-23T00:00:00.000Z',
    workspace: { name: 'demo' },
    projects: [{ name: 'api', path: 'api', evidence: { ignored: true } }],
    validation: { status: 'passed', issues: [] },
  };
  const graph = {
    schemaVersion: 'workspace-knowledge-graph.v1',
    source: {
      hash: hashWorkspaceModelForGraphBinding(model),
      inputs: {
        schemaVersion: 'workspace-knowledge-graph-inputs.v1',
        scopes: [
          { kind: 'workspace', id: 'demo', truncated: false },
          { kind: 'project', id: 'api', truncated: false },
        ],
      },
    },
    workspace: { name: 'demo' },
    projectTopology: {},
    quality: {},
    entities: [],
    relations: [],
    proofs: [],
    providers: [],
    diagnostics: [],
  };
  return { model, graph };
}

describe('workspace graph artifact validation', () => {
  it('matches the published CLI workspace-model-structural-v1 hash semantics', () => {
    const model = {
      schemaVersion: 'workspace-model.v1',
      generatedAt: '2026-08-23T00:00:00Z',
      workspace: { name: 'demo' },
      projects: [{ name: 'api', path: 'api', evidence: { ignored: true } }],
      validation: {
        status: 'passed',
        issues: [
          { severity: 'warning', code: 'b', target: 'z', message: 'm' },
          { severity: 'error', code: 'a', target: 'y', message: 'n' },
        ],
      },
      projectTopology: { generatedAt: 'today', nodes: [], edges: [] },
      runId: 'ignored',
      evidence: { ignored: true },
    };
    expect(hashWorkspaceModelForGraphBinding(model)).toBe(
      '9e0f98d806b287f3f06921ab7133a39e9786c46f6e9bf53a788f05e914c90fd8'
    );
  });

  it('accepts a graph bound to the canonical model and complete scope inventory', () => {
    const { model, graph } = fixture();
    expect(validateWorkspaceGraphArtifact(graph, model)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it('rejects mismatched model binding, missing project scope, and stale proof', () => {
    const { model, graph } = fixture();
    graph.source.hash = 'f'.repeat(64);
    graph.source.inputs.scopes = [{ kind: 'workspace', id: 'demo', truncated: false }];
    graph.proofs = [{ id: 'proof:stale', freshness: 'stale' }];
    const result = validateWorkspaceGraphArtifact(graph, model);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('does not match');
    expect(result.errors.join('\n')).toContain('missing project api');
    expect(result.errors.join('\n')).toContain('proof(s) are stale');
  });
});
