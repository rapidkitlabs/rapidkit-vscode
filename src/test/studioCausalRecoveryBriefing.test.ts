import { describe, expect, it } from 'vitest';

import { buildStudioCausalRecoveryBriefing } from '../core/studioCausalRecoveryBriefing.js';

describe('Studio causal recovery briefing', () => {
  it.each([
    ['native build cache drift', 'CMake cache references another source root'],
    ['unknown framework blocker', 'Acme validator exited with code 17'],
    ['missing generated evidence', 'Required project report is absent'],
  ])('turns a fresh %s CLI action into one exact native continuation', (_name, blocker) => {
    const result = buildStudioCausalRecoveryBriefing({
      blockers: [blocker],
      sourceCandidates: ['service/project.manifest'],
      evidenceGeneration: 'evidence-v2',
      producerRoute: { commandId: 'workspaceReadiness', reason: 'Refresh readiness evidence.' },
      remediationStep: {
        id: 'repair-service',
        projectName: 'service',
        risk: 'guarded',
        executable: true,
        executionReady: true,
        executionKind: 'contract-command',
        requiresApproval: false,
      },
      remediationPlanRefreshed: true,
    });

    expect(result).toMatchObject({
      ok: true,
      changed: false,
      output: {
        recoveryPath: 'contract-remediation-action',
        nextAction: 'execute-remediation-step',
        blockers: [blocker],
        producerRefreshCommandId: 'workspaceReadiness',
        remediationStep: { id: 'repair-service' },
        requiredAction: {
          schemaVersion: 'workspai.studio-required-causal-action.v1',
          authority: 'workspai-cli-remediation-plan',
          toolName: 'execute-remediation-step',
          input: { stepId: 'repair-service' },
        },
      },
    });
    const tools = (result.output as { recommendedTools: string[] }).recommendedTools;
    expect(tools).toEqual(
      expect.arrayContaining([
        'inspect-evidence',
        'query-workspace-graph',
        'run-governed-command',
        'run-workspace-command',
        'execute-remediation-step',
        'apply-workspace-patch',
        'inspect-workspace-changes',
      ])
    );
    expect(JSON.stringify(result)).not.toContain('structuredCommand');
  });

  it('widens to the general capability plane only when no exact action is ready', () => {
    const result = buildStudioCausalRecoveryBriefing({
      blockers: ['Repository-specific generator output is missing'],
      sourceCandidates: ['generator.config'],
      remediationStep: {
        id: 'manual-generator-review',
        risk: 'guarded',
        executable: false,
        canApply: false,
        executionReady: false,
        executionKind: 'unavailable',
      },
      remediationPlanRefreshed: true,
    });

    expect(result).toMatchObject({
      ok: true,
      changed: false,
      output: {
        recoveryPath: 'general-source-repair',
        fallbackCapability: 'general-source-repair',
        nextAction: 'model-select-causal-capability',
      },
    });
    expect((result.output as Record<string, unknown>).requiredAction).toBeUndefined();
  });

  it('stops on a typed external prerequisite without spending model turns', () => {
    const result = buildStudioCausalRecoveryBriefing({
      blockers: ['nova-api: Go dependencies not downloaded (go.sum missing)'],
      sourceCandidates: ['nova-api/go.mod'],
      evidenceGeneration: 'doctor-go-v2',
      environmentPrerequisite: {
        id: 'doctor.nova-api.runtime-dependency-materialization.dependency-materialization',
        summary: 'Required repair executable is unavailable: go (nova-api).',
        requirements: [
          {
            kind: 'executable',
            id: 'executable:go',
            status: 'missing',
            executable: 'go',
            message: 'Install or configure Go.',
          },
        ],
        retryPolicy: { sameGeneration: 'forbidden', resumeWhen: 'environment-changed' },
      },
      remediationPlanRefreshed: true,
    });

    expect(result).toMatchObject({
      ok: false,
      changed: false,
      cardBlocking: true,
      requiresUserDecision: false,
      terminalReason: 'environment-prerequisite-required',
      error: 'Required repair executable is unavailable: go (nova-api).',
      output: {
        recoveryPath: 'contract-prerequisite',
        nextAction: 'environment-change-and-fresh-plan',
        missingExecutable: 'go',
      },
    });
  });
});
