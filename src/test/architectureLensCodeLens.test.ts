import { describe, expect, it } from 'vitest';

import { buildArchitectureCodeLensSummary } from '../providers/architectureLensCodeLens';

describe('architectureLensCodeLens', () => {
  it('builds graph-backed code lens titles and seed text', () => {
    const summary = buildArchitectureCodeLensSummary({
      filePath: '/tmp/wsp/orders/service.ts',
      graphSnapshot: {
        scanRoot: '/tmp/wsp',
        supportedTopology: 'fastapi.standard',
        nodes: [
          {
            id: 'service:orders/service.ts',
            type: 'service',
            label: 'orders service',
            filePath: 'orders/service.ts',
            confidence: 88,
          },
          {
            id: 'test:tests/orders.spec.ts',
            type: 'test',
            label: 'orders tests',
            filePath: 'tests/orders.spec.ts',
            confidence: 80,
          },
        ],
        edges: [
          {
            sourceId: 'service:orders/service.ts',
            targetId: 'test:tests/orders.spec.ts',
            relation: 'covered-by',
          },
        ],
        scannedFileCount: 12,
        topModules: ['orders', 'billing'],
        refreshMode: 'incremental',
        changedFileCount: 1,
        generatedAt: Date.now(),
      },
      impactQuery: {
        impactedNodes: [
          {
            id: 'service:orders/service.ts',
            type: 'service',
            label: 'orders service',
            filePath: 'orders/service.ts',
            confidence: 88,
          },
          {
            id: 'test:tests/orders.spec.ts',
            type: 'test',
            label: 'orders tests',
            filePath: 'tests/orders.spec.ts',
            confidence: 80,
          },
        ],
        impactedEdges: [
          {
            sourceId: 'service:orders/service.ts',
            targetId: 'test:tests/orders.spec.ts',
            relation: 'covered-by',
          },
        ],
        candidateTests: ['tests/orders.spec.ts'],
        impactedModules: ['orders', 'billing'],
        confidence: 82,
        unknownScope: false,
      },
      score: {
        confidence: 84,
        riskLevel: 'high',
        scopeKnown: true,
        likelyFailureMode: 'High dependency blast radius can propagate breakage across services.',
        rationale: [
          'Multiple dependency edges are affected by current scope.',
          'Candidate tests are available for impact verification.',
        ],
        blockedReasons: ['Review impact before mutation.'],
      },
    });

    expect(summary.title).toBe('Workspai: Impact HIGH • 2 modules • 1 test');
    expect(summary.auxiliaryTitle).toBe('Workspai: Scope orders, billing • 84% confidence');
    expect(summary.seedText).toContain('Seed file: orders/service.ts');
    expect(summary.seedText).toContain('Predicted risk: high (84% confidence)');
    expect(summary.seedText).toContain('Affected modules: orders, billing');
    expect(summary.seedText).toContain('Candidate tests: tests/orders.spec.ts');
    expect(summary.seedText).toContain('Blocked reasons: Review impact before mutation.');
    expect(summary.seedText).toContain('Decision Clarity Contract (required):');
    expect(summary.seedText).toContain('6) Verify plan: exact command(s) and execution directory.');
    expect(summary.seedText).toContain('7) Rollback plan: how to undo or back out');
  });

  it('falls back to scope review wording when impact modules are missing', () => {
    const summary = buildArchitectureCodeLensSummary({
      filePath: '/tmp/wsp/app/main.py',
      graphSnapshot: {
        scanRoot: '/tmp/wsp',
        supportedTopology: 'python.custom',
        nodes: [],
        edges: [],
        scannedFileCount: 1,
        topModules: [],
        refreshMode: 'full',
        changedFileCount: 1,
        generatedAt: Date.now(),
      },
      impactQuery: {
        impactedNodes: [],
        impactedEdges: [],
        candidateTests: [],
        impactedModules: [],
        confidence: 40,
        unknownScope: false,
      },
      score: {
        confidence: 45,
        riskLevel: 'medium',
        scopeKnown: false,
        rationale: [],
        blockedReasons: [],
      },
    });

    expect(summary.auxiliaryTitle).toBe('Workspai: Scope scope needs review • 45% confidence');
    expect(summary.seedText).toContain('Affected modules: unknown');
    expect(summary.seedText).toContain('Candidate tests: none found yet');
  });
});
