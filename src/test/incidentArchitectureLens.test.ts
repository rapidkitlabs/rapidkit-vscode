import { describe, expect, it } from 'vitest';

import { buildIncidentArchitectureLens } from '../../webview-ui/src/lib/incidentArchitectureLens';

describe('incidentArchitectureLens', () => {
  it('builds a blocked architecture lens from graph, impact, predictive, and gate evidence', () => {
    const lens = buildIncidentArchitectureLens({
      graphSnapshot: {
        workspacePath: '/tmp/wsp',
        projectPath: '/tmp/wsp/orders-api',
        graphVersion: 'v1',
        nodes: [
          {
            id: 'service:orders',
            type: 'service',
            label: 'orders service',
            filePath: 'src/orders/service.ts',
            confidence: 92,
          },
          {
            id: 'controller:orders',
            type: 'controller',
            label: 'orders controller',
            filePath: 'src/orders/controller.ts',
            confidence: 84,
          },
        ],
        edges: [
          {
            sourceId: 'controller:orders',
            targetId: 'service:orders',
            relation: 'depends-on',
          },
        ],
        summary: {
          nodeCount: 2,
          edgeCount: 1,
          supportedTopology: 'springboot.enterprise',
        },
      },
      impactAssessment: {
        requestId: 'impact-1',
        sources: ['system-graph', 'doctor'],
        confidence: 81,
        riskLevel: 'high',
        affectedFiles: ['src/orders/service.ts', 'src/orders/controller.ts'],
        affectedModules: ['orders', 'billing'],
        affectedTests: ['tests/orders.service.spec.ts'],
        likelyFailureMode: 'authorization flow may fail across the orders boundary',
        rationale: ['Orders depends on billing during auth checks.'],
        verifyChecklist: ['Run doctor checks', 'Run orders integration tests'],
        blockMutationWhenScopeUnknown: true,
        impactScoreContract: {
          schemaVersion: 'e1-impact-score-contract.v1',
          scoringModelVersion: 'c11-deterministic.v1',
          scopeModelVersion: 'graph-seed-scope.v1',
          generatedAt: '2026-05-12T00:00:00.000Z',
          supportedTopology: 'springboot.enterprise',
          scopeKnown: false,
          confidence: 86,
          riskLevel: 'high',
          impactedModules: ['orders', 'billing'],
          candidateTests: ['tests/orders.service.spec.ts'],
          crossServiceBoundaryPaths: ['orders -> billing'],
          signalCounts: {
            impactedNodeCount: 2,
            impactedEdgeCount: 1,
            impactedModuleCount: 2,
            candidateTestCount: 1,
            crossServiceBoundaryCount: 1,
          },
          blockedReasons: ['Scope is uncertain'],
          architectureWarnings: ['Cross-boundary mutation risk'],
          likelyFailureMode: 'authorization flow may fail across the orders boundary',
        },
      },
      predictiveWarning: {
        requestId: 'pred-1',
        warningId: 'warn-1',
        confidenceBand: 'high',
        predictedFailure: 'Likely downstream auth regression during checkout.',
        affectedScopeSummary: 'orders, billing',
        nextSafeAction: 'Run change-impact-lite and verify before apply.',
        verifyChecklist: ['Run doctor checks'],
        telemetrySeed: {
          predictionKey: 'pred-orders-auth',
          evidenceSources: ['system-graph', 'doctor-evidence'],
        },
      },
      releaseGateEvidence: {
        requestId: 'gate-1',
        scopeKnown: false,
        verifyPathPresent: true,
        rollbackPathPresent: false,
        confidenceSufficient: true,
        blockedReasons: [
          'Scope is uncertain. Ask for clarification before mutation recommendation.',
          'Rollback path is unavailable for this risk class.',
        ],
      },
    });

    expect(lens).not.toBeNull();
    expect(lens?.blocked).toBe(true);
    expect(lens?.title).toBe('Architecture lens: review before mutation');
    expect(lens?.statusLabel).toContain('Blocked');
    expect(lens?.statusLabel).toContain('high confidence');
    expect(lens?.confidenceLabel).toBe('high');
    expect(lens?.confidenceSummary).toBe('high confidence (86%)');
    expect(lens?.impactContractTag).toContain('e1-impact-score-contract.v1');
    expect(lens?.graphSummary).toBe('springboot.enterprise · 2 nodes · 1 edges');
    expect(lens?.headline).toContain('authorization flow may fail');
    expect(lens?.reasons).toEqual(
      expect.arrayContaining([
        'Orders depends on billing during auth checks.',
        'Signals: system-graph, doctor-evidence',
      ])
    );
    expect(lens?.verifyChecklist).toEqual(['Run doctor checks', 'Run orders integration tests']);
    expect(lens?.focusNodes[0]).toEqual(
      expect.objectContaining({
        label: 'orders service',
        type: 'Service',
        filePath: 'src/orders/service.ts',
      })
    );
    expect(lens?.blockedReasons).toHaveLength(2);
    expect(lens?.nextSafeAction).toBe('Run change-impact-lite and verify before apply.');
  });

  it('falls back to graph readiness when impact evidence is not available yet', () => {
    const lens = buildIncidentArchitectureLens({
      graphSnapshot: {
        workspacePath: '/tmp/wsp',
        graphVersion: 'v1',
        nodes: [],
        edges: [],
        summary: {
          nodeCount: 0,
          edgeCount: 0,
          supportedTopology: 'fastapi.standard',
        },
      },
    });

    expect(lens).not.toBeNull();
    expect(lens?.blocked).toBe(false);
    expect(lens?.title).toBe('Architecture lens: system graph loaded');
    expect(lens?.confidenceSummary).toBe('low confidence (0%)');
    expect(lens?.headline).toBe(
      'System graph evidence is ready for architecture-aware impact review.'
    );
    expect(lens?.graphSummary).toBe('fastapi.standard · 0 nodes · 0 edges');
    expect(lens?.verifyChecklist).toEqual([]);
  });
});
