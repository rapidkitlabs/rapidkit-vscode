export const WORKSPACE_GRAPH_PROJECTION_PREFIX = '__workspace_graph_projection_v1__:';

export type WorkspaceGraphEntityProjection = {
  id: string;
  kind: string;
  label: string;
  projectId?: string;
  path?: string;
  scope?: string;
  proofIds: string[];
  attributes: Record<string, unknown>;
};

export type WorkspaceGraphRelationProjection = {
  id: string;
  from: string;
  to: string;
  kind: string;
  derivation?: string;
  trust?: string;
  confidence?: string;
  proofIds: string[];
};

export type WorkspaceGraphProofProjection = {
  id: string;
  provider?: string;
  artifact?: string;
  pointer?: string;
  line?: number;
  column?: number;
  observedAt?: string;
  derivation?: string;
  trust?: string;
  confidence?: string;
  freshness?: string;
  detail?: string;
};

export type WorkspaceGraphProviderProjection = {
  id: string;
  version?: string;
  status?: string;
  permission?: string;
  discoveredEntities?: number;
  discoveredRelations?: number;
  proofCount?: number;
  diagnostics: string[];
};

export type WorkspaceGraphInputScopeProjection = {
  kind: string;
  id: string;
  strategy?: string;
  fileCount?: number;
  fileLimit?: number;
  truncated?: boolean;
};

export type WorkspaceGraphBindingCoverageProjection = {
  eligibleCount: number;
  boundCount: number;
  unknownCount: number;
  coverageRatio: number | null;
};

export type WorkspaceGraphQualityProjection = {
  [key: string]:
    | number
    | string
    | boolean
    | Record<string, WorkspaceGraphBindingCoverageProjection>
    | undefined;
  entityCount?: number;
  relationCount?: number;
  proofCount?: number;
  entityProofCoverageRatio?: number;
  relationProofCoverageRatio?: number;
  providerSuccessRatio?: number;
  conflictCount?: number;
  unknownCount?: number;
  portable?: boolean;
  secretValuesEmitted?: boolean;
  bindingCoverage?: Record<string, WorkspaceGraphBindingCoverageProjection>;
};

export type WorkspaceGraphProjection = {
  schemaVersion: 'workspace-graph-projection.v1';
  sourceSchemaVersion: string;
  generatedAt?: string;
  revision: string;
  truncated: boolean;
  total: { entities: number; relations: number; proofs: number };
  entities: WorkspaceGraphEntityProjection[];
  relations: WorkspaceGraphRelationProjection[];
  proofs: WorkspaceGraphProofProjection[];
  workspace?: { name?: string; profile?: string };
  source?: {
    artifact?: string;
    strategy?: string;
    inputHash?: string;
    scopes: WorkspaceGraphInputScopeProjection[];
  };
  providers: WorkspaceGraphProviderProjection[];
  quality: WorkspaceGraphQualityProjection;
  diagnostics: Array<{
    code: string;
    severity: string;
    message: string;
    recommendation?: string;
    entityIds?: string[];
    relationIds?: string[];
  }>;
  highlightedEntityIds?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string' && Boolean((value[key] as string).trim());
}

function validProjectionArray(value: unknown, required: string[]): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && required.every((key) => hasString(entry, key)))
  );
}

export function isWorkspaceGraphProjection(value: unknown): value is WorkspaceGraphProjection {
  if (!isRecord(value) || value.schemaVersion !== 'workspace-graph-projection.v1') {
    return false;
  }
  const total = isRecord(value.total) ? value.total : null;
  if (
    !hasString(value, 'sourceSchemaVersion') ||
    !hasString(value, 'revision') ||
    typeof value.truncated !== 'boolean' ||
    !total ||
    !['entities', 'relations', 'proofs'].every((key) => Number.isFinite(total[key])) ||
    !validProjectionArray(value.entities, ['id', 'kind', 'label']) ||
    !validProjectionArray(value.relations, ['id', 'from', 'to', 'kind']) ||
    !validProjectionArray(value.proofs, ['id']) ||
    !validProjectionArray(value.providers, ['id']) ||
    !Array.isArray(value.diagnostics) ||
    !isRecord(value.quality)
  ) {
    return false;
  }
  const entityIds = new Set(
    (value.entities as Array<Record<string, unknown>>).map((item) => item.id)
  );
  return (value.relations as Array<Record<string, unknown>>).every(
    (relation) => entityIds.has(relation.from) && entityIds.has(relation.to)
  );
}

export function parseWorkspaceGraphProjection(body: string): WorkspaceGraphProjection | null {
  if (!body.startsWith(WORKSPACE_GRAPH_PROJECTION_PREFIX)) {
    return null;
  }
  try {
    const parsed = JSON.parse(body.slice(WORKSPACE_GRAPH_PROJECTION_PREFIX.length)) as unknown;
    return isWorkspaceGraphProjection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function findWorkspaceGraphProjection(
  sections: Array<{ id: string; body: string }> | undefined
): WorkspaceGraphProjection | null {
  const section = sections?.find((entry) => entry.id === 'workspace-graph-projection');
  return section ? parseWorkspaceGraphProjection(section.body) : null;
}
