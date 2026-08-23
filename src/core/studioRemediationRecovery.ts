import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import {
  clearDoctorRemediationPlanCache,
  readDoctorRemediationPlanForStudio,
  type DoctorRemediationPlanStepView,
  type DoctorRemediationPlanView,
} from './doctorRemediationPlanReader.js';
import { resolveDashboardCommandExecutionPlan } from './dashboardCommandExecutionPlan.js';
import { runIncidentInlineCommand } from '../ui/panels/incidentStudioInlineCommandBridge.js';
import { buildRapidkitCommand } from '../utils/platformCapabilities.js';

export type StudioRemediationRecovery = {
  plan: DoctorRemediationPlanView | null;
  refreshed: boolean;
  refreshError?: string;
};

export function selectStudioRemediationRecoveryStep(
  plan: DoctorRemediationPlanView | null,
  handoff?: StudioBlockerHandoff
): DoctorRemediationPlanStepView | undefined {
  const candidates = (plan?.visibleSteps ?? []).filter(
    (candidate) =>
      candidate.risk !== 'invasive' &&
      (candidate.studioState === 'ready' || candidate.studioState === 'review-required') &&
      (candidate.canApply || candidate.executable)
  );
  if (!handoff) {
    return candidates[0];
  }

  const selectedActionIds = new Set(handoff.selectedTarget?.actionIds ?? []);
  if (selectedActionIds.size > 0) {
    return candidates.find(
      (candidate) =>
        selectedActionIds.has(candidate.actionId ?? '') || selectedActionIds.has(candidate.id)
    );
  }

  const blockingFindings = (handoff.doctorFindings ?? []).filter(
    (finding) => finding.status === 'blocking'
  );
  if (blockingFindings.length === 0) {
    return candidates[0];
  }

  const findingIds = new Set(blockingFindings.map((finding) => finding.id));
  const causalKeys = new Set(
    blockingFindings
      .map((finding) => finding.causalKey)
      .filter((value): value is string => Boolean(value))
  );
  // A workspace Doctor card can contain blocking and advisory findings from
  // multiple projects. Never repair a convenient advisory merely because the
  // active blocker has no executable capability. The exact finding identity is
  // the transaction boundary; no match delegates to governed source diagnosis.
  return candidates.find(
    (candidate) =>
      candidate.findingStatus === 'blocking' &&
      ((Boolean(candidate.issueId) && findingIds.has(candidate.issueId!)) ||
        (Boolean(candidate.causalKey) && causalKeys.has(candidate.causalKey!)))
  );
}

/**
 * Resolve the canonical, card-specific repair queue before involving a model.
 *
 * Dashboard cards may be backed by stale or missing producer evidence. That is
 * an evidence-reconciliation task, not an invitation to edit source. The CLI's
 * artifact remediation plan maps those findings to exact producer commands and
 * orders them by causal dependency. Both Sidebar Studio and native Chat use this
 * preflight so Resume cannot repeat a card-wide, no-op repair transaction.
 */
export async function ensureStudioRemediationRecovery(input: {
  workspacePath: string;
  handoff: StudioBlockerHandoff;
  projectPath?: string;
  maxSteps?: number;
  actionId: string;
}): Promise<StudioRemediationRecovery> {
  const handoff = {
    ...input.handoff,
    ...(input.projectPath ? { projectPath: input.projectPath } : {}),
  };
  const maxSteps = input.maxSteps ?? 64;
  clearDoctorRemediationPlanCache();
  let plan = await readDoctorRemediationPlanForStudio({
    workspacePath: input.workspacePath,
    handoff,
    maxSteps,
  });
  if (plan?.freshness.verdict === 'fresh') {
    return { plan, refreshed: false };
  }

  const executionPlan = resolveDashboardCommandExecutionPlan('workspaceRemediationPlan');
  if (executionPlan.cliArgs.length === 0) {
    return {
      plan,
      refreshed: false,
      refreshError: 'The CLI does not advertise the canonical remediation-plan producer.',
    };
  }

  const execution = await runIncidentInlineCommand({
    command: buildRapidkitCommand(executionPlan.cliArgs),
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    actionId: input.actionId,
  });
  clearDoctorRemediationPlanCache();
  plan = await readDoctorRemediationPlanForStudio({
    workspacePath: input.workspacePath,
    handoff,
    maxSteps,
  });
  const acceptedExit =
    execution.exitCode === 0 || execution.exitCode === 1 || execution.exitCode === 2;
  return {
    plan,
    refreshed: acceptedExit,
    ...(!acceptedExit
      ? {
          refreshError:
            execution.error ??
            execution.stderrTail ??
            `The remediation-plan producer exited with ${String(execution.exitCode)}.`,
        }
      : {}),
  };
}
