import crypto from 'node:crypto';
import * as path from 'node:path';

import {
  incompatibleJsonArtifact,
  isJsonArtifactReadFailure,
  readJsonArtifact,
  type JsonArtifactReadResult,
} from './jsonArtifactReader.js';
import { PROJECT_KNOWLEDGE_GRAPH_REFERENCE_PATH } from './workspaceIntelligencePaths.js';

export const PROJECT_KNOWLEDGE_GRAPH_REFERENCE_SCHEMA_VERSION =
  'project-knowledge-graph-reference.v1' as const;

export type ProjectKnowledgeGraphReference = {
  schemaVersion: typeof PROJECT_KNOWLEDGE_GRAPH_REFERENCE_SCHEMA_VERSION;
  generatedAt: string;
  project: { name: string };
  canonical: {
    graph: 'workspace:.workspai/reports/workspace-knowledge-graph.json';
    boundedQuery: string;
    sourceHash: string;
    projectionHash: string;
  };
  summary: { entityCount: number; relationCount: number; proofCount: number };
  integrity: {
    algorithm: 'sha256';
    payloadHash: string;
    portable: true;
    absolutePathsEmitted: false;
  };
};

export type ProjectKnowledgeGraphReferenceReadResult =
  | { kind: 'missing'; artifactPath: string }
  | {
      kind: 'valid';
      artifactPath: string;
      reference: ProjectKnowledgeGraphReference;
    }
  | { kind: 'corrupt'; artifactPath: string; error: string }
  | { kind: 'incompatible'; artifactPath: string; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSort);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableSort(value[key])])
  );
}

function hashCanonicalJson(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableSort(value)))
    .digest('hex');
}

function isPortableValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return !/(?:^|[\s"'`(=])(?:\/(?![/.])|~[\\/]|\$HOME[\\/]|%USERPROFILE%[\\/]|[A-Za-z]:[\\/]|\\\\[^\\\s]+\\|file:\/\/)/i.test(
      value
    );
  }
  if (Array.isArray(value)) {
    return value.every(isPortableValue);
  }
  return !isRecord(value) || Object.values(value).every(isPortableValue);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function isProjectKnowledgeGraphReference(
  value: unknown
): value is ProjectKnowledgeGraphReference {
  if (!isRecord(value)) {
    return false;
  }
  const project = value.project;
  const canonical = value.canonical;
  const summary = value.summary;
  const integrity = value.integrity;
  return (
    value.schemaVersion === PROJECT_KNOWLEDGE_GRAPH_REFERENCE_SCHEMA_VERSION &&
    typeof value.generatedAt === 'string' &&
    !Number.isNaN(Date.parse(value.generatedAt)) &&
    isRecord(project) &&
    typeof project.name === 'string' &&
    Boolean(project.name.trim()) &&
    isRecord(canonical) &&
    canonical.graph === 'workspace:.workspai/reports/workspace-knowledge-graph.json' &&
    typeof canonical.boundedQuery === 'string' &&
    Boolean(canonical.boundedQuery.trim()) &&
    isHash(canonical.sourceHash) &&
    isHash(canonical.projectionHash) &&
    isRecord(summary) &&
    isNonNegativeInteger(summary.entityCount) &&
    isNonNegativeInteger(summary.relationCount) &&
    isNonNegativeInteger(summary.proofCount) &&
    isRecord(integrity) &&
    integrity.algorithm === 'sha256' &&
    isHash(integrity.payloadHash) &&
    integrity.portable === true &&
    integrity.absolutePathsEmitted === false &&
    isPortableValue(value)
  );
}

export async function readProjectKnowledgeGraphReference(input: {
  projectPath: string;
  expectedProjectName?: string;
  canonicalGraph?: Record<string, unknown>;
}): Promise<ProjectKnowledgeGraphReferenceReadResult> {
  const absolutePath = path.join(input.projectPath, PROJECT_KNOWLEDGE_GRAPH_REFERENCE_PATH);
  const result: JsonArtifactReadResult = await readJsonArtifact(absolutePath);
  if (isJsonArtifactReadFailure(result)) {
    return result;
  }
  if (!isProjectKnowledgeGraphReference(result.raw)) {
    return incompatibleJsonArtifact({
      artifactPath: result.artifactPath,
      expectedSchemaVersion: PROJECT_KNOWLEDGE_GRAPH_REFERENCE_SCHEMA_VERSION,
      actualSchemaVersion: result.raw.schemaVersion,
      reason: 'Project Graph reference is incomplete, non-portable, or structurally invalid.',
    });
  }

  const { integrity, ...payload } = result.raw;
  if (hashCanonicalJson(payload) !== integrity.payloadHash) {
    return incompatibleJsonArtifact({
      artifactPath: result.artifactPath,
      expectedSchemaVersion: PROJECT_KNOWLEDGE_GRAPH_REFERENCE_SCHEMA_VERSION,
      actualSchemaVersion: result.raw.schemaVersion,
      reason: 'Project Graph reference payload hash does not match its portable payload.',
    });
  }
  if (input.expectedProjectName && result.raw.project.name !== input.expectedProjectName) {
    return incompatibleJsonArtifact({
      artifactPath: result.artifactPath,
      expectedSchemaVersion: PROJECT_KNOWLEDGE_GRAPH_REFERENCE_SCHEMA_VERSION,
      actualSchemaVersion: result.raw.schemaVersion,
      reason: `Project Graph reference belongs to ${result.raw.project.name}, not ${input.expectedProjectName}.`,
    });
  }
  const graphSource = isRecord(input.canonicalGraph?.source)
    ? input.canonicalGraph.source
    : undefined;
  if (graphSource && result.raw.canonical.sourceHash !== graphSource.hash) {
    return incompatibleJsonArtifact({
      artifactPath: result.artifactPath,
      expectedSchemaVersion: PROJECT_KNOWLEDGE_GRAPH_REFERENCE_SCHEMA_VERSION,
      actualSchemaVersion: result.raw.schemaVersion,
      reason: 'Project Graph reference is stale relative to the canonical workspace Graph.',
    });
  }
  return { kind: 'valid', artifactPath: result.artifactPath, reference: result.raw };
}
