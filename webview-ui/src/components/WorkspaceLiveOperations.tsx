import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Copy,
  FileJson2,
  Gauge,
  GitBranch,
  Layers3,
  Maximize2,
  Minimize2,
  Network,
  Radio,
  RefreshCw,
  Route,
  ScanLine,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';

import {
  findWorkspaceGraphProjection,
  type WorkspaceGraphEntityProjection,
  type WorkspaceGraphProjection,
  type WorkspaceGraphRelationProjection,
} from '@workspai-contracts/workspaceGraphProjection';

import type {
  DashboardEvidencePayload,
  WorkspaceActivityEvidenceBinding,
  WorkspaceActivityBoardStatus,
} from '@/lib/dashboardEvidence';
import { WorkspaceGraphCanvas } from './WorkspaceGraphCanvas';
import type { WorkspaceGraphChangeOverlay } from './WorkspaceGraphExplorer';

type LiveMode = 'floor' | 'operations' | 'assurance' | 'command-center';

const FLOOR_GRAPH_LIMIT = 72;
const FLOOR_ARCHITECTURE_KINDS = new Set([
  'workspace',
  'project',
  'service',
  'api',
  'endpoint',
  'protocol',
  'package',
  'runtime-unit',
  'database',
  'queue',
  'deployment',
  'pipeline',
]);

type FloorGraph = {
  entities: WorkspaceGraphEntityProjection[];
  relations: WorkspaceGraphRelationProjection[];
  focused: boolean;
};

type WorkspaceLiveOperationsProps = {
  panelId: string;
  evidence: DashboardEvidencePayload | null;
  workspaceName: string;
  hasWorkspace: boolean;
  onRefresh: () => void;
  onOpenTerminalLive: () => void;
  onRunBenchmark: () => void;
  onCopyCaption: (text: string) => void;
  onRevealArtifact: (artifactPath: string) => void;
};

function statusTone(status: WorkspaceActivityBoardStatus): string {
  if (status === 'succeeded') return 'success';
  if (status === 'failed' || status === 'blocked') return 'danger';
  if (status === 'running') return 'active';
  if (status === 'cancelled' || status === 'rolled-back') return 'warning';
  return 'neutral';
}

function assuranceTone(status: 'passed' | 'failed' | 'pending'): string {
  if (status === 'passed') return 'success';
  if (status === 'failed') return 'danger';
  return 'neutral';
}

function formatDuration(durationMs: number | undefined): string {
  if (!Number.isFinite(durationMs)) return '—';
  if ((durationMs ?? 0) < 1_000) return `${Math.round(durationMs ?? 0)} ms`;
  return `${((durationMs ?? 0) / 1_000).toFixed((durationMs ?? 0) < 10_000 ? 1 : 0)} s`;
}

function formatCount(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat().format(value)
    : '—';
}

function formatRelativeTime(value: string | undefined): string {
  if (!value) return 'No snapshot';
  const ageMs = Date.now() - Date.parse(value);
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'Just now';
  if (ageMs < 10_000) return 'Live now';
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s ago`;
  return `${Math.floor(ageMs / 60_000)}m ago`;
}

function uniqueEvidenceBindings(
  bindings: readonly WorkspaceActivityEvidenceBinding[]
): WorkspaceActivityEvidenceBinding[] {
  const unique = new Map<string, WorkspaceActivityEvidenceBinding>();
  for (const binding of bindings) {
    unique.set(
      `${binding.kind}\u0000${binding.ref}\u0000${binding.role}\u0000${binding.graphSourceHash ?? ''}`,
      binding
    );
  }
  return [...unique.values()];
}

function compactEvidenceRef(binding: WorkspaceActivityEvidenceBinding): string {
  const segments = binding.ref.replace(/\\/g, '/').split('/').filter(Boolean);
  const compact = segments.at(-1) ?? binding.ref;
  return compact.length > 44 ? `${compact.slice(0, 41)}…` : compact;
}

function graphFromEvidence(
  evidence: DashboardEvidencePayload | null
): WorkspaceGraphProjection | null {
  const model = evidence?.cards.find((card) => card.id === 'workspaceModel');
  return findWorkspaceGraphProjection(model?.detailSections);
}

function relationDegrees(graph: WorkspaceGraphProjection): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const relation of graph.relations) {
    degrees.set(relation.from, (degrees.get(relation.from) ?? 0) + 1);
    degrees.set(relation.to, (degrees.get(relation.to) ?? 0) + 1);
  }
  return degrees;
}

function boundedOperationsGraph(
  graph: WorkspaceGraphProjection | null,
  requestedIds: readonly string[]
): FloorGraph {
  if (!graph) {
    return { entities: [], relations: [], focused: false };
  }
  const entitiesById = new Map(graph.entities.map((entity) => [entity.id, entity]));
  const selected = new Set(requestedIds.filter((id) => entitiesById.has(id)));
  const focused = selected.size > 0;
  if (focused) {
    for (const relation of graph.relations) {
      if (selected.size >= FLOOR_GRAPH_LIMIT) break;
      if (selected.has(relation.from)) selected.add(relation.to);
      else if (selected.has(relation.to)) selected.add(relation.from);
    }
  } else {
    const degrees = relationDegrees(graph);
    const candidates = [...graph.entities].sort((left, right) => {
      const kindDelta =
        Number(FLOOR_ARCHITECTURE_KINDS.has(right.kind)) -
        Number(FLOOR_ARCHITECTURE_KINDS.has(left.kind));
      return kindDelta || (degrees.get(right.id) ?? 0) - (degrees.get(left.id) ?? 0);
    });
    for (const entity of candidates.slice(0, FLOOR_GRAPH_LIMIT)) selected.add(entity.id);
  }
  const selectedIds = [...selected].slice(0, FLOOR_GRAPH_LIMIT);
  const boundedIds = new Set(selectedIds);
  return {
    entities: selectedIds
      .map((id) => entitiesById.get(id))
      .filter((entity): entity is WorkspaceGraphEntityProjection => Boolean(entity)),
    relations: graph.relations.filter(
      (relation) => boundedIds.has(relation.from) && boundedIds.has(relation.to)
    ),
    focused,
  };
}

function floorStatusLabel(status: WorkspaceActivityBoardStatus): string {
  if (status === 'succeeded') return 'passed';
  if (status === 'running') return 'live';
  return status;
}

export function WorkspaceLiveOperations({
  panelId,
  evidence,
  workspaceName,
  hasWorkspace,
  onRefresh,
  onOpenTerminalLive,
  onRunBenchmark,
  onCopyCaption,
  onRevealArtifact,
}: WorkspaceLiveOperationsProps) {
  const [mode, setMode] = useState<LiveMode>('floor');
  const [presentation, setPresentation] = useState(false);
  const operations = evidence?.operations;
  const board = operations?.board;
  const benchmark = operations?.benchmark;
  const changes = operations?.changes;
  const selectedChange = changes?.selected;
  const evaluationCard = evidence?.cards.find((card) => card.id === 'workspaceIntelligenceRun');
  const observedTokens = Number(evaluationCard?.metrics?.observedTokens ?? Number.NaN);
  const tokenProvenance = String(
    evaluationCard?.metrics?.tokenProvenance ?? benchmark?.evaluation.provenance ?? 'unavailable'
  );
  const evaluationOutcome = String(evaluationCard?.metrics?.evaluationOutcome ?? 'unavailable');
  const selectedRun = useMemo(
    () =>
      board?.runs.find((run) => run.run.runId === board.selectedRunId) ?? board?.runs[0] ?? null,
    [board]
  );
  const studioSession = operations?.studio.sessions[0] ?? null;
  const evidenceBindings = useMemo(
    () =>
      uniqueEvidenceBindings([
        ...(selectedRun?.run.evidenceBindings ?? []),
        ...(selectedRun?.nodes.flatMap((node) => node.evidenceBindings ?? []) ?? []),
        ...(studioSession?.stages.flatMap((stage) => stage.evidenceBindings ?? []) ?? []),
      ]),
    [selectedRun, studioSession]
  );
  const graphIdentityBindings = evidenceBindings.filter((binding) =>
    ['graph-entity', 'graph-relation', 'proof'].includes(binding.kind)
  );
  const architectureBindings = graphIdentityBindings.filter(
    (binding) => binding.graphSourceHash === benchmark?.graph.sourceHash
  );
  const executionStages = useMemo(
    () =>
      studioSession?.stages.length
        ? studioSession.stages
        : [...(selectedRun?.nodes ?? [])].sort((left, right) => left.order - right.order),
    [selectedRun, studioSession]
  );
  const graphProjection = useMemo(() => graphFromEvidence(evidence), [evidence]);
  const graphRequestedIds = useMemo(() => {
    const ids = new Set(
      architectureBindings
        .filter((binding) => binding.kind === 'graph-entity')
        .map((binding) => binding.ref)
    );
    for (const id of selectedChange?.graphChange.actual?.impactedEntityIds ?? []) ids.add(id);
    for (const operation of selectedChange?.graphChange.prediction?.operations ?? []) {
      if (operation.targetKind === 'entity') ids.add(operation.targetId);
    }
    for (const operation of [
      ...(selectedChange?.graphChange.surprise?.matched ?? []),
      ...(selectedChange?.graphChange.surprise?.unpredicted ?? []),
      ...(selectedChange?.graphChange.surprise?.missing ?? []),
    ]) {
      if (operation.targetKind === 'entity') ids.add(operation.targetId);
    }
    return [...ids];
  }, [architectureBindings, selectedChange]);
  const floorGraph = useMemo(
    () => boundedOperationsGraph(graphProjection, graphRequestedIds),
    [graphProjection, graphRequestedIds]
  );
  const floorGraphOverlay = useMemo<WorkspaceGraphChangeOverlay | null>(() => {
    if (!selectedChange) return null;
    return {
      predictedIds: (selectedChange.graphChange.prediction?.operations ?? [])
        .filter((operation) => operation.targetKind === 'entity')
        .map((operation) => operation.targetId),
      actualIds: selectedChange.graphChange.actual?.impactedEntityIds ?? [],
      surpriseIds: (selectedChange.graphChange.surprise?.unpredicted ?? [])
        .filter((operation) => operation.targetKind === 'entity')
        .map((operation) => operation.targetId),
      verdict: selectedChange.graphChange.surprise?.verdict ?? null,
    };
  }, [selectedChange]);
  const floorPipeline = useMemo(
    () =>
      selectedChange
        ? selectedChange.assurances.map((assurance) => ({
            id: assurance.id,
            label: assurance.id.replace(/-/g, ' '),
            status:
              assurance.status === 'passed'
                ? ('succeeded' as const)
                : assurance.status === 'failed'
                  ? ('failed' as const)
                  : ('pending' as const),
          }))
        : executionStages.slice(-7).map((stage) => ({
            id: stage.id,
            label: stage.label,
            status: stage.status,
          })),
    [executionStages, selectedChange]
  );
  const floorAttemptCells = executionStages.slice(-48);
  const maximumStageDuration = Math.max(
    1,
    ...floorAttemptCells.map((stage) => stage.durationMs ?? 0)
  );
  const activeOperationCount =
    (board?.activeRunCount ?? 0) + (operations?.studio.activeSessionCount ?? 0);
  const trackedExecutionCount = (board?.runs.length ?? 0) + (operations?.studio.sessionCount ?? 0);
  const latestActivityAt = [board?.generatedAt, studioSession?.updatedAt]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  const verified = evaluationCard?.metrics?.evaluationVerified === 'verified';
  const reduction = benchmark?.retrievalSummary.medianEstimatedReductionPercent;

  const caption = [
    `${workspaceName || 'Workspace'} · Workspai Command Center`,
    benchmark
      ? `${benchmark.retrievalSummary.medianEstimatedReductionPercent.toFixed(1)}% estimated retrieval-payload reduction`
      : 'Retrieval benchmark not generated',
    Number.isFinite(observedTokens)
      ? `${formatCount(observedTokens)} observed tokens`
      : 'Observed model tokens unavailable',
    verified ? 'Verified outcome' : `Outcome: ${evaluationOutcome}`,
    board
      ? `${trackedExecutionCount} observed execution(s) · ${activeOperationCount} active`
      : 'No Live Board snapshot',
    evidenceBindings.length > 0
      ? `${evidenceBindings.length} provenance-backed Live evidence binding(s)`
      : 'No Live evidence binding declared',
    changes?.summary.total
      ? `${changes.summary.sealed}/${changes.summary.total} proof-carrying change(s) sealed`
      : 'No proof-carrying change recorded',
  ].join('\n');

  if (!hasWorkspace) {
    return (
      <section className="ws-live-empty" id={panelId} role="tabpanel">
        <Activity size={28} aria-hidden="true" />
        <h2>Select a workspace to open Live Operations</h2>
        <p>Workspai renders observed CLI activity without treating activity as verification.</p>
      </section>
    );
  }

  return (
    <section
      className={`ws-live ${presentation ? 'ws-live--presentation' : ''}`}
      id={panelId}
      role="tabpanel"
    >
      <header className="ws-live__header">
        <div>
          <div className="ws-live__eyebrow">
            <span className="ws-live__pulse" aria-hidden="true" />
            Workspace operations
          </div>
          <h2>{workspaceName} · Live</h2>
          <p>
            Unified CLI and Studio telemetry, evidence-backed architecture metrics, and explicit
            measurement provenance. Updated {formatRelativeTime(latestActivityAt)}.
          </p>
        </div>
        <div className="ws-live__actions">
          <button type="button" className="ws-live__button" onClick={onRefresh}>
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </button>
          <button type="button" className="ws-live__button" onClick={onOpenTerminalLive}>
            <TerminalSquare size={13} aria-hidden="true" /> Open interactive Live
          </button>
          <button
            type="button"
            className="ws-live__button"
            onClick={() => setPresentation((value) => !value)}
            aria-pressed={presentation}
          >
            {presentation ? (
              <Minimize2 size={13} aria-hidden="true" />
            ) : (
              <Maximize2 size={13} aria-hidden="true" />
            )}
            {presentation ? 'Exit presentation' : 'Presentation mode'}
          </button>
        </div>
      </header>

      <div className="ws-live__mode" role="tablist" aria-label="Live presentation mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'floor'}
          className={mode === 'floor' ? 'is-active' : ''}
          onClick={() => setMode('floor')}
        >
          Operations Floor
        </button>
        {changes?.availability === 'available' ? (
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'assurance'}
            className={mode === 'assurance' ? 'is-active' : ''}
            onClick={() => setMode('assurance')}
          >
            Change Assurance
          </button>
        ) : null}
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'operations'}
          className={mode === 'operations' ? 'is-active' : ''}
          onClick={() => setMode('operations')}
        >
          Operations
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'command-center'}
          className={mode === 'command-center' ? 'is-active' : ''}
          onClick={() => setMode('command-center')}
        >
          Command Center
        </button>
      </div>

      <div className="ws-live__kpis" aria-label="Live workspace summary">
        <div className="ws-live__kpi">
          <span>Active execution</span>
          <strong>{formatCount(activeOperationCount)}</strong>
          <small>CLI + Studio</small>
        </div>
        <div className="ws-live__kpi">
          <span>Tracked activity</span>
          <strong>{formatCount(trackedExecutionCount)}</strong>
          <small>{formatCount(operations?.studio.toolCallCount)} Studio tool calls</small>
        </div>
        <div className="ws-live__kpi">
          <span>Context reduction</span>
          <strong>{reduction == null ? '—' : `${reduction.toFixed(1)}%`}</strong>
          <small>estimated retrieval payload</small>
        </div>
        <div className="ws-live__kpi">
          <span>Observed tokens</span>
          <strong>{formatCount(observedTokens)}</strong>
          <small>{tokenProvenance} provenance</small>
        </div>
      </div>

      {mode === 'floor' ? (
        <div className="ws-operations-floor">
          <div className="ws-operations-floor__pulsebar">
            <div>
              <span className="ws-live__pulse" aria-hidden="true" />
              <div>
                <strong>{selectedChange ? 'Governed change' : 'Observed execution'}</strong>
                <small>
                  {selectedChange?.changeId ??
                    studioSession?.sessionId ??
                    selectedRun?.run.runId ??
                    'Waiting for correlated activity'}
                </small>
              </div>
            </div>
            <dl>
              <div>
                <dt>Graph revision</dt>
                <dd>{graphProjection?.revision.slice(0, 10) ?? '—'}</dd>
              </div>
              <div>
                <dt>Evidence refs</dt>
                <dd>{formatCount(evidenceBindings.length)}</dd>
              </div>
              <div>
                <dt>Throughput</dt>
                <dd>{formatCount(floorAttemptCells.length)} stages</dd>
              </div>
              <div>
                <dt>Freshness</dt>
                <dd>{formatRelativeTime(latestActivityAt)}</dd>
              </div>
            </dl>
          </div>

          <section className="ws-operations-floor__pipeline" aria-label="Governed execution path">
            <header>
              <span>Governed execution path</span>
              <small>
                {selectedChange
                  ? `${selectedChange.state} · ${selectedChange.status}`
                  : studioSession
                    ? `${studioSession.assistantMode} session`
                    : (selectedRun?.commandLabel ?? 'No selected execution')}
              </small>
            </header>
            <div>
              {floorPipeline.length ? (
                floorPipeline.map((stage, index) => (
                  <div
                    className={`ws-operations-floor__pipeline-stage is-${statusTone(stage.status)}`}
                    key={stage.id}
                    title={`${stage.label} · ${floorStatusLabel(stage.status)}`}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{stage.label}</strong>
                    <small>{floorStatusLabel(stage.status)}</small>
                  </div>
                ))
              ) : (
                <div className="ws-operations-floor__pipeline-empty">
                  Run a CLI command or Studio repair to populate the governed path.
                </div>
              )}
            </div>
          </section>

          <div className="ws-operations-floor__telemetry">
            <article>
              <header>
                <span>Capability spread</span>
                <ScanLine size={13} aria-hidden="true" />
              </header>
              <div className="ws-operations-floor__capabilities">
                {[
                  {
                    label: 'Graph evidence',
                    value: architectureBindings.length,
                    total: Math.max(architectureBindings.length, evidenceBindings.length),
                  },
                  {
                    label: 'Benchmark scenarios',
                    value: benchmark?.retrievalSummary.matchedScenarioCount ?? 0,
                    total: benchmark?.retrievalSummary.scenarioCount ?? 0,
                  },
                  {
                    label: 'Assurance claims',
                    value:
                      selectedChange?.assurances.filter((item) => item.status === 'passed')
                        .length ?? 0,
                    total: selectedChange?.assurances.length ?? 0,
                  },
                  {
                    label: 'Successful stages',
                    value: floorAttemptCells.filter((item) => item.status === 'succeeded').length,
                    total: floorAttemptCells.length,
                  },
                ].map((capability) => {
                  const ratio = capability.total > 0 ? capability.value / capability.total : 0;
                  return (
                    <div key={capability.label}>
                      <span>{capability.label}</span>
                      <i aria-hidden="true">
                        <b style={{ width: `${Math.round(ratio * 100)}%` }} />
                      </i>
                      <strong>
                        {capability.value}/{capability.total || '—'}
                      </strong>
                    </div>
                  );
                })}
              </div>
            </article>

            <article>
              <header>
                <span>Dispatch map</span>
                <Route size={13} aria-hidden="true" />
              </header>
              <div className="ws-operations-floor__dispatch" aria-label="Observed stage dispatch">
                {floorAttemptCells.slice(-18).map((stage, index) => (
                  <span
                    className={`is-${statusTone(stage.status)}`}
                    key={stage.id}
                    title={`${stage.label} · ${floorStatusLabel(stage.status)}`}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                ))}
                {!floorAttemptCells.length ? <small>No observed dispatch</small> : null}
              </div>
            </article>

            <article>
              <header>
                <span>Execution depth</span>
                <Layers3 size={13} aria-hidden="true" />
              </header>
              <div className="ws-operations-floor__depth" aria-label="Observed stage durations">
                {floorAttemptCells.slice(-20).map((stage) => (
                  <i key={stage.id} title={`${stage.label} · ${formatDuration(stage.durationMs)}`}>
                    <b
                      className={`is-${statusTone(stage.status)}`}
                      style={{
                        height: `${Math.max(
                          10,
                          Math.round(((stage.durationMs ?? 0) / maximumStageDuration) * 100)
                        )}%`,
                      }}
                    />
                  </i>
                ))}
                {!floorAttemptCells.length ? <small>No duration samples</small> : null}
              </div>
            </article>
          </div>

          <section className="ws-operations-floor__mesh">
            <header>
              <div>
                <span>
                  <Network size={13} aria-hidden="true" /> Architecture mesh
                </span>
                <strong>{graphProjection?.workspace?.name ?? workspaceName}</strong>
                <small>
                  {floorGraph.focused
                    ? 'Revision-bound evidence neighborhood'
                    : 'Bounded canonical architecture overview'}
                </small>
              </div>
              <div className="ws-operations-floor__mesh-metrics">
                <span>{formatCount(graphProjection?.total.entities)} nodes</span>
                <span>{formatCount(graphProjection?.total.relations)} edges</span>
                <span>{formatCount(graphProjection?.total.proofs)} proofs</span>
              </div>
            </header>
            {floorGraph.entities.length ? (
              <div className="ws-operations-floor__graph-canvas">
                <WorkspaceGraphCanvas
                  entities={floorGraph.entities}
                  relations={floorGraph.relations}
                  selectedId={null}
                  onSelect={() => undefined}
                  highlightedIds={graphRequestedIds}
                  changeOverlay={floorGraphOverlay}
                  presentation
                />
              </div>
            ) : (
              <div className="ws-operations-floor__mesh-empty">
                <Network size={24} aria-hidden="true" />
                <span>Generate Workspace Intelligence to materialize the canonical Graph.</span>
              </div>
            )}
            <footer>
              <span className="is-evidence">● evidence focus</span>
              <span className="is-predicted">● predicted</span>
              <span className="is-actual">● observed</span>
              <span className="is-surprise">● surprise</span>
              <small>No architecture edge is inferred from Live activity.</small>
            </footer>
          </section>

          <div className="ws-operations-floor__lower">
            <section className="ws-operations-floor__attempts">
              <header>
                <div>
                  <span>Agent attempt grid</span>
                  <strong>Every bounded tool and CLI stage retained</strong>
                </div>
                <small>{floorAttemptCells.length} observed cells</small>
              </header>
              <div>
                {floorAttemptCells.map((stage, index) => (
                  <span
                    className={`is-${statusTone(stage.status)}`}
                    key={stage.id}
                    title={`${index + 1}. ${stage.label} · ${floorStatusLabel(stage.status)} · ${formatDuration(stage.durationMs)}`}
                  >
                    {stage.status === 'succeeded' ? '■' : stage.status === 'running' ? '◆' : '○'}
                  </span>
                ))}
                {!floorAttemptCells.length ? (
                  <p>No tool or command stages have been observed for this workspace.</p>
                ) : null}
              </div>
              <footer>
                <span>{formatCount(operations?.studio.toolCallCount)} tool calls</span>
                <span>{formatCount(operations?.studio.failedToolCallCount)} failed</span>
                <span>{formatCount(studioSession?.modelCheckpointCount)} model checkpoints</span>
              </footer>
            </section>

            <aside className="ws-operations-floor__ledger">
              <header>
                <span>Assurance ledger</span>
                <GitBranch size={13} aria-hidden="true" />
              </header>
              <strong
                className={
                  selectedChange?.graphChange.surprise?.verdict === 'surprising'
                    ? 'is-danger'
                    : selectedChange?.status === 'sealed'
                      ? 'is-success'
                      : 'is-active'
                }
              >
                {selectedChange?.graphChange.surprise?.verdict ??
                  selectedChange?.status ??
                  'observational'}
              </strong>
              <dl>
                <div>
                  <dt>Matched</dt>
                  <dd>{formatCount(selectedChange?.graphChange.surprise?.matched.length)}</dd>
                </div>
                <div>
                  <dt>Unpredicted</dt>
                  <dd>{formatCount(selectedChange?.graphChange.surprise?.unpredicted.length)}</dd>
                </div>
                <div>
                  <dt>Missing</dt>
                  <dd>{formatCount(selectedChange?.graphChange.surprise?.missing.length)}</dd>
                </div>
                <div>
                  <dt>Uncertainty</dt>
                  <dd>{formatCount(selectedChange?.remainingUncertainty.length)}</dd>
                </div>
              </dl>
              <p>
                {selectedChange?.nextActions[0] ??
                  'Begin a Goal-bound change to compare predicted and observed architecture effects.'}
              </p>
            </aside>
          </div>
        </div>
      ) : mode === 'operations' ? (
        <div className="ws-live__operations-grid">
          <article className="ws-live__panel ws-live__panel--runs">
            <div className="ws-live__panel-heading">
              <div>
                <span>Unified execution timeline</span>
                <h3>
                  {studioSession
                    ? `${studioSession.assistantMode} · ${studioSession.cardId}`
                    : (selectedRun?.commandLabel ?? 'No activity captured yet')}
                </h3>
              </div>
              {studioSession || selectedRun ? (
                <span
                  className={`ws-live__status is-${statusTone(
                    studioSession?.status ?? selectedRun?.run.status ?? 'unknown'
                  )}`}
                >
                  {studioSession?.status ?? selectedRun?.run.status}
                </span>
              ) : null}
            </div>
            {studioSession?.stages.length || selectedRun?.nodes.length ? (
              <div className="ws-live__timeline" aria-label="Observed execution stages">
                {(studioSession?.stages.length
                  ? studioSession.stages
                  : [...(selectedRun?.nodes ?? [])].sort((left, right) => left.order - right.order)
                ).map((node, index) => (
                  <div className="ws-live__timeline-row" key={node.id}>
                    <div className={`ws-live__timeline-marker is-${statusTone(node.status)}`}>
                      {node.status === 'succeeded' ? (
                        <CheckCircle2 size={13} aria-hidden="true" />
                      ) : node.status === 'running' ? (
                        <Radio size={13} aria-hidden="true" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <div className="ws-live__timeline-content">
                      <div>
                        <strong>{node.label}</strong>
                        <span className="ws-live__source-badge">
                          {studioSession ? <Bot size={11} aria-hidden="true" /> : null}
                          {studioSession ? 'Studio' : 'CLI'}
                        </span>
                      </div>
                      <small>
                        {node.status} · {formatDuration(node.durationMs)}
                        {'evidenceBindings' in node && node.evidenceBindings?.length
                          ? ` · ${node.evidenceBindings.length} evidence ref(s)`
                          : ''}
                      </small>
                      {'detail' in node && node.detail ? <p>{node.detail}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ws-live__empty-panel">
                Run a Workspai command, then refresh this Board projection.
              </div>
            )}
          </article>

          <aside className="ws-live__panel ws-live__panel--fleet">
            <div className="ws-live__panel-heading">
              <div>
                <span>Fleet</span>
                <h3>{board?.scopeLabel ?? workspaceName}</h3>
              </div>
              <Gauge size={16} aria-hidden="true" />
            </div>
            <dl className="ws-live__fleet-stats">
              <div>
                <dt>Studio tools</dt>
                <dd>{formatCount(operations?.studio.toolCallCount)}</dd>
              </div>
              <div>
                <dt>Tool failures</dt>
                <dd>{formatCount(operations?.studio.failedToolCallCount)}</dd>
              </div>
              <div>
                <dt>Scopes</dt>
                <dd>{formatCount(board?.scopeCount)}</dd>
              </div>
              <div>
                <dt>Freshness</dt>
                <dd>{formatRelativeTime(latestActivityAt)}</dd>
              </div>
            </dl>
            {operations?.diagnostics.length ? (
              <div className="ws-live__diagnostic">
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{operations.diagnostics[0]}</span>
              </div>
            ) : null}
          </aside>
        </div>
      ) : mode === 'assurance' ? (
        <div className="ws-change-assurance">
          <header className="ws-change-assurance__header">
            <div>
              <span>Proof-Carrying Change</span>
              <h3>{selectedChange?.changeId ?? 'No change capsule selected'}</h3>
              <p>
                Intent, architecture baseline, observed effects, re-observation, and independent
                verification remain separate, inspectable assurance claims.
              </p>
            </div>
            {selectedChange ? (
              <span
                className={`ws-live__status is-${selectedChange.status === 'sealed' ? 'success' : selectedChange.status === 'blocked' ? 'danger' : 'active'}`}
              >
                {selectedChange.status}
              </span>
            ) : null}
          </header>

          <div className="ws-change-assurance__summary" aria-label="Change assurance summary">
            <div>
              <span>Tracked changes</span>
              <strong>{formatCount(changes?.summary.total)}</strong>
            </div>
            <div>
              <span>Sealed</span>
              <strong>{formatCount(changes?.summary.sealed)}</strong>
            </div>
            <div>
              <span>Blocked</span>
              <strong>{formatCount(changes?.summary.blocked)}</strong>
            </div>
            <div>
              <span>Invalid</span>
              <strong>{formatCount(changes?.summary.invalid)}</strong>
            </div>
          </div>

          {selectedChange ? (
            <div className="ws-change-assurance__body">
              <div className="ws-change-assurance__timeline" aria-label="Change assurance timeline">
                {selectedChange.assurances.map((assurance, index) => (
                  <div className="ws-change-assurance__stage" key={assurance.id}>
                    <div
                      className={`ws-live__timeline-marker is-${assuranceTone(assurance.status)}`}
                    >
                      {assurance.status === 'passed' ? (
                        <CheckCircle2 size={13} aria-hidden="true" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <div>
                      <strong>{assurance.id.replace(/-/g, ' ')}</strong>
                      <span>{assurance.status}</span>
                      <p>{assurance.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
              <aside className="ws-change-assurance__detail">
                <span>Decision state</span>
                <strong>{selectedChange.state}</strong>
                <small>Goal {selectedChange.goalId}</small>
                <div>
                  <ShieldCheck size={14} aria-hidden="true" />
                  <span>
                    {selectedChange.assurances.filter((item) => item.status === 'passed').length}/
                    {selectedChange.assurances.length} assurance claims passed
                  </span>
                </div>
                {selectedChange.remainingUncertainty.length ? (
                  <ul>
                    {selectedChange.remainingUncertainty.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No remaining uncertainty declared.</p>
                )}
                {selectedChange.deletedArtifacts.length ? (
                  <div className="ws-change-assurance__deletions">
                    <span>
                      {formatCount(selectedChange.deletedArtifacts.length)} verified deletion
                      {selectedChange.deletedArtifacts.length === 1 ? '' : 's'}
                    </span>
                    <ul>
                      {selectedChange.deletedArtifacts.slice(0, 4).map((item) => (
                        <li key={`${item.artifact}:${item.digest}`} title={item.artifact}>
                          <code>{item.artifact}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="ws-change-assurance__artifacts" aria-label="Change evidence">
                  {(
                    [
                      ['Capsule', selectedChange.artifacts.capsule],
                      ['Architecture lease', selectedChange.artifacts.lease],
                      ['Prediction', selectedChange.artifacts.prediction],
                      ['Actual Graph delta', selectedChange.artifacts.actualOverlay],
                      ['Surprise report', selectedChange.artifacts.surpriseReport],
                      ['Decision ledger', selectedChange.artifacts.transaction],
                      ['Decision events', selectedChange.artifacts.events],
                    ] as const
                  ).map(([label, artifactPath]) =>
                    artifactPath ? (
                      <button
                        type="button"
                        className="ws-live__button"
                        key={label}
                        onClick={() => onRevealArtifact(artifactPath)}
                      >
                        <FileJson2 size={12} aria-hidden="true" /> {label}
                      </button>
                    ) : null
                  )}
                </div>
                {selectedChange.nextActions.length ? (
                  <div className="ws-change-assurance__next">
                    <span>Next canonical action</span>
                    <code>{selectedChange.nextActions[0]}</code>
                  </div>
                ) : null}
              </aside>
            </div>
          ) : (
            <div className="ws-live__empty-panel">
              {changes?.diagnostics[0] ??
                'Begin a Goal-bound change to create a tamper-evident assurance timeline.'}
            </div>
          )}
        </div>
      ) : (
        <div className="ws-command-center">
          <div className="ws-command-center__pulsebar">
            <div>
              <span className="ws-live__pulse" aria-hidden="true" />
              <strong>System pulse</strong>
              <small>{formatRelativeTime(latestActivityAt)}</small>
            </div>
            <div>
              <Clock3 size={13} aria-hidden="true" />
              {formatCount(operations?.studio.toolCallCount)} model tools ·{' '}
              {formatCount(board?.runs.length)} CLI runs
            </div>
          </div>

          {evidenceBindings.length > 0 ? (
            <div className="ws-command-center__evidence-rail" aria-label="Live evidence bindings">
              <span>
                <ShieldCheck size={13} aria-hidden="true" /> Evidence bridge
              </span>
              <div>
                {evidenceBindings.slice(0, 6).map((binding) => (
                  <code
                    key={`${binding.kind}:${binding.ref}:${binding.role}`}
                    title={`${binding.kind} · ${binding.role} · ${binding.provenance} · ${binding.ref}`}
                  >
                    {binding.kind} · {compactEvidenceRef(binding)}
                  </code>
                ))}
              </div>
              <small>
                {architectureBindings.length > 0
                  ? `${architectureBindings.length} Graph/proof reference(s) match the displayed source revision.`
                  : graphIdentityBindings.length > 0
                    ? 'Graph references target another or unavailable revision, so no architecture edge is overlaid.'
                    : 'Artifact references connect execution to canonical evidence; no Graph entity edge is inferred.'}
              </small>
            </div>
          ) : null}
          <div className="ws-command-center__hero">
            <div className="ws-command-center__graph">
              <div className="ws-command-center__label">
                <Network size={14} aria-hidden="true" /> Architecture
              </div>
              <strong>{workspaceName}</strong>
              <span>
                {formatCount(benchmark?.graph.entityCount)} entities ·{' '}
                {formatCount(benchmark?.graph.relationCount)} relations ·{' '}
                {formatCount(benchmark?.graph.proofCount)} proofs
              </span>
              <small>
                Evidence-backed Graph · source {benchmark?.graph.sourceHash.slice(0, 8) ?? '—'}
              </small>
            </div>
            <div className="ws-command-center__flow">
              <div className="ws-command-center__label">
                <Activity size={14} aria-hidden="true" /> Live execution
              </div>
              <div className="ws-command-center__flow-grid">
                {(studioSession?.stages.length ? studioSession.stages : (selectedRun?.nodes ?? []))
                  .slice(-6)
                  .map((node) => (
                    <span key={node.id} className={`is-${statusTone(node.status)}`}>
                      <b>{node.label}</b>
                      {'evidenceBindings' in node && node.evidenceBindings?.length ? (
                        <small title="Revision-bound evidence used by this stage">
                          <ShieldCheck size={11} aria-hidden="true" />{' '}
                          {node.evidenceBindings.length}
                        </small>
                      ) : null}
                    </span>
                  ))}
                {!studioSession?.stages.length && !selectedRun?.nodes.length ? (
                  <span>No observed stages</span>
                ) : null}
              </div>
              <small>Studio tool calls + CLI Board activity</small>
            </div>
          </div>

          <div className="ws-command-center__trust">
            <div>
              <span>Retrieval efficiency</span>
              <strong>{reduction == null ? 'Unavailable' : `${reduction.toFixed(1)}%`}</strong>
              <small>estimated median payload reduction</small>
            </div>
            <div>
              <span>Model usage</span>
              <strong>{formatCount(observedTokens)}</strong>
              <small>{tokenProvenance} tokens</small>
            </div>
            <div>
              <span>Engineering outcome</span>
              <strong className={verified ? 'is-verified' : ''}>
                {verified ? <ShieldCheck size={17} aria-hidden="true" /> : null}
                {evaluationOutcome}
              </strong>
              <small>{verified ? 'verification-backed' : 'no verified claim'}</small>
            </div>
          </div>

          <div
            className={`ws-command-center__binding ${evidenceBindings.length ? 'is-bound' : ''}`}
            role="note"
          >
            {evidenceBindings.length ? (
              <ShieldCheck size={13} aria-hidden="true" />
            ) : (
              <AlertTriangle size={13} aria-hidden="true" />
            )}
            {evidenceBindings.length
              ? `Live exposes ${evidenceBindings.length} provenance-backed evidence binding(s). Only source-hash-bound Graph identities are rendered as architecture edges.`
              : 'This run exposes no public evidence binding. Workspai keeps Live separate from Graph rather than drawing a fabricated architecture edge.'}
          </div>

          <div className="ws-command-center__actions">
            {!benchmark ? (
              <button type="button" className="ws-live__button is-primary" onClick={onRunBenchmark}>
                <Gauge size={13} aria-hidden="true" /> Generate agent-core benchmark
              </button>
            ) : null}
            <button
              type="button"
              className="ws-live__button"
              onClick={() => onCopyCaption(caption)}
            >
              <Copy size={13} aria-hidden="true" /> Copy technical caption
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
