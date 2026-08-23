import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import type { StudioEvidenceRefreshCommandId } from './sidebarStudioAgentRuntime.js';

export type StudioCausalProducerRoute = {
  commandId: StudioEvidenceRefreshCommandId;
  reason: string;
};

type ProducerRule = {
  commandId: StudioEvidenceRefreshCommandId;
  artifactTokens: readonly string[];
  findingTokens: readonly string[];
};

const PRODUCER_RULES: readonly ProducerRule[] = [
  {
    commandId: 'checkWorkspaceHealth',
    artifactTokens: ['doctor-last-run.json', 'doctor-workspace-cache.json'],
    findingTokens: ['workspace.doctor', 'doctor evidence'],
  },
  {
    commandId: 'workspaceAnalyze',
    artifactTokens: ['analyze-last-run.json'],
    findingTokens: ['workspace.analyze', 'analyze evidence'],
  },
  {
    commandId: 'workspaceReadiness',
    artifactTokens: ['release-readiness-last-run.json'],
    findingTokens: ['workspace.readiness', 'readiness evidence', 'release readiness evidence'],
  },
  {
    commandId: 'workspacePipeline',
    artifactTokens: ['workspace-pipeline-last-run.json'],
    findingTokens: ['workspace.pipeline', 'pipeline evidence'],
  },
  {
    commandId: 'workspaceContractVerify',
    artifactTokens: ['workspace-contract-verify-last-run.json'],
    findingTokens: ['workspace.contract', 'contract verification evidence'],
  },
  {
    commandId: 'workspaceImpact',
    artifactTokens: ['workspace-impact-last-run.json'],
    findingTokens: ['workspace.impact', 'impact evidence'],
  },
  {
    commandId: 'workspaceDiff',
    artifactTokens: ['workspace-diff-last-run.json'],
    findingTokens: ['workspace.diff', 'diff evidence'],
  },
  {
    commandId: 'workspaceModel',
    artifactTokens: ['workspace-model.json'],
    findingTokens: ['workspace.model', 'workspace model evidence'],
  },
  {
    commandId: 'workspaceContextAgent',
    artifactTokens: ['workspace-context-agent.json'],
    findingTokens: ['workspace.context', 'agent context evidence'],
  },
  {
    commandId: 'workspaceAgentSync',
    artifactTokens: ['agent-customization-pack.json', 'agent-grounding'],
    findingTokens: ['workspace.agent', 'agent grounding', 'agent customization'],
  },
  {
    commandId: 'workspaceExplain',
    artifactTokens: ['workspace-explain-last-run.json'],
    findingTokens: ['workspace.explain', 'explain evidence'],
  },
  {
    commandId: 'workspaceTrace',
    artifactTokens: ['workspace-trace-last-run.json'],
    findingTokens: ['workspace.trace', 'trace evidence'],
  },
];

const PRODUCER_FRESHNESS_FAILURE =
  /\b(stale|missing|not found|unavailable|older than|generated .* before|refresh required)\b/i;

/**
 * Resolve only evidence-producer failures. Source/runtime findings deliberately
 * return undefined and continue through the CLI remediation plan or inspected
 * source-repair loop. This prevents a broad Verify retry from masquerading as
 * causal progress when one upstream artifact is stale.
 */
export function resolveStudioCausalProducerRoute(
  handoff: Pick<
    StudioBlockerHandoff,
    'artifactPath' | 'blockers' | 'selectedTarget' | 'dashboardCommandId'
  >
): StudioCausalProducerRoute | undefined {
  const blockerText = handoff.blockers.join('\n').toLowerCase();
  const artifactText = handoff.artifactPath.toLowerCase();
  const targetText = [handoff.selectedTarget?.findingId, handoff.selectedTarget?.causalKey]
    .filter((value): value is string => Boolean(value))
    .join('\n')
    .toLowerCase();
  const combined = `${blockerText}\n${targetText}`;

  // A producer route is safe only for an explicit freshness/availability
  // defect. A failed Doctor finding, for example, must not rerun Doctor forever.
  if (!PRODUCER_FRESHNESS_FAILURE.test(combined)) {
    return undefined;
  }

  // Workspace Run is one artifact with project-scoped lifecycle findings.
  // Route the exact missing/stale stage through the governed registry; the
  // host binds the selected canonical project and then Verify advances to the
  // next stage (init -> test/build/start) from freshly generated evidence.
  const workspaceRunArtifact =
    artifactText.includes('workspace-run-last') ||
    combined.includes('workspace run evidence') ||
    combined.includes('workspace-run-last');
  const lifecycleRules = [
    { stage: 'init', commandId: 'workspaceRunInit' },
    { stage: 'test', commandId: 'workspaceRunTest' },
    { stage: 'build', commandId: 'workspaceRunBuild' },
    { stage: 'start', commandId: 'workspaceRunStart' },
  ] as const;
  for (const rule of lifecycleRules) {
    const findingMatch = new RegExp(`(?:^|[\\s.:/])${rule.stage}(?:$|[\\s.:/])`, 'i').test(
      combined
    );
    if (workspaceRunArtifact && findingMatch) {
      return {
        commandId: rule.commandId,
        reason: `Produce fresh project-scoped Workspace Run ${rule.stage} evidence before verification.`,
      };
    }
  }

  for (const rule of PRODUCER_RULES) {
    const artifactMatch = rule.artifactTokens.some((token) => artifactText.includes(token));
    const findingMatch = rule.findingTokens.some((token) => combined.includes(token));
    if (!artifactMatch && !findingMatch) {
      continue;
    }
    return {
      commandId: rule.commandId,
      reason: `Refresh the exact canonical producer for ${rule.commandId} before repair or verification.`,
    };
  }

  return undefined;
}
