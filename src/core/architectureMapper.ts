/**
 * C03: Architecture Mapping Engine (Project -> IR)
 *
 * Converts discovered projects into normalized ArchitectureIR objects with
 * confidence-aware component mappings and uncertainty handling.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ArchitectureIR,
  createArchitectureIR,
  createDataStoreComponent,
  createServiceComponent,
  MappingMetadata,
  RuntimeType,
  ServiceHandler,
} from './architectureIr';
import { DiscoveryResult } from './byopDiscovery';

export interface ArchitectureMapper {
  mapToIR(
    projectPath: string,
    discovery: DiscoveryResult,
    existingIr?: ArchitectureIR
  ): Promise<ArchitectureIR>;
}

interface ServiceSeed {
  id: string;
  name: string;
  runtime: RuntimeType;
  path: string;
  entryPoint: string;
  sourceFile: string;
  handlers: ServiceHandler[];
  confidence: number;
}

interface DataStoreSeed {
  id: string;
  name: string;
  type:
    | 'postgres'
    | 'mysql'
    | 'mongodb'
    | 'redis'
    | 'dynamodb'
    | 's3'
    | 'firestore'
    | 'elasticsearch'
    | 'other';
  sourceFile: string;
  confidence: number;
}

export interface MappingScopeAssessment {
  unknownScope: boolean;
  scopeCoverage: 'known' | 'partial' | 'unknown';
  scopeConfidenceScore: number;
  mappedServiceCount: number;
  mappedDataStoreCount: number;
  blockMutationWhenScopeUnknown: boolean;
  blockedReasons: string[];
}

const NATIVE_FRAMEWORKS = new Set([
  'fastapi',
  'django',
  'flask',
  'nestjs',
  'express',
  'koa',
  'gogin',
  'gin',
  'echo',
  'spring',
  'springboot',
  'rails',
  'dotnet',
]);

/**
 * Routes mapping to stack-aware native mappers when possible.
 */
export class NativeArchitectureMapper implements ArchitectureMapper {
  async mapToIR(
    projectPath: string,
    discovery: DiscoveryResult,
    existingIr?: ArchitectureIR
  ): Promise<ArchitectureIR> {
    switch (discovery.framework) {
      case 'fastapi': {
        const mapper = new FastApiArchitectureMapper();
        return mapper.mapToIR(projectPath, discovery, existingIr);
      }
      case 'nestjs': {
        const mapper = new NestjsArchitectureMapper();
        return mapper.mapToIR(projectPath, discovery, existingIr);
      }
      case 'gogin':
      case 'gin':
      case 'echo': {
        const mapper = new GoNativeArchitectureMapper();
        return mapper.mapToIR(projectPath, discovery, existingIr);
      }
      case 'express': {
        const mapper = new ExpressNativeArchitectureMapper();
        return mapper.mapToIR(projectPath, discovery, existingIr);
      }
      case 'koa': {
        const mapper = new KoaNativeArchitectureMapper();
        return mapper.mapToIR(projectPath, discovery, existingIr);
      }
      case 'django': {
        const mapper = new DjangoNativeArchitectureMapper();
        return mapper.mapToIR(projectPath, discovery, existingIr);
      }
      case 'flask': {
        const mapper = new FlaskNativeArchitectureMapper();
        return mapper.mapToIR(projectPath, discovery, existingIr);
      }
      case 'spring':
      case 'springboot': {
        const mapper = new SpringBootArchitectureMapper();
        return mapper.mapToIR(projectPath, discovery, existingIr);
      }
      case 'rails': {
        const mapper = new RailsNativeArchitectureMapper();
        return mapper.mapToIR(projectPath, discovery, existingIr);
      }
      case 'dotnet': {
        const mapper = new DotnetNativeArchitectureMapper();
        return mapper.mapToIR(projectPath, discovery, existingIr);
      }
      default: {
        const mapper = new HeuristicArchitectureMapper();
        return mapper.mapToIR(projectPath, discovery, existingIr);
      }
    }
  }
}

/**
 * Stack-specific mapper for FastAPI projects.
 */
export class FastApiArchitectureMapper implements ArchitectureMapper {
  async mapToIR(
    projectPath: string,
    discovery: DiscoveryResult,
    existingIr?: ArchitectureIR
  ): Promise<ArchitectureIR> {
    const ir = baseIr(projectPath, discovery, existingIr, 'native');

    const candidates = findFiles(projectPath, ['.py'], 6).filter((file) => {
      const content = safeReadFile(file);
      return content.includes('FastAPI(') || /@app\.(get|post|put|patch|delete)\(/.test(content);
    });

    const services = candidates.map((file, index) => {
      const rel = toRel(projectPath, file);
      const handlers = parseFastApiHandlers(safeReadFile(file), rel);
      const id = normalizeId(`fastapi-service-${index + 1}-${path.basename(file, '.py')}`);
      return buildServiceSeed(
        id,
        path.basename(file, '.py'),
        discovery.runtime,
        rel,
        rel,
        rel,
        handlers,
        0.95
      );
    });

    applySeedsToIr(ir, services, detectDataStores(projectPath, 0.9), 'native');
    return finalizeMappedIr(ir, discovery);
  }
}

/**
 * Stack-specific mapper for NestJS projects.
 */
export class NestjsArchitectureMapper implements ArchitectureMapper {
  async mapToIR(
    projectPath: string,
    discovery: DiscoveryResult,
    existingIr?: ArchitectureIR
  ): Promise<ArchitectureIR> {
    const ir = baseIr(projectPath, discovery, existingIr, 'native');

    const candidates = findFiles(projectPath, ['.ts'], 6).filter((file) => {
      const rel = toRel(projectPath, file);
      return rel.endsWith('.controller.ts') || rel.endsWith('main.ts');
    });

    const services = candidates.map((file, index) => {
      const rel = toRel(projectPath, file);
      const content = safeReadFile(file);
      const handlers = parseNestHandlers(content, rel);
      const baseName = path.basename(file).replace(/\.(controller\.)?ts$/, '');
      const id = normalizeId(`nestjs-service-${index + 1}-${baseName}`);
      return buildServiceSeed(
        id,
        baseName,
        discovery.runtime,
        path.dirname(rel),
        rel,
        rel,
        handlers,
        0.95
      );
    });

    applySeedsToIr(ir, services, detectDataStores(projectPath, 0.88), 'native');
    return finalizeMappedIr(ir, discovery);
  }
}

/**
 * Stack-specific mapper for Go HTTP frameworks.
 */
export class GoNativeArchitectureMapper implements ArchitectureMapper {
  async mapToIR(
    projectPath: string,
    discovery: DiscoveryResult,
    existingIr?: ArchitectureIR
  ): Promise<ArchitectureIR> {
    const ir = baseIr(projectPath, discovery, existingIr, 'native');

    const candidates = findFiles(projectPath, ['.go'], 5).filter((file) => {
      const content = safeReadFile(file);
      return /\.GET\(|\.POST\(|\.PUT\(|\.DELETE\(/.test(content);
    });

    const services = candidates.map((file, index) => {
      const rel = toRel(projectPath, file);
      const handlers = parseGoHandlers(safeReadFile(file), rel);
      const id = normalizeId(`go-service-${index + 1}-${path.basename(file, '.go')}`);
      return buildServiceSeed(
        id,
        path.basename(file, '.go'),
        discovery.runtime,
        path.dirname(rel),
        rel,
        rel,
        handlers,
        0.9
      );
    });

    applySeedsToIr(ir, services, detectDataStores(projectPath, 0.85), 'native');
    return finalizeMappedIr(ir, discovery);
  }
}

/**
 * Stack-specific mapper for Express projects.
 */
export class ExpressNativeArchitectureMapper implements ArchitectureMapper {
  async mapToIR(
    projectPath: string,
    discovery: DiscoveryResult,
    existingIr?: ArchitectureIR
  ): Promise<ArchitectureIR> {
    const ir = baseIr(projectPath, discovery, existingIr, 'native');
    const candidates = findFiles(projectPath, ['.ts', '.js'], 6).filter((file) => {
      const content = safeReadFile(file);
      return (
        /\bexpress\(/.test(content) ||
        /\b(?:app|router)\.(get|post|put|delete|patch)\(/.test(content)
      );
    });

    const services = candidates.map((file, index) => {
      const rel = toRel(projectPath, file);
      const handlers = parseExpressHandlers(safeReadFile(file), rel);
      const baseName = path.basename(file).replace(/\.(ts|js)$/, '');
      const id = normalizeId(`express-service-${index + 1}-${baseName}`);
      return buildServiceSeed(
        id,
        baseName,
        discovery.runtime,
        path.dirname(rel),
        rel,
        rel,
        handlers,
        0.93
      );
    });

    applySeedsToIr(ir, services, detectDataStores(projectPath, 0.86), 'native');
    return finalizeMappedIr(ir, discovery);
  }
}

/**
 * Stack-specific mapper for Koa projects.
 */
export class KoaNativeArchitectureMapper implements ArchitectureMapper {
  async mapToIR(
    projectPath: string,
    discovery: DiscoveryResult,
    existingIr?: ArchitectureIR
  ): Promise<ArchitectureIR> {
    const ir = baseIr(projectPath, discovery, existingIr, 'native');
    const candidates = findFiles(projectPath, ['.ts', '.js'], 6).filter((file) => {
      const content = safeReadFile(file);
      return (
        /\bnew\s+Koa\(/.test(content) || /\brouter\.(get|post|put|delete|patch)\(/.test(content)
      );
    });

    const services = candidates.map((file, index) => {
      const rel = toRel(projectPath, file);
      const handlers = parseKoaHandlers(safeReadFile(file), rel);
      const baseName = path.basename(file).replace(/\.(ts|js)$/, '');
      const id = normalizeId(`koa-service-${index + 1}-${baseName}`);
      return buildServiceSeed(
        id,
        baseName,
        discovery.runtime,
        path.dirname(rel),
        rel,
        rel,
        handlers,
        0.9
      );
    });

    applySeedsToIr(ir, services, detectDataStores(projectPath, 0.84), 'native');
    return finalizeMappedIr(ir, discovery);
  }
}

/**
 * Stack-specific mapper for Django projects.
 */
export class DjangoNativeArchitectureMapper implements ArchitectureMapper {
  async mapToIR(
    projectPath: string,
    discovery: DiscoveryResult,
    existingIr?: ArchitectureIR
  ): Promise<ArchitectureIR> {
    const ir = baseIr(projectPath, discovery, existingIr, 'native');
    const candidates = findFiles(projectPath, ['.py'], 7).filter((file) => {
      const rel = toRel(projectPath, file);
      const content = safeReadFile(file);
      return rel.endsWith('urls.py') || /\bpath\(|\bre_path\(/.test(content);
    });

    const services = candidates.map((file, index) => {
      const rel = toRel(projectPath, file);
      const handlers = parseDjangoHandlers(safeReadFile(file), rel);
      const baseName = path.basename(file, '.py');
      const id = normalizeId(`django-service-${index + 1}-${baseName}`);
      return buildServiceSeed(
        id,
        baseName,
        discovery.runtime,
        path.dirname(rel),
        rel,
        rel,
        handlers,
        0.9
      );
    });

    applySeedsToIr(ir, services, detectDataStores(projectPath, 0.87), 'native');
    return finalizeMappedIr(ir, discovery);
  }
}

/**
 * Stack-specific mapper for Flask projects.
 */
export class FlaskNativeArchitectureMapper implements ArchitectureMapper {
  async mapToIR(
    projectPath: string,
    discovery: DiscoveryResult,
    existingIr?: ArchitectureIR
  ): Promise<ArchitectureIR> {
    const ir = baseIr(projectPath, discovery, existingIr, 'native');
    const candidates = findFiles(projectPath, ['.py'], 6).filter((file) => {
      const content = safeReadFile(file);
      return (
        /\bFlask\(/.test(content) ||
        /@(?:app|bp)\.(?:route|get|post|put|delete|patch)\(/.test(content)
      );
    });

    const services = candidates.map((file, index) => {
      const rel = toRel(projectPath, file);
      const handlers = parseFlaskHandlers(safeReadFile(file), rel);
      const baseName = path.basename(file, '.py');
      const id = normalizeId(`flask-service-${index + 1}-${baseName}`);
      return buildServiceSeed(
        id,
        baseName,
        discovery.runtime,
        path.dirname(rel),
        rel,
        rel,
        handlers,
        0.94
      );
    });

    applySeedsToIr(ir, services, detectDataStores(projectPath, 0.87), 'native');
    return finalizeMappedIr(ir, discovery);
  }
}

/**
 * Stack-specific mapper for Spring Boot projects.
 */
export class SpringBootArchitectureMapper implements ArchitectureMapper {
  async mapToIR(
    projectPath: string,
    discovery: DiscoveryResult,
    existingIr?: ArchitectureIR
  ): Promise<ArchitectureIR> {
    const ir = baseIr(projectPath, discovery, existingIr, 'native');

    const candidates = findFiles(projectPath, ['.java'], 8).filter((file) => {
      const content = safeReadFile(file);
      const rel = toRel(projectPath, file);
      return (
        /@RestController|@Controller/.test(content) ||
        /@GetMapping|@PostMapping|@PutMapping|@DeleteMapping|@PatchMapping|@RequestMapping/.test(
          content
        ) ||
        /Controller\.java$/i.test(rel)
      );
    });

    const services = candidates.map((file, index) => {
      const rel = toRel(projectPath, file);
      const content = safeReadFile(file);
      const handlers = parseSpringHandlers(content, rel);
      const baseName = path.basename(file, '.java').replace(/Controller$/i, '') || 'spring-service';
      const id = normalizeId(`spring-service-${index + 1}-${baseName}`);
      return buildServiceSeed(
        id,
        baseName,
        discovery.runtime,
        path.dirname(rel),
        rel,
        rel,
        handlers,
        0.95
      );
    });

    if (services.length === 0) {
      const fallback = findFiles(projectPath, ['.java'], 8).find((file) =>
        /Application\.java$/i.test(file)
      );
      if (fallback) {
        const rel = toRel(projectPath, fallback);
        services.push(
          buildServiceSeed(
            normalizeId('spring-service-1-application'),
            path.basename(fallback, '.java'),
            discovery.runtime,
            path.dirname(rel),
            rel,
            rel,
            [],
            0.85
          )
        );
      }
    }

    applySeedsToIr(ir, services, detectDataStores(projectPath, 0.9), 'native');
    return finalizeMappedIr(ir, discovery);
  }
}

/**
 * Stack-specific mapper for Rails projects.
 */
export class RailsNativeArchitectureMapper implements ArchitectureMapper {
  async mapToIR(
    projectPath: string,
    discovery: DiscoveryResult,
    existingIr?: ArchitectureIR
  ): Promise<ArchitectureIR> {
    const ir = baseIr(projectPath, discovery, existingIr, 'native');
    const routesFile = path.join(projectPath, 'config', 'routes.rb');
    const candidates = this.fileExists(routesFile)
      ? [routesFile]
      : findFiles(projectPath, ['.rb'], 7).filter((file) => /routes\.rb$/i.test(file));

    const services = candidates.map((file, index) => {
      const rel = toRel(projectPath, file);
      const handlers = parseRailsHandlers(safeReadFile(file), rel);
      const id = normalizeId(`rails-service-${index + 1}-routes`);
      return buildServiceSeed(
        id,
        'routes',
        discovery.runtime,
        path.dirname(rel),
        rel,
        rel,
        handlers,
        0.9
      );
    });

    applySeedsToIr(ir, services, detectDataStores(projectPath, 0.85), 'native');
    return finalizeMappedIr(ir, discovery);
  }

  private fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }
}

/**
 * Stack-specific mapper for .NET API projects.
 */
export class DotnetNativeArchitectureMapper implements ArchitectureMapper {
  async mapToIR(
    projectPath: string,
    discovery: DiscoveryResult,
    existingIr?: ArchitectureIR
  ): Promise<ArchitectureIR> {
    const ir = baseIr(projectPath, discovery, existingIr, 'native');
    const candidates = findFiles(projectPath, ['.cs'], 8).filter((file) => {
      const rel = toRel(projectPath, file);
      const content = safeReadFile(file);
      return rel.endsWith('Controller.cs') || /\[Http(Get|Post|Put|Delete|Patch)/.test(content);
    });

    const services = candidates.map((file, index) => {
      const rel = toRel(projectPath, file);
      const handlers = parseDotnetHandlers(safeReadFile(file), rel);
      const baseName = path.basename(file, '.cs').replace(/Controller$/i, '') || 'api';
      const id = normalizeId(`dotnet-service-${index + 1}-${baseName}`);
      return buildServiceSeed(
        id,
        baseName,
        discovery.runtime,
        path.dirname(rel),
        rel,
        rel,
        handlers,
        0.93
      );
    });

    applySeedsToIr(ir, services, detectDataStores(projectPath, 0.86), 'native');
    return finalizeMappedIr(ir, discovery);
  }
}

/**
 * Heuristic fallback mapper for unknown/unsupported stacks.
 */
export class HeuristicArchitectureMapper implements ArchitectureMapper {
  async mapToIR(
    projectPath: string,
    discovery: DiscoveryResult,
    existingIr?: ArchitectureIR
  ): Promise<ArchitectureIR> {
    const ir = baseIr(projectPath, discovery, existingIr, 'heuristic');

    const entryCandidates = findLikelyEntryPoints(projectPath);
    const services: ServiceSeed[] = entryCandidates.map((rel, index) => {
      const abs = path.join(projectPath, rel);
      const content = safeReadFile(abs);
      const handlers = parseGenericHandlers(content, rel);
      const id = normalizeId(
        `heuristic-service-${index + 1}-${path.basename(rel).replace(/\.[^.]+$/, '')}`
      );
      return buildServiceSeed(
        id,
        path.basename(rel).replace(/\.[^.]+$/, ''),
        discovery.runtime as RuntimeType,
        path.dirname(rel),
        rel,
        rel,
        handlers,
        0.65
      );
    });

    if (services.length === 0) {
      const fallback = discovery.entryPoint || 'unknown-entry';
      services.push(
        buildServiceSeed(
          normalizeId('heuristic-service-1-default'),
          'default-service',
          discovery.runtime as RuntimeType,
          '.',
          fallback,
          fallback,
          [],
          0.5
        )
      );
    }

    applySeedsToIr(ir, services, detectDataStores(projectPath, 0.6), 'heuristic');
    return finalizeMappedIr(ir, discovery);
  }
}

/**
 * Incremental mapper that updates existing IR from changed files only.
 */
export class IncrementalArchitectureMapper {
  async updateIR(
    projectPath: string,
    existingIr: ArchitectureIR,
    changedFiles: string[]
  ): Promise<ArchitectureIR> {
    const now = new Date().toISOString();
    const next: ArchitectureIR = {
      ...existingIr,
      updatedAt: now,
      topology: {
        ...existingIr.topology,
        services: [...existingIr.topology.services],
        dataStores: [...existingIr.topology.dataStores],
      },
      mapping: { ...existingIr.mapping },
      metadata: {
        ...existingIr.metadata,
        lastValidated: now,
      },
    };

    const normalizedChanged = changedFiles.map((file) => toRel(projectPath, file));

    // Refresh mapping timestamps/confidence for directly touched components.
    Object.entries(next.mapping).forEach(([componentId, metadata]) => {
      if (normalizedChanged.includes(metadata.sourceFile)) {
        next.mapping[componentId] = {
          ...metadata,
          mappedAt: now,
          confidence: Math.max(metadata.confidence - 0.05, 0.4),
          automationHint: 'Re-scan component using native mapper for full confidence recovery',
        };
      }
    });

    // Add newly introduced service candidates from changed files.
    for (const rel of normalizedChanged) {
      if (!looksLikeServiceFile(rel)) {
        continue;
      }
      const hasService = next.topology.services.some(
        (svc) => svc.entryPoint === rel || svc.path === path.dirname(rel)
      );
      if (hasService) {
        continue;
      }

      const id = normalizeId(`incremental-${path.basename(rel).replace(/\.[^.]+$/, '')}`);
      const service = createServiceComponent(
        id,
        path.basename(rel).replace(/\.[^.]+$/, ''),
        next.runtime,
        path.dirname(rel),
        rel
      );
      service.confidenceLevel = 'low';
      service.mappingSource = 'incremental-changed-file';
      service.handlers = [];

      next.topology.services.push(service);
      next.mapping[id] = {
        sourceFile: rel,
        lineRange: [1, 1],
        confidence: 0.45,
        mappedAt: now,
        mapperType: 'heuristic',
        evidence: ['File changed and matched service naming heuristic'],
        automationHint: 'Promote to native mapping once framework parser confirms routes',
      };
    }

    return finalizeMappedIr(next);
  }
}

export function assessMappingScopeForMutation(
  ir: ArchitectureIR,
  discovery?: Pick<DiscoveryResult, 'framework' | 'confidenceLevel'>
): MappingScopeAssessment {
  const mappedServiceCount = ir.topology.services.length;
  const mappedDataStoreCount = ir.topology.dataStores.length;
  const expectedComponentCount = mappedServiceCount + mappedDataStoreCount;

  const mappedComponentIds = new Set<string>([
    ...ir.topology.services.map((svc) => svc.id),
    ...ir.topology.dataStores.map((ds) => ds.id),
  ]);
  const mappedKeyCount = Object.keys(ir.mapping).filter((id) => mappedComponentIds.has(id)).length;
  const mappingCoverage = expectedComponentCount > 0 ? mappedKeyCount / expectedComponentCount : 0;

  const handlerCount = ir.topology.services.reduce((sum, svc) => sum + svc.handlers.length, 0);
  const servicesWithoutHandlers = ir.topology.services.filter(
    (svc) => svc.handlers.length === 0
  ).length;
  const handlerCoverage =
    mappedServiceCount > 0 ? 1 - servicesWithoutHandlers / mappedServiceCount : 0;

  const framework = discovery?.framework ?? ir.framework;
  const frameworkNativelySupported = framework ? NATIVE_FRAMEWORKS.has(framework) : false;
  const heuristicOnly =
    ir.metadata.mapperType === 'heuristic' ||
    Object.values(ir.mapping).every((meta) => meta.mapperType === 'heuristic');

  const blockedReasons: string[] = [];

  if (expectedComponentCount === 0) {
    blockedReasons.push('Affected scope is unknown because no components were mapped.');
  }

  if (mappingCoverage < 0.7) {
    blockedReasons.push('Mapped component coverage is below mutation-safe threshold (70%).');
  }

  if (mappedServiceCount > 0 && handlerCount === 0) {
    blockedReasons.push('Service handler coverage is empty, so endpoint impact scope is unknown.');
  }

  if (mappedServiceCount > 0 && handlerCoverage < 0.5) {
    blockedReasons.push('More than half of mapped services have no handlers.');
  }

  if (heuristicOnly && !frameworkNativelySupported) {
    blockedReasons.push(
      'Only heuristic mapping is available for a non-native framework; block mutation until scope is confirmed.'
    );
  }

  if ((discovery?.confidenceLevel ?? ir.metadata.confidenceLevel) === 'low') {
    blockedReasons.push(
      'Mapping confidence is low and cannot safely support mutating recommendations.'
    );
  }

  const unknownScope = blockedReasons.length > 0;

  let scopeCoverage: 'known' | 'partial' | 'unknown' = 'known';
  if (unknownScope) {
    scopeCoverage = 'unknown';
  } else if (mappingCoverage < 0.9 || !frameworkNativelySupported) {
    scopeCoverage = 'partial';
  }

  const scopeConfidenceScore = clamp01(
    mappingCoverage * 0.6 +
      handlerCoverage * 0.2 +
      (frameworkNativelySupported ? 0.15 : 0.05) +
      ((discovery?.confidenceLevel ?? ir.metadata.confidenceLevel) === 'high' ? 0.05 : 0)
  );

  return {
    unknownScope,
    scopeCoverage,
    scopeConfidenceScore,
    mappedServiceCount,
    mappedDataStoreCount,
    blockMutationWhenScopeUnknown: unknownScope,
    blockedReasons,
  };
}

export function shouldBlockMutationRecommendation(
  ir: ArchitectureIR,
  discovery?: Pick<DiscoveryResult, 'framework' | 'confidenceLevel'>
): boolean {
  return assessMappingScopeForMutation(ir, discovery).blockMutationWhenScopeUnknown;
}

function finalizeMappedIr(
  ir: ArchitectureIR,
  discovery?: Pick<DiscoveryResult, 'framework' | 'confidenceLevel'>
): ArchitectureIR {
  const assessment = assessMappingScopeForMutation(ir, discovery);
  ir.metadata.scopeCoverage = assessment.scopeCoverage;
  ir.metadata.scopeConfidenceScore = assessment.scopeConfidenceScore;
  ir.metadata.blockMutationWhenScopeUnknown = assessment.blockMutationWhenScopeUnknown;
  ir.metadata.blockedReasons = assessment.blockedReasons;
  return ir;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function baseIr(
  projectPath: string,
  discovery: DiscoveryResult,
  existingIr: ArchitectureIR | undefined,
  mapperType: 'native' | 'heuristic'
): ArchitectureIR {
  if (existingIr) {
    return {
      ...existingIr,
      updatedAt: new Date().toISOString(),
      runtime: (discovery.runtime as RuntimeType) || existingIr.runtime,
      framework: discovery.framework || existingIr.framework,
      topology: {
        ...existingIr.topology,
        services: [],
        dataStores: [],
      },
      mapping: {},
      metadata: {
        ...existingIr.metadata,
        mapperType,
        confidenceLevel: mapperType === 'native' ? 'high' : discovery.confidenceLevel,
        confidenceReason: discovery.reason,
      },
    };
  }

  const projectId = normalizeId(path.basename(projectPath) || 'unknown-project');
  const projectName = path.basename(projectPath) || 'Unknown Project';
  const ir = createArchitectureIR(projectId, projectName, discovery.runtime as RuntimeType);
  ir.framework = discovery.framework;
  ir.metadata.mapperType = mapperType;
  ir.metadata.confidenceLevel = mapperType === 'native' ? 'high' : discovery.confidenceLevel;
  ir.metadata.confidenceReason = discovery.reason;
  return ir;
}

function applySeedsToIr(
  ir: ArchitectureIR,
  serviceSeeds: ServiceSeed[],
  dataStoreSeeds: DataStoreSeed[],
  mapperType: 'native' | 'heuristic'
): void {
  const now = new Date().toISOString();
  const seenServiceIds = new Set<string>();

  for (const seed of serviceSeeds) {
    if (seenServiceIds.has(seed.id)) {
      continue;
    }
    seenServiceIds.add(seed.id);

    const service = createServiceComponent(
      seed.id,
      seed.name,
      seed.runtime,
      seed.path,
      seed.entryPoint
    );
    service.framework = ir.framework;
    service.handlers = seed.handlers;
    service.confidenceLevel = toConfidenceLevel(seed.confidence);
    service.mappingSource = mapperType;

    ir.topology.services.push(service);
    ir.mapping[seed.id] = createMappingMetadata(seed.sourceFile, seed.confidence, mapperType, now, [
      `Service discovered from ${seed.sourceFile}`,
    ]);
  }

  for (const ds of dataStoreSeeds) {
    if (ir.topology.dataStores.some((existing) => existing.id === ds.id)) {
      continue;
    }
    const dataStore = createDataStoreComponent(ds.id, ds.name, ds.type);
    dataStore.confidenceLevel = toConfidenceLevel(ds.confidence);
    dataStore.mappingSource = mapperType;
    dataStore.accessedBy = ir.topology.services.map((service) => ({ serviceId: service.id }));

    for (const service of ir.topology.services) {
      service.dataStoreAccess.push({
        dataStoreId: dataStore.id,
        operation: 'both',
      });
    }

    ir.topology.dataStores.push(dataStore);
    ir.mapping[ds.id] = createMappingMetadata(ds.sourceFile, ds.confidence, mapperType, now, [
      `Datastore inferred from ${ds.sourceFile}`,
    ]);
  }
}

function createMappingMetadata(
  sourceFile: string,
  confidence: number,
  mapperType: 'native' | 'heuristic',
  mappedAt: string,
  evidence: string[]
): MappingMetadata {
  return {
    sourceFile,
    lineRange: [1, 1],
    confidence,
    mappedAt,
    mapperType,
    evidence,
  };
}

function detectDataStores(projectPath: string, confidence: number): DataStoreSeed[] {
  const seeds: DataStoreSeed[] = [];
  const files = findFiles(
    projectPath,
    ['.py', '.ts', '.js', '.go', '.toml', '.json', '.yml', '.yaml'],
    4
  );

  const signatures: Array<{
    type: DataStoreSeed['type'];
    id: string;
    name: string;
    pattern: RegExp;
  }> = [
    {
      type: 'postgres',
      id: 'postgres-main',
      name: 'Postgres',
      pattern: /(postgres|psycopg|\bpg\b|typeorm.*postgres)/i,
    },
    { type: 'mysql', id: 'mysql-main', name: 'MySQL', pattern: /mysql/i },
    {
      type: 'mongodb',
      id: 'mongodb-main',
      name: 'MongoDB',
      pattern: /(mongodb|mongoose|pymongo)/i,
    },
    { type: 'redis', id: 'redis-main', name: 'Redis', pattern: /redis/i },
    { type: 'dynamodb', id: 'dynamodb-main', name: 'DynamoDB', pattern: /dynamodb/i },
    { type: 's3', id: 's3-main', name: 'S3', pattern: /(\bs3\b|boto3)/i },
    {
      type: 'elasticsearch',
      id: 'elasticsearch-main',
      name: 'Elasticsearch',
      pattern: /elasticsearch|opensearch/i,
    },
  ];

  for (const file of files.slice(0, 120)) {
    const content = safeReadFile(file);
    const rel = toRel(projectPath, file);
    for (const sig of signatures) {
      if (sig.pattern.test(content) && !seeds.some((seed) => seed.id === sig.id)) {
        seeds.push({
          id: sig.id,
          name: sig.name,
          type: sig.type,
          sourceFile: rel,
          confidence,
        });
      }
    }
  }

  return seeds;
}

function findLikelyEntryPoints(projectPath: string): string[] {
  const candidates = [
    'main.py',
    'app.py',
    'server.py',
    'main.ts',
    'src/main.ts',
    'server.js',
    'index.js',
    'main.go',
    'src/main/java/Application.java',
    'src/main/java/com/example/Application.java',
    'config/application.rb',
    'Program.cs',
    'Startup.cs',
  ];
  return candidates.filter((entry) => fs.existsSync(path.join(projectPath, entry)));
}

function parseFastApiHandlers(content: string, sourceFile: string): ServiceHandler[] {
  const handlers: ServiceHandler[] = [];
  const regex = /@app\.(get|post|put|delete|patch)\(["'`]([^"'`]+)["'`]/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const method = match[1].toUpperCase() as ServiceHandler['method'];
    const routePath = normalizeRoute(match[2]);
    handlers.push(
      buildHandler(
        `${method}-${routePath}`,
        method,
        routePath,
        sourceFile,
        content,
        match.index,
        0.95
      )
    );
  }

  return handlers;
}

function parseNestHandlers(content: string, sourceFile: string): ServiceHandler[] {
  const handlers: ServiceHandler[] = [];
  const controllerBase = extractNestControllerBasePath(content);
  const regex = /@(Get|Post|Put|Delete|Patch)\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const method = match[1].toUpperCase() as ServiceHandler['method'];
    const rawPath = cleanDecoratorPath(match[2]);
    const fullPath = joinRoutes(controllerBase, rawPath);
    handlers.push(
      buildHandler(
        `${method}-${fullPath}`,
        method,
        fullPath,
        sourceFile,
        content,
        match.index,
        0.92
      )
    );
  }

  return handlers;
}

function parseGoHandlers(content: string, sourceFile: string): ServiceHandler[] {
  const handlers: ServiceHandler[] = [];
  const regex = /\.(GET|POST|PUT|DELETE|PATCH)\(["'`]([^"'`]+)["'`]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const method = match[1] as ServiceHandler['method'];
    const routePath = normalizeRoute(match[2]);
    handlers.push(
      buildHandler(
        `${method}-${routePath}`,
        method,
        routePath,
        sourceFile,
        content,
        match.index,
        0.88
      )
    );
  }

  return handlers;
}

function parseSpringHandlers(content: string, sourceFile: string): ServiceHandler[] {
  const handlers: ServiceHandler[] = [];
  const classBase = extractSpringClassBasePath(content);

  const mappingRegex =
    /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = mappingRegex.exec(content)) !== null) {
    const annotation = match[1];
    const args = match[2] || '';
    const explicitMethod = extractSpringRequestMethod(args);
    const method = explicitMethod || springAnnotationToMethod(annotation);
    if (!method) {
      continue;
    }

    const rawPath = extractSpringPath(args);
    const fullPath = joinRoutes(classBase, rawPath || '/');
    handlers.push(
      buildHandler(
        `${method}-${fullPath}`,
        method,
        fullPath,
        sourceFile,
        content,
        match.index,
        0.94
      )
    );
  }

  return handlers;
}

function parseExpressHandlers(content: string, sourceFile: string): ServiceHandler[] {
  const handlers: ServiceHandler[] = [];
  const regex = /(?:app|router)\.(get|post|put|delete|patch)\(["'`]([^"'`]+)["'`]/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const method = match[1].toUpperCase() as ServiceHandler['method'];
    const routePath = normalizeRoute(match[2]);
    handlers.push(
      buildHandler(
        `${method}-${routePath}`,
        method,
        routePath,
        sourceFile,
        content,
        match.index,
        0.9
      )
    );
  }
  return handlers;
}

function parseKoaHandlers(content: string, sourceFile: string): ServiceHandler[] {
  const handlers: ServiceHandler[] = [];
  const regex = /(?:router|app)\.(get|post|put|delete|patch)\(\s*["'`]([^"'`]+)["'`]/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const method = match[1].toUpperCase() as ServiceHandler['method'];
    const routePath = normalizeRoute(match[2]);
    handlers.push(
      buildHandler(
        `${method}-${routePath}`,
        method,
        routePath,
        sourceFile,
        content,
        match.index,
        0.88
      )
    );
  }
  return handlers;
}

function parseDjangoHandlers(content: string, sourceFile: string): ServiceHandler[] {
  const handlers: ServiceHandler[] = [];
  const regex = /(?:path|re_path)\(\s*["'`]([^"'`]+)["'`]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const routePath = normalizeRoute(match[1]);
    handlers.push(
      buildHandler(`ANY-${routePath}`, 'ANY', routePath, sourceFile, content, match.index, 0.85)
    );
  }
  return handlers;
}

function parseFlaskHandlers(content: string, sourceFile: string): ServiceHandler[] {
  const handlers: ServiceHandler[] = [];

  const routeRegex =
    /@(?:app|bp)\.route\(\s*["'`]([^"'`]+)["'`](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?/gi;
  let routeMatch: RegExpExecArray | null;
  while ((routeMatch = routeRegex.exec(content)) !== null) {
    const routePath = normalizeRoute(routeMatch[1]);
    const methodsRaw = routeMatch[2];
    if (!methodsRaw) {
      handlers.push(
        buildHandler(
          `ANY-${routePath}`,
          'ANY',
          routePath,
          sourceFile,
          content,
          routeMatch.index,
          0.9
        )
      );
      continue;
    }
    const methods = methodsRaw
      .split(',')
      .map((m) => m.replace(/["'`\s]/g, '').toUpperCase())
      .filter(Boolean) as ServiceHandler['method'][];
    for (const method of methods) {
      handlers.push(
        buildHandler(
          `${method}-${routePath}`,
          method,
          routePath,
          sourceFile,
          content,
          routeMatch.index,
          0.9
        )
      );
    }
  }

  const shortcutRegex = /@(?:app|bp)\.(get|post|put|delete|patch)\(\s*["'`]([^"'`]+)["'`]/gi;
  let shortcutMatch: RegExpExecArray | null;
  while ((shortcutMatch = shortcutRegex.exec(content)) !== null) {
    const method = shortcutMatch[1].toUpperCase() as ServiceHandler['method'];
    const routePath = normalizeRoute(shortcutMatch[2]);
    handlers.push(
      buildHandler(
        `${method}-${routePath}`,
        method,
        routePath,
        sourceFile,
        content,
        shortcutMatch.index,
        0.92
      )
    );
  }

  return dedupeHandlers(handlers);
}

function parseRailsHandlers(content: string, sourceFile: string): ServiceHandler[] {
  const handlers: ServiceHandler[] = [];

  const directRegex = /^\s*(get|post|put|patch|delete)\s+["']([^"']+)["']/gim;
  let directMatch: RegExpExecArray | null;
  while ((directMatch = directRegex.exec(content)) !== null) {
    const method = directMatch[1].toUpperCase() as ServiceHandler['method'];
    const routePath = normalizeRoute(directMatch[2]);
    handlers.push(
      buildHandler(
        `${method}-${routePath}`,
        method,
        routePath,
        sourceFile,
        content,
        directMatch.index,
        0.88
      )
    );
  }

  const resourceRegex = /^\s*resources\s+:([a-zA-Z_][a-zA-Z0-9_]*)/gim;
  let resourceMatch: RegExpExecArray | null;
  while ((resourceMatch = resourceRegex.exec(content)) !== null) {
    const name = resourceMatch[1];
    const collection = normalizeRoute(`/${name}`);
    const member = normalizeRoute(`/${name}/:id`);
    handlers.push(
      buildHandler(
        `GET-${collection}`,
        'GET',
        collection,
        sourceFile,
        content,
        resourceMatch.index,
        0.85
      )
    );
    handlers.push(
      buildHandler(
        `POST-${collection}`,
        'POST',
        collection,
        sourceFile,
        content,
        resourceMatch.index,
        0.85
      )
    );
    handlers.push(
      buildHandler(`GET-${member}`, 'GET', member, sourceFile, content, resourceMatch.index, 0.85)
    );
    handlers.push(
      buildHandler(`PUT-${member}`, 'PUT', member, sourceFile, content, resourceMatch.index, 0.85)
    );
    handlers.push(
      buildHandler(
        `DELETE-${member}`,
        'DELETE',
        member,
        sourceFile,
        content,
        resourceMatch.index,
        0.85
      )
    );
  }

  return dedupeHandlers(handlers);
}

function parseDotnetHandlers(content: string, sourceFile: string): ServiceHandler[] {
  const handlers: ServiceHandler[] = [];
  const controllerName =
    path
      .basename(sourceFile)
      .replace(/Controller\.cs$/i, '')
      .toLowerCase() || 'controller';
  const classRouteMatch = content.match(/\[Route\(\s*"([^"]+)"\s*\)\]/);
  let classBase = classRouteMatch ? classRouteMatch[1] : '/';
  classBase = classBase.replace(/\[controller\]/gi, controllerName);
  classBase = normalizeRoute(classBase);

  const regex = /\[(HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch)(?:\(\s*"([^"]*)"\s*\))?\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const annotation = match[1];
    const segment = match[2] || '/';
    const method = annotation.replace('Http', '').toUpperCase() as ServiceHandler['method'];
    const routePath = joinRoutes(classBase, segment || '/');
    handlers.push(
      buildHandler(
        `${method}-${routePath}`,
        method,
        routePath,
        sourceFile,
        content,
        match.index,
        0.9
      )
    );
  }

  return handlers;
}

function parseGenericHandlers(content: string, sourceFile: string): ServiceHandler[] {
  const fromFastApi = parseFastApiHandlers(content, sourceFile);
  if (fromFastApi.length > 0) {
    return fromFastApi;
  }

  const fromNest = parseNestHandlers(content, sourceFile);
  if (fromNest.length > 0) {
    return fromNest;
  }

  const fromGo = parseGoHandlers(content, sourceFile);
  if (fromGo.length > 0) {
    return fromGo;
  }

  const fromSpring = parseSpringHandlers(content, sourceFile);
  if (fromSpring.length > 0) {
    return fromSpring;
  }

  const fromFlask = parseFlaskHandlers(content, sourceFile);
  if (fromFlask.length > 0) {
    return fromFlask;
  }

  const fromDjango = parseDjangoHandlers(content, sourceFile);
  if (fromDjango.length > 0) {
    return fromDjango;
  }

  const fromKoa = parseKoaHandlers(content, sourceFile);
  if (fromKoa.length > 0) {
    return fromKoa;
  }

  const fromRails = parseRailsHandlers(content, sourceFile);
  if (fromRails.length > 0) {
    return fromRails;
  }

  const fromDotnet = parseDotnetHandlers(content, sourceFile);
  if (fromDotnet.length > 0) {
    return fromDotnet;
  }

  return parseExpressHandlers(content, sourceFile);
}

function dedupeHandlers(handlers: ServiceHandler[]): ServiceHandler[] {
  const seen = new Set<string>();
  const next: ServiceHandler[] = [];
  for (const handler of handlers) {
    const key = `${handler.method}|${handler.path}|${handler.sourceFile}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(handler);
  }
  return next;
}

function extractSpringClassBasePath(content: string): string {
  const classLevel = content.match(
    /@RequestMapping\s*\(([^)]*)\)\s*(?:public\s+)?(?:class|interface)/s
  );
  if (!classLevel) {
    return '/';
  }
  const rawPath = extractSpringPath(classLevel[1] || '');
  return normalizeRoute(rawPath || '/');
}

function extractSpringPath(args: string): string {
  const namedPath = args.match(/(?:path|value)\s*=\s*["'`]([^"'`]+)["'`]/);
  if (namedPath) {
    return namedPath[1];
  }

  const positionalPath = args.match(/["'`]([^"'`]+)["'`]/);
  if (positionalPath) {
    return positionalPath[1];
  }

  return '/';
}

function extractSpringRequestMethod(args: string): ServiceHandler['method'] | undefined {
  const methodMatch = args.match(/RequestMethod\.(GET|POST|PUT|DELETE|PATCH)/);
  if (!methodMatch) {
    return undefined;
  }
  return methodMatch[1] as ServiceHandler['method'];
}

function springAnnotationToMethod(annotation: string): ServiceHandler['method'] | undefined {
  switch (annotation) {
    case 'GetMapping':
      return 'GET';
    case 'PostMapping':
      return 'POST';
    case 'PutMapping':
      return 'PUT';
    case 'DeleteMapping':
      return 'DELETE';
    case 'PatchMapping':
      return 'PATCH';
    case 'RequestMapping':
      return 'ANY';
    default:
      return undefined;
  }
}

function buildHandler(
  id: string,
  method: ServiceHandler['method'],
  routePath: string,
  sourceFile: string,
  content: string,
  offset: number,
  confidence: number
): ServiceHandler {
  const line = lineNumberAtOffset(content, offset);
  return {
    id: normalizeId(id),
    method,
    path: routePath,
    sourceFile,
    lineRange: [line, line],
    confidence,
  };
}

function buildServiceSeed(
  id: string,
  name: string,
  runtime: string,
  servicePath: string,
  entryPoint: string,
  sourceFile: string,
  handlers: ServiceHandler[],
  confidence: number
): ServiceSeed {
  return {
    id,
    name,
    runtime: (runtime as RuntimeType) || 'unknown',
    path: servicePath === '' ? '.' : servicePath,
    entryPoint,
    sourceFile,
    handlers,
    confidence,
  };
}

function toConfidenceLevel(value: number): 'high' | 'medium' | 'low' {
  if (value >= 0.8) {
    return 'high';
  }
  if (value >= 0.55) {
    return 'medium';
  }
  return 'low';
}

function lineNumberAtOffset(content: string, offset: number): number {
  if (offset <= 0) {
    return 1;
  }
  return content.slice(0, offset).split('\n').length;
}

function extractNestControllerBasePath(content: string): string {
  const match = content.match(/@Controller\(([^)]*)\)/);
  if (!match) {
    return '/';
  }
  const raw = cleanDecoratorPath(match[1]);
  return normalizeRoute(raw);
}

function cleanDecoratorPath(raw: string): string {
  const cleaned = raw.trim().replace(/["'`]/g, '');
  if (cleaned === '' || cleaned === 'undefined' || cleaned === 'null') {
    return '/';
  }
  return cleaned;
}

function normalizeRoute(value: string): string {
  if (!value) {
    return '/';
  }
  const prefixed = value.startsWith('/') ? value : `/${value}`;
  return prefixed.replace(/\/+/g, '/');
}

function joinRoutes(base: string, child: string): string {
  const normalizedBase = normalizeRoute(base);
  const normalizedChild = normalizeRoute(child);
  if (normalizedChild === '/') {
    return normalizedBase;
  }
  return normalizeRoute(`${normalizedBase}/${normalizedChild}`);
}

function normalizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function toRel(projectPath: string, filePath: string): string {
  return path.relative(projectPath, filePath).replace(/\\/g, '/');
}

function safeReadFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function looksLikeServiceFile(relPath: string): boolean {
  return (
    /(^|\/)(main|app|server)\.(py|ts|js|go)$/i.test(relPath) ||
    relPath.endsWith('.controller.ts') ||
    relPath.endsWith('.service.ts') ||
    relPath.endsWith('Controller.java') ||
    relPath.endsWith('routes.rb') ||
    relPath.endsWith('Controller.cs') ||
    relPath.endsWith('urls.py')
  );
}

function findFiles(projectPath: string, exts: string[], maxDepth: number): string[] {
  const results: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) {
      return;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
          continue;
        }
        walk(full, depth + 1);
        continue;
      }

      if (exts.some((ext) => entry.name.endsWith(ext))) {
        results.push(full);
      }
    }
  };

  walk(projectPath, 0);
  return results;
}
