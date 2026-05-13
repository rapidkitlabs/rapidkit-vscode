import { describe, expect, it } from 'vitest';

import {
  buildImpactScoreContractV1,
  IMPACT_SCORE_CONTRACT_MODEL_VERSION,
  IMPACT_SCORE_CONTRACT_SCHEMA_VERSION,
  scoreSystemGraphImpactDeterministic,
  type SystemGraphImpactQueryResult,
  type SystemGraphNode,
} from '../core/systemGraphIndexer';

type Scenario = {
  name: string;
  impactQuery: SystemGraphImpactQueryResult;
  doctorErrors: number;
  doctorWarnings: number;
  requiresImpactReview: boolean;
  requiresVerifyPath: boolean;
  riskClass:
    | 'informational'
    | 'non-mutating-executable'
    | 'guarded-mutating'
    | 'high-risk-mutating';
  expectScopeKnown: boolean;
  expectBoundaryPaths?: boolean;
  expectUnknownScopeBlock?: boolean;
  expectVerifyGapBlock?: boolean;
};

function n(
  id: string,
  type: SystemGraphNode['type'],
  filePath: string,
  confidence = 85,
  label = id
): SystemGraphNode {
  return {
    id,
    type,
    label,
    filePath,
    confidence,
  };
}

function q(input: {
  nodes: SystemGraphNode[];
  edges?: Array<{
    sourceId: string;
    targetId: string;
    relation: 'calls' | 'depends-on' | 'reads' | 'covered-by';
  }>;
  tests?: string[];
  modules?: string[];
  confidence?: number;
  unknownScope?: boolean;
}): SystemGraphImpactQueryResult {
  return {
    impactedNodes: input.nodes,
    impactedEdges: input.edges || [],
    candidateTests: input.tests || [],
    impactedModules: input.modules || [],
    confidence: input.confidence ?? 75,
    unknownScope: input.unknownScope ?? false,
  };
}

const scenarios: Scenario[] = [
  {
    name: 'checkout-auth cross-service call chain',
    impactQuery: q({
      nodes: [
        n('controller:orders', 'controller', 'src/orders/controllers/orderController.ts'),
        n('service:auth', 'service', 'src/auth/services/authService.ts'),
      ],
      edges: [{ sourceId: 'controller:orders', targetId: 'service:auth', relation: 'calls' }],
      tests: ['tests/orders/orderController.test.ts'],
      modules: ['orders', 'auth'],
    }),
    doctorErrors: 0,
    doctorWarnings: 1,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'guarded-mutating',
    expectScopeKnown: true,
  },
  {
    name: 'schema migration order-payments dependency',
    impactQuery: q({
      nodes: [
        n('service:orders', 'service', 'src/orders/services/orderService.ts'),
        n('datastore:billing', 'datastore', 'src/billing/repositories/billingRepo.ts'),
      ],
      edges: [{ sourceId: 'service:orders', targetId: 'datastore:billing', relation: 'reads' }],
      tests: ['tests/orders/migration.test.ts'],
      modules: ['orders', 'billing'],
    }),
    doctorErrors: 0,
    doctorWarnings: 2,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'high-risk-mutating',
    expectScopeKnown: true,
    expectBoundaryPaths: true,
  },
  {
    name: 'cache invalidation single-service hotfix',
    impactQuery: q({
      nodes: [n('service:cache', 'service', 'src/cache/services/cacheService.ts')],
      tests: ['tests/cache/cacheService.test.ts'],
      modules: ['cache'],
    }),
    doctorErrors: 0,
    doctorWarnings: 0,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'guarded-mutating',
    expectScopeKnown: true,
  },
  {
    name: 'unknown seed for risky mutation',
    impactQuery: q({ nodes: [], unknownScope: true }),
    doctorErrors: 0,
    doctorWarnings: 0,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'high-risk-mutating',
    expectScopeKnown: false,
    expectUnknownScopeBlock: true,
    expectVerifyGapBlock: true,
  },
  {
    name: 'no candidate tests for guarded mutation',
    impactQuery: q({
      nodes: [n('service:payments', 'service', 'src/payments/services/paymentService.ts')],
      modules: ['payments'],
      tests: [],
    }),
    doctorErrors: 0,
    doctorWarnings: 1,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'guarded-mutating',
    expectScopeKnown: true,
    expectVerifyGapBlock: true,
  },
  {
    name: 'doctor errors raise critical instability signal',
    impactQuery: q({
      nodes: [n('service:orders', 'service', 'src/orders/services/orderService.ts')],
      tests: ['tests/orders/orderService.test.ts'],
      modules: ['orders'],
    }),
    doctorErrors: 3,
    doctorWarnings: 1,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'high-risk-mutating',
    expectScopeKnown: true,
  },
  {
    name: 'runtime to datastore chain across order service',
    impactQuery: q({
      nodes: [
        n('route:orders', 'route', 'src/orders/routes/orderRoutes.ts'),
        n('service:orders', 'service', 'src/orders/services/orderService.ts'),
        n('datastore:orders', 'datastore', 'src/orders/repositories/orderRepo.ts'),
      ],
      edges: [
        { sourceId: 'route:orders', targetId: 'service:orders', relation: 'calls' },
        { sourceId: 'service:orders', targetId: 'datastore:orders', relation: 'reads' },
        { sourceId: 'route:orders', targetId: 'datastore:orders', relation: 'depends-on' },
      ],
      modules: ['orders'],
      tests: [],
    }),
    doctorErrors: 0,
    doctorWarnings: 0,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'guarded-mutating',
    expectScopeKnown: true,
    expectVerifyGapBlock: true,
  },
  {
    name: 'low-risk verify-ready endpoint adjustment',
    impactQuery: q({
      nodes: [n('route:health', 'route', 'src/health/routes/healthRoutes.ts')],
      modules: ['health'],
      tests: ['tests/health/healthRoutes.test.ts'],
    }),
    doctorErrors: 0,
    doctorWarnings: 0,
    requiresImpactReview: false,
    requiresVerifyPath: false,
    riskClass: 'non-mutating-executable',
    expectScopeKnown: true,
  },
  {
    name: 'three-service boundary propagation risk',
    impactQuery: q({
      nodes: [
        n('service:orders', 'service', 'src/orders/services/orderService.ts'),
        n('service:payments', 'service', 'src/payments/services/paymentService.ts'),
        n('service:notifications', 'service', 'src/notifications/services/notificationService.ts'),
      ],
      edges: [
        { sourceId: 'service:orders', targetId: 'service:payments', relation: 'calls' },
        { sourceId: 'service:payments', targetId: 'service:notifications', relation: 'calls' },
      ],
      modules: ['orders', 'payments', 'notifications'],
      tests: ['tests/orders/orderFlow.test.ts'],
    }),
    doctorErrors: 1,
    doctorWarnings: 1,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'high-risk-mutating',
    expectScopeKnown: true,
    expectBoundaryPaths: true,
  },
  {
    name: 'infra datastore dependency check',
    impactQuery: q({
      nodes: [
        n('service:api', 'service', 'src/api/services/apiService.ts'),
        n('infra:redis', 'infra-service', 'infra/docker/redis.yml'),
      ],
      edges: [{ sourceId: 'service:api', targetId: 'infra:redis', relation: 'reads' }],
      modules: ['api', 'infra'],
      tests: ['tests/api/redis.integration.test.ts'],
    }),
    doctorErrors: 0,
    doctorWarnings: 2,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'guarded-mutating',
    expectScopeKnown: true,
  },
  {
    name: 'datastore-only index update with tests',
    impactQuery: q({
      nodes: [n('datastore:orders', 'datastore', 'src/orders/repositories/orderRepo.ts')],
      modules: ['orders'],
      tests: ['tests/orders/orderRepo.test.ts'],
    }),
    doctorErrors: 0,
    doctorWarnings: 0,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'guarded-mutating',
    expectScopeKnown: true,
  },
  {
    name: 'controller refactor with stable coverage',
    impactQuery: q({
      nodes: [n('controller:users', 'controller', 'src/users/controllers/userController.ts')],
      modules: ['users'],
      tests: ['tests/users/userController.test.ts'],
    }),
    doctorErrors: 0,
    doctorWarnings: 0,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'guarded-mutating',
    expectScopeKnown: true,
  },
  {
    name: 'route-level tweak missing verify tests',
    impactQuery: q({
      nodes: [n('route:users', 'route', 'src/users/routes/userRoutes.ts')],
      modules: ['users'],
      tests: [],
    }),
    doctorErrors: 0,
    doctorWarnings: 0,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'guarded-mutating',
    expectScopeKnown: true,
    expectVerifyGapBlock: true,
  },
  {
    name: 'billing worker retry policy change',
    impactQuery: q({
      nodes: [
        n('service:billingWorker', 'service', 'src/billing/services/billingWorker.ts'),
        n('service:payments', 'service', 'src/payments/services/paymentService.ts'),
      ],
      edges: [
        { sourceId: 'service:billingWorker', targetId: 'service:payments', relation: 'depends-on' },
      ],
      modules: ['billing', 'payments'],
      tests: ['tests/billing/billingWorker.test.ts'],
    }),
    doctorErrors: 1,
    doctorWarnings: 0,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'high-risk-mutating',
    expectScopeKnown: true,
    expectBoundaryPaths: true,
  },
  {
    name: 'auth token rotation command route',
    impactQuery: q({
      nodes: [n('service:auth', 'service', 'src/auth/services/tokenRotation.ts')],
      modules: ['auth'],
      tests: ['tests/auth/tokenRotation.test.ts'],
    }),
    doctorErrors: 0,
    doctorWarnings: 1,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'guarded-mutating',
    expectScopeKnown: true,
  },
  {
    name: 'payment timeout hotfix under pressure',
    impactQuery: q({
      nodes: [
        n('route:checkout', 'route', 'src/orders/routes/checkout.ts'),
        n('service:payments', 'service', 'src/payments/services/paymentService.ts'),
      ],
      edges: [{ sourceId: 'route:checkout', targetId: 'service:payments', relation: 'calls' }],
      modules: ['orders', 'payments'],
      tests: ['tests/orders/checkout.integration.test.ts'],
    }),
    doctorErrors: 2,
    doctorWarnings: 1,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'high-risk-mutating',
    expectScopeKnown: true,
    expectBoundaryPaths: true,
  },
  {
    name: 'feature flag flip with low risk policy',
    impactQuery: q({
      nodes: [n('service:flags', 'service', 'src/config/services/featureFlags.ts')],
      modules: ['config'],
      tests: ['tests/config/featureFlags.test.ts'],
    }),
    doctorErrors: 0,
    doctorWarnings: 0,
    requiresImpactReview: false,
    requiresVerifyPath: false,
    riskClass: 'informational',
    expectScopeKnown: true,
  },
  {
    name: 'incident replay remediation patch',
    impactQuery: q({
      nodes: [n('service:replay', 'service', 'src/incident/services/replayService.ts')],
      modules: ['incident'],
      tests: ['tests/incident/replayService.test.ts'],
    }),
    doctorErrors: 0,
    doctorWarnings: 2,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'guarded-mutating',
    expectScopeKnown: true,
  },
  {
    name: 'multi-module schema and api change',
    impactQuery: q({
      nodes: [
        n('controller:orders', 'controller', 'src/orders/controllers/orderController.ts'),
        n('datastore:orders', 'datastore', 'src/orders/repositories/orderRepo.ts'),
        n('service:audit', 'service', 'src/audit/services/auditService.ts'),
      ],
      edges: [
        { sourceId: 'controller:orders', targetId: 'datastore:orders', relation: 'depends-on' },
        { sourceId: 'controller:orders', targetId: 'service:audit', relation: 'calls' },
      ],
      modules: ['orders', 'audit'],
      tests: ['tests/orders/schemaChange.test.ts'],
    }),
    doctorErrors: 1,
    doctorWarnings: 2,
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'high-risk-mutating',
    expectScopeKnown: true,
    expectBoundaryPaths: true,
  },
  {
    name: 'unknown scope non-mutating read-only diagnosis',
    impactQuery: q({ nodes: [], unknownScope: true }),
    doctorErrors: 0,
    doctorWarnings: 0,
    requiresImpactReview: false,
    requiresVerifyPath: false,
    riskClass: 'non-mutating-executable',
    expectScopeKnown: false,
  },
];

describe('impact score scenario matrix (E1.5)', () => {
  it('contains at least 20 incident/change scenarios', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(20);
  });

  it.each(scenarios)('validates scenario: $name', (scenario) => {
    const graphSnapshot = {
      scanRoot: '/workspace',
      supportedTopology: 'enterprise.backend',
      nodes: scenario.impactQuery.impactedNodes,
      edges: scenario.impactQuery.impactedEdges,
      scannedFileCount: scenario.impactQuery.impactedNodes.length,
      topModules: scenario.impactQuery.impactedModules.slice(0, 5),
      refreshMode: 'full' as const,
      changedFileCount: 0,
      generatedAt: Date.now(),
    };

    const score = scoreSystemGraphImpactDeterministic({
      impactQuery: scenario.impactQuery,
      graphSnapshot,
      doctorErrors: scenario.doctorErrors,
      doctorWarnings: scenario.doctorWarnings,
      requiresImpactReview: scenario.requiresImpactReview,
      requiresVerifyPath: scenario.requiresVerifyPath,
      riskClass: scenario.riskClass,
    });

    const contract = buildImpactScoreContractV1({
      impactQuery: scenario.impactQuery,
      scoring: score,
      graphSnapshot,
      generatedAt: '2026-05-12T00:00:00.000Z',
    });

    expect(contract.schemaVersion).toBe(IMPACT_SCORE_CONTRACT_SCHEMA_VERSION);
    expect(contract.scoringModelVersion).toBe(IMPACT_SCORE_CONTRACT_MODEL_VERSION);
    expect(contract.generatedAt).toBe('2026-05-12T00:00:00.000Z');
    expect(contract.signalCounts.impactedNodeCount).toBe(scenario.impactQuery.impactedNodes.length);
    expect(contract.signalCounts.impactedEdgeCount).toBe(scenario.impactQuery.impactedEdges.length);
    expect(contract.signalCounts.candidateTestCount).toBe(
      scenario.impactQuery.candidateTests.length
    );
    expect(contract.scopeKnown).toBe(scenario.expectScopeKnown);

    if (scenario.expectBoundaryPaths) {
      expect(contract.crossServiceBoundaryPaths.length).toBeGreaterThan(0);
    }

    if (scenario.expectUnknownScopeBlock) {
      expect(
        score.blockedReasons.some((reason) => /scope is unknown|scope is uncertain/i.test(reason))
      ).toBe(true);
    }

    if (scenario.expectVerifyGapBlock) {
      expect(
        score.blockedReasons.some((reason) => /verification path|candidate tests/i.test(reason))
      ).toBe(true);
    }
  });
});
