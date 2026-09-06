import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterAll, describe, expect, it } from 'vitest';

import { analyzeRemoteRepository } from '../core/repositoryAnalysis';

const runIntegration = process.env.WORKSPAI_RUN_REPOSITORY_ANALYSIS_E2E === '1';
const temporaryRoots: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryRoots.map((root) => fs.remove(root)));
});

describe('repository analysis local-first flow', () => {
  it.skipIf(!runIntegration)(
    'clones, adopts, models, verifies, and measures a public repository',
    async () => {
      const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repo-analysis-'));
      temporaryRoots.push(storagePath);
      const stages: string[] = [];
      const report = await analyzeRemoteRepository({
        repositoryUrl: 'https://github.com/octocat/Hello-World',
        requestId: 'integration-test',
        storagePath,
        cliVersion: '0.75.0',
        onProgress: (progress) => stages.push(progress.stage),
      });

      expect(report.schemaVersion).toBe('workspai-vscode-repository-analysis.v1');
      expect(report.repository.commit).toMatch(/^[a-f0-9]{40}$/);
      expect(report.summary.projects).toBeGreaterThan(0);
      expect(report.summary.entities).toBeGreaterThan(0);
      expect(report.graph.schemaVersion).toBe('workspace-graph-projection.v1');
      expect(report.graph.entities.length).toBeGreaterThan(0);
      expect(report.graph.entities.length).toBeLessThanOrEqual(500);
      expect(report.doctor.counts.projectsScanned).toBeGreaterThan(0);
      expect(['ready', 'conditional', 'blocked']).toContain(report.insights.webAgent.verdict);
      expect(report.insights.security.claimBoundary).toContain('not a substitute');
      expect(await fs.pathExists(report.artifacts.doctor)).toBe(true);
      expect(report.execution).toMatchObject({
        sourceCodeExecuted: false,
        dependencyInstallExecuted: false,
      });
      expect(stages).toEqual([
        'validating',
        'cloning',
        'adopting',
        'modeling',
        'verifying',
        'measuring',
        'ready',
      ]);

      const cachedStages: string[] = [];
      const cachedReport = await analyzeRemoteRepository({
        repositoryUrl: 'https://github.com/octocat/Hello-World',
        requestId: 'integration-test-cache',
        storagePath,
        cliVersion: '0.75.0',
        onProgress: (progress) => cachedStages.push(progress.stage),
      });
      expect(cachedReport.repository.commit).toBe(report.repository.commit);
      expect(cachedReport.execution.cacheReused).toBe(true);
      expect(cachedStages).toEqual(['validating', 'ready']);
    },
    12 * 60_000
  );
});
