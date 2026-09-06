import crypto from 'node:crypto';
import path from 'node:path';

import fs from 'fs-extra';

import type {
  RepositoryAnalysisProgress,
  RepositoryAnalysisReport,
  RepositoryAnalysisStage,
} from '../contracts/repositoryAnalysis.js';
import { projectDoctorEvidence } from './doctorEvidenceProjection.js';
import { buildWorkspaceGraphProjection } from './workspaceGraphProjection.js';
import { run } from '../utils/exec.js';
import { buildRapidkitExecutionSpec } from '../utils/platformCapabilities.js';

const ALLOWED_REPOSITORY_HOSTS = new Set(['github.com', 'gitlab.com', 'bitbucket.org']);
const ANALYSIS_TIMEOUT_MS = 10 * 60_000;
const MAX_ANALYSIS_BYTES = 1024 * 1024 * 1024;
const MAX_CACHED_ANALYSES = 3;

export type { RepositoryAnalysisProgress, RepositoryAnalysisReport, RepositoryAnalysisStage };

export type NormalizedRepositoryUrl = {
  url: string;
  host: string;
  owner: string;
  name: string;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function isolatedAnalysisEnvironment(homePath: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    const upper = key.toUpperCase();
    if (
      upper === 'GIT_ASKPASS' ||
      upper === 'SSH_ASKPASS' ||
      upper === 'GCM_INTERACTIVE' ||
      upper === 'GH_TOKEN' ||
      upper === 'GITHUB_TOKEN' ||
      upper === 'GITLAB_TOKEN' ||
      upper === 'BITBUCKET_TOKEN' ||
      upper === 'GIT_CONFIG_COUNT' ||
      upper === 'GIT_CONFIG_GLOBAL' ||
      upper === 'GIT_CONFIG_SYSTEM' ||
      upper.startsWith('GIT_CONFIG_KEY_') ||
      upper.startsWith('GIT_CONFIG_VALUE_')
    ) {
      delete env[key];
    }
  }
  return {
    ...env,
    HOME: homePath,
    USERPROFILE: homePath,
    XDG_CONFIG_HOME: path.join(homePath, '.config'),
    GIT_CONFIG_GLOBAL: path.join(homePath, '.gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_LFS_SKIP_SMUDGE: '1',
    npm_config_ignore_scripts: 'true',
  };
}

async function directorySize(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(entryPath);
    } else if (entry.isFile()) {
      total += (await fs.stat(entryPath)).size;
    }
    if (total > MAX_ANALYSIS_BYTES) {
      return total;
    }
  }
  return total;
}

async function pruneAnalysisCache(analysisRoot: string, retainedRoot: string): Promise<void> {
  const candidates: Array<{ root: string; generatedAt: number }> = [];
  for (const entry of await fs.readdir(analysisRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }
    const root = path.join(analysisRoot, entry.name);
    const reportPath = path.join(root, 'report.json');
    if (!(await fs.pathExists(reportPath))) {
      continue;
    }
    const report = asRecord(await fs.readJson(reportPath));
    const generatedAt = Date.parse(
      typeof report.generatedAt === 'string' ? report.generatedAt : ''
    );
    candidates.push({ root, generatedAt: Number.isFinite(generatedAt) ? generatedAt : 0 });
  }
  const removable = candidates
    .filter((candidate) => path.resolve(candidate.root) !== path.resolve(retainedRoot))
    .sort((left, right) => right.generatedAt - left.generatedAt)
    .slice(MAX_CACHED_ANALYSES - 1);
  await Promise.all(removable.map((candidate) => fs.remove(candidate.root)));
}

export function normalizePublicRepositoryUrl(input: string): NormalizedRepositoryUrl {
  const raw = input.trim();
  if (!raw) {
    throw new Error('Enter a public repository URL.');
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Use a full HTTPS repository URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS repository URLs are accepted.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Repository URLs must not contain credentials.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Use the repository root URL without query parameters or fragments.');
  }
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_REPOSITORY_HOSTS.has(host)) {
    throw new Error('Quick Analysis currently supports public GitHub, GitLab, and Bitbucket URLs.');
  }
  const segments = parsed.pathname
    .replace(/\.git\/?$/i, '')
    .split('/')
    .filter(Boolean);
  const validDepth = host === 'gitlab.com' ? segments.length >= 2 : segments.length === 2;
  if (!validDepth) {
    throw new Error('Use the repository root URL, for example https://github.com/org/repo.');
  }
  const name = segments.at(-1);
  const owner = segments.slice(0, -1).join('/');
  if (!owner || !name || segments.some((segment) => !/^[A-Za-z0-9_.-]+$/.test(segment))) {
    throw new Error('The repository owner or name is invalid.');
  }
  return { url: `https://${host}/${owner}/${name}.git`, host, owner, name };
}

function safeJsonParse(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    return null;
  }
}

function operationData(value: unknown): JsonRecord {
  const record = asRecord(value);
  return asRecord(record.data ?? record.result ?? value);
}

async function runCli(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  cancelSignal?: AbortSignal
) {
  const execution = buildRapidkitExecutionSpec(args);
  const result = await run(execution.command, execution.args, {
    cwd,
    env: { ...execution.env, ...env, NO_COLOR: '1', FORCE_COLOR: '0' },
    shell: execution.shell,
    timeout: ANALYSIS_TIMEOUT_MS,
    cancelSignal,
  });
  if (result.exitCode !== 0 && result.exitCode !== 2) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || `Workspai exited ${result.exitCode}.`
    );
  }
  return safeJsonParse(result.stdout);
}

/** Read-only retrieval from the captured canonical Graph, not the visual sample. */
export async function searchRepositoryAnalysis(report: RepositoryAnalysisReport, query: string) {
  const text = query.trim();
  if (!text || text.length > 500 || [...text].some((character) => character.charCodeAt(0) < 32)) {
    throw new Error('Enter a question of 1–500 characters.');
  }
  const root = path.dirname(path.dirname(report.artifacts.workspacePath));
  const raw = asRecord(
    await runCli(
      [
        'workspace',
        'graph',
        'search',
        text,
        '--from',
        report.artifacts.graph,
        '--workspace',
        report.artifacts.workspacePath,
        '--limit',
        '8',
        '--json',
      ],
      report.artifacts.workspacePath,
      isolatedAnalysisEnvironment(path.join(root, 'home'))
    )
  );
  const result = asRecord(raw.artifact ?? raw.data ?? raw.result ?? raw);
  if (
    result.schemaVersion !== 'workspace-knowledge-search.v1' ||
    !Array.isArray(result.entities) ||
    !Array.isArray(result.proofs) ||
    !Array.isArray(result.relations) ||
    !Array.isArray(result.relatedEntities) ||
    typeof result.totalMatches !== 'number' ||
    typeof result.truncated !== 'boolean'
  ) {
    throw new Error('CLI did not return supported proof-backed search evidence.');
  }
  const validIdentity = (value: unknown) => {
    const item = asRecord(value);
    return typeof item.id === 'string' && typeof item.label === 'string';
  };
  if (
    result.entities.length > 8 ||
    result.entities.some((value) => {
      const item = asRecord(value);
      return (
        !validIdentity(value) ||
        typeof item.kind !== 'string' ||
        !Array.isArray(item.proofIds) ||
        item.proofIds.some((id) => typeof id !== 'string')
      );
    }) ||
    result.relatedEntities.some((value) => !validIdentity(value)) ||
    result.proofs.some((value) => {
      const item = asRecord(value);
      return typeof item.id !== 'string' || typeof item.artifact !== 'string';
    }) ||
    result.relations.some((value) => {
      const item = asRecord(value);
      return ['id', 'from', 'to', 'kind'].some((key) => typeof item[key] !== 'string');
    })
  ) {
    throw new Error('Malformed CLI search entities or evidence.');
  }
  return result;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
          )
        ),
      ]
        .map((entry) => entry.trim())
        .sort()
    : [];
}

function connectedSurfaces(graph: unknown): RepositoryAnalysisReport['connectedSurfaces'] {
  const graphRecord = asRecord(graph);
  const entities = records(graphRecord.entities);
  const relations = records(graphRecord.relations);
  const degree = new Map<string, number>();
  for (const relation of relations) {
    if (typeof relation.from === 'string') {
      degree.set(relation.from, (degree.get(relation.from) ?? 0) + 1);
    }
    if (typeof relation.to === 'string') {
      degree.set(relation.to, (degree.get(relation.to) ?? 0) + 1);
    }
  }
  return entities
    .map((entity) => ({
      id: typeof entity.id === 'string' ? entity.id : '',
      label: typeof entity.label === 'string' ? entity.label : 'Unnamed surface',
      kind: typeof entity.kind === 'string' ? entity.kind : 'unknown',
      connections: degree.get(typeof entity.id === 'string' ? entity.id : '') ?? 0,
    }))
    .filter((entry: { id: string; connections: number }) => entry.id && entry.connections > 0)
    .sort(
      (
        left: { connections: number; label: string },
        right: { connections: number; label: string }
      ) => right.connections - left.connections || left.label.localeCompare(right.label)
    )
    .slice(0, 8);
}

function repositoryQuestions(name: string, runtimes: string[], frameworks: string[]): string[] {
  const technology = frameworks[0] ?? runtimes[0];
  return [
    `Where are the main entry points in ${name}?`,
    `Which components have the highest architectural reach?`,
    technology
      ? `How is ${technology} connected to tests, deployment, and CI?`
      : 'How are source, tests, deployment, and CI connected?',
    'What evidence should an agent inspect before making a change?',
  ];
}

export function deriveRepositoryInsights(input: {
  model: JsonRecord;
  doctor: ReturnType<typeof projectDoctorEvidence>;
  graph: ReturnType<typeof buildWorkspaceGraphProjection>;
  readinessStatus: string;
  failedStages: number;
  connected: RepositoryAnalysisReport['connectedSurfaces'];
}): RepositoryAnalysisReport['insights'] {
  const projects = records(input.model.projects);
  const governedCount = (control: 'ci' | 'release' | 'ownership') =>
    projects.filter((project) => {
      const governance = asRecord(project.governance);
      const value = asRecord(governance[control]);
      return value.status === 'repository' || value.status === 'external-observed';
    }).length;
  const verificationCommands = [
    ...new Set(
      projects.flatMap((project) => {
        const commands = asRecord(project.commands);
        return stringList(commands.supported).filter((command) =>
          /(?:test|check|verify|lint|typecheck|build|audit)/i.test(command)
        );
      })
    ),
  ].sort();
  const ciProjects = governedCount('ci');
  const releaseProjects = governedCount('release');
  const ownershipProjects = governedCount('ownership');
  const governedProjects = Math.max(ciProjects, releaseProjects, ownershipProjects);
  const deliveryVerdict: RepositoryAnalysisReport['insights']['delivery']['verdict'] =
    projects.length === 0 || (governedProjects === 0 && verificationCommands.length === 0)
      ? 'unknown'
      : ciProjects === projects.length && verificationCommands.length > 0
        ? 'ready'
        : 'partial';

  const securityFindings = input.doctor.findings.filter(
    (finding) =>
      finding.issueClass?.toLowerCase() === 'security' ||
      /(?:security|vulnerabilit|audit|credential|secret|permission)/i.test(finding.symptom)
  );
  const securitySignals = securityFindings.map((finding) => finding.symptom).slice(0, 5);
  const securityVerdict: RepositoryAnalysisReport['insights']['security']['verdict'] =
    securityFindings.length > 0 ? 'attention' : 'unknown';

  const graphPortable = input.graph.quality.portable === true;
  const proofCoverage = input.graph.quality.entityProofCoverageRatio;
  const proofBacked = typeof proofCoverage === 'number' && proofCoverage > 0;
  const webAgentSignals = [
    ...(graphPortable ? ['Portable canonical Graph is available'] : []),
    ...(proofBacked ? [`${Math.round(proofCoverage * 100)}% entity proof coverage`] : []),
    ...(verificationCommands.length > 0
      ? [`${verificationCommands.length} supported verification actions discovered`]
      : []),
    ...(input.readinessStatus === 'passed' ? ['Intelligence chain passed'] : []),
  ];
  const webAgentGaps = [
    ...(!graphPortable ? ['Graph portability is not verified'] : []),
    ...(!proofBacked ? ['No entity proof coverage was reported'] : []),
    ...(verificationCommands.length === 0
      ? ['No supported verification action was discovered']
      : []),
    ...(input.doctor.counts.blockingCauses > 0
      ? [`${input.doctor.counts.blockingCauses} Doctor blocker(s) remain`]
      : []),
    ...(input.failedStages > 0 ? [`${input.failedStages} intelligence stage(s) failed`] : []),
    ...(input.readinessStatus !== 'passed' ? ['The intelligence gate has not passed'] : []),
    'Remote runtime, credentials, network access, and services have not been tested',
  ];
  const webAgentVerdict: RepositoryAnalysisReport['insights']['webAgent']['verdict'] =
    input.doctor.counts.blockingCauses > 0 ||
    input.failedStages > 0 ||
    input.readinessStatus === 'blocked'
      ? 'blocked'
      : 'conditional';

  const highestConnections = input.connected[0]?.connections ?? 0;
  const concentrationThreshold = Math.max(12, Math.ceil(input.graph.total.relations * 0.01));
  const hotspots = input.connected.filter(
    (surface) => surface.connections >= concentrationThreshold
  );
  const changeVerdict: RepositoryAnalysisReport['insights']['changeSurface']['verdict'] =
    input.connected.length === 0 ? 'unknown' : hotspots.length > 0 ? 'concentrated' : 'distributed';

  return {
    webAgent: {
      verdict: webAgentVerdict,
      signals: webAgentSignals,
      gaps: webAgentGaps,
      claimBoundary:
        'Static preparation assessment. A remote agent environment has not been launched or verified. Supported lifecycle actions are discovery hints, not executed repository commands.',
    },
    security: {
      verdict: securityVerdict,
      findingCount: securityFindings.length,
      signals: securitySignals,
      claimBoundary:
        'Reports security signals observed by the static Workspai Doctor evidence. It is not a substitute for a dependency audit, secret scan, SAST, or runtime penetration test.',
    },
    delivery: {
      verdict: deliveryVerdict,
      ciProjects,
      releaseProjects,
      ownershipProjects,
      verificationCommands,
    },
    changeSurface: {
      verdict: changeVerdict,
      hotspotCount: hotspots.length,
      highestConnections,
      signals: input.connected
        .slice(0, 4)
        .map((surface) => `${surface.label}: ${surface.connections} connections`),
    },
  };
}

export async function analyzeRemoteRepository(input: {
  repositoryUrl: string;
  requestId: string;
  storagePath: string;
  cliVersion: string;
  cancelSignal?: AbortSignal;
  onProgress: (progress: RepositoryAnalysisProgress) => void;
}): Promise<RepositoryAnalysisReport> {
  input.onProgress({
    requestId: input.requestId,
    stage: 'validating',
    message: 'Validating public repository URL',
  });
  const repository = normalizePublicRepositoryUrl(input.repositoryUrl);
  const analysisRoot = path.join(input.storagePath, 'repository-analysis');
  const probeHome = path.join(analysisRoot, '.probe-home');
  await fs.ensureDir(probeHome);
  await fs.ensureFile(path.join(probeHome, '.gitconfig'));
  const probeEnv = isolatedAnalysisEnvironment(probeHome);
  const remoteHeadResult = await run(
    'git',
    ['-c', 'credential.helper=', 'ls-remote', repository.url, 'HEAD'],
    { cwd: analysisRoot, env: probeEnv, timeout: 30_000, cancelSignal: input.cancelSignal }
  );
  if (remoteHeadResult.exitCode !== 0) {
    throw new Error(
      remoteHeadResult.stderr.trim() || 'The public repository HEAD could not be resolved.'
    );
  }
  const remoteCommit = remoteHeadResult.stdout.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{40,64}$/i.test(remoteCommit ?? '')) {
    throw new Error('The repository did not return a valid HEAD commit.');
  }
  const key = crypto
    .createHash('sha256')
    .update(`${repository.url}\0${remoteCommit}\0${input.cliVersion}`)
    .digest('hex')
    .slice(0, 16);
  const root = path.join(input.storagePath, 'repository-analysis', key);
  const sourcePath = path.join(root, 'source');
  const workspaceParent = path.join(root, 'workspace-root');
  const workspacePath = path.join(workspaceParent, 'analysis');
  const isolatedHome = path.join(root, 'home');
  const cacheMarker = path.join(root, 'report.json');
  const reports = path.join(workspacePath, '.workspai', 'reports');
  const expectedArtifacts = {
    workspacePath,
    model: path.join(reports, 'workspace-model.json'),
    graph: path.join(reports, 'workspace-knowledge-graph.json'),
    doctor: path.join(reports, 'doctor-last-run.json'),
    intelligence: path.join(reports, 'workspace-intelligence-run-last-run.json'),
  };

  if (await fs.pathExists(cacheMarker)) {
    const cached = (await fs.readJson(cacheMarker)) as RepositoryAnalysisReport;
    if (
      cached?.schemaVersion === 'workspai-vscode-repository-analysis.v1' &&
      cached.repository?.url === repository.url &&
      cached.repository?.commit === remoteCommit &&
      cached.execution?.cliVersion === input.cliVersion &&
      cached.graph?.schemaVersion === 'workspace-graph-projection.v1' &&
      typeof cached.doctor?.verdict === 'string' &&
      typeof cached.insights?.webAgent?.verdict === 'string' &&
      cached.insights.webAgent.claimBoundary.startsWith('Static preparation assessment.') &&
      (
        await Promise.all([
          fs.pathExists(sourcePath),
          fs.pathExists(expectedArtifacts.model),
          fs.pathExists(expectedArtifacts.graph),
          fs.pathExists(expectedArtifacts.doctor),
          fs.pathExists(expectedArtifacts.intelligence),
        ])
      ).every(Boolean)
    ) {
      input.onProgress({
        requestId: input.requestId,
        stage: 'ready',
        message: 'Loaded current local analysis',
      });
      return {
        ...cached,
        requestId: input.requestId,
        repository: {
          ...repository,
          commit: remoteCommit,
          localPath: sourcePath,
        },
        execution: {
          mode: 'local-static',
          cliVersion: input.cliVersion,
          sourceCodeExecuted: false,
          dependencyInstallExecuted: false,
          cacheReused: true,
        },
        artifacts: expectedArtifacts,
      };
    }
  }

  await fs.remove(root);
  await fs.ensureDir(path.join(root, 'git-hooks-disabled'));
  await fs.ensureDir(isolatedHome);
  await fs.ensureFile(path.join(isolatedHome, '.gitconfig'));
  const isolatedEnv = isolatedAnalysisEnvironment(isolatedHome);

  input.onProgress({
    requestId: input.requestId,
    stage: 'cloning',
    message: 'Creating a shallow isolated copy',
  });
  const clone = await run(
    'git',
    [
      '-c',
      'protocol.file.allow=never',
      '-c',
      'credential.helper=',
      '-c',
      `core.hooksPath=${path.join(root, 'git-hooks-disabled')}`,
      'clone',
      '--depth',
      '1',
      '--single-branch',
      '--no-tags',
      '--recurse-submodules=no',
      repository.url,
      sourcePath,
    ],
    {
      cwd: root,
      env: isolatedEnv,
      timeout: ANALYSIS_TIMEOUT_MS,
      cancelSignal: input.cancelSignal,
    }
  );
  if (clone.exitCode !== 0) {
    throw new Error(clone.stderr.trim() || 'Unable to clone the repository.');
  }
  if ((await directorySize(sourcePath)) > MAX_ANALYSIS_BYTES) {
    await fs.remove(root);
    throw new Error('The shallow repository copy exceeds the 1 GB Quick Analysis safety budget.');
  }
  const commitResult = await run('git', ['rev-parse', 'HEAD'], {
    cwd: sourcePath,
    env: isolatedEnv,
    timeout: 15_000,
    cancelSignal: input.cancelSignal,
  });
  const commit = commitResult.exitCode === 0 ? commitResult.stdout.trim() : remoteCommit;

  input.onProgress({
    requestId: input.requestId,
    stage: 'adopting',
    message: 'Creating an isolated Workspai workspace',
  });
  await fs.ensureDir(workspaceParent);
  await runCli(
    [
      'create',
      'workspace',
      'analysis',
      '--output',
      workspaceParent,
      '--profile',
      'minimal',
      '--skip-python-engine',
      '--skip-git',
      '--yes',
      '--json',
    ],
    workspaceParent,
    isolatedEnv,
    input.cancelSignal
  );
  await runCli(
    ['adopt', sourcePath, '--workspace', workspacePath, '--project-grounding', 'off', '--json'],
    workspacePath,
    isolatedEnv,
    input.cancelSignal
  );

  input.onProgress({
    requestId: input.requestId,
    stage: 'modeling',
    message: 'Building the canonical model and knowledge graph',
  });
  await runCli(
    ['workspace', 'model', '--workspace', workspacePath, '--write', '--include-evidence', '--json'],
    workspacePath,
    isolatedEnv,
    input.cancelSignal
  );

  input.onProgress({
    requestId: input.requestId,
    stage: 'verifying',
    message: 'Running the governed intelligence chain',
  });
  const intelligenceOutput = operationData(
    await runCli(
      [
        'workspace',
        'intelligence',
        'run',
        '--workspace',
        workspacePath,
        '--for-agent',
        'generic',
        '--json',
      ],
      workspacePath,
      isolatedEnv,
      input.cancelSignal
    )
  );

  input.onProgress({
    requestId: input.requestId,
    stage: 'measuring',
    message: 'Measuring bounded graph retrieval',
  });
  const benchmark = operationData(
    await runCli(
      [
        'workspace',
        'graph',
        'benchmark',
        'architecture entry points dependencies verification',
        '--workspace',
        workspacePath,
        '--limit',
        '12',
        '--json',
      ],
      workspacePath,
      isolatedEnv,
      input.cancelSignal
    )
  );

  const [modelValue, graphValue, doctorValue, intelligenceArtifactValue] = await Promise.all([
    fs.readJson(path.join(reports, 'workspace-model.json')),
    fs.readJson(path.join(reports, 'workspace-knowledge-graph.json')),
    fs.readJson(path.join(reports, 'doctor-last-run.json')),
    fs.readJson(path.join(reports, 'workspace-intelligence-run-last-run.json')),
  ]);
  const model = asRecord(modelValue);
  const graph = asRecord(graphValue);
  const doctor = projectDoctorEvidence(asRecord(doctorValue), { scope: 'workspace' });
  const modelSummary = asRecord(model.summary);
  const modelIdentity = asRecord(model.identity);
  const graphQuality = asRecord(graph.quality);
  const intelligenceArtifact = asRecord(intelligenceArtifactValue);
  const intelligence = Object.keys(intelligenceArtifact).length
    ? intelligenceArtifact
    : intelligenceOutput;
  const stages = records(intelligence.stages);
  const blocked = stages.filter((stage) => stage.status === 'blocked');
  const failed = stages.filter((stage) => stage.status === 'failed');
  const runtimes = stringList(modelSummary.runtimes ?? modelIdentity.runtimeFamilies);
  const frameworks = stringList(modelSummary.frameworks);
  const diagnostics = Array.isArray(graph.diagnostics) ? graph.diagnostics : [];
  const status = typeof intelligence.status === 'string' ? intelligence.status : 'unknown';
  const verdict: RepositoryAnalysisReport['verdict'] =
    status === 'passed' ? 'ready' : status === 'blocked' ? 'blocked' : 'limited';
  const graphProjection = buildWorkspaceGraphProjection(graph, { revision: remoteCommit });
  const connected = connectedSurfaces(graph);
  const insights = deriveRepositoryInsights({
    model,
    doctor,
    graph: graphProjection,
    readinessStatus: status,
    failedStages: failed.length,
    connected,
  });
  const report: RepositoryAnalysisReport = {
    schemaVersion: 'workspai-vscode-repository-analysis.v1',
    requestId: input.requestId,
    generatedAt: new Date().toISOString(),
    repository: { ...repository, commit, localPath: sourcePath },
    execution: {
      mode: 'local-static',
      cliVersion: input.cliVersion,
      sourceCodeExecuted: false,
      dependencyInstallExecuted: false,
      cacheReused: false,
    },
    verdict,
    summary: {
      projects: Number(
        modelSummary.projectCount ?? (Array.isArray(model.projects) ? model.projects.length : 0)
      ),
      entities: Number(
        graphQuality.entityCount ?? (Array.isArray(graph.entities) ? graph.entities.length : 0)
      ),
      relations: Number(
        graphQuality.relationCount ?? (Array.isArray(graph.relations) ? graph.relations.length : 0)
      ),
      proofs: Number(
        graphQuality.proofCount ?? (Array.isArray(graph.proofs) ? graph.proofs.length : 0)
      ),
      diagnostics: diagnostics.length,
    },
    identity: { runtimes, frameworks },
    readiness: {
      status,
      stagesPassed: stages.filter((stage) => stage.status === 'passed').length,
      stagesBlocked: blocked.length,
      stagesFailed: failed.length,
      blockers: [...blocked, ...failed]
        .map((stage) => (typeof stage.message === 'string' ? stage.message : stage.id))
        .filter((entry: unknown): entry is string => typeof entry === 'string')
        .slice(0, 6),
    },
    doctor: {
      canonical: doctor.canonical,
      verdict: doctor.verdict,
      ...(doctor.freshness ? { freshness: doctor.freshness } : {}),
      blockers: doctor.blockers,
      advisories: doctor.advisories,
      counts: doctor.counts,
      findings: doctor.findings.map((finding) => ({
        id: finding.id,
        ...(finding.projectName ? { projectName: finding.projectName } : {}),
        ...(finding.issueClass ? { issueClass: finding.issueClass } : {}),
        symptom: finding.symptom,
        status: finding.status,
        ...(finding.diagnosisState ? { diagnosisState: finding.diagnosisState } : {}),
        ...(finding.repairDisposition ? { repairDisposition: finding.repairDisposition } : {}),
        ...(finding.verifyCommand ? { verifyCommand: finding.verifyCommand } : {}),
      })),
    },
    insights,
    graph: graphProjection,
    ...(benchmark.schemaVersion === 'workspace-graph-token-efficiency.v1'
      ? {
          retrieval: {
            query: String(benchmark.query ?? ''),
            corpusEstimatedTokens: Number(asRecord(benchmark.corpus).estimatedTokens ?? 0),
            boundedEstimatedTokens: Number(asRecord(benchmark.retrieval).estimatedTokens ?? 0),
            reductionPercent: Number(asRecord(benchmark.savings).reductionPercent ?? 0),
            estimated: true as const,
            claimBoundary: String(asRecord(benchmark.methodology).claimBoundary ?? ''),
          },
        }
      : {}),
    connectedSurfaces: connected,
    questions: repositoryQuestions(repository.name, runtimes, frameworks),
    artifacts: expectedArtifacts,
  };
  await fs.writeJson(cacheMarker, report, { spaces: 2 });
  await pruneAnalysisCache(analysisRoot, root);
  input.onProgress({
    requestId: input.requestId,
    stage: 'ready',
    message: 'Evidence-backed analysis is ready',
  });
  return report;
}

export async function deleteRepositoryAnalysis(
  storagePath: string,
  repositoryUrl: string
): Promise<void> {
  const repository = normalizePublicRepositoryUrl(repositoryUrl);
  const root = path.join(storagePath, 'repository-analysis');
  if (!(await fs.pathExists(root))) {
    return;
  }
  for (const entry of await fs.readdir(root)) {
    const reportPath = path.join(root, entry, 'report.json');
    if (!(await fs.pathExists(reportPath))) {
      continue;
    }
    const report = (await fs.readJson(reportPath)) as RepositoryAnalysisReport;
    if (report.repository?.url === repository.url) {
      await fs.remove(path.join(root, entry));
    }
  }
}
