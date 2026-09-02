import type { StudioAgentToolResult } from './studioAgentToolRegistry.js';
import { STUDIO_GENERAL_SOURCE_REPAIR_RECOMMENDED_TOOLS } from './studioRepairReceipt.js';

export type StudioCausalRecoveryStepBrief = {
  id: string;
  actionId?: string;
  projectName?: string;
  projectPath?: string;
  risk?: string;
  canApply?: boolean;
  executable?: boolean;
  executionKind?: 'structured-operation' | 'contract-command' | 'unavailable';
  executionReady?: boolean;
  requiresApproval?: boolean;
  files?: string[];
  verifyCommand?: string;
};

export type StudioEnvironmentPrerequisiteBrief = {
  id: string;
  summary: string;
  requirements: Array<{
    kind: 'executable' | 'action';
    id: string;
    status: 'satisfied' | 'missing' | 'pending';
    executable?: string;
    actionId?: string;
    message: string;
  }>;
  retryPolicy?: {
    sameGeneration: 'allowed' | 'forbidden';
    resumeWhen: 'immediate' | 'dependencies-complete' | 'environment-changed';
  };
};

/**
 * Build the one recovery handoff shared by webview Studio and Native Chat.
 *
 * The controller deliberately does not interpret error prose or select a
 * language/framework-specific fix. A fresh CLI plan may narrow the next turn
 * to one immutable action. Otherwise it supplies proof and the governed
 * capability plane, and the model owns causal selection.
 */
export function buildStudioCausalRecoveryBriefing(input: {
  blockers: readonly string[];
  sourceCandidates: readonly string[];
  evidenceGeneration?: string;
  producerRoute?: { commandId: string; reason: string };
  remediationStep?: StudioCausalRecoveryStepBrief;
  environmentPrerequisite?: StudioEnvironmentPrerequisiteBrief;
  remediationPlanRefreshed: boolean;
  remediationPlanError?: string;
}): StudioAgentToolResult<Record<string, unknown>> {
  if (input.environmentPrerequisite) {
    const missingExecutable = input.environmentPrerequisite.requirements.find(
      (requirement) =>
        requirement.kind === 'executable' &&
        requirement.status === 'missing' &&
        typeof requirement.executable === 'string'
    )?.executable;
    return {
      ok: false,
      changed: false,
      cardBlocking: true,
      requiresUserDecision: false,
      terminalReason: 'environment-prerequisite-required',
      ...(input.evidenceGeneration ? { evidenceGeneration: input.evidenceGeneration } : {}),
      output: {
        recoveryPath: 'contract-prerequisite',
        nextAction: 'environment-change-and-fresh-plan',
        requiredActionId: input.environmentPrerequisite.id,
        requirements: input.environmentPrerequisite.requirements,
        retryPolicy: input.environmentPrerequisite.retryPolicy,
        ...(missingExecutable ? { missingExecutable } : {}),
        blockers: [...input.blockers],
        remediationPlanRefreshed: input.remediationPlanRefreshed,
      },
      error: input.environmentPrerequisite.summary,
    };
  }
  const legacyExecutionReady = Boolean(
    input.remediationStep?.executionReady === undefined &&
    (input.remediationStep?.canApply === true || input.remediationStep?.executable === true)
  );
  const exactRemediationReady = Boolean(
    input.remediationStep &&
    input.remediationStep.risk !== 'invasive' &&
    input.remediationStep.executionKind !== 'unavailable' &&
    (input.remediationStep.executionReady === true || legacyExecutionReady)
  );
  const requiredAction = exactRemediationReady
    ? {
        schemaVersion: 'workspai.studio-required-causal-action.v1',
        authority: 'workspai-cli-remediation-plan',
        toolName: 'execute-remediation-step',
        input: { stepId: input.remediationStep!.id },
        stepId: input.remediationStep!.id,
        executionKind:
          input.remediationStep!.executionKind ??
          (input.remediationStep!.canApply ? 'structured-operation' : 'contract-command'),
        requiresApproval: input.remediationStep!.requiresApproval === true,
        reason:
          'The fresh CLI remediation plan selected this immutable, non-invasive action for the active blocker.',
      }
    : undefined;
  return {
    ok: true,
    changed: false,
    ...(input.evidenceGeneration ? { evidenceGeneration: input.evidenceGeneration } : {}),
    output: {
      recoveryPath: exactRemediationReady ? 'contract-remediation-action' : 'general-source-repair',
      nextAction: exactRemediationReady
        ? 'execute-remediation-step'
        : 'model-select-causal-capability',
      ...(exactRemediationReady
        ? { requiredAction }
        : { fallbackCapability: 'general-source-repair' }),
      blockers: [...input.blockers],
      sourceCandidates: [...input.sourceCandidates],
      recommendedTools: [...STUDIO_GENERAL_SOURCE_REPAIR_RECOMMENDED_TOOLS],
      ...(input.producerRoute
        ? {
            producerRefreshCommandId: input.producerRoute.commandId,
            producerRefreshReason: input.producerRoute.reason,
          }
        : {}),
      ...(input.remediationStep ? { remediationStep: input.remediationStep } : {}),
      remediationPlanRefreshed: input.remediationPlanRefreshed,
      ...(input.remediationPlanError ? { remediationPlanError: input.remediationPlanError } : {}),
      instruction: exactRemediationReady
        ? 'The CLI selected one exact remediation action from fresh evidence. Invoke the required native tool with the exact stepId; its policy, approval, transaction, rollback, and verification boundaries remain controller-owned.'
        : 'Select the smallest evidence-backed causal action. The controller does not classify the blocker by product, language, framework, or error text. Inspect, refresh an owning producer, run a structured project-native command, or submit a governed source transaction, then verify.',
    },
  };
}
