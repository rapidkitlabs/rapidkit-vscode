import { describe, expect, it } from 'vitest';

import { buildIncidentArchitectureLens } from '../../webview-ui/src/lib/incidentArchitectureLens';
import { buildIncidentArchitectureNavigator } from '../../webview-ui/src/lib/incidentImpactNavigator';

describe('incidentImpactNavigator', () => {
  it('builds actionable navigator sections for modules, files, tests, and graph focus', () => {
    const lens = buildIncidentArchitectureLens({
      graphSnapshot: {
        workspacePath: '/tmp/wsp',
        projectPath: '/tmp/wsp/orders-api',
        graphVersion: 'v1',
        nodes: [
          {
            id: 'service:orders',
            type: 'service',
            label: 'OrdersService',
            filePath: 'src/orders/service.ts',
            confidence: 92,
            symbolName: 'OrdersService',
            startLine: 12,
          },
        ],
        edges: [],
        summary: {
          nodeCount: 1,
          edgeCount: 0,
          supportedTopology: 'nestjs.standard',
        },
      },
      impactAssessment: {
        requestId: 'impact-1',
        sources: ['system-graph'],
        confidence: 79,
        riskLevel: 'medium',
        affectedFiles: ['src/orders/service.ts', 'src/orders/controller.ts'],
        affectedModules: ['orders'],
        affectedTests: ['tests/orders.service.spec.ts'],
        rationale: ['Orders controller depends on orders service.'],
        verifyChecklist: ['Run orders service tests'],
        blockMutationWhenScopeUnknown: true,
      },
    });

    const sections = buildIncidentArchitectureNavigator(lens);

    expect(sections.map((section) => section.id)).toEqual(['modules', 'files', 'tests', 'nodes']);
    expect(sections[0]?.items[0]).toMatchObject({
      kind: 'module',
      action: 'query',
      label: 'orders',
    });
    expect(sections[1]?.items[0]).toMatchObject({
      kind: 'file',
      action: 'open',
      targetPath: 'src/orders/service.ts',
    });
    expect(sections[2]?.items[0]).toMatchObject({
      kind: 'test',
      action: 'open',
      targetPath: 'tests/orders.service.spec.ts',
    });
    expect(sections[3]?.items[0]).toMatchObject({
      kind: 'node',
      action: 'open',
      label: 'OrdersService',
      targetPath: 'src/orders/service.ts',
      symbolName: 'OrdersService',
      startLine: 12,
    });
  });
});
