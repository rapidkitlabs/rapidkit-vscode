export type WorkspaceGraphStreamEventType =
  | 'graph.snapshot'
  | 'graph.delta'
  | 'graph.provider-progress'
  | 'graph.quality-changed'
  | 'graph.proof-invalidated'
  | 'graph.resync-required'
  | 'graph.paused'
  | 'graph.complete'
  | 'graph.heartbeat'
  | 'graph.error';

export type WorkspaceGraphStreamEnvelope = {
  schemaVersion: 'workspace-graph-stream.v1';
  type: WorkspaceGraphStreamEventType;
  workspaceId: string;
  sessionId: string;
  generation: number;
  baseRevision?: number;
  baseModelHash?: string;
  baseGraphHash?: string;
  revision: number;
  modelHash: string;
  graphHash: string;
  generatedAt: string;
  causationId: string;
  correlationId: string;
  payload: Record<string, unknown>;
};

export type WorkspaceGraphStreamState = {
  workspaceId: string;
  sessionId: string;
  generation: number;
  revision: number;
  modelHash: string;
  graphHash: string;
  entities: Map<string, Record<string, unknown>>;
  relations: Map<string, Record<string, unknown>>;
  proofs: Map<string, Record<string, unknown>>;
  providers: Map<string, Record<string, unknown>>;
  quality: Record<string, unknown>;
  diagnostics: unknown[];
  source?: Record<string, unknown>;
  workspace?: Record<string, unknown>;
  projectTopology?: Record<string, unknown>;
};

export type WorkspaceGraphStreamApplyResult =
  | { status: 'applied'; state: WorkspaceGraphStreamState }
  | { status: 'ignored'; state: WorkspaceGraphStreamState; reason: 'duplicate' }
  | { status: 'error'; state: WorkspaceGraphStreamState | null; reason: string }
  | {
      status: 'resync-required';
      state: WorkspaceGraphStreamState | null;
      reason:
        | 'revision-gap'
        | 'identity-mismatch'
        | 'generation-regression'
        | 'schema-unsupported'
        | 'hash-discontinuity'
        | 'validation-failed'
        | 'queue-overflow';
    };

export function createWorkspaceGraphReplaySnapshot(
  state: WorkspaceGraphStreamState,
  generatedAt = new Date().toISOString()
): WorkspaceGraphStreamEnvelope {
  const replayId = `replay:${state.sessionId}:${state.revision}`;
  return {
    schemaVersion: 'workspace-graph-stream.v1',
    type: 'graph.snapshot',
    workspaceId: state.workspaceId,
    sessionId: state.sessionId,
    generation: state.generation,
    revision: state.revision,
    modelHash: state.modelHash,
    graphHash: state.graphHash,
    generatedAt,
    causationId: replayId,
    correlationId: replayId,
    payload: {
      replay: true,
      graph: {
        entities: [...state.entities.values()],
        relations: [...state.relations.values()],
        proofs: [...state.proofs.values()],
        providers: [...state.providers.values()],
        quality: state.quality,
        diagnostics: state.diagnostics,
        ...(state.source ? { source: state.source } : {}),
        ...(state.workspace ? { workspace: state.workspace } : {}),
        ...(state.projectTopology ? { projectTopology: state.projectTopology } : {}),
      },
    },
  };
}

function recordsById(value: unknown): Map<string, Record<string, unknown>> | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const result = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id) {
      return null;
    }
    if (result.has(record.id)) {
      return null;
    }
    result.set(record.id, record);
  }
  return result;
}

function eventState(
  state: WorkspaceGraphStreamState,
  event: WorkspaceGraphStreamEnvelope
): WorkspaceGraphStreamState {
  return {
    ...state,
    generation: event.generation,
    revision: event.revision,
    modelHash: event.modelHash,
    graphHash: event.graphHash,
  };
}

function stringPayload(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stringIds(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : null;
}

function applyCollectionDelta(
  current: Map<string, Record<string, unknown>>,
  added: unknown,
  updated: unknown,
  removed: unknown
): Map<string, Record<string, unknown>> | null {
  const additions = recordsById(added);
  const updates = recordsById(updated);
  const removals = stringIds(removed);
  if (!additions || !updates || !removals) {
    return null;
  }
  const next = new Map(current);
  for (const id of removals) {
    next.delete(id);
  }
  for (const [id, record] of additions) {
    next.set(id, record);
  }
  for (const [id, record] of updates) {
    if (!next.has(id)) {
      return null;
    }
    next.set(id, record);
  }
  return next;
}

export function applyWorkspaceGraphStreamEvent(
  state: WorkspaceGraphStreamState | null,
  event: WorkspaceGraphStreamEnvelope
): WorkspaceGraphStreamApplyResult {
  if (event.schemaVersion !== 'workspace-graph-stream.v1') {
    return { status: 'resync-required', state, reason: 'schema-unsupported' };
  }
  if (event.type === 'graph.snapshot') {
    const graph = event.payload.graph;
    if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
      return { status: 'resync-required', state, reason: 'validation-failed' };
    }
    const raw = graph as Record<string, unknown>;
    const entities = recordsById(raw.entities);
    const relations = recordsById(raw.relations);
    const proofs = recordsById(raw.proofs);
    const providers = recordsById(raw.providers);
    if (!entities || !relations || !proofs || !providers) {
      return { status: 'resync-required', state, reason: 'validation-failed' };
    }
    return {
      status: 'applied',
      state: {
        workspaceId: event.workspaceId,
        sessionId: event.sessionId,
        generation: event.generation,
        revision: event.revision,
        modelHash: event.modelHash,
        graphHash: event.graphHash,
        entities,
        relations,
        proofs,
        providers,
        quality:
          raw.quality && typeof raw.quality === 'object' && !Array.isArray(raw.quality)
            ? (raw.quality as Record<string, unknown>)
            : {},
        diagnostics: Array.isArray(raw.diagnostics) ? raw.diagnostics : [],
        source:
          raw.source && typeof raw.source === 'object'
            ? (raw.source as Record<string, unknown>)
            : undefined,
        workspace:
          raw.workspace && typeof raw.workspace === 'object'
            ? (raw.workspace as Record<string, unknown>)
            : undefined,
        projectTopology:
          raw.projectTopology && typeof raw.projectTopology === 'object'
            ? (raw.projectTopology as Record<string, unknown>)
            : undefined,
      },
    };
  }
  if (!state) {
    return { status: 'resync-required', state, reason: 'revision-gap' };
  }
  if (event.workspaceId !== state.workspaceId || event.sessionId !== state.sessionId) {
    return { status: 'resync-required', state, reason: 'identity-mismatch' };
  }
  if (event.generation < state.generation) {
    return { status: 'resync-required', state, reason: 'generation-regression' };
  }
  if (event.type === 'graph.resync-required') {
    const reason = event.payload.reason;
    const acceptedReasons = new Set([
      'revision-gap',
      'identity-mismatch',
      'generation-regression',
      'schema-unsupported',
      'hash-discontinuity',
      'validation-failed',
      'queue-overflow',
    ]);
    return {
      status: 'resync-required',
      state,
      reason:
        typeof reason === 'string' && acceptedReasons.has(reason)
          ? (reason as Extract<
              WorkspaceGraphStreamApplyResult,
              { status: 'resync-required' }
            >['reason'])
          : 'validation-failed',
    };
  }
  if (event.type === 'graph.error') {
    return {
      status: 'error',
      state,
      reason:
        stringPayload(event.payload.message) ?? stringPayload(event.payload.code) ?? 'graph-error',
    };
  }
  if (event.type === 'graph.quality-changed') {
    if (!event.payload.quality || typeof event.payload.quality !== 'object') {
      return { status: 'resync-required', state, reason: 'validation-failed' };
    }
    return {
      status: 'applied',
      state: {
        ...eventState(state, event),
        quality: event.payload.quality as Record<string, unknown>,
        diagnostics: Array.isArray(event.payload.diagnostics)
          ? event.payload.diagnostics
          : state.diagnostics,
      },
    };
  }
  if (event.type === 'graph.proof-invalidated') {
    const proofIds = stringIds(event.payload.proofIds);
    if (!proofIds || proofIds.length === 0) {
      return { status: 'resync-required', state, reason: 'validation-failed' };
    }
    const invalidated = new Set(proofIds);
    const proofs = new Map(state.proofs);
    for (const proofId of invalidated) {
      proofs.delete(proofId);
    }
    const stripProofs = (record: Record<string, unknown>) => ({
      ...record,
      proofIds: Array.isArray(record.proofIds)
        ? record.proofIds.filter((id) => typeof id === 'string' && !invalidated.has(id))
        : record.proofIds,
    });
    return {
      status: 'applied',
      state: {
        ...eventState(state, event),
        proofs,
        entities: new Map([...state.entities].map(([id, record]) => [id, stripProofs(record)])),
        relations: new Map([...state.relations].map(([id, record]) => [id, stripProofs(record)])),
      },
    };
  }
  if (event.type === 'graph.provider-progress') {
    const providerId = stringPayload(event.payload.providerId);
    const status = stringPayload(event.payload.status);
    if (!providerId || !status) {
      return { status: 'resync-required', state, reason: 'validation-failed' };
    }
    const providers = new Map(state.providers);
    providers.set(providerId, {
      ...(providers.get(providerId) ?? { id: providerId }),
      status,
      ...(typeof event.payload.message === 'string'
        ? { diagnostics: [event.payload.message] }
        : {}),
    });
    return { status: 'applied', state: { ...eventState(state, event), providers } };
  }
  if (event.type !== 'graph.delta') {
    return { status: 'applied', state: eventState(state, event) };
  }
  if (event.revision === state.revision && event.graphHash === state.graphHash) {
    return { status: 'ignored', state, reason: 'duplicate' };
  }
  if (event.baseRevision !== state.revision || event.revision !== state.revision + 1) {
    return { status: 'resync-required', state, reason: 'revision-gap' };
  }
  if (event.baseGraphHash !== state.graphHash || event.baseModelHash !== state.modelHash) {
    return { status: 'resync-required', state, reason: 'hash-discontinuity' };
  }
  const entities = applyCollectionDelta(
    state.entities,
    event.payload.entitiesAdded,
    event.payload.entitiesUpdated,
    event.payload.entitiesRemoved
  );
  const relations = applyCollectionDelta(
    state.relations,
    event.payload.relationsAdded,
    event.payload.relationsUpdated,
    event.payload.relationsRemoved
  );
  const proofs = applyCollectionDelta(
    state.proofs,
    event.payload.proofsAdded,
    event.payload.proofsUpdated,
    event.payload.proofsRemoved
  );
  const providerChanges = recordsById(event.payload.providersUpdated);
  const providers = providerChanges ? new Map(state.providers) : null;
  if (providers && providerChanges) {
    for (const [id, provider] of providerChanges) {
      providers.set(id, provider);
    }
  }
  if (!entities || !relations || !proofs || !providers) {
    return { status: 'resync-required', state, reason: 'validation-failed' };
  }
  for (const relation of relations.values()) {
    if (!entities.has(String(relation.from)) || !entities.has(String(relation.to))) {
      return { status: 'resync-required', state, reason: 'validation-failed' };
    }
  }
  return {
    status: 'applied',
    state: {
      ...state,
      generation: event.generation,
      revision: event.revision,
      modelHash: event.modelHash,
      graphHash: event.graphHash,
      entities,
      relations,
      proofs,
      providers,
      quality:
        event.payload.quality && typeof event.payload.quality === 'object'
          ? (event.payload.quality as Record<string, unknown>)
          : state.quality,
      diagnostics: Array.isArray(event.payload.diagnostics)
        ? event.payload.diagnostics
        : state.diagnostics,
    },
  };
}
