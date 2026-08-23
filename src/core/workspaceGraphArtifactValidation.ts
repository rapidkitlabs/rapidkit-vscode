import crypto from 'node:crypto';

export type WorkspaceGraphArtifactValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

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

export function hashWorkspaceModelForGraphBinding(model: Record<string, unknown>): string {
  const deprecatedGraph = model.graph;
  const projectTopology = model.projectTopology;
  const projects = model.projects;
  const validation = model.validation;
  const stableModel = { ...model };
  for (const key of [
    'runId',
    'evidence',
    'facts',
    'factFreshness',
    'build',
    'graph',
    'projectTopology',
    'projects',
    'validation',
  ]) {
    delete stableModel[key];
  }
  const structuralProjects = Array.isArray(projects)
    ? projects.map((value) => {
        if (!isRecord(value)) {
          return value;
        }
        const project = { ...value };
        delete project.evidence;
        return project;
      })
    : [];
  const topology = isRecord(projectTopology)
    ? projectTopology
    : isRecord(deprecatedGraph)
      ? deprecatedGraph
      : undefined;
  const stableValidation = isRecord(validation)
    ? {
        ...validation,
        issues: Array.isArray(validation.issues)
          ? [...validation.issues].sort((left, right) => {
              const issueKey = (value: unknown) => {
                const issue = isRecord(value) ? value : {};
                return `${String(issue.severity ?? '')}:${String(issue.code ?? '')}:${String(issue.target ?? '')}:${String(issue.message ?? '')}`;
              };
              return issueKey(left).localeCompare(issueKey(right));
            })
          : validation.issues,
      }
    : validation;
  const canonical = stableSort({
    ...stableModel,
    generatedAt: '<ignored>',
    projects: structuralProjects,
    projectTopology: topology ? { ...topology, generatedAt: '<ignored>' } : undefined,
    validation: stableValidation,
  });
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function validateWorkspaceGraphArtifact(
  graph: Record<string, unknown>,
  model?: Record<string, unknown>
): WorkspaceGraphArtifactValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (graph.schemaVersion !== 'workspace-knowledge-graph.v1') {
    errors.push('Graph schema is not workspace-knowledge-graph.v1.');
  }
  for (const key of ['source', 'workspace', 'projectTopology', 'quality'] as const) {
    if (!isRecord(graph[key])) {
      errors.push(`Graph ${key} is missing or invalid.`);
    }
  }
  for (const key of ['entities', 'relations', 'proofs', 'providers', 'diagnostics'] as const) {
    if (!Array.isArray(graph[key])) {
      errors.push(`Graph ${key} must be an array.`);
    }
  }
  const source = isRecord(graph.source) ? graph.source : {};
  const sourceHash = typeof source.hash === 'string' ? source.hash : '';
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) {
    errors.push('Graph source hash is missing or invalid.');
  } else if (model && hashWorkspaceModelForGraphBinding(model) !== sourceHash) {
    errors.push('Graph source hash does not match the canonical Workspace Model.');
  }
  const staleProofs = Array.isArray(graph.proofs)
    ? graph.proofs.filter((proof) => isRecord(proof) && proof.freshness === 'stale').length
    : 0;
  if (staleProofs > 0) {
    errors.push(`${staleProofs} graph proof(s) are stale.`);
  }

  const inputs = isRecord(source.inputs) ? source.inputs : null;
  const scopes = inputs && Array.isArray(inputs.scopes) ? inputs.scopes : null;
  if (!inputs || inputs.schemaVersion !== 'workspace-knowledge-graph-inputs.v1' || !scopes) {
    errors.push('Graph input fingerprint metadata is missing or incompatible.');
  } else {
    const workspaceScopes = scopes.filter((scope) => isRecord(scope) && scope.kind === 'workspace');
    if (workspaceScopes.length !== 1) {
      errors.push('Graph input fingerprint must contain exactly one workspace scope.');
    }
    const projectIds = new Set(
      scopes.flatMap((scope) =>
        isRecord(scope) && scope.kind === 'project' && typeof scope.id === 'string'
          ? [scope.id]
          : []
      )
    );
    const modelProjects = Array.isArray(model?.projects)
      ? model.projects.flatMap((project) =>
          isRecord(project) && typeof project.name === 'string' ? [project.name] : []
        )
      : [];
    for (const projectId of modelProjects) {
      if (!projectIds.has(projectId)) {
        errors.push(`Graph input scope is missing project ${projectId}.`);
      }
    }
    if (scopes.some((scope) => isRecord(scope) && scope.truncated === true)) {
      warnings.push('One or more graph source scopes are bounded.');
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}
