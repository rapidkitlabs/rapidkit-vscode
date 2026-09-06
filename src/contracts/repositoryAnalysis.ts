export type RepositoryAnalysisStage =
  | 'validating'
  | 'cloning'
  | 'adopting'
  | 'modeling'
  | 'verifying'
  | 'measuring'
  | 'ready';

export type RepositoryAnalysisProgress = {
  requestId: string;
  stage: RepositoryAnalysisStage;
  message: string;
};

export type RepositoryAnalysisReport = {
  schemaVersion: 'workspai-vscode-repository-analysis.v1';
  requestId: string;
  generatedAt: string;
  repository: {
    url: string;
    host: string;
    owner: string;
    name: string;
    commit: string;
    localPath: string;
  };
  execution: {
    mode: 'local-static';
    cliVersion: string;
    sourceCodeExecuted: false;
    dependencyInstallExecuted: false;
    cacheReused: boolean;
  };
  verdict: 'ready' | 'limited' | 'blocked';
  summary: {
    projects: number;
    entities: number;
    relations: number;
    proofs: number;
    diagnostics: number;
  };
  identity: {
    runtimes: string[];
    frameworks: string[];
  };
  readiness: {
    status: string;
    stagesPassed: number;
    stagesBlocked: number;
    stagesFailed: number;
    blockers: string[];
  };
  doctor: {
    canonical: boolean;
    verdict: 'passed' | 'attention' | 'blocked';
    freshness?: 'fresh' | 'stale' | 'unknown';
    blockers: string[];
    advisories: string[];
    counts: {
      projectsScanned: number;
      affectedProjects: number;
      blockingCauses: number;
      advisoryFindings: number;
      unknownFindings: number;
      repairableFindings: number;
    };
    findings: Array<{
      id: string;
      projectName?: string;
      issueClass?: string;
      symptom: string;
      status: 'blocking' | 'advisory' | 'informational' | 'unknown';
      diagnosisState?: 'confirmed' | 'candidate' | 'unknown';
      repairDisposition?:
        | 'automatic'
        | 'approval-required'
        | 'manual'
        | 'unavailable'
        | 'not-needed';
      verifyCommand?: string;
    }>;
  };
  insights: {
    webAgent: {
      verdict: 'ready' | 'conditional' | 'blocked';
      signals: string[];
      gaps: string[];
      claimBoundary: string;
    };
    security: {
      verdict: 'no-observed-blocker' | 'attention' | 'unknown';
      findingCount: number;
      signals: string[];
      claimBoundary: string;
    };
    delivery: {
      verdict: 'ready' | 'partial' | 'unknown';
      ciProjects: number;
      releaseProjects: number;
      ownershipProjects: number;
      verificationCommands: string[];
    };
    changeSurface: {
      verdict: 'concentrated' | 'distributed' | 'unknown';
      hotspotCount: number;
      highestConnections: number;
      signals: string[];
    };
  };
  graph: WorkspaceGraphProjection;
  retrieval?: {
    query: string;
    corpusEstimatedTokens: number;
    boundedEstimatedTokens: number;
    reductionPercent: number;
    estimated: true;
    claimBoundary: string;
  };
  connectedSurfaces: Array<{
    id: string;
    label: string;
    kind: string;
    connections: number;
  }>;
  questions: string[];
  artifacts: {
    workspacePath: string;
    model: string;
    graph: string;
    doctor: string;
    intelligence: string;
  };
};
import type { WorkspaceGraphProjection } from './workspaceGraphProjection';
