import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Bot,
  CheckCircle2,
  Download,
  FileCheck2,
  GitBranch,
  Network,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Workflow,
} from 'lucide-react';

import { WorkspaceGraphWebgl } from '@/components/WorkspaceGraphWebgl';
import { RepositoryInvestigation } from '@/components/RepositoryInvestigation';
import { analysisGateLabel } from '@/lib/repositoryAnalysisPresentation';
import {
  WORKSPACE_GRAPH_DEFAULT_3D_RENDERER,
  resolveWorkspaceGraphRenderer,
  detectWorkspaceGraphRendererCapabilities,
} from '@/lib/workspaceGraphRenderer';
import {
  createRepositoryAnalysisStoryGif,
  type RepositoryAnalysisStoryStep,
} from '@/lib/repositoryAnalysisGif';
import { captureWorkspaceGraphImageData } from '@/lib/workspaceGraphRecording';
import { workspaceGraphProjectScopeIds } from '@/lib/workspaceGraphScope';
import {
  ANALYSIS_CAPTURE_LIMIT,
  captureAnalysisSection,
  encodeAnalysisRecording,
} from '@/lib/repositoryAnalysisCapture';
import { vscode } from '@/vscode';
import type {
  RepositoryAnalysisReport,
  RepositoryAnalysisStage,
} from '@workspai-contracts/repositoryAnalysis';
import { normalizeExtensionWebviewMessage } from '@workspai-contracts/webviewProtocol';

const STAGES: Array<{ id: RepositoryAnalysisStage; label: string }> = [
  { id: 'validating', label: 'Resolve' },
  { id: 'cloning', label: 'Isolate' },
  { id: 'adopting', label: 'Adopt' },
  { id: 'modeling', label: 'Map' },
  { id: 'verifying', label: 'Doctor' },
  { id: 'measuring', label: 'Measure' },
  { id: 'ready', label: 'Deliver' },
];

const ARCHITECTURE_KINDS = new Set([
  'workspace',
  'project',
  'service',
  'api',
  'endpoint',
  'schema',
  'protocol',
  'language',
  'package',
  'runtime-unit',
  'lifecycle-stage',
  'database',
  'queue',
  'container',
  'deployment',
  'pipeline',
  'environment',
  'decision',
  'test-suite',
  'owner',
]);

function compact(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  );
}

function percent(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
}

export function RepositoryAnalysisPanel() {
  const [investigationSeed, setInvestigationSeed] = useState<{ query: string; id: number }>();
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [requestId, setRequestId] = useState('');
  const [stage, setStage] = useState<RepositoryAnalysisStage | 'idle' | 'failed'>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<RepositoryAnalysisReport | null>(null);
  const [story, setStory] = useState<RepositoryAnalysisStoryStep[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [graphRenderer] = useState(() =>
    resolveWorkspaceGraphRenderer(
      WORKSPACE_GRAPH_DEFAULT_3D_RENDERER,
      detectWorkspaceGraphRendererCapabilities()
    )
  );
  const [graphRenderFailed, setGraphRenderFailed] = useState(false);
  const [graphMode, setGraphMode] = useState<'architecture' | 'all'>('all');
  const [graphQuery, setGraphQuery] = useState('');
  const [graphKind, setGraphKind] = useState('all');
  const [graphProject, setGraphProject] = useState('all');
  const [isolatedEntityId, setIsolatedEntityId] = useState<string | null>(null);
  const [graphGifRequest, setGraphGifRequest] = useState<{
    id: number;
    revision: string;
    delayCentiseconds: number;
  } | null>(null);
  const [exportMessage, setExportMessage] = useState('');
  const [storyExporting, setStoryExporting] = useState(false);
  const graphCaptureRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  const snapshotsRef = useRef<string[]>([]);
  const captureQueueRef = useRef(Promise.resolve());
  const captureGeneration = useRef(0);
  const [recordAnalysis, setRecordAnalysis] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const busy = stage !== 'idle' && stage !== 'ready' && stage !== 'failed';

  useEffect(
    () => () => {
      captureGeneration.current += 1;
    },
    []
  );

  useEffect(() => {
    if (!recordAnalysis || stage === 'idle' || !pageRef.current) return;
    const generation = captureGeneration.current;
    captureQueueRef.current = captureQueueRef.current.then(async () => {
      if (generation !== captureGeneration.current) return;
      setCapturing(true);
      try {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
        const root = pageRef.current;
        if (!root || generation !== captureGeneration.current) return;
        const append = async (target: HTMLElement, y = 0) => {
          if (
            generation !== captureGeneration.current ||
            snapshotsRef.current.length >= ANALYSIS_CAPTURE_LIMIT
          )
            return;
          const snapshot = await captureAnalysisSection(target, y);
          if (generation !== captureGeneration.current) return;
          snapshotsRef.current.push(snapshot);
          setCaptureCount(snapshotsRef.current.length);
        };
        await append(root);
        if (report) {
          // Capture the rendered page from top to bottom, then linger on the live Graph.
          const viewport = (root.getBoundingClientRect().width * 600) / 960;
          for (
            let y = viewport * 0.85;
            y < root.scrollHeight && snapshotsRef.current.length < 27;
            y += viewport * 0.85
          ) {
            await append(root, y);
          }
          const graph = root.querySelector<HTMLElement>('.repo-analysis__graph-card');
          if (graph) {
            for (let frame = 0; frame < 4; frame += 1) {
              await new Promise<void>((resolve) => setTimeout(resolve, 300));
              await append(graph);
            }
          }
          const doctor = root.querySelector<HTMLElement>('.repo-analysis__doctor-card');
          if (doctor) await append(doctor);
          const decisions = root.querySelector<HTMLElement>('.repo-analysis__decision-card');
          if (decisions) await append(decisions);
        }
      } catch (reason) {
        if (generation === captureGeneration.current)
          setCaptureError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (generation === captureGeneration.current) setCapturing(false);
      }
    });
  }, [stage, report, recordAnalysis]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const inbound = normalizeExtensionWebviewMessage(event.data);
      if (!inbound) return;
      if (inbound.command === 'repositoryAnalysisProgress') {
        if (requestId && inbound.data?.requestId !== requestId) return;
        const nextStage = inbound.data?.stage as RepositoryAnalysisStage;
        const nextMessage =
          typeof inbound.data?.message === 'string' ? inbound.data.message : 'Analyzing repository';
        setStage(nextStage);
        setMessage(nextMessage);
        setStory((current) =>
          current.some((entry) => entry.stage === nextStage)
            ? current
            : [...current, { stage: nextStage, message: nextMessage }]
        );
      }
      if (inbound.command === 'repositoryAnalysisCompleted') {
        const next = inbound.data as RepositoryAnalysisReport;
        if (requestId && next?.requestId !== requestId) return;
        setReport(next);
        setStage('ready');
        setMessage(
          next.execution.cacheReused
            ? 'Current evidence loaded from the local cache.'
            : 'Evidence-backed analysis complete.'
        );
        setStory((current) =>
          current.some((entry) => entry.stage === 'ready')
            ? current
            : [...current, { stage: 'ready', message: 'Evidence-backed analysis ready' }]
        );
      }
      if (inbound.command === 'repositoryAnalysisFailed') {
        if (requestId && inbound.data?.requestId !== requestId) return;
        setStage('failed');
        setError(inbound.error || 'Repository analysis failed.');
      }
      if (inbound.command === 'repositoryAnalysisCancelled') {
        if (requestId && inbound.data?.requestId !== requestId) return;
        setStage('idle');
        setMessage('Analysis stopped.');
      }
      if (inbound.command === 'repositoryAnalysisDeleted') {
        setReport(null);
        setStory([]);
        setStage('idle');
        setMessage('Local analysis removed.');
      }
      if (inbound.command === 'repositoryAnalysisExported') {
        if (requestId && inbound.data?.requestId !== requestId) return;
        setExportMessage(
          inbound.error
            ? `Export failed: ${inbound.error}`
            : inbound.data?.kind === 'cancelled'
              ? 'Export cancelled. The recording is still available.'
              : 'GIF exported.'
        );
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [requestId]);

  const stageIndex =
    stage === 'failed' || stage === 'idle' ? -1 : STAGES.findIndex((item) => item.id === stage);
  const technologies = useMemo(
    () => [
      ...new Set([...(report?.identity.frameworks ?? []), ...(report?.identity.runtimes ?? [])]),
    ],
    [report]
  );
  const selectedEntity = report?.graph.entities.find((entity) => entity.id === selectedEntityId);
  const graphKinds = useMemo(
    () => [...new Set(report?.graph.entities.map((entity) => entity.kind) ?? [])].sort(),
    [report]
  );
  const graphProjects = useMemo(
    () =>
      [
        ...new Set(report?.graph.entities.map((entity) => entity.projectId).filter(Boolean) ?? []),
      ].sort() as string[],
    [report]
  );
  const visibleGraph = useMemo(() => {
    if (!report) return { entities: [], relations: [] };
    const neighborhood = isolatedEntityId ? new Set([isolatedEntityId]) : null;
    if (neighborhood) {
      for (const relation of report.graph.relations) {
        if (relation.from === isolatedEntityId) neighborhood.add(relation.to);
        if (relation.to === isolatedEntityId) neighborhood.add(relation.from);
      }
    }
    const projectScope =
      graphProject === 'all' ? null : workspaceGraphProjectScopeIds(report.graph, graphProject);
    const query = graphQuery.trim().toLowerCase();
    const entities = report.graph.entities.filter((entity) => {
      if (neighborhood && !neighborhood.has(entity.id)) return false;
      if (projectScope && !projectScope.has(entity.id)) return false;
      if (graphMode === 'architecture' && !ARCHITECTURE_KINDS.has(entity.kind)) return false;
      if (graphKind !== 'all' && entity.kind !== graphKind) return false;
      return (
        !query ||
        [entity.label, entity.id, entity.kind, entity.path, entity.projectId]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      );
    });
    const ids = new Set(entities.map((entity) => entity.id));
    return {
      entities,
      relations: report.graph.relations.filter(
        (relation) => ids.has(relation.from) && ids.has(relation.to)
      ),
    };
  }, [graphKind, graphMode, graphProject, graphQuery, isolatedEntityId, report]);
  const doctorTotal = report
    ? report.doctor.counts.blockingCauses +
      report.doctor.counts.advisoryFindings +
      report.doctor.counts.unknownFindings
    : 0;
  const doctorStyle = report
    ? ({
        '--doctor-blocked': `${(report.doctor.counts.blockingCauses / Math.max(doctorTotal, 1)) * 100}%`,
        '--doctor-advisory': `${((report.doctor.counts.blockingCauses + report.doctor.counts.advisoryFindings) / Math.max(doctorTotal, 1)) * 100}%`,
      } as CSSProperties)
    : undefined;

  const start = () => {
    captureGeneration.current += 1;
    snapshotsRef.current = [];
    setCaptureCount(0);
    setCaptureError('');
    setGraphRenderFailed(false);
    const id = `repo-${Date.now()}`;
    setRequestId(id);
    setReport(null);
    setStory([]);
    setError('');
    setExportMessage('');
    setSelectedEntityId(null);
    setIsolatedEntityId(null);
    setStage('validating');
    setMessage('Validating public repository URL');
    vscode.postMessage('analyzeRemoteRepository', { repositoryUrl, requestId: id });
  };

  const exportRecording = async () => {
    if (!report || capturing || storyExporting) return;
    setStoryExporting(true);
    setExportMessage('Encoding captured screen frames…');
    try {
      const result = await encodeAnalysisRecording(snapshotsRef.current);
      vscode.postMessage('exportRepositoryAnalysisGif', {
        ...result,
        requestId,
        repositoryName: report.repository.name,
        commit: report.repository.commit,
        kind: 'recording',
      });
      setExportMessage('Choose where to save the recorded analysis.');
    } catch (reason) {
      setExportMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setStoryExporting(false);
    }
  };

  const exportStory = async () => {
    if (!report || storyExporting) return;
    setStoryExporting(true);
    setExportMessage('Building analysis story…');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      let capturedGraph: ImageData | undefined;
      if (graphCaptureRef.current) {
        try {
          capturedGraph = captureWorkspaceGraphImageData(graphCaptureRef.current, {
            width: 840,
            height: 420,
          });
        } catch {
          // The evidence-derived fallback remains available when the live canvas is not ready.
        }
      }
      const result = createRepositoryAnalysisStoryGif(report, story, { capturedGraph });
      vscode.postMessage('exportRepositoryAnalysisGif', {
        ...result,
        requestId,
        repositoryName: report.repository.name,
        commit: report.repository.commit,
        kind: 'story',
      });
      setExportMessage('Choose where to save the analysis story.');
    } catch (reason) {
      setExportMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setStoryExporting(false);
    }
  };

  return (
    <main
      ref={pageRef}
      className={`repo-analysis ${report ? 'has-report' : ''}`}
      aria-label="Analyze repository"
    >
      <section className="repo-analysis__hero">
        <div className="repo-analysis__hero-copy">
          <div className="repo-analysis__eyebrow">
            <Radar size={14} /> LOCAL REPOSITORY INTELLIGENCE
          </div>
          <h2>What’s inside this repo?</h2>
          <p>
            See its architecture, health, security signals, and agent readiness before the first
            change. Everything runs locally.
          </p>
          <div className="repo-analysis__input-row">
            <label className="sr-only" htmlFor="repository-analysis-url">
              Public repository URL
            </label>
            <GitBranch size={15} aria-hidden="true" />
            <input
              id="repository-analysis-url"
              type="url"
              value={repositoryUrl}
              disabled={busy}
              placeholder="https://github.com/owner/repository"
              aria-describedby="repository-analysis-url-help"
              onChange={(event) => setRepositoryUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && repositoryUrl.trim() && !busy) start();
              }}
            />
            <button
              type="button"
              className="ws-btn ws-btn--primary"
              disabled={busy || !repositoryUrl.trim()}
              onClick={start}
            >
              <Search size={14} /> {busy ? 'Analyzing…' : report ? 'Analyze again' : 'Analyze repo'}
            </button>
            {busy ? (
              <button
                type="button"
                className="ws-btn"
                onClick={() => vscode.postMessage('cancelRemoteRepositoryAnalysis', { requestId })}
              >
                Stop
              </button>
            ) : null}
          </div>
          <small id="repository-analysis-url-help" className="repo-analysis__url-help">
            Public GitHub, GitLab or Bitbucket URL. An isolated local copy is created; your open
            project is not replaced.
          </small>
          <div className="repo-analysis__trust-row">
            <label>
              <input
                type="checkbox"
                checked={recordAnalysis}
                disabled={busy || capturing}
                onChange={(event) => setRecordAnalysis(event.target.checked)}
              />
              Record analysis for GIF
            </label>
            <span>
              <ShieldCheck size={13} /> No source execution
            </span>
            <span>
              <Boxes size={13} /> No dependency install
            </span>
            <span>
              <Activity size={13} /> Evidence, not a synthetic score
            </span>
          </div>
        </div>
        <div className="repo-analysis__hero-visual" aria-hidden="true">
          <div className="repo-analysis__orbit orbit-a">
            <span />
          </div>
          <div className="repo-analysis__orbit orbit-b">
            <span />
          </div>
          <div className="repo-analysis__orbit orbit-c">
            <span />
          </div>
          <div className="repo-analysis__signal-core">
            <Sparkles size={22} />
          </div>
          <span className="repo-analysis__signal-label label-model">MODEL</span>
          <span className="repo-analysis__signal-label label-graph">GRAPH</span>
          <span className="repo-analysis__signal-label label-doctor">DOCTOR</span>
        </div>
      </section>

      {recordAnalysis ? (
        <p className="repo-analysis__capture-status" role="status">
          {captureError
            ? `Recording unavailable: ${captureError}`
            : capturing
              ? 'Capturing the actual page…'
              : `${captureCount} captured frames · sampled stages and results tour · local only`}
        </p>
      ) : null}

      {stage !== 'idle' && !report ? (
        <section className="repo-analysis__progress">
          <div className="repo-analysis__progress-copy">
            <span>LIVE ANALYSIS</span>
            <strong role={error ? 'alert' : 'status'}>{error || message}</strong>
            <small>
              {error
                ? 'No result was inferred from an incomplete run.'
                : 'Canonical evidence is being produced locally.'}
            </small>
          </div>
          <div className="repo-analysis__steps">
            {STAGES.map((item, index) => (
              <div key={item.id} className={index <= stageIndex ? 'is-active' : ''}>
                <span>
                  {index < stageIndex ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    String(index + 1).padStart(2, '0')
                  )}
                </span>
                <b>{item.label}</b>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {report ? (
        <>
          <section className={`repo-analysis__verdict is-${report.verdict}`}>
            <div className="repo-analysis__verdict-icon">
              {report.verdict === 'ready' ? <CheckCircle2 /> : <AlertTriangle />}
            </div>
            <div>
              <span>{analysisGateLabel(report.readiness)}</span>
              <h3>
                {report.repository.owner}/{report.repository.name}
              </h3>
              <p>
                Commit {report.repository.commit.slice(0, 12)} · CLI {report.execution.cliVersion} ·{' '}
                {message}
              </p>
              <p>
                Repository code and dependency installation were not executed. A blocked gate does
                not make the architecture evidence unusable; inspect its reasons before changing or
                releasing the project.
              </p>
            </div>
            <div className="repo-analysis__verdict-actions">
              {captureCount > 0 ? (
                <button
                  type="button"
                  className="ws-btn"
                  disabled={capturing || storyExporting || busy}
                  title="Export captured analysis frames, including the progress and results"
                  onClick={() => void exportRecording()}
                >
                  <Download size={14} /> {capturing ? 'Recording…' : 'Recorded analysis GIF'}
                </button>
              ) : null}
              <button
                type="button"
                className="ws-btn ws-btn--primary"
                onClick={() =>
                  vscode.postMessage('openAnalyzedRepository', {
                    path: report.repository.localPath,
                  })
                }
              >
                Open isolated copy <ArrowUpRight size={14} />
              </button>
              <button
                type="button"
                className="ws-btn"
                title="Export an illustrated summary, not a recording of the analysis"
                disabled={storyExporting || busy || capturing}
                onClick={() => void exportStory()}
              >
                <Download size={14} /> {storyExporting ? 'Encoding…' : 'Summary GIF'}
              </button>
            </div>
          </section>

          <RepositoryInvestigation
            key={report.requestId}
            report={report}
            seed={investigationSeed}
          />
          <section className="repo-analysis__metrics" aria-label="Repository evidence totals">
            {[
              [
                <GitBranch key="projects" />,
                report.summary.projects,
                'Projects',
                'registered topology',
              ],
              [
                <Boxes key="entities" />,
                compact(report.summary.entities),
                'Entities',
                `${report.graph.entities.length} in visual projection`,
              ],
              [
                <Network key="relations" />,
                compact(report.summary.relations),
                'Relations',
                'canonical connections',
              ],
              [
                <FileCheck2 key="proofs" />,
                compact(report.summary.proofs),
                'Proofs',
                `${percent(report.graph.quality.entityProofCoverageRatio)} entity coverage`,
              ],
              [
                <Activity key="diagnostics" />,
                report.summary.diagnostics,
                'Diagnostics',
                'Graph-reported findings',
              ],
            ].map(([icon, value, label, detail]) => (
              <article key={String(label)}>
                {icon}
                <strong>{value}</strong>
                <span>{label}</span>
                <small>{detail}</small>
              </article>
            ))}
          </section>

          <section className="repo-analysis__intelligence-grid">
            <article className="repo-analysis__graph-card">
              <header>
                <div>
                  <span>LIVE ARCHITECTURE MAP</span>
                  <h3>Canonical Graph</h3>
                </div>
                <div className="repo-analysis__graph-actions">
                  <span>
                    {report.graph.truncated
                      ? 'Bounded visual · full totals retained'
                      : 'Complete visual projection'}
                  </span>
                  <button
                    type="button"
                    className="ws-btn"
                    disabled={Boolean(graphGifRequest)}
                    onClick={() =>
                      setGraphGifRequest({
                        id: Date.now(),
                        revision: report.graph.revision,
                        delayCentiseconds: 14,
                      })
                    }
                  >
                    <Download size={13} /> {graphGifRequest ? 'Capturing…' : '360° Graph GIF'}
                  </button>
                </div>
              </header>
              <div className="repo-analysis__graph-toolbar">
                <div className="repo-analysis__segmented" aria-label="Graph scope">
                  <button
                    type="button"
                    className={graphMode === 'architecture' ? 'is-active' : ''}
                    onClick={() => setGraphMode('architecture')}
                  >
                    Architecture
                  </button>
                  <button
                    type="button"
                    className={graphMode === 'all' ? 'is-active' : ''}
                    onClick={() => setGraphMode('all')}
                  >
                    All evidence
                  </button>
                </div>
                <label className="repo-analysis__graph-search">
                  <Search size={13} />
                  <input
                    value={graphQuery}
                    onChange={(event) => setGraphQuery(event.target.value)}
                    placeholder="Find a service, file, API…"
                  />
                </label>
                <select
                  aria-label="Filter Graph by entity kind"
                  value={graphKind}
                  onChange={(event) => setGraphKind(event.target.value)}
                >
                  <option value="all">All types</option>
                  {graphKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter Graph by project"
                  value={graphProject}
                  onChange={(event) => setGraphProject(event.target.value)}
                >
                  <option value="all">All projects</option>
                  {graphProjects.map((project) => (
                    <option key={project} value={project}>
                      {project}
                    </option>
                  ))}
                </select>
                {selectedEntity ? (
                  <button
                    type="button"
                    className="ws-btn"
                    onClick={() =>
                      setIsolatedEntityId((current) =>
                        current === selectedEntity.id ? null : selectedEntity.id
                      )
                    }
                  >
                    {isolatedEntityId ? 'Show full scope' : 'Isolate neighbors'}
                  </button>
                ) : null}
              </div>
              <div ref={graphCaptureRef} className="repo-analysis__graph-stage">
                {!visibleGraph.entities.length ? (
                  <div className="repo-analysis__graph-empty">
                    <p>No entities match this view.</p>
                    <button
                      type="button"
                      className="ws-btn"
                      onClick={() => {
                        setGraphMode('all');
                        setGraphKind('all');
                        setGraphProject('all');
                        setGraphQuery('');
                        setIsolatedEntityId(null);
                      }}
                    >
                      Show available Graph evidence
                    </button>
                  </div>
                ) : null}
                {graphRenderFailed || graphRenderer === 'list' ? (
                  <p role="status">
                    Interactive Graph is unavailable in this webview. Open the canonical Graph
                    evidence below.
                  </p>
                ) : (
                  <WorkspaceGraphWebgl
                    key={report.repository.commit}
                    entities={visibleGraph.entities}
                    relations={visibleGraph.relations}
                    selectedId={selectedEntityId}
                    onSelect={setSelectedEntityId}
                    presentation={false}
                    onFallback={() => setGraphRenderFailed(true)}
                    preferenceKey={`repository-analysis:${report.repository.commit}`}
                    wordmarkLabel={report.repository.name}
                    gifExportRequest={graphGifRequest}
                    onGifExported={(result) => {
                      vscode.postMessage('exportRepositoryAnalysisGif', {
                        gifDataUrl: result.gifDataUrl,
                        width: result.width,
                        height: result.height,
                        frameCount: result.frameCount,
                        requestId,
                        repositoryName: report.repository.name,
                        commit: report.repository.commit,
                        kind: 'graph',
                      });
                      setGraphGifRequest(null);
                      setExportMessage('Choose where to save the 360° Graph GIF.');
                    }}
                    onGifExportFailed={(_id, reason) => {
                      setGraphGifRequest(null);
                      setExportMessage(`Graph GIF stopped: ${reason}`);
                    }}
                    preferWebgl={graphRenderer === 'webgl3d'}
                    autoOrbitDefault={
                      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                    }
                  />
                )}
                <div className="repo-analysis__graph-overlay">
                  <span>
                    {visibleGraph.entities.length} visible / {compact(report.graph.total.entities)}{' '}
                    total nodes
                  </span>
                  <span>{compact(visibleGraph.relations.length)} visible links</span>
                  <span>{report.graph.providers.length} providers</span>
                </div>
              </div>
              <footer>
                <span>
                  {selectedEntity
                    ? `${selectedEntity.kind} · ${selectedEntity.label}`
                    : 'Select a node to inspect its identity'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    vscode.postMessage('openRepositoryAnalysisArtifact', {
                      path: report.artifacts.graph,
                    })
                  }
                >
                  Open full Graph evidence <ArrowUpRight size={12} />
                </button>
              </footer>
              {selectedEntity ? (
                <div className="repo-analysis__entity-inspector">
                  <div>
                    <span>SELECTED ENTITY</span>
                    <strong>{selectedEntity.label}</strong>
                    <small>
                      {selectedEntity.kind} · {selectedEntity.projectId ?? 'workspace scope'} ·{' '}
                      {selectedEntity.proofIds.length} proof references
                    </small>
                  </div>
                  {Object.entries(selectedEntity.attributes)
                    .slice(0, 4)
                    .map(([key, value]) => (
                      <span key={key}>
                        <b>{key}</b>
                        {Array.isArray(value) ? value.join(', ') : String(value ?? '—')}
                      </span>
                    ))}
                </div>
              ) : null}
              <details className="repo-analysis__graph-facts">
                <summary>
                  Graph production facts · {report.graph.providers.length} providers ·{' '}
                  {report.graph.diagnostics.length} diagnostics
                </summary>
                <div>
                  <section>
                    <h4>Providers</h4>
                    {report.graph.providers.map((provider) => (
                      <p key={provider.id}>
                        <b>{provider.id}</b>
                        <span>{provider.status ?? 'unknown'}</span>
                        <small>
                          {provider.discoveredEntities ?? 0} entities ·{' '}
                          {provider.discoveredRelations ?? 0} relations · {provider.proofCount ?? 0}{' '}
                          proofs
                        </small>
                      </p>
                    ))}
                  </section>
                  <section>
                    <h4>Input scopes</h4>
                    {report.graph.source?.scopes.map((scope) => (
                      <p key={`${scope.kind}:${scope.id}`}>
                        <b>{scope.id}</b>
                        <span>{scope.truncated ? 'bounded' : 'complete'}</span>
                        <small>
                          {scope.fileCount ?? 0}/{scope.eligibleFileCount ?? scope.fileLimit ?? '—'}{' '}
                          files · {scope.strategy ?? 'strategy unreported'}
                        </small>
                      </p>
                    ))}
                  </section>
                  <section>
                    <h4>Diagnostics</h4>
                    {report.graph.diagnostics.length ? (
                      report.graph.diagnostics.map((diagnostic, index) => (
                        <p key={`${diagnostic.code}:${index}`}>
                          <b>{diagnostic.code}</b>
                          <span>{diagnostic.severity}</span>
                          <small>{diagnostic.message}</small>
                        </p>
                      ))
                    ) : (
                      <p>
                        <small>No Graph diagnostic was reported.</small>
                      </p>
                    )}
                  </section>
                </div>
              </details>
            </article>

            <article className={`repo-analysis__doctor-card is-${report.doctor.verdict}`}>
              <header>
                <div>
                  <span>REPOSITORY DOCTOR</span>
                  <h3>
                    {report.doctor.verdict === 'passed'
                      ? 'No blocking cause found'
                      : report.doctor.verdict === 'blocked'
                        ? 'Action required before handoff'
                        : 'Review before handoff'}
                  </h3>
                </div>
                <ShieldCheck size={22} />
              </header>
              <div className="repo-analysis__doctor-summary">
                <div className="repo-analysis__doctor-ring" style={doctorStyle}>
                  <strong>{doctorTotal}</strong>
                  <span>action signals</span>
                </div>
                <div>
                  <b>{report.doctor.counts.projectsScanned} projects scanned</b>
                  <span>
                    {report.doctor.canonical ? 'Canonical diagnosis' : 'Compatibility projection'} ·{' '}
                    {report.doctor.freshness ?? 'freshness unknown'}
                  </span>
                  <div className="repo-analysis__doctor-legend">
                    <em className="is-blocked">{report.doctor.counts.blockingCauses} blocking</em>
                    <em className="is-advisory">
                      {report.doctor.counts.advisoryFindings} advisory
                    </em>
                    <em className="is-repairable">
                      {report.doctor.counts.repairableFindings} repairable
                    </em>
                  </div>
                </div>
              </div>
              <div className="repo-analysis__findings">
                {report.doctor.findings.length ? (
                  report.doctor.findings.map((finding) => (
                    <div key={finding.id} className={`is-${finding.status}`}>
                      {finding.status === 'blocking' ? (
                        <AlertCircle size={14} />
                      ) : (
                        <Activity size={14} />
                      )}
                      <span>
                        <b>{finding.projectName ?? finding.id}</b>
                        <small>{finding.symptom}</small>
                        <button
                          type="button"
                          className="ws-btn"
                          onClick={() =>
                            setInvestigationSeed({
                              query:
                                `${finding.projectName ?? ''} ${finding.issueClass ?? finding.symptom}`
                                  .trim()
                                  .slice(0, 500),
                              id: Date.now(),
                            })
                          }
                        >
                          Find related graph evidence
                        </button>
                        {finding.verifyCommand ? (
                          <details>
                            <summary>Verification step</summary>
                            <code className="repo-analysis__verify-command">
                              {finding.verifyCommand}
                            </code>
                            <small>Review and run from the project directory.</small>
                          </details>
                        ) : null}
                      </span>
                      <em>
                        {finding.repairDisposition ?? finding.diagnosisState ?? finding.status}
                      </em>
                    </div>
                  ))
                ) : (
                  <div className="repo-analysis__doctor-clear">
                    <CheckCircle2 size={18} /> Doctor reported no applicable findings.
                  </div>
                )}
              </div>
              <footer>
                <span>
                  {report.doctor.findings.length} governed findings shown · full canonical artifact
                  available
                </span>
                <button
                  type="button"
                  onClick={() =>
                    vscode.postMessage('openRepositoryAnalysisArtifact', {
                      path: report.artifacts.doctor,
                    })
                  }
                >
                  Open Doctor evidence <ArrowUpRight size={12} />
                </button>
              </footer>
            </article>

            <article className="repo-analysis__decision-card">
              <header>
                <div>
                  <span>WHAT THIS MEANS</span>
                  <h3>What needs attention next?</h3>
                </div>
                <Bot size={22} />
              </header>
              <div className="repo-analysis__decision-grid">
                <section
                  className={
                    report.insights.webAgent.verdict === 'blocked' ? 'is-blocked' : 'is-conditional'
                  }
                >
                  <Bot size={16} />
                  <span>REMOTE AGENT PREPARATION</span>
                  <strong>
                    {report.insights.webAgent.verdict === 'blocked'
                      ? 'Resolve blockers'
                      : 'Environment check needed'}
                  </strong>
                  <p>
                    {report.insights.webAgent.gaps[0] ??
                      report.insights.webAgent.signals[0] ??
                      'No decisive agent-entry signal was observed.'}
                  </p>
                  <details>
                    <summary>Why?</summary>
                    {[...report.insights.webAgent.signals, ...report.insights.webAgent.gaps].map(
                      (signal) => (
                        <small key={signal}>{signal}</small>
                      )
                    )}
                    <em>{report.insights.webAgent.claimBoundary}</em>
                  </details>
                </section>
                <section
                  className={report.insights.security.findingCount ? 'is-attention' : 'is-unknown'}
                >
                  <ShieldCheck size={16} />
                  <span>SECURITY SIGNALS</span>
                  <strong>
                    {report.insights.security.findingCount
                      ? 'Review findings'
                      : 'Audit not verified'}
                  </strong>
                  <p>
                    {report.insights.security.findingCount
                      ? `${report.insights.security.findingCount} observed finding(s) need review.`
                      : 'No vulnerability audit result is available. Open the isolated copy to run the appropriate audit.'}
                  </p>
                  <details>
                    <summary>Evidence boundary</summary>
                    {report.insights.security.signals.map((signal) => (
                      <small key={signal}>{signal}</small>
                    ))}
                    <em>{report.insights.security.claimBoundary}</em>
                  </details>
                </section>
                <section className={`is-${report.insights.delivery.verdict}`}>
                  <Workflow size={16} />
                  <span>VERIFY &amp; SHIP</span>
                  <strong>
                    {report.insights.delivery.verdict === 'ready'
                      ? 'Controls discovered'
                      : report.insights.delivery.verdict === 'unknown'
                        ? 'Not observed'
                        : 'Controls incomplete'}
                  </strong>
                  <p>
                    {report.insights.delivery.verificationCommands.length} supported verification
                    action(s) · {report.insights.delivery.ciProjects} CI project(s)
                  </p>
                  <details>
                    <summary>Discovered controls</summary>
                    <small>{report.insights.delivery.releaseProjects} release-controlled</small>
                    <small>{report.insights.delivery.ownershipProjects} ownership-controlled</small>
                    {report.insights.delivery.verificationCommands.slice(0, 8).map((command) => (
                      <small key={command}>{command}</small>
                    ))}
                  </details>
                </section>
                <section className={`is-${report.insights.changeSurface.verdict}`}>
                  <Network size={16} />
                  <span>START YOUR REVIEW HERE</span>
                  <strong>Connected surfaces</strong>
                  <p>
                    Inspect high-connection entities before editing. Connection count is not a risk
                    score.
                  </p>
                  <details>
                    <summary>Highest-reach surfaces</summary>
                    {report.insights.changeSurface.signals.map((signal) => (
                      <small key={signal}>{signal}</small>
                    ))}
                  </details>
                  <button
                    type="button"
                    className="ws-btn"
                    onClick={() => {
                      const id = report.connectedSurfaces.find((surface) =>
                        report.graph.entities.some((entity) => entity.id === surface.id)
                      )?.id;
                      if (id) {
                        setGraphMode('all');
                        setGraphKind('all');
                        setGraphProject('all');
                        setGraphQuery('');
                        setSelectedEntityId(id);
                        setIsolatedEntityId(id);
                        graphCaptureRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        });
                      }
                    }}
                  >
                    Inspect in Graph
                  </button>
                </section>
              </div>
            </article>
          </section>

          <section className="repo-analysis__evidence-row">
            <article>
              <header>
                <span>SYSTEM IDENTITY</span>
                <b>{technologies.length} detected</b>
              </header>
              <div className="repo-analysis__chips">
                {technologies.length ? (
                  technologies.map((item) => <span key={item}>{item}</span>)
                ) : (
                  <em>No runtime identity detected</em>
                )}
              </div>
            </article>
            <article>
              <header>
                <span>GRAPH INTEGRITY</span>
                <b>{report.graph.quality.portable === true ? 'portable' : 'unverified'}</b>
              </header>
              <div className="repo-analysis__facts">
                <span>
                  <b>{percent(report.graph.quality.entityProofCoverageRatio)}</b> entity proof
                </span>
                <span>
                  <b>{percent(report.graph.quality.relationProofCoverageRatio)}</b> relation proof
                </span>
                <span>
                  <b>{percent(report.graph.quality.providerSuccessRatio)}</b> provider success
                </span>
                <span>
                  <b>{report.graph.quality.conflictCount ?? 0}</b> conflicts
                </span>
              </div>
            </article>
            {report.retrieval ? (
              <article className="repo-analysis__context-card">
                <header>
                  <span>BOUNDED CONTEXT</span>
                  <b>estimated</b>
                </header>
                <strong>{report.retrieval.reductionPercent}%</strong>
                <p>smaller retrieval payload</p>
                <small>
                  {compact(report.retrieval.corpusEstimatedTokens)} corpus tokens →{' '}
                  {compact(report.retrieval.boundedEstimatedTokens)} retrieved
                </small>
                <details>
                  <summary>Measurement boundary</summary>
                  <p>{report.retrieval.claimBoundary}</p>
                </details>
              </article>
            ) : null}
          </section>

          <section className="repo-analysis__next">
            <div>
              <span>QUESTION-SIZED ENTRY POINTS</span>
              <h3>The Graph is ready for follow-up, not another full-repo read.</h3>
            </div>
            <ol>
              {report.questions.map((question) => (
                <li key={question}>
                  <button
                    className="ws-btn"
                    onClick={() => setInvestigationSeed({ query: question, id: Date.now() })}
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section className="repo-analysis__footer-actions">
            <span role="status">{exportMessage}</span>
            <button
              type="button"
              className="ws-btn"
              onClick={() =>
                vscode.postMessage('openRepositoryAnalysisArtifact', {
                  path: report.artifacts.intelligence,
                })
              }
            >
              Open intelligence evidence
            </button>
            <button
              type="button"
              className="ws-btn ws-btn--danger"
              onClick={() =>
                vscode.postMessage('deleteRemoteRepositoryAnalysis', {
                  repositoryUrl: report.repository.url,
                  requestId,
                })
              }
            >
              <Trash2 size={13} /> Delete local analysis
            </button>
          </section>
        </>
      ) : null}
    </main>
  );
}
