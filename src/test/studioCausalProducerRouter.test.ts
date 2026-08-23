import { describe, expect, it } from 'vitest';

import { resolveStudioCausalProducerRoute } from '../core/studioCausalProducerRouter.js';

describe('studio causal producer router', () => {
  it.each([
    ['workspace.doctor: Doctor evidence is stale', 'checkWorkspaceHealth'],
    ['workspace.analyze: Analyze evidence is missing', 'workspaceAnalyze'],
    ['workspace.readiness: Release readiness evidence is stale', 'workspaceReadiness'],
    ['workspace.pipeline: Pipeline evidence is unavailable', 'workspacePipeline'],
    [
      'workspace.contract.verify: Contract verification evidence is stale',
      'workspaceContractVerify',
    ],
  ])('routes %s to its exact producer', (blocker, commandId) => {
    expect(
      resolveStudioCausalProducerRoute({
        artifactPath: '.workspai/reports/workspace-verify-last-run.json',
        blockers: [blocker],
      })?.commandId
    ).toBe(commandId);
  });

  it('uses the referenced producer artifact when the blocker describes freshness', () => {
    expect(
      resolveStudioCausalProducerRoute({
        artifactPath: '.workspai/reports/doctor-last-run.json',
        blockers: ['Canonical evidence is stale and refresh required.'],
      })?.commandId
    ).toBe('checkWorkspaceHealth');
  });

  it('does not turn a real Doctor source finding into a producer retry', () => {
    expect(
      resolveStudioCausalProducerRoute({
        artifactPath: '.workspai/reports/doctor-last-run.json',
        blockers: ['ledger-api: Dependencies not installed'],
      })
    ).toBeUndefined();
  });

  it.each([
    ['project.api.init: Workspace run evidence is stale', 'workspaceRunInit'],
    [
      'project.api.test: Missing evidence report: .workspai/reports/workspace-run-last.json',
      'workspaceRunTest',
    ],
    ['project.api.build: Workspace run evidence is unavailable', 'workspaceRunBuild'],
    ['project.api.start: Workspace run evidence is missing', 'workspaceRunStart'],
  ])('routes a project lifecycle finding to its exact governed producer', (blocker, commandId) => {
    expect(
      resolveStudioCausalProducerRoute({
        artifactPath: '.workspai/reports/workspace-verify-last-run.json',
        blockers: [blocker],
        selectedTarget: {
          findingId: blocker.split(':')[0],
          actionIds: [blocker.split(':')[0]],
          projectName: 'api',
          repairMode: 'command',
          sourceMutation: 'forbidden',
        },
      })?.commandId
    ).toBe(commandId);
  });
});
