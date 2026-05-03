import * as fs from 'fs-extra';
import * as path from 'path';
import * as nodeFs from 'fs';

export type SystemGraphNodeType =
  | 'route'
  | 'controller'
  | 'service'
  | 'model'
  | 'datastore'
  | 'test'
  | 'infra-service'
  | 'db-schema';

export interface SystemGraphNode {
  id: string;
  type: SystemGraphNodeType;
  label: string;
  filePath: string;
  confidence: number;
  symbolName?: string;
  startLine?: number;
}

export interface SystemGraphEdge {
  sourceId: string;
  targetId: string;
  relation: 'calls' | 'depends-on' | 'reads' | 'covered-by';
}

export interface ProjectSystemGraphSnapshot {
  scanRoot: string;
  supportedTopology: string;
  nodes: SystemGraphNode[];
  edges: SystemGraphEdge[];
  scannedFileCount: number;
  topModules: string[];
  refreshMode: 'full' | 'incremental' | 'cache-hit';
  changedFileCount: number;
  generatedAt: number;
  /** Present and true when the snapshot was built with localProcessingMode — symbol details are stripped. */
  localProcessingMode?: boolean;
}

export interface ProjectSystemGraphIndexerInput {
  workspacePath?: string;
  projectPath?: string;
  framework?: string;
  kit?: string;
  maxFiles?: number;
  useIncrementalCache?: boolean;
  forceFullScan?: boolean;
  /** When true, strips symbolName and startLine from nodes to avoid leaking symbol details outside the local machine. */
  localProcessingMode?: boolean;
}

interface SourceFileEntry {
  absolutePath: string;
  relPath: string;
  signature: string;
}

interface GraphCacheEntry {
  fileSignatures: Map<string, string>;
  nodesByFile: Map<string, SystemGraphNode[]>;
}

export interface SystemGraphImpactQueryInput {
  seedFilePaths?: string[];
  seedModules?: string[];
  maxNodes?: number;
  maxDepth?: number;
}

export interface SystemGraphImpactQueryResult {
  impactedNodes: SystemGraphNode[];
  impactedEdges: SystemGraphEdge[];
  candidateTests: string[];
  impactedModules: string[];
  confidence: number;
  unknownScope: boolean;
}

export interface DeterministicImpactScoringInput {
  impactQuery: SystemGraphImpactQueryResult;
  graphSnapshot: ProjectSystemGraphSnapshot;
  doctorErrors: number;
  doctorWarnings: number;
  requiresImpactReview: boolean;
  requiresVerifyPath: boolean;
  riskClass:
    | 'informational'
    | 'non-mutating-executable'
    | 'guarded-mutating'
    | 'high-risk-mutating';
}

export interface DeterministicImpactScoringResult {
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  scopeKnown: boolean;
  likelyFailureMode?: string;
  rationale: string[];
  blockedReasons: string[];
  architectureWarnings: string[];
}

export interface ProjectSystemGraphWatcherUpdate {
  reason: 'initial' | 'fs-event' | 'manual';
  snapshot: ProjectSystemGraphSnapshot;
  changedPath?: string;
  eventType?: string;
}

export interface ProjectSystemGraphWatcherOptions extends ProjectSystemGraphIndexerInput {
  debounceMs?: number;
  pollIntervalMs?: number;
  onUpdate?: (update: ProjectSystemGraphWatcherUpdate) => void | Promise<void>;
}

export interface ProjectSystemGraphWatcherHandle {
  getSnapshot: () => ProjectSystemGraphSnapshot | null;
  refresh: (
    reason?: 'manual' | 'fs-event',
    changedPath?: string
  ) => Promise<ProjectSystemGraphSnapshot>;
  dispose: () => void;
  isDisposed: () => boolean;
}

const GRAPH_CACHE = new Map<string, GraphCacheEntry>();

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.go', '.java']);
const INFRA_EXTENSIONS = new Set(['.yaml', '.yml', '.prisma', '.sql']);
const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  '.idea',
  '.vscode',
  'dist',
  'build',
  'out',
  'target',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
]);
const TOKEN_STOP_WORDS = new Set([
  'src',
  'main',
  'index',
  'app',
  'api',
  'route',
  'routes',
  'router',
  'controller',
  'controllers',
  'service',
  'services',
  'model',
  'models',
  'entity',
  'entities',
  'schema',
  'schemas',
  'repository',
  'repositories',
  'dao',
  'db',
  'test',
  'tests',
  'spec',
  'impl',
  'core',
]);

function normalizeTopology(input: { framework?: string; kit?: string }): string {
  const kit = typeof input.kit === 'string' && input.kit.trim() ? input.kit.trim() : '';
  if (kit) {
    return kit;
  }

  const framework =
    typeof input.framework === 'string' && input.framework.trim() ? input.framework.trim() : '';
  return framework || 'unknown';
}

function safeRelative(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

function makeNodeId(type: SystemGraphNodeType, relPath: string): string {
  return `${type}:${relPath}`;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeModuleToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (!value || out.includes(value)) {
      continue;
    }
    out.push(value);
  }
  return out;
}

function resolveScanRoot(input: ProjectSystemGraphIndexerInput): string {
  return (
    (typeof input.projectPath === 'string' && input.projectPath.trim()) ||
    (typeof input.workspacePath === 'string' && input.workspacePath.trim()) ||
    ''
  );
}

async function collectSourceFiles(scanRoot: string, maxFiles: number): Promise<SourceFileEntry[]> {
  const queue: string[] = [scanRoot];
  const collected: SourceFileEntry[] = [];

  while (queue.length > 0 && collected.length < maxFiles) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let entries: Array<fs.Dirent>;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          queue.push(absolutePath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(ext) && !INFRA_EXTENSIONS.has(ext)) {
        continue;
      }

      let stat: fs.Stats;
      try {
        stat = await fs.stat(absolutePath);
      } catch {
        continue;
      }

      const relPath = safeRelative(scanRoot, absolutePath);
      collected.push({
        absolutePath,
        relPath,
        signature: `${stat.size}:${Math.floor(stat.mtimeMs)}`,
      });
      if (collected.length >= maxFiles) {
        break;
      }
    }
  }

  return collected;
}

function collectWatchDirectories(scanRoot: string, files: SourceFileEntry[]): string[] {
  const dirs = new Set<string>([scanRoot]);
  for (const file of files) {
    dirs.add(path.dirname(file.absolutePath));
  }
  return Array.from(dirs);
}

function classifySourceFileToNodes(entry: SourceFileEntry, source: string): SystemGraphNode[] {
  const ext = path.extname(entry.relPath).toLowerCase();
  if (INFRA_EXTENSIONS.has(ext)) {
    return classifyInfraFileToNodes(entry, source);
  }
  const classified = classifyNodeType(entry.relPath, source.slice(0, 12000));
  if (!classified) {
    return [];
  }

  const anchor = extractRepresentativeSymbolAnchor(entry.relPath, source, classified.type);

  return [
    {
      id: makeNodeId(classified.type, entry.relPath),
      type: classified.type,
      label: anchor.label,
      filePath: entry.relPath,
      confidence: clampConfidence(classified.confidence),
      ...(anchor.symbolName ? { symbolName: anchor.symbolName } : {}),
      ...(typeof anchor.startLine === 'number' ? { startLine: anchor.startLine } : {}),
    },
  ];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toFallbackSymbolName(relPath: string): string {
  const base = path.basename(relPath, path.extname(relPath));
  return base.replace(/[._-]+/g, ' ').trim() || base;
}

function findLineMatch(
  lines: string[],
  matchers: Array<(line: string) => { label: string; symbolName?: string } | null>
): { label: string; symbolName?: string; startLine: number } | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const matcher of matchers) {
      const result = matcher(line);
      if (result) {
        return {
          ...result,
          startLine: index + 1,
        };
      }
    }
  }
  return null;
}

function extractRepresentativeSymbolAnchor(
  relPath: string,
  source: string,
  nodeType: SystemGraphNodeType
): { label: string; symbolName?: string; startLine?: number } {
  const lines = source.split(/\r?\n/);
  const fallbackSymbol = toFallbackSymbolName(relPath);
  const fallbackLabel = path.basename(relPath);

  const routeMatchers = [
    (line: string) => {
      const match = line.match(/\brouter\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/i);
      if (!match) {
        return null;
      }
      const method = match[1].toUpperCase();
      const routePath = match[2];
      return { label: `${method} ${routePath}`, symbolName: routePath };
    },
    (line: string) => {
      const match = line.match(
        /@(?:Request)?(Get|Post|Put|Patch|Delete)Mapping\(\s*["']?([^"')\s]+)?/i
      );
      if (!match) {
        return null;
      }
      const method = match[1].toUpperCase();
      const routePath = (match[2] || '').trim();
      return {
        label: routePath ? `${method} ${routePath}` : `${method} route`,
        symbolName: routePath || `${method}Mapping`,
      };
    },
  ];

  const symbolMatchers = [
    (line: string) => {
      const match = line.match(/\b(?:export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/);
      return match ? { label: match[1], symbolName: match[1] } : null;
    },
    (line: string) => {
      const match = line.match(/\binterface\s+([A-Za-z_][A-Za-z0-9_]*)/);
      return match ? { label: match[1], symbolName: match[1] } : null;
    },
    (line: string) => {
      const match = line.match(/\brecord\s+([A-Za-z_][A-Za-z0-9_]*)/);
      return match ? { label: match[1], symbolName: match[1] } : null;
    },
    (line: string) => {
      const match = line.match(/\b(?:export\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/);
      return match ? { label: match[1], symbolName: match[1] } : null;
    },
    (line: string) => {
      const match = line.match(/\bconst\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(/);
      return match ? { label: match[1], symbolName: match[1] } : null;
    },
    (line: string) => {
      const match = line.match(/\bdef\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      return match ? { label: match[1], symbolName: match[1] } : null;
    },
    (line: string) => {
      const match = line.match(/\bfunc\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      return match ? { label: match[1], symbolName: match[1] } : null;
    },
    (line: string) => {
      const match = line.match(/\b(?:describe|test|it)\s*\(\s*["'`]([^"'`]+)["'`]/);
      return match ? { label: match[1], symbolName: match[1] } : null;
    },
  ];

  const matchers = nodeType === 'route' ? [...routeMatchers, ...symbolMatchers] : symbolMatchers;
  const match = findLineMatch(lines, matchers);
  if (match) {
    return match;
  }

  const fallbackSymbolRegex = new RegExp(`\\b${escapeRegExp(fallbackSymbol)}\\b`, 'i');
  const fallbackLineIndex = lines.findIndex((line) => fallbackSymbolRegex.test(line));

  return {
    label: fallbackSymbol || fallbackLabel,
    symbolName: fallbackSymbol || undefined,
    ...(fallbackLineIndex >= 0 ? { startLine: fallbackLineIndex + 1 } : {}),
  };
}

function classifyNodeType(
  relPath: string,
  source: string
): { type: SystemGraphNodeType; confidence: number } | null {
  const p = relPath.toLowerCase();
  const has = (re: RegExp): boolean => re.test(source);

  const isTestPath =
    /(^|\/)tests?(\/|$)/.test(p) || /\.spec\.|\.test\./.test(p) || /(^|\/)__tests__(\/|$)/.test(p);
  if (isTestPath || has(/\b(describe|it|test|@SpringBootTest|pytest|unittest)\b/)) {
    const confidence = isTestPath ? 92 : 76;
    return { type: 'test', confidence };
  }

  const routePath =
    /(^|\/)(routes?|router)(\/|$)/.test(p) ||
    /route/.test(path.basename(p)) ||
    /router/.test(path.basename(p));
  const routeSignal = has(
    /\b(@GetMapping|@PostMapping|@RequestMapping|router\.|app\.(get|post|put|patch|delete))\b/
  );
  if (routePath || routeSignal) {
    return { type: 'route', confidence: routePath && routeSignal ? 88 : routePath ? 75 : 69 };
  }

  const controllerPath =
    /(^|\/)(controllers?)(\/|$)/.test(p) || /controller/.test(path.basename(p));
  const controllerSignal = has(/\b@Controller\b/);
  if (controllerPath || controllerSignal) {
    return {
      type: 'controller',
      confidence: controllerPath && controllerSignal ? 86 : controllerPath ? 74 : 68,
    };
  }

  const servicePath = /(^|\/)(services?)(\/|$)/.test(p) || /service/.test(path.basename(p));
  const serviceSignal = has(/\b@Service\b|\bclass\s+[A-Za-z0-9_]+Service\b/);
  if (servicePath || serviceSignal) {
    return {
      type: 'service',
      confidence: servicePath && serviceSignal ? 86 : servicePath ? 74 : 68,
    };
  }

  const modelPath =
    /(^|\/)(models?|entities?|schemas?)(\/|$)/.test(p) ||
    /model|entity|schema/.test(path.basename(p));
  const modelSignal = has(/\b(@Entity|BaseModel|dataclass|pydantic|Sequelize|typeorm)\b/);
  if (modelPath || modelSignal) {
    return { type: 'model', confidence: modelPath && modelSignal ? 83 : modelPath ? 72 : 66 };
  }

  const datastorePath =
    /(^|\/)(repositories?|dao|database|db|prisma|migrations?)(\/|$)/.test(p) ||
    /repository|dao|database|prisma|migration/.test(path.basename(p));
  const datastoreSignal = has(
    /\b(Repository|query|SELECT|INSERT|UPDATE|DELETE|sqlalchemy|jdbc|prisma)\b/i
  );
  if (datastorePath || datastoreSignal) {
    return {
      type: 'datastore',
      confidence: datastorePath && datastoreSignal ? 82 : datastorePath ? 71 : 65,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Cross-layer infra/schema parsers (docker-compose, prisma, SQL migrations)
// ---------------------------------------------------------------------------

function parseDockerComposeNodes(relPath: string, source: string): SystemGraphNode[] {
  const nodes: SystemGraphNode[] = [];
  // Match service names under the `services:` block (YAML key pattern)
  const servicesBlockMatch = source.match(/^services\s*:/m);
  if (!servicesBlockMatch) {
    return nodes;
  }

  const serviceNameRegex = /^ {2}([a-zA-Z0-9_-]+)\s*:/gm;
  let match: RegExpExecArray | null;
  while ((match = serviceNameRegex.exec(source)) !== null) {
    const serviceName = match[1];
    // Skip YAML reserved sub-keys that appear indented under a service block
    const reservedKeys = new Set([
      'image',
      'build',
      'ports',
      'volumes',
      'environment',
      'depends_on',
      'networks',
      'command',
      'entrypoint',
      'restart',
      'labels',
      'env_file',
      'healthcheck',
      'deploy',
      'configs',
      'secrets',
      'logging',
      'extra_hosts',
    ]);
    if (reservedKeys.has(serviceName)) {
      continue;
    }
    const lineIndex = source.slice(0, match.index).split('\n').length;
    nodes.push({
      id: makeNodeId('infra-service', `${relPath}#${serviceName}`),
      type: 'infra-service',
      label: serviceName,
      filePath: relPath,
      confidence: 82,
      symbolName: serviceName,
      startLine: lineIndex,
    });
  }
  return nodes;
}

function parsePrismaSchemaNodes(relPath: string, source: string): SystemGraphNode[] {
  const nodes: SystemGraphNode[] = [];
  // Match `model ModelName {` declarations
  const modelRegex = /^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;
  let match: RegExpExecArray | null;
  while ((match = modelRegex.exec(source)) !== null) {
    const modelName = match[1];
    const lineIndex = source.slice(0, match.index).split('\n').length;
    nodes.push({
      id: makeNodeId('db-schema', `${relPath}#${modelName}`),
      type: 'db-schema',
      label: modelName,
      filePath: relPath,
      confidence: 88,
      symbolName: modelName,
      startLine: lineIndex,
    });
  }
  // Match `enum EnumName {` declarations
  const enumRegex = /^enum\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;
  while ((match = enumRegex.exec(source)) !== null) {
    const enumName = match[1];
    const lineIndex = source.slice(0, match.index).split('\n').length;
    nodes.push({
      id: makeNodeId('db-schema', `${relPath}#${enumName}`),
      type: 'db-schema',
      label: enumName,
      filePath: relPath,
      confidence: 78,
      symbolName: enumName,
      startLine: lineIndex,
    });
  }
  return nodes;
}

function parseSqlMigrationNodes(relPath: string, source: string): SystemGraphNode[] {
  const nodes: SystemGraphNode[] = [];
  // Match CREATE TABLE statements
  const createTableRegex =
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?([A-Za-z_][A-Za-z0-9_]*)["'`]?\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = createTableRegex.exec(source)) !== null) {
    const tableName = match[1];
    const lineIndex = source.slice(0, match.index).split('\n').length;
    nodes.push({
      id: makeNodeId('db-schema', `${relPath}#${tableName}`),
      type: 'db-schema',
      label: tableName,
      filePath: relPath,
      confidence: 85,
      symbolName: tableName,
      startLine: lineIndex,
    });
  }
  // Match ALTER TABLE ... ADD COLUMN as weaker signal (schema drift)
  const alterTableRegex = /\bALTER\s+TABLE\s+["'`]?([A-Za-z_][A-Za-z0-9_]*)["'`]?\s+ADD/gi;
  const seen = new Set(nodes.map((node) => node.symbolName));
  while ((match = alterTableRegex.exec(source)) !== null) {
    const tableName = match[1];
    if (!seen.has(tableName)) {
      seen.add(tableName);
      const lineIndex = source.slice(0, match.index).split('\n').length;
      nodes.push({
        id: makeNodeId('db-schema', `${relPath}#${tableName}`),
        type: 'db-schema',
        label: tableName,
        filePath: relPath,
        confidence: 72,
        symbolName: tableName,
        startLine: lineIndex,
      });
    }
  }
  return nodes;
}

function classifyInfraFileToNodes(entry: SourceFileEntry, source: string): SystemGraphNode[] {
  const ext = path.extname(entry.relPath).toLowerCase();
  const baseName = path.basename(entry.relPath).toLowerCase();

  if (ext === '.prisma') {
    return parsePrismaSchemaNodes(entry.relPath, source);
  }

  if (ext === '.sql') {
    return parseSqlMigrationNodes(entry.relPath, source);
  }

  if (ext === '.yaml' || ext === '.yml') {
    // Only parse docker-compose files; skip other YAML configs (e.g., CI, k8s)
    if (
      baseName.startsWith('docker-compose') ||
      baseName === 'compose.yaml' ||
      baseName === 'compose.yml'
    ) {
      return parseDockerComposeNodes(entry.relPath, source);
    }
  }

  return [];
}

function tokensFromPath(relPath: string): string[] {
  const withoutExt = relPath.replace(/\.[^.]+$/, '').toLowerCase();
  const tokens = withoutExt
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TOKEN_STOP_WORDS.has(token));
  return uniqueStrings(tokens);
}

function overlapCount(left: string[], right: string[]): number {
  let count = 0;
  for (const token of left) {
    if (right.includes(token)) {
      count += 1;
    }
  }
  return count;
}

function buildEdges(nodes: SystemGraphNode[]): SystemGraphEdge[] {
  const routeNodes = nodes.filter((node) => node.type === 'route');
  const controllerNodes = nodes.filter((node) => node.type === 'controller');
  const serviceNodes = nodes.filter((node) => node.type === 'service');
  const modelNodes = nodes.filter((node) => node.type === 'model');
  const datastoreNodes = nodes.filter((node) => node.type === 'datastore');
  const testNodes = nodes.filter((node) => node.type === 'test');
  const infraServiceNodes = nodes.filter((node) => node.type === 'infra-service');
  const dbSchemaNodes = nodes.filter((node) => node.type === 'db-schema');

  const tokenMap = new Map<string, string[]>();
  for (const node of nodes) {
    tokenMap.set(node.id, tokensFromPath(node.filePath));
  }

  const edges: SystemGraphEdge[] = [];
  const pushEdge = (edge: SystemGraphEdge) => {
    if (
      !edges.some(
        (item) =>
          item.sourceId === edge.sourceId &&
          item.targetId === edge.targetId &&
          item.relation === edge.relation
      )
    ) {
      edges.push(edge);
    }
  };

  const connectByTokenOverlap = (
    from: SystemGraphNode[],
    to: SystemGraphNode[],
    relation: SystemGraphEdge['relation']
  ) => {
    for (const source of from) {
      const sourceTokens = tokenMap.get(source.id) || [];
      let bestTarget: SystemGraphNode | null = null;
      let bestScore = 0;

      for (const target of to) {
        const targetTokens = tokenMap.get(target.id) || [];
        const score = overlapCount(sourceTokens, targetTokens);
        if (score > bestScore) {
          bestScore = score;
          bestTarget = target;
        }
      }

      if (bestTarget && bestScore > 0) {
        pushEdge({
          sourceId: source.id,
          targetId: bestTarget.id,
          relation,
        });
      }
    }
  };

  connectByTokenOverlap(
    routeNodes,
    controllerNodes.length > 0 ? controllerNodes : serviceNodes,
    'calls'
  );
  connectByTokenOverlap(controllerNodes, serviceNodes, 'calls');
  connectByTokenOverlap(serviceNodes, modelNodes, 'depends-on');
  connectByTokenOverlap(serviceNodes, datastoreNodes, 'reads');
  connectByTokenOverlap(
    controllerNodes.length > 0 ? controllerNodes : serviceNodes,
    testNodes,
    'covered-by'
  );

  // Cross-layer edges: code services → infra services, models → db-schema
  connectByTokenOverlap(serviceNodes, infraServiceNodes, 'reads');
  connectByTokenOverlap(datastoreNodes, infraServiceNodes, 'reads');
  connectByTokenOverlap(modelNodes, dbSchemaNodes, 'depends-on');
  connectByTokenOverlap(datastoreNodes, dbSchemaNodes, 'reads');

  return edges;
}

function topModulesFromNodes(nodes: SystemGraphNode[]): string[] {
  const counters = new Map<string, number>();
  for (const node of nodes) {
    const tokens = tokensFromPath(node.filePath);
    if (tokens.length === 0) {
      continue;
    }
    const primary = tokens[0];
    counters.set(primary, (counters.get(primary) || 0) + 1);
  }

  return Array.from(counters.entries())
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0])
    .slice(0, 5);
}

function normalizeSeedFilePath(scanRoot: string, filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return '';
  }

  const absolute = path.isAbsolute(trimmed) ? trimmed : path.join(scanRoot, trimmed);
  const relative = safeRelative(scanRoot, absolute);
  return relative.replace(/^\.\//, '');
}

function modulesFromNodes(nodes: SystemGraphNode[]): string[] {
  const modules = new Set<string>();
  for (const node of nodes) {
    const tokens = tokensFromPath(node.filePath);
    if (tokens.length > 0) {
      modules.add(tokens[0]);
    }
  }
  return Array.from(modules).slice(0, 8);
}

function inferServiceBoundary(node: SystemGraphNode): string {
  const relPath = node.filePath.split(path.sep).join('/').toLowerCase();
  const segments = relPath.split('/').filter((segment) => segment.length > 0);

  const boundaryAnchors = new Set([
    'routes',
    'route',
    'router',
    'controllers',
    'controller',
    'services',
    'service',
    'models',
    'model',
    'entities',
    'entity',
    'schemas',
    'schema',
    'repositories',
    'repository',
    'dao',
    'database',
    'db',
    'tests',
    'test',
  ]);

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!boundaryAnchors.has(segment)) {
      continue;
    }
    if (index > 0) {
      const candidate = normalizeModuleToken(segments[index - 1]);
      if (candidate) {
        return candidate;
      }
    }
  }

  const tokens = tokensFromPath(node.filePath)
    .map((token) => normalizeModuleToken(token))
    .filter((token) => token.length > 0);
  return tokens[0] || 'unknown-boundary';
}

function impactedNodeIdsFromSeeds(
  snapshot: ProjectSystemGraphSnapshot,
  seeds: string[],
  maxDepth: number
): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  const ensure = (nodeId: string) => {
    if (!adjacency.has(nodeId)) {
      adjacency.set(nodeId, new Set<string>());
    }
    return adjacency.get(nodeId) as Set<string>;
  };

  for (const node of snapshot.nodes) {
    ensure(node.id);
  }

  for (const edge of snapshot.edges) {
    ensure(edge.sourceId).add(edge.targetId);
    ensure(edge.targetId).add(edge.sourceId);
  }

  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [];

  for (const seed of seeds) {
    if (!visited.has(seed)) {
      visited.add(seed);
      queue.push({ id: seed, depth: 0 });
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (current.depth >= maxDepth) {
      continue;
    }

    const neighbours = adjacency.get(current.id);
    if (!neighbours) {
      continue;
    }

    for (const neighbour of neighbours) {
      if (!visited.has(neighbour)) {
        visited.add(neighbour);
        queue.push({ id: neighbour, depth: current.depth + 1 });
      }
    }
  }

  return visited;
}

export function queryProjectSystemGraphImpact(
  snapshot: ProjectSystemGraphSnapshot,
  input: SystemGraphImpactQueryInput
): SystemGraphImpactQueryResult {
  const seedFiles = (input.seedFilePaths || [])
    .map((item) => normalizeSeedFilePath(snapshot.scanRoot, item || ''))
    .filter((item) => item.length > 0);
  const seedModules = (input.seedModules || [])
    .map((item) => normalizeModuleToken(item || ''))
    .filter((item) => item.length > 0);

  const seedNodeIds = new Set<string>();
  for (const node of snapshot.nodes) {
    const nodeTokens = tokensFromPath(node.filePath).map((token) => normalizeModuleToken(token));

    if (
      seedFiles.some((seedFile) => node.filePath === seedFile || node.filePath.endsWith(seedFile))
    ) {
      seedNodeIds.add(node.id);
      continue;
    }

    if (seedModules.some((seedModule) => nodeTokens.includes(seedModule))) {
      seedNodeIds.add(node.id);
    }
  }

  const maxDepth = clampInt(input.maxDepth ?? 2, 1, 4);
  const maxNodes = clampInt(input.maxNodes ?? 32, 5, 120);
  const impactedIds = impactedNodeIdsFromSeeds(snapshot, Array.from(seedNodeIds), maxDepth);

  const impactedNodes = snapshot.nodes
    .filter((node) => impactedIds.has(node.id))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxNodes);
  const impactedNodeIdSet = new Set(impactedNodes.map((node) => node.id));

  const impactedEdges = snapshot.edges.filter(
    (edge) => impactedNodeIdSet.has(edge.sourceId) && impactedNodeIdSet.has(edge.targetId)
  );

  const candidateTests = uniqueStrings(
    impactedNodes.filter((node) => node.type === 'test').map((node) => node.filePath)
  );

  const impactedModules = modulesFromNodes(impactedNodes);
  const unknownScope = seedNodeIds.size === 0 || impactedNodes.length === 0;

  let confidence = 0;
  if (!unknownScope) {
    confidence =
      40 +
      Math.min(24, seedNodeIds.size * 6) +
      Math.min(16, impactedEdges.length * 3) +
      Math.min(10, candidateTests.length * 4) +
      Math.min(10, impactedModules.length * 2);
  }

  return {
    impactedNodes,
    impactedEdges,
    candidateTests,
    impactedModules,
    confidence: clampConfidence(confidence),
    unknownScope,
  };
}

export function scoreSystemGraphImpactDeterministic(
  input: DeterministicImpactScoringInput
): DeterministicImpactScoringResult {
  const impact = input.impactQuery;
  const scopeKnown = !impact.unknownScope && impact.impactedNodes.length > 0;
  const blockedReasons: string[] = [];
  const rationale: string[] = [];
  const architectureWarnings: string[] = [];

  let riskScore = 0;

  if (!scopeKnown) {
    riskScore += 35;
    rationale.push('Affected scope could not be resolved from current graph seeds.');
    if (input.requiresImpactReview) {
      blockedReasons.push('Scope is unknown for an impact-reviewed action.');
    }
  }

  if (impact.impactedEdges.length >= 5) {
    riskScore += 20;
    rationale.push('High edge fan-out indicates broad dependency blast radius.');
  } else if (impact.impactedEdges.length >= 2) {
    riskScore += 10;
    rationale.push('Multiple dependency edges are affected by current scope.');
  }

  if (impact.impactedModules.length >= 3) {
    riskScore += 12;
    rationale.push('Impact spans multiple modules.');
  }

  const boundarySet = new Set(
    impact.impactedNodes
      .filter(
        (node) =>
          node.type === 'route' ||
          node.type === 'controller' ||
          node.type === 'service' ||
          node.type === 'datastore'
      )
      .map((node) => inferServiceBoundary(node))
      .filter((boundary) => boundary.length > 0)
  );
  if (boundarySet.size >= 2) {
    riskScore += 14;
    rationale.push(`Service-boundary impact detected across ${boundarySet.size} bounded contexts.`);
    architectureWarnings.push(
      `Cross-boundary mutation risk: ${Array.from(boundarySet).slice(0, 3).join(', ')}`
    );
  }

  const impactedNodeById = new Map(impact.impactedNodes.map((node) => [node.id, node]));
  const impactedEdges = impact.impactedEdges;
  const hasCallEdge = impactedEdges.some((edge) => edge.relation === 'calls');
  const hasDependencyEdge = impactedEdges.some(
    (edge) => edge.relation === 'depends-on' || edge.relation === 'reads'
  );
  const hasRuntimeToDataPath = impactedEdges.some((edge) => {
    const source = impactedNodeById.get(edge.sourceId);
    const target = impactedNodeById.get(edge.targetId);
    if (!source || !target) {
      return false;
    }
    const sourceIsRuntime =
      source.type === 'route' || source.type === 'controller' || source.type === 'service';
    const targetIsCore = target.type === 'service' || target.type === 'datastore';
    return sourceIsRuntime && targetIsCore;
  });
  if (hasCallEdge && hasDependencyEdge && hasRuntimeToDataPath && impactedEdges.length >= 3) {
    riskScore += 16;
    rationale.push('Data-flow dependency chain indicates pre-apply architecture breakage risk.');
    architectureWarnings.push(
      'Architecture breakage warning: runtime -> service -> datastore dependency chain is in scope.'
    );
    if (input.requiresImpactReview) {
      blockedReasons.push('Architecture breakage warning requires explicit impact confirmation.');
    }
  }

  if (impact.candidateTests.length === 0) {
    riskScore += 10;
    rationale.push('No candidate tests were found for affected scope.');
    if (input.requiresVerifyPath) {
      blockedReasons.push('Verification path is weak because no candidate tests are available.');
    }
  } else {
    riskScore -= 5;
    rationale.push('Candidate tests are available for impact verification.');
  }

  const doctorErrors = Math.max(0, Math.round(input.doctorErrors));
  const doctorWarnings = Math.max(0, Math.round(input.doctorWarnings));
  if (doctorErrors > 0) {
    riskScore += Math.min(36, doctorErrors * 12);
    rationale.push(`${doctorErrors} doctor error(s) increase failure probability.`);
  }
  if (doctorWarnings > 0) {
    riskScore += Math.min(12, doctorWarnings * 4);
    rationale.push(`${doctorWarnings} doctor warning(s) indicate instability risk.`);
  }

  if (input.riskClass === 'guarded-mutating') {
    riskScore += 8;
  } else if (input.riskClass === 'high-risk-mutating') {
    riskScore += 16;
  }

  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (riskScore >= 70) {
    riskLevel = 'critical';
  } else if (riskScore >= 50) {
    riskLevel = 'high';
  } else if (riskScore >= 25) {
    riskLevel = 'medium';
  }

  let confidence = 30;
  confidence += Math.min(30, impact.impactedNodes.length * 3);
  confidence += Math.min(20, impact.impactedEdges.length * 4);
  confidence += Math.min(15, impact.candidateTests.length * 5);

  if (input.graphSnapshot.nodes.length > 0) {
    const density = input.graphSnapshot.edges.length / input.graphSnapshot.nodes.length;
    if (density >= 0.5) {
      confidence += 10;
    } else if (density >= 0.25) {
      confidence += 5;
    }
  }

  if (!scopeKnown) {
    confidence -= 25;
  }
  confidence -= Math.min(30, doctorErrors * 6);

  if (input.requiresImpactReview && !scopeKnown) {
    confidence = Math.min(confidence, 45);
  }

  let likelyFailureMode: string | undefined;
  if (!scopeKnown) {
    likelyFailureMode = 'Affected scope is uncertain, so mutation may impact unknown services.';
  } else if (architectureWarnings.length > 0) {
    likelyFailureMode = architectureWarnings[0];
  } else if (doctorErrors > 0) {
    likelyFailureMode = `${doctorErrors} unresolved doctor error(s) suggest runtime breakage risk.`;
  } else if (impact.candidateTests.length === 0) {
    likelyFailureMode =
      'No candidate tests found for affected scope, increasing silent regression risk.';
  } else if (impact.impactedEdges.length >= 5) {
    likelyFailureMode = 'High dependency blast radius can propagate breakage across services.';
  }

  return {
    confidence: clampConfidence(confidence),
    riskLevel,
    scopeKnown,
    likelyFailureMode,
    rationale,
    blockedReasons: uniqueStrings(blockedReasons),
    architectureWarnings: uniqueStrings(architectureWarnings),
  };
}

// ---------------------------------------------------------------------------
// Query API: assembleSystemGraphContextPacket
// Single-call API that indexes the graph, runs impact query, scores it, and
// returns a structured context packet ready for AI context assembly and
// predictive-diagnostics payload construction.
// ---------------------------------------------------------------------------

export interface SystemGraphContextPacketInput extends ProjectSystemGraphIndexerInput {
  seedFilePaths?: string[];
  seedModules?: string[];
  impactMaxNodes?: number;
  impactMaxDepth?: number;
  doctorErrors?: number;
  doctorWarnings?: number;
  requiresImpactReview?: boolean;
  requiresVerifyPath?: boolean;
  riskClass?: DeterministicImpactScoringInput['riskClass'];
}

export interface SystemGraphContextPacket {
  snapshot: ProjectSystemGraphSnapshot;
  impact: SystemGraphImpactQueryResult;
  scoring: DeterministicImpactScoringResult;
  /** Compact text summary ready for injection into an AI prompt context slot. */
  aiContextSummary: string;
}

function buildAiContextSummary(
  snapshot: ProjectSystemGraphSnapshot,
  impact: SystemGraphImpactQueryResult,
  scoring: DeterministicImpactScoringResult
): string {
  const lines: string[] = [];

  lines.push(
    `System graph: ${snapshot.nodes.length} nodes across ${snapshot.topModules.slice(0, 5).join(', ') || 'unknown modules'} (topology: ${snapshot.supportedTopology}).`
  );

  if (impact.unknownScope) {
    lines.push(
      'Impact scope: unknown — affected modules could not be resolved from available seeds.'
    );
  } else {
    lines.push(
      `Impact scope: ${impact.impactedNodes.length} node(s), ${impact.impactedModules.slice(0, 5).join(', ') || 'unknown modules'}, confidence ${impact.confidence}%.`
    );
    if (impact.candidateTests.length > 0) {
      lines.push(
        `Candidate tests: ${impact.candidateTests.slice(0, 4).join(', ')}${impact.candidateTests.length > 4 ? ` (+${impact.candidateTests.length - 4} more)` : ''}.`
      );
    } else {
      lines.push('Candidate tests: none found for affected scope.');
    }
  }

  lines.push(
    `Risk: ${scoring.riskLevel} (scoring confidence ${scoring.confidence}%)${scoring.scopeKnown ? '' : ', scope unknown'}.`
  );

  if (scoring.likelyFailureMode) {
    lines.push(`Likely failure mode: ${scoring.likelyFailureMode}`);
  }

  if (scoring.architectureWarnings.length > 0) {
    lines.push(`Architecture warnings: ${scoring.architectureWarnings.slice(0, 2).join('; ')}.`);
  }

  if (scoring.blockedReasons.length > 0) {
    lines.push(`Blocked: ${scoring.blockedReasons.slice(0, 2).join('; ')}.`);
  }

  return lines.join(' ');
}

export async function assembleSystemGraphContextPacket(
  input: SystemGraphContextPacketInput
): Promise<SystemGraphContextPacket> {
  const snapshot = await indexProjectSystemGraph(input);

  const impact = queryProjectSystemGraphImpact(snapshot, {
    seedFilePaths: input.seedFilePaths,
    seedModules: input.seedModules,
    maxNodes: input.impactMaxNodes,
    maxDepth: input.impactMaxDepth,
  });

  const scoring = scoreSystemGraphImpactDeterministic({
    impactQuery: impact,
    graphSnapshot: snapshot,
    doctorErrors: input.doctorErrors ?? 0,
    doctorWarnings: input.doctorWarnings ?? 0,
    requiresImpactReview: input.requiresImpactReview ?? false,
    requiresVerifyPath: input.requiresVerifyPath ?? false,
    riskClass: input.riskClass ?? 'non-mutating-executable',
  });

  return {
    snapshot,
    impact,
    scoring,
    aiContextSummary: buildAiContextSummary(snapshot, impact, scoring),
  };
}

export function clearProjectSystemGraphCache(scanRoot?: string): void {
  if (typeof scanRoot === 'string' && scanRoot.trim()) {
    GRAPH_CACHE.delete(scanRoot.trim());
    return;
  }

  GRAPH_CACHE.clear();
}

export async function createProjectSystemGraphWatcher(
  options: ProjectSystemGraphWatcherOptions
): Promise<ProjectSystemGraphWatcherHandle> {
  const scanRoot = resolveScanRoot(options);
  const maxFiles =
    typeof options.maxFiles === 'number' && options.maxFiles > 0 ? options.maxFiles : 240;
  const debounceMs = clampInt(options.debounceMs ?? 120, 40, 1000);
  const pollIntervalMs = clampInt(options.pollIntervalMs ?? 0, 0, 5000);
  const watchers = new Map<string, nodeFs.FSWatcher>();

  let disposed = false;
  let pendingTimer: NodeJS.Timeout | undefined;
  let pollTimer: NodeJS.Timeout | undefined;
  let snapshot: ProjectSystemGraphSnapshot | null = null;
  let pendingReason: 'manual' | 'fs-event' = 'manual';
  let pendingPath: string | undefined;
  let pendingEventType: string | undefined;

  const safeOnUpdate = async (update: ProjectSystemGraphWatcherUpdate): Promise<void> => {
    if (!options.onUpdate) {
      return;
    }
    try {
      await options.onUpdate(update);
    } catch {
      // Best-effort callback: watcher should remain healthy even if callback fails.
    }
  };

  const closeAllWatchers = () => {
    for (const watcher of watchers.values()) {
      try {
        watcher.close();
      } catch {
        // ignore
      }
    }
    watchers.clear();
  };

  const reconcileWatchers = async () => {
    if (!scanRoot || disposed || !(await fs.pathExists(scanRoot))) {
      closeAllWatchers();
      return;
    }

    const sourceFiles = await collectSourceFiles(scanRoot, maxFiles);
    const targetDirs = new Set(collectWatchDirectories(scanRoot, sourceFiles));

    for (const watchedDir of Array.from(watchers.keys())) {
      if (!targetDirs.has(watchedDir)) {
        const watcher = watchers.get(watchedDir);
        try {
          watcher?.close();
        } catch {
          // ignore
        }
        watchers.delete(watchedDir);
      }
    }

    const schedule = (reason: 'manual' | 'fs-event', changedPath?: string, eventType?: string) => {
      pendingReason = reason;
      pendingPath = changedPath;
      pendingEventType = eventType;

      if (pendingTimer) {
        clearTimeout(pendingTimer);
      }
      pendingTimer = setTimeout(() => {
        pendingTimer = undefined;
        void refreshInternal(pendingReason, pendingPath, pendingEventType);
      }, debounceMs);
    };

    for (const dir of targetDirs) {
      if (watchers.has(dir)) {
        continue;
      }

      try {
        const watcher = nodeFs.watch(dir, (eventType, filename) => {
          if (disposed) {
            return;
          }

          const changedPath =
            typeof filename === 'string' && filename.length > 0 ? path.join(dir, filename) : dir;
          schedule('fs-event', changedPath, eventType);
        });
        watchers.set(dir, watcher);
      } catch {
        // Skip directories that cannot be watched in current environment.
      }
    }
  };

  const refreshInternal = async (
    reason: 'manual' | 'fs-event',
    changedPath?: string,
    eventType?: string
  ): Promise<ProjectSystemGraphSnapshot> => {
    snapshot = await indexProjectSystemGraph({
      ...options,
      useIncrementalCache: true,
    });
    await reconcileWatchers();

    const shouldEmit =
      reason === 'manual' ||
      snapshot.refreshMode !== 'cache-hit' ||
      snapshot.changedFileCount > 0 ||
      Boolean(changedPath);

    if (shouldEmit) {
      await safeOnUpdate({
        reason,
        snapshot,
        changedPath,
        eventType,
      });
    }

    return snapshot;
  };

  const initialSnapshot = await refreshInternal('manual');
  await safeOnUpdate({ reason: 'initial', snapshot: initialSnapshot });

  if (pollIntervalMs > 0) {
    pollTimer = setInterval(() => {
      if (disposed) {
        return;
      }
      void refreshInternal('fs-event', undefined, 'poll');
    }, pollIntervalMs);
  }

  return {
    getSnapshot: () => snapshot,
    refresh: (reason = 'manual', changedPath?: string) =>
      refreshInternal(reason, changedPath, reason === 'fs-event' ? 'change' : undefined),
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = undefined;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      closeAllWatchers();
    },
    isDisposed: () => disposed,
  };
}

export async function indexProjectSystemGraph(
  input: ProjectSystemGraphIndexerInput
): Promise<ProjectSystemGraphSnapshot> {
  const scanRoot = resolveScanRoot(input);

  if (!scanRoot || !(await fs.pathExists(scanRoot))) {
    return {
      scanRoot,
      supportedTopology: normalizeTopology(input),
      nodes: [],
      edges: [],
      scannedFileCount: 0,
      topModules: [],
      refreshMode: 'full',
      changedFileCount: 0,
      generatedAt: Date.now(),
    };
  }

  const maxFiles = typeof input.maxFiles === 'number' && input.maxFiles > 0 ? input.maxFiles : 240;
  const files = await collectSourceFiles(scanRoot, maxFiles);
  const useIncrementalCache = input.useIncrementalCache !== false;
  const forceFullScan = input.forceFullScan === true;
  const cached = useIncrementalCache ? GRAPH_CACHE.get(scanRoot) : undefined;
  const fileSignatures = new Map(files.map((entry) => [entry.relPath, entry.signature] as const));

  const changedEntries = forceFullScan
    ? files
    : files.filter((entry) => cached?.fileSignatures.get(entry.relPath) !== entry.signature);

  const removedRelPaths =
    forceFullScan || !cached
      ? []
      : Array.from(cached.fileSignatures.keys()).filter((relPath) => !fileSignatures.has(relPath));

  const refreshMode: 'full' | 'incremental' | 'cache-hit' =
    !cached || forceFullScan
      ? 'full'
      : changedEntries.length === 0 && removedRelPaths.length === 0
        ? 'cache-hit'
        : 'incremental';

  const nodesByFile = new Map<string, SystemGraphNode[]>();
  if (cached && refreshMode !== 'full') {
    for (const [relPath, cachedNodes] of cached.nodesByFile.entries()) {
      if (
        !removedRelPaths.includes(relPath) &&
        !changedEntries.some((entry) => entry.relPath === relPath)
      ) {
        nodesByFile.set(relPath, cachedNodes);
      }
    }
  }

  for (const entry of changedEntries) {
    let source = '';
    try {
      source = await fs.readFile(entry.absolutePath, 'utf-8');
    } catch {
      continue;
    }

    nodesByFile.set(entry.relPath, classifySourceFileToNodes(entry, source));
  }

  const nodes = Array.from(nodesByFile.values()).flat();

  const dedupedNodes = nodes.filter(
    (node, index, all) => all.findIndex((other) => other.id === node.id) === index
  );
  const edges = buildEdges(dedupedNodes);

  GRAPH_CACHE.set(scanRoot, {
    fileSignatures,
    nodesByFile,
  });

  const localProcessingMode = input.localProcessingMode === true;
  const outputNodes: SystemGraphNode[] = localProcessingMode
    ? dedupedNodes.map(({ symbolName: _sym, startLine: _line, ...rest }) => rest)
    : dedupedNodes;

  return {
    scanRoot,
    supportedTopology: normalizeTopology(input),
    nodes: outputNodes,
    edges,
    scannedFileCount: files.length,
    topModules: topModulesFromNodes(dedupedNodes),
    refreshMode,
    changedFileCount: changedEntries.length + removedRelPaths.length,
    generatedAt: Date.now(),
    ...(localProcessingMode ? { localProcessingMode: true } : {}),
  };
}
