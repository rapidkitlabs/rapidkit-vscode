import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  resolveWorkspaceArtifactPathSync,
  WORKSPAI_REPORTS_DIR,
} from '../../core/workspaceIntelligencePaths';

export interface WorkspaceContext {
  workspacePath: string;
  workspaceName: string;
  projectPath?: string;
  projectName?: string;
}

export interface AnalyzeReport {
  schemaVersion: string;
  generatedAt: string;
  workspacePath: string;
  summary: {
    statusScope?: 'source-structure';
    releaseReadiness?: 'not-evaluated';
    score: number;
    verdict: 'ready' | 'needs-attention' | 'blocked';
    projectCount: number;
    runtimeCount: number;
    findings: {
      fail: number;
      warn: number;
      info: number;
    };
  };
  findings: Array<{
    id: string;
    severity: 'fail' | 'warn' | 'info';
    target: string;
    title: string;
    detail: string;
    remediation: string;
  }>;
  enterpriseControls?: {
    jsonReady: boolean;
    ciGateCommand: string;
    releaseGateCommand: string;
    evidencePath?: string;
  };
  [key: string]: unknown;
}

export const getAnalyzeReportPath = (workspacePath: string): string => {
  return resolveWorkspaceArtifactPathSync(
    workspacePath,
    path.join(WORKSPAI_REPORTS_DIR, 'analyze-last-run.json')
  );
};

export const analyzeReportExists = (workspacePath: string): boolean => {
  return fs.existsSync(getAnalyzeReportPath(workspacePath));
};

export const loadAnalyzeReport = (
  workspaceContext: WorkspaceContext
): { report: AnalyzeReport | null; error: string | null } => {
  const reportPath = getAnalyzeReportPath(workspaceContext.workspacePath);

  if (!fs.existsSync(reportPath)) {
    return { report: null, error: 'Report file not found' };
  }

  try {
    const rawContent = fs.readFileSync(reportPath, 'utf-8');
    const report: AnalyzeReport = JSON.parse(rawContent);
    if (
      report.schemaVersion !== 'rapidkit-analyze-v1' ||
      !report.summary ||
      typeof report.summary.score !== 'number' ||
      !['ready', 'needs-attention', 'blocked'].includes(report.summary.verdict)
    ) {
      return { report: null, error: 'Analyze report does not satisfy rapidkit-analyze-v1.' };
    }
    return { report, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { report: null, error: `Failed to load report: ${message}` };
  }
};

export const runWorkspaceAnalyze = async (workspaceContext: WorkspaceContext): Promise<void> => {
  await vscode.commands.executeCommand('workspai.workspaceAnalyze', {
    workspace: {
      path: workspaceContext.workspacePath,
      name: workspaceContext.workspaceName,
    },
  });
};
