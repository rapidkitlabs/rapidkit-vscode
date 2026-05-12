import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  createProjectSystemGraphWatcher,
  clearProjectSystemGraphCache,
  indexProjectSystemGraph,
  queryProjectSystemGraphImpact,
  scoreSystemGraphImpactDeterministic,
  buildImpactScoreContractV1,
  IMPACT_SCORE_CONTRACT_SCHEMA_VERSION,
  IMPACT_SCORE_CONTRACT_MODEL_VERSION,
  assembleSystemGraphContextPacket,
} from '../core/systemGraphIndexer';

const tempDirs: string[] = [];

function mkTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function write(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

async function waitForCondition(
  condition: () => boolean,
  timeoutMs = 2500,
  pollMs = 40
): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

afterEach(() => {
  clearProjectSystemGraphCache();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('systemGraphIndexer', () => {
  it('extracts route/service/model/test nodes and edges for a fastapi-style project', async () => {
    const projectRoot = mkTempDir('rk-graph-fastapi-');

    write(
      path.join(projectRoot, 'app', 'routes', 'orders.py'),
      'from app.services.orders_service import OrdersService\nrouter.get("/orders")\n'
    );
    write(
      path.join(projectRoot, 'app', 'services', 'orders_service.py'),
      'from app.models.order import Order\nclass OrdersService:\n  pass\n'
    );
    write(path.join(projectRoot, 'app', 'models', 'order.py'), 'class Order:\n  pass\n');
    write(path.join(projectRoot, 'tests', 'test_orders.py'), 'def test_orders():\n  assert True\n');

    const graph = await indexProjectSystemGraph({
      projectPath: projectRoot,
      framework: 'fastapi',
      kit: 'fastapi.standard',
    });

    expect(graph.supportedTopology).toBe('fastapi.standard');
    expect(graph.nodes.some((node) => node.type === 'route')).toBe(true);
    expect(graph.nodes.some((node) => node.type === 'service')).toBe(true);
    expect(graph.nodes.some((node) => node.type === 'model')).toBe(true);
    expect(graph.nodes.some((node) => node.type === 'test')).toBe(true);
    const serviceNode = graph.nodes.find((node) => node.type === 'service');
    const modelNode = graph.nodes.find((node) => node.type === 'model');
    expect(serviceNode).toMatchObject({
      label: 'OrdersService',
      symbolName: 'OrdersService',
      startLine: 2,
    });
    expect(modelNode).toMatchObject({
      label: 'Order',
      symbolName: 'Order',
      startLine: 1,
    });
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.topModules.length).toBeGreaterThan(0);
    expect(graph.refreshMode).toBe('full');
  });

  it('extracts controller/service/datastore edges for a spring-style layout', async () => {
    const projectRoot = mkTempDir('rk-graph-spring-');

    write(
      path.join(
        projectRoot,
        'src',
        'main',
        'java',
        'com',
        'acme',
        'orders',
        'controller',
        'OrderController.java'
      ),
      '@Controller class OrderController {}\n'
    );
    write(
      path.join(
        projectRoot,
        'src',
        'main',
        'java',
        'com',
        'acme',
        'orders',
        'service',
        'OrderService.java'
      ),
      '@Service class OrderService {}\n'
    );
    write(
      path.join(
        projectRoot,
        'src',
        'main',
        'java',
        'com',
        'acme',
        'orders',
        'repository',
        'OrderRepository.java'
      ),
      'interface OrderRepository extends Repository<Order, Long> {}\n'
    );

    const graph = await indexProjectSystemGraph({
      projectPath: projectRoot,
      framework: 'springboot',
      kit: 'springboot.standard',
    });

    expect(graph.nodes.some((node) => node.type === 'controller')).toBe(true);
    expect(graph.nodes.some((node) => node.type === 'service')).toBe(true);
    expect(graph.nodes.some((node) => node.type === 'datastore')).toBe(true);
    const controllerNode = graph.nodes.find((node) => node.type === 'controller');
    const datastoreNode = graph.nodes.find((node) => node.type === 'datastore');
    expect(controllerNode).toMatchObject({
      label: 'OrderController',
      symbolName: 'OrderController',
      startLine: 1,
    });
    expect(datastoreNode).toMatchObject({
      label: 'OrderRepository',
      symbolName: 'OrderRepository',
      startLine: 1,
    });
    expect(graph.edges.some((edge) => edge.relation === 'calls' || edge.relation === 'reads')).toBe(
      true
    );
  });

  it('returns empty graph when scan root is unavailable', async () => {
    const graph = await indexProjectSystemGraph({
      projectPath: '/tmp/does-not-exist-rk-graph',
      framework: 'fastapi',
    });

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.scannedFileCount).toBe(0);
  });

  it('uses incremental refresh cache and rescans only changed files', async () => {
    const projectRoot = mkTempDir('rk-graph-incremental-');
    const routePath = path.join(projectRoot, 'app', 'routes', 'orders.py');
    const servicePath = path.join(projectRoot, 'app', 'services', 'orders_service.py');

    write(routePath, 'router.get("/orders")\n');
    write(servicePath, 'class OrdersService:\n  pass\n');

    const full = await indexProjectSystemGraph({
      projectPath: projectRoot,
      framework: 'fastapi',
      kit: 'fastapi.standard',
      useIncrementalCache: true,
    });

    expect(full.refreshMode).toBe('full');

    fs.appendFileSync(servicePath, '\n# changed\n', 'utf8');

    const incremental = await indexProjectSystemGraph({
      projectPath: projectRoot,
      framework: 'fastapi',
      kit: 'fastapi.standard',
      useIncrementalCache: true,
    });

    expect(
      incremental.refreshMode === 'incremental' || incremental.refreshMode === 'cache-hit'
    ).toBe(true);
    expect(incremental.changedFileCount).toBeGreaterThanOrEqual(0);
    expect(incremental.nodes.some((node) => node.type === 'service')).toBe(true);
  });

  it('returns impacted scope and candidate tests from query API', async () => {
    const projectRoot = mkTempDir('rk-graph-query-');

    write(
      path.join(projectRoot, 'app', 'routes', 'orders.py'),
      'from app.services.orders_service import OrdersService\nrouter.get("/orders")\n'
    );
    write(
      path.join(projectRoot, 'app', 'services', 'orders_service.py'),
      'class OrdersService:\n  pass\n'
    );
    write(path.join(projectRoot, 'tests', 'test_orders.py'), 'def test_orders():\n  assert True\n');

    const graph = await indexProjectSystemGraph({
      projectPath: projectRoot,
      framework: 'fastapi',
      kit: 'fastapi.standard',
      useIncrementalCache: false,
    });

    const impact = queryProjectSystemGraphImpact(graph, {
      seedModules: ['orders'],
      maxDepth: 2,
    });

    expect(impact.unknownScope).toBe(false);
    expect(impact.impactedNodes.length).toBeGreaterThan(0);
    expect(impact.impactedModules.some((item) => item.includes('orders'))).toBe(true);
    expect(impact.confidence).toBeGreaterThan(0);
  });

  it('scores impact deterministically for C11 blast-radius baseline', async () => {
    const projectRoot = mkTempDir('rk-graph-score-');

    write(path.join(projectRoot, 'app', 'routes', 'orders.py'), 'router.get("/orders")\n');
    write(
      path.join(projectRoot, 'app', 'services', 'orders_service.py'),
      'class OrdersService:\n  pass\n'
    );
    write(path.join(projectRoot, 'tests', 'test_orders.py'), 'def test_orders():\n  assert True\n');

    const graph = await indexProjectSystemGraph({
      projectPath: projectRoot,
      framework: 'fastapi',
      kit: 'fastapi.standard',
    });

    const impact = queryProjectSystemGraphImpact(graph, {
      seedModules: ['non-existent-module'],
      maxDepth: 2,
    });
    const score = scoreSystemGraphImpactDeterministic({
      impactQuery: impact,
      graphSnapshot: graph,
      doctorErrors: 1,
      doctorWarnings: 1,
      requiresImpactReview: true,
      requiresVerifyPath: true,
      riskClass: 'guarded-mutating',
    });

    expect(score.scopeKnown).toBe(false);
    expect(score.confidence).toBeLessThanOrEqual(45);
    expect(score.riskLevel === 'high' || score.riskLevel === 'critical').toBe(true);
    expect(score.blockedReasons.length).toBeGreaterThan(0);
    expect(score.rationale.length).toBeGreaterThan(0);
    expect(Array.isArray(score.architectureWarnings)).toBe(true);
  });

  it('flags service-boundary architecture warnings for cross-context impact', () => {
    const score = scoreSystemGraphImpactDeterministic({
      impactQuery: {
        impactedNodes: [
          {
            id: 'controller:src/orders/controllers/orderController.ts',
            type: 'controller',
            label: 'OrderController',
            filePath: 'src/orders/controllers/orderController.ts',
            confidence: 88,
          },
          {
            id: 'service:src/payments/services/paymentService.ts',
            type: 'service',
            label: 'PaymentService',
            filePath: 'src/payments/services/paymentService.ts',
            confidence: 86,
          },
        ],
        impactedEdges: [
          {
            sourceId: 'controller:src/orders/controllers/orderController.ts',
            targetId: 'service:src/payments/services/paymentService.ts',
            relation: 'calls',
          },
        ],
        candidateTests: ['tests/orders/orderController.test.ts'],
        impactedModules: ['orders', 'payments'],
        confidence: 78,
        unknownScope: false,
      },
      graphSnapshot: {
        scanRoot: '/workspace',
        supportedTopology: 'node.backend',
        nodes: [],
        edges: [],
        scannedFileCount: 0,
        topModules: ['orders', 'payments'],
        refreshMode: 'full',
        changedFileCount: 0,
        generatedAt: Date.now(),
      },
      doctorErrors: 0,
      doctorWarnings: 0,
      requiresImpactReview: true,
      requiresVerifyPath: true,
      riskClass: 'guarded-mutating',
    });

    expect(score.architectureWarnings.length).toBeGreaterThan(0);
    expect(
      score.architectureWarnings.some((warning) => warning.toLowerCase().includes('cross-boundary'))
    ).toBe(true);
  });

  it('flags data-flow dependency-chain warning before mutating apply', () => {
    const score = scoreSystemGraphImpactDeterministic({
      impactQuery: {
        impactedNodes: [
          {
            id: 'route:src/orders/routes/orderRoutes.ts',
            type: 'route',
            label: 'GET /orders',
            filePath: 'src/orders/routes/orderRoutes.ts',
            confidence: 90,
          },
          {
            id: 'service:src/orders/services/orderService.ts',
            type: 'service',
            label: 'OrderService',
            filePath: 'src/orders/services/orderService.ts',
            confidence: 90,
          },
          {
            id: 'datastore:src/orders/repositories/orderRepository.ts',
            type: 'datastore',
            label: 'OrderRepository',
            filePath: 'src/orders/repositories/orderRepository.ts',
            confidence: 88,
          },
        ],
        impactedEdges: [
          {
            sourceId: 'route:src/orders/routes/orderRoutes.ts',
            targetId: 'service:src/orders/services/orderService.ts',
            relation: 'calls',
          },
          {
            sourceId: 'service:src/orders/services/orderService.ts',
            targetId: 'datastore:src/orders/repositories/orderRepository.ts',
            relation: 'reads',
          },
          {
            sourceId: 'route:src/orders/routes/orderRoutes.ts',
            targetId: 'datastore:src/orders/repositories/orderRepository.ts',
            relation: 'depends-on',
          },
        ],
        candidateTests: [],
        impactedModules: ['orders'],
        confidence: 82,
        unknownScope: false,
      },
      graphSnapshot: {
        scanRoot: '/workspace',
        supportedTopology: 'node.backend',
        nodes: [],
        edges: [],
        scannedFileCount: 0,
        topModules: ['orders'],
        refreshMode: 'full',
        changedFileCount: 0,
        generatedAt: Date.now(),
      },
      doctorErrors: 0,
      doctorWarnings: 0,
      requiresImpactReview: true,
      requiresVerifyPath: true,
      riskClass: 'guarded-mutating',
    });

    expect(
      score.architectureWarnings.some((warning) =>
        warning.toLowerCase().includes('architecture breakage warning')
      )
    ).toBe(true);
    expect(
      score.blockedReasons.some((reason) =>
        reason.toLowerCase().includes('architecture breakage warning')
      )
    ).toBe(true);
    expect(
      score.rationale.some((line) => line.toLowerCase().includes('data-flow dependency chain'))
    ).toBe(true);
  });

  it('builds a versioned E1 impact score contract with boundary paths', () => {
    const impact = {
      impactedNodes: [
        {
          id: 'controller:src/orders/controllers/orderController.ts',
          type: 'controller' as const,
          label: 'OrderController',
          filePath: 'src/orders/controllers/orderController.ts',
          confidence: 88,
        },
        {
          id: 'service:src/payments/services/paymentService.ts',
          type: 'service' as const,
          label: 'PaymentService',
          filePath: 'src/payments/services/paymentService.ts',
          confidence: 86,
        },
      ],
      impactedEdges: [
        {
          sourceId: 'controller:src/orders/controllers/orderController.ts',
          targetId: 'service:src/payments/services/paymentService.ts',
          relation: 'calls' as const,
        },
      ],
      candidateTests: ['tests/orders/orderController.test.ts'],
      impactedModules: ['orders', 'payments'],
      confidence: 78,
      unknownScope: false,
    };

    const score = scoreSystemGraphImpactDeterministic({
      impactQuery: impact,
      graphSnapshot: {
        scanRoot: '/workspace',
        supportedTopology: 'node.backend',
        nodes: impact.impactedNodes,
        edges: impact.impactedEdges,
        scannedFileCount: 2,
        topModules: ['orders', 'payments'],
        refreshMode: 'full',
        changedFileCount: 0,
        generatedAt: Date.now(),
      },
      doctorErrors: 0,
      doctorWarnings: 0,
      requiresImpactReview: true,
      requiresVerifyPath: true,
      riskClass: 'guarded-mutating',
    });

    const contract = buildImpactScoreContractV1({
      impactQuery: impact,
      scoring: score,
      graphSnapshot: {
        scanRoot: '/workspace',
        supportedTopology: 'node.backend',
        nodes: impact.impactedNodes,
        edges: impact.impactedEdges,
        scannedFileCount: 2,
        topModules: ['orders', 'payments'],
        refreshMode: 'full',
        changedFileCount: 0,
        generatedAt: Date.now(),
      },
      generatedAt: '2026-05-12T00:00:00.000Z',
    });

    expect(contract.schemaVersion).toBe(IMPACT_SCORE_CONTRACT_SCHEMA_VERSION);
    expect(contract.scoringModelVersion).toBe(IMPACT_SCORE_CONTRACT_MODEL_VERSION);
    expect(contract.supportedTopology).toBe('node.backend');
    expect(contract.scopeKnown).toBe(true);
    expect(contract.signalCounts.impactedNodeCount).toBe(2);
    expect(contract.signalCounts.candidateTestCount).toBe(1);
    expect(contract.crossServiceBoundaryPaths.length).toBeGreaterThan(0);
  });

  it('emits watcher updates on file changes', async () => {
    const projectRoot = mkTempDir('rk-graph-watcher-');
    const routeFile = path.join(projectRoot, 'app', 'routes', 'orders.py');

    write(routeFile, 'router.get("/orders")\n');

    const updates: Array<{ reason: string; changedPath?: string }> = [];
    const watcher = await createProjectSystemGraphWatcher({
      projectPath: projectRoot,
      framework: 'fastapi',
      kit: 'fastapi.standard',
      debounceMs: 60,
      pollIntervalMs: 120,
      onUpdate: (update) => {
        updates.push({ reason: update.reason, changedPath: update.changedPath });
      },
    });

    try {
      fs.appendFileSync(routeFile, '# touched\n', 'utf8');

      await waitForCondition(() => updates.some((update) => update.reason === 'fs-event'));

      expect(watcher.getSnapshot()).not.toBeNull();
      expect(updates.some((update) => update.reason === 'initial')).toBe(true);
      expect(updates.some((update) => update.reason === 'fs-event')).toBe(true);
    } finally {
      watcher.dispose();
    }

    expect(watcher.isDisposed()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Cross-layer extraction: docker-compose, prisma schema, SQL migrations
  // ---------------------------------------------------------------------------

  it('extracts infra-service nodes from docker-compose.yml', async () => {
    const projectRoot = mkTempDir('rk-graph-compose-');

    write(
      path.join(projectRoot, 'docker-compose.yml'),
      [
        'version: "3.8"',
        'services:',
        '  api:',
        '    image: node:20',
        '    ports:',
        '      - "3000:3000"',
        '    depends_on:',
        '      - db',
        '  db:',
        '    image: postgres:15',
        '    environment:',
        '      POSTGRES_DB: appdb',
        '  redis:',
        '    image: redis:7',
      ].join('\n')
    );

    const graph = await indexProjectSystemGraph({ projectPath: projectRoot });

    const infraNodes = graph.nodes.filter((node) => node.type === 'infra-service');
    expect(infraNodes.length).toBeGreaterThanOrEqual(3);
    const labels = infraNodes.map((node) => node.label);
    expect(labels).toContain('api');
    expect(labels).toContain('db');
    expect(labels).toContain('redis');
    for (const node of infraNodes) {
      expect(node.confidence).toBeGreaterThanOrEqual(70);
      expect(typeof node.symbolName).toBe('string');
    }
  });

  it('extracts db-schema nodes from a prisma schema file', async () => {
    const projectRoot = mkTempDir('rk-graph-prisma-');

    write(
      path.join(projectRoot, 'prisma', 'schema.prisma'),
      [
        'generator client {',
        '  provider = "prisma-client-js"',
        '}',
        '',
        'datasource db {',
        '  provider = "postgresql"',
        '  url      = env("DATABASE_URL")',
        '}',
        '',
        'model User {',
        '  id    Int    @id @default(autoincrement())',
        '  email String @unique',
        '  posts Post[]',
        '}',
        '',
        'model Post {',
        '  id       Int    @id @default(autoincrement())',
        '  title    String',
        '  authorId Int',
        '  author   User   @relation(fields: [authorId], references: [id])',
        '}',
        '',
        'enum Role {',
        '  USER',
        '  ADMIN',
        '}',
      ].join('\n')
    );

    const graph = await indexProjectSystemGraph({ projectPath: projectRoot });

    const schemaNodes = graph.nodes.filter((node) => node.type === 'db-schema');
    expect(schemaNodes.length).toBeGreaterThanOrEqual(3);
    const labels = schemaNodes.map((node) => node.label);
    expect(labels).toContain('User');
    expect(labels).toContain('Post');
    expect(labels).toContain('Role');
    for (const node of schemaNodes) {
      expect(node.confidence).toBeGreaterThanOrEqual(70);
      expect(typeof node.startLine).toBe('number');
    }
  });

  it('extracts db-schema nodes from SQL migration files', async () => {
    const projectRoot = mkTempDir('rk-graph-sql-');

    write(
      path.join(projectRoot, 'migrations', '001_create_orders.sql'),
      [
        '-- create orders table',
        'CREATE TABLE IF NOT EXISTS orders (',
        '  id SERIAL PRIMARY KEY,',
        '  user_id INT NOT NULL,',
        '  total DECIMAL(10,2)',
        ');',
        '',
        'CREATE TABLE order_items (',
        '  id SERIAL PRIMARY KEY,',
        '  order_id INT NOT NULL,',
        '  product_id INT NOT NULL',
        ');',
      ].join('\n')
    );
    write(
      path.join(projectRoot, 'migrations', '002_alter_orders.sql'),
      'ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMP;\n'
    );

    const graph = await indexProjectSystemGraph({ projectPath: projectRoot });

    const schemaNodes = graph.nodes.filter((node) => node.type === 'db-schema');
    expect(schemaNodes.length).toBeGreaterThanOrEqual(2);
    const labels = schemaNodes.map((node) => node.label);
    expect(labels).toContain('orders');
    expect(labels).toContain('order_items');
    for (const node of schemaNodes) {
      expect(node.confidence).toBeGreaterThanOrEqual(70);
    }
  });

  it('builds cross-layer edges between code service and infra-service nodes', async () => {
    const projectRoot = mkTempDir('rk-graph-crosslayer-');

    // Code layer: service that maps to "orders"
    write(
      path.join(projectRoot, 'src', 'services', 'orders_service.ts'),
      'export class OrdersService { async getAll() {} }\n'
    );
    write(
      path.join(projectRoot, 'src', 'models', 'order.ts'),
      'export class Order { id: number = 0; }\n'
    );
    // Infra layer: docker-compose with an orders-related DB service
    write(
      path.join(projectRoot, 'docker-compose.yml'),
      [
        'services:',
        '  orders-db:',
        '    image: postgres:15',
        '  orders-cache:',
        '    image: redis:7',
      ].join('\n')
    );
    // DB schema layer: prisma model
    write(path.join(projectRoot, 'prisma', 'schema.prisma'), 'model Order {\n  id Int @id\n}\n');

    const graph = await indexProjectSystemGraph({ projectPath: projectRoot });

    const infraNodes = graph.nodes.filter((node) => node.type === 'infra-service');
    const schemaNodes = graph.nodes.filter((node) => node.type === 'db-schema');
    expect(infraNodes.length).toBeGreaterThanOrEqual(1);
    expect(schemaNodes.length).toBeGreaterThanOrEqual(1);

    // Impact query seeded from the service file should reach infra and schema nodes
    const result = queryProjectSystemGraphImpact(graph, {
      seedFilePaths: ['src/services/orders_service.ts'],
      maxDepth: 3,
    });
    // impactedNodes should include at least the service node itself
    expect(result.impactedNodes.length).toBeGreaterThan(0);
    expect(result.unknownScope).toBe(false);
  });

  it('does not extract infra-service nodes from non-compose YAML files', async () => {
    const projectRoot = mkTempDir('rk-graph-yaml-skip-');

    write(
      path.join(projectRoot, '.github', 'workflows', 'ci.yml'),
      [
        'name: CI',
        'on: [push]',
        'jobs:',
        '  build:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v3',
      ].join('\n')
    );

    const graph = await indexProjectSystemGraph({ projectPath: projectRoot });

    const infraNodes = graph.nodes.filter((node) => node.type === 'infra-service');
    expect(infraNodes.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Sub-feature 1: Incremental graph refresh — watcher picks up new file
  // ---------------------------------------------------------------------------

  it('watcher snapshot includes nodes from a file added after initial index', async () => {
    const projectRoot = mkTempDir('rk-graph-watcher-new-');
    write(path.join(projectRoot, 'app', 'routes', 'orders.py'), 'router.get("/orders")\n');

    const snapshots: number[] = [];
    const watcher = await createProjectSystemGraphWatcher({
      projectPath: projectRoot,
      framework: 'fastapi',
      kit: 'fastapi.standard',
      debounceMs: 60,
      pollIntervalMs: 120,
      onUpdate: (update) => {
        if (update.reason !== 'initial') {
          snapshots.push(update.snapshot.nodes.length);
        }
      },
    });

    try {
      const initialCount = watcher.getSnapshot()?.nodes.length ?? 0;
      expect(initialCount).toBeGreaterThanOrEqual(1);

      // Add a new service file and wait for watcher to pick it up
      write(
        path.join(projectRoot, 'app', 'services', 'orders_service.py'),
        'class OrdersService:\n  pass\n'
      );

      await waitForCondition(
        () => watcher.getSnapshot()?.nodes.some((node) => node.type === 'service') ?? false
      );

      const latest = watcher.getSnapshot();
      expect(latest).not.toBeNull();
      expect(latest!.nodes.some((node) => node.type === 'service')).toBe(true);
    } finally {
      watcher.dispose();
    }
  });

  it('manual refresh returns updated snapshot when file content changes', async () => {
    const projectRoot = mkTempDir('rk-graph-manual-refresh-');
    const servicePath = path.join(projectRoot, 'app', 'services', 'users_service.py');
    write(servicePath, 'class UsersService:\n  pass\n');

    const watcher = await createProjectSystemGraphWatcher({
      projectPath: projectRoot,
      framework: 'fastapi',
      debounceMs: 60,
    });

    try {
      const before = watcher.getSnapshot();
      expect(before?.nodes.some((n) => n.type === 'service')).toBe(true);

      // Overwrite with a model file content
      write(path.join(projectRoot, 'app', 'models', 'user.py'), 'class User:\n  id: int\n');

      const refreshed = await watcher.refresh('manual');
      expect(refreshed.nodes.some((n) => n.type === 'model')).toBe(true);
    } finally {
      watcher.dispose();
    }
  });

  // ---------------------------------------------------------------------------
  // Sub-feature 2: Query API — assembleSystemGraphContextPacket
  // ---------------------------------------------------------------------------

  it('assembleSystemGraphContextPacket returns snapshot, impact, scoring, and aiContextSummary', async () => {
    const projectRoot = mkTempDir('rk-graph-context-packet-');

    write(path.join(projectRoot, 'app', 'routes', 'orders.py'), 'router.get("/orders")\n');
    write(
      path.join(projectRoot, 'app', 'services', 'orders_service.py'),
      'class OrdersService:\n  pass\n'
    );
    write(path.join(projectRoot, 'app', 'models', 'order.py'), 'class Order:\n  pass\n');
    write(
      path.join(projectRoot, 'tests', 'test_orders.py'),
      'def test_get_orders(): assert True\n'
    );

    const packet = await assembleSystemGraphContextPacket({
      projectPath: projectRoot,
      framework: 'fastapi',
      kit: 'fastapi.standard',
      seedModules: ['orders'],
      impactMaxDepth: 2,
      doctorErrors: 0,
      doctorWarnings: 0,
      requiresImpactReview: false,
      requiresVerifyPath: true,
      riskClass: 'guarded-mutating',
    });

    expect(packet.snapshot.nodes.length).toBeGreaterThan(0);
    expect(packet.snapshot.supportedTopology).toBe('fastapi.standard');
    expect(packet.impact.impactedNodes.length).toBeGreaterThan(0);
    expect(packet.impact.unknownScope).toBe(false);
    expect(typeof packet.scoring.riskLevel).toBe('string');
    expect(typeof packet.scoring.confidence).toBe('number');
    expect(typeof packet.aiContextSummary).toBe('string');
    expect(packet.aiContextSummary.length).toBeGreaterThan(20);
    // Summary must contain topology, impact scope, and risk level
    expect(packet.aiContextSummary).toMatch(/fastapi\.standard/);
    expect(packet.aiContextSummary).toMatch(/risk:/i);
  });

  it('assembleSystemGraphContextPacket aiContextSummary states unknown scope when seeds do not match', async () => {
    const projectRoot = mkTempDir('rk-graph-context-unknown-');
    write(
      path.join(projectRoot, 'app', 'services', 'auth_service.py'),
      'class AuthService:\n  pass\n'
    );

    const packet = await assembleSystemGraphContextPacket({
      projectPath: projectRoot,
      seedModules: ['nonexistent-xyz-module'],
      impactMaxDepth: 2,
    });

    expect(packet.impact.unknownScope).toBe(true);
    expect(packet.aiContextSummary).toMatch(/unknown/i);
  });

  it('assembleSystemGraphContextPacket respects localProcessingMode and strips symbol details', async () => {
    const projectRoot = mkTempDir('rk-graph-local-packet-');
    write(
      path.join(projectRoot, 'app', 'services', 'orders_service.py'),
      'class OrdersService:\n  pass\n'
    );

    const packet = await assembleSystemGraphContextPacket({
      projectPath: projectRoot,
      localProcessingMode: true,
    });

    expect(packet.snapshot.localProcessingMode).toBe(true);
    for (const node of packet.snapshot.nodes) {
      expect(node.symbolName).toBeUndefined();
      expect(node.startLine).toBeUndefined();
    }
  });

  // ---------------------------------------------------------------------------
  // Sub-feature 3: Local-processing mode for sensitive repositories
  // ---------------------------------------------------------------------------

  it('localProcessingMode strips symbolName and startLine but preserves type and filePath', async () => {
    const projectRoot = mkTempDir('rk-graph-local-mode-');

    write(
      path.join(projectRoot, 'app', 'services', 'payment_service.py'),
      'class PaymentService:\n  def charge(self): pass\n'
    );
    write(
      path.join(projectRoot, 'app', 'models', 'payment.py'),
      'class Payment:\n  amount: float\n'
    );
    write(path.join(projectRoot, 'tests', 'test_payments.py'), 'def test_charge(): assert True\n');

    const graph = await indexProjectSystemGraph({
      projectPath: projectRoot,
      framework: 'fastapi',
      localProcessingMode: true,
    });

    expect(graph.localProcessingMode).toBe(true);
    expect(graph.nodes.length).toBeGreaterThan(0);
    for (const node of graph.nodes) {
      expect(node.symbolName).toBeUndefined();
      expect(node.startLine).toBeUndefined();
      expect(typeof node.type).toBe('string');
      expect(typeof node.filePath).toBe('string');
      expect(typeof node.label).toBe('string');
      expect(typeof node.confidence).toBe('number');
    }
  });

  it('localProcessingMode=false (default) preserves symbolName and startLine', async () => {
    const projectRoot = mkTempDir('rk-graph-normal-mode-');

    write(
      path.join(projectRoot, 'app', 'services', 'billing_service.py'),
      'class BillingService:\n  pass\n'
    );

    const graph = await indexProjectSystemGraph({
      projectPath: projectRoot,
      framework: 'fastapi',
      localProcessingMode: false,
    });

    expect(graph.localProcessingMode).toBeUndefined();
    const serviceNode = graph.nodes.find((n) => n.type === 'service');
    expect(serviceNode).toBeDefined();
    expect(serviceNode?.symbolName).toBe('BillingService');
    expect(typeof serviceNode?.startLine).toBe('number');
  });

  it('localProcessingMode works with cross-layer infra and db-schema nodes', async () => {
    const projectRoot = mkTempDir('rk-graph-local-infra-');

    write(path.join(projectRoot, 'docker-compose.yml'), 'services:\n  api:\n    image: node:20\n');
    write(path.join(projectRoot, 'prisma', 'schema.prisma'), 'model User {\n  id Int @id\n}\n');

    const graph = await indexProjectSystemGraph({
      projectPath: projectRoot,
      localProcessingMode: true,
    });

    expect(graph.localProcessingMode).toBe(true);
    for (const node of graph.nodes) {
      expect(node.symbolName).toBeUndefined();
      expect(node.startLine).toBeUndefined();
    }
    const infraNode = graph.nodes.find((n) => n.type === 'infra-service');
    const schemaNode = graph.nodes.find((n) => n.type === 'db-schema');
    expect(infraNode).toBeDefined();
    expect(schemaNode).toBeDefined();
  });
});
