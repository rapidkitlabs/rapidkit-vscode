import type {
  StudioAgentToolApprovalGrant,
  StudioAgentToolResult,
} from './studioAgentToolRegistry.js';
import {
  assertStudioWorkspaceCommandApproval,
  describeStudioWorkspaceCommandFailure,
  resolveStudioWorkspaceCommandPlan,
  runStudioWorkspaceCommand,
  type StudioWorkspaceCommandExecution,
  type StudioWorkspaceCommandRequest,
  type StudioWorkspaceProcessEvent,
} from './studioWorkspaceCommand.js';
import {
  beginStudioWorkspaceSourceTransaction,
  disposeStudioWorkspaceSourceTransaction,
  inspectStudioWorkspaceSourceTransaction,
  rollbackStudioWorkspaceSourceTransaction,
  type StudioWorkspaceSourceRollback,
} from './studioWorkspaceSourceSnapshot.js';

const workspaceCommandTails = new Map<string, Promise<void>>();

async function withWorkspaceCommandTransactionLock<T>(
  sourceRoot: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = sourceRoot.toLowerCase();
  const predecessor = workspaceCommandTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const owned = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = predecessor.catch(() => undefined).then(() => owned);
  workspaceCommandTails.set(key, tail);
  await predecessor.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (workspaceCommandTails.get(key) === tail) {
      workspaceCommandTails.delete(key);
    }
  }
}

export type StudioWorkspaceCommandTransactionOutput = StudioWorkspaceCommandExecution & {
  transactionId: string;
  changedPaths: string[];
  observedSourceChange: boolean;
  sourceFingerprint: string;
  observationScopes: string[];
  diagnosticOutcome?: 'clean' | 'findings';
  authorization?: {
    fingerprint: string;
    approvedBy?: string;
    approvedAt?: string;
    execution: 'once' | 'session' | 'project';
  };
  rollback?: StudioWorkspaceSourceRollback & {
    reason: 'unapproved-mutation' | 'failed-command';
  };
  effects: {
    source: boolean;
    repositoryMetadata: boolean;
    externalSystem: boolean;
    verificationScopes: string[];
    sourceCheckpointCoverage: 'complete' | 'not-applicable';
    nonSourceRollbackCoverage: 'none';
  };
};

export async function executeStudioWorkspaceCommandTransaction(input: {
  workspacePath: string;
  projectPath?: string;
  request: StudioWorkspaceCommandRequest;
  approval?: StudioAgentToolApprovalGrant;
  evidenceGeneration?: string;
  signal?: AbortSignal;
  reportProcessEvent?(event: StudioWorkspaceProcessEvent): Promise<void> | void;
  isExpectedDiagnosticFindingExit?(input: {
    command: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }): boolean;
}): Promise<StudioAgentToolResult<StudioWorkspaceCommandTransactionOutput>> {
  const plan = resolveStudioWorkspaceCommandPlan({
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    request: input.request,
  });
  assertStudioWorkspaceCommandApproval({ plan, approval: input.approval });

  // Linked projects may live outside the managed workspace. The command root
  // is therefore the selected project when present, not the registry root.
  const sourceRoot = input.projectPath ?? input.workspacePath;
  return withWorkspaceCommandTransactionLock(sourceRoot, async () => {
    const transaction = await beginStudioWorkspaceSourceTransaction({
      workspacePath: sourceRoot,
    });
    if (!transaction) {
      return {
        ok: false,
        terminalReason: 'workspace-command-checkpoint-unavailable',
        error:
          'Studio could not create a complete source checkpoint, so the workspace command was not started.',
      };
    }

    try {
      const execution = await runStudioWorkspaceCommand(plan, {
        signal: input.signal,
        onProcessEvent: input.reportProcessEvent,
      });
      const inspected = await inspectStudioWorkspaceSourceTransaction(transaction);
      if (!inspected) {
        let rollback: StudioWorkspaceSourceRollback | undefined;
        try {
          rollback = await rollbackStudioWorkspaceSourceTransaction(transaction);
        } catch {
          // The error below deliberately escalates to human review when exact
          // restoration itself cannot be proven.
        }
        return {
          ok: false,
          changed: !rollback,
          requiresUserDecision: !rollback,
          terminalReason: rollback
            ? 'workspace-command-post-checkpoint-restored'
            : 'workspace-command-post-checkpoint-unavailable',
          error: rollback
            ? 'Studio could not inspect command output state and restored the exact pre-command checkpoint.'
            : 'Studio could not inspect or prove restoration of source state after the command.',
          ...(input.evidenceGeneration ? { evidenceGeneration: input.evidenceGeneration } : {}),
        };
      }

      const sourceChanged = inspected.changedPaths.length > 0;
      const diagnosticFindings = Boolean(
        input.isExpectedDiagnosticFindingExit?.({
          command: plan.displayCommand,
          exitCode: execution.exitCode,
          stdout: execution.stdout,
          stderr: execution.stderr,
        })
      );
      const commandObserved = execution.exitCode === 0 || diagnosticFindings;
      const rollbackReason =
        sourceChanged && !plan.requiresExplicitApproval
          ? 'unapproved-mutation'
          : sourceChanged && !commandObserved
            ? 'failed-command'
            : undefined;

      if (rollbackReason) {
        try {
          const rollback = await rollbackStudioWorkspaceSourceTransaction(
            transaction,
            inspected.changedPaths
          );
          return {
            ok: false,
            changed: false,
            ...(input.evidenceGeneration ? { evidenceGeneration: input.evidenceGeneration } : {}),
            terminalReason:
              plan.externalSideEffects || plan.repositoryMetadataEffects
                ? 'workspace-command-source-restored-non-source-effects-unverified'
                : rollbackReason === 'unapproved-mutation'
                  ? 'workspace-command-source-mutation-rolled-back'
                  : 'workspace-command-failure-rolled-back',
            error:
              rollbackReason === 'unapproved-mutation'
                ? 'The command changed project source without an approved mutation declaration. Studio restored the exact pre-command checkpoint.'
                : `${describeStudioWorkspaceCommandFailure(execution)}\nStudio restored the exact pre-command source checkpoint.${
                    plan.externalSideEffects || plan.repositoryMetadataEffects
                      ? ' Repository metadata or external-system effects are outside that checkpoint and must be inspected separately.'
                      : ''
                  }`,
            output: {
              ...execution,
              transactionId: transaction.id,
              changedPaths: inspected.changedPaths,
              observedSourceChange: true,
              sourceFingerprint: rollback.restoredFingerprint,
              rollback: { ...rollback, reason: rollbackReason },
              effects: {
                source: sourceChanged,
                repositoryMetadata: plan.repositoryMetadataEffects,
                externalSystem: plan.externalSideEffects,
                verificationScopes: plan.effectScopes,
                sourceCheckpointCoverage: 'complete',
                nonSourceRollbackCoverage: 'none',
              },
              observationScopes: plan.observationScopes,
            },
          };
        } catch (error) {
          return {
            ok: false,
            changed: true,
            requiresUserDecision: true,
            ...(input.evidenceGeneration ? { evidenceGeneration: input.evidenceGeneration } : {}),
            terminalReason: 'workspace-command-rollback-failed',
            error:
              `The command changed source and automatic rollback could not be proven: ` +
              (error instanceof Error ? error.message : String(error)),
            output: {
              ...execution,
              transactionId: transaction.id,
              changedPaths: inspected.changedPaths,
              observedSourceChange: true,
              sourceFingerprint: inspected.after.fingerprint,
              effects: {
                source: sourceChanged,
                repositoryMetadata: plan.repositoryMetadataEffects,
                externalSystem: plan.externalSideEffects,
                verificationScopes: plan.effectScopes,
                sourceCheckpointCoverage: 'complete',
                nonSourceRollbackCoverage: 'none',
              },
              observationScopes: plan.observationScopes,
            },
          };
        }
      }

      return {
        ok: commandObserved,
        changed: sourceChanged,
        ...(input.evidenceGeneration ? { evidenceGeneration: input.evidenceGeneration } : {}),
        output: {
          ...execution,
          transactionId: transaction.id,
          changedPaths: inspected.changedPaths,
          observedSourceChange: sourceChanged,
          sourceFingerprint: inspected.after.fingerprint,
          effects: {
            source: sourceChanged,
            repositoryMetadata: plan.repositoryMetadataEffects,
            externalSystem: plan.externalSideEffects,
            verificationScopes: plan.effectScopes,
            sourceCheckpointCoverage: sourceChanged ? 'complete' : 'not-applicable',
            nonSourceRollbackCoverage: 'none',
          },
          observationScopes: plan.observationScopes,
          ...(commandObserved
            ? { diagnosticOutcome: diagnosticFindings ? ('findings' as const) : ('clean' as const) }
            : {}),
          ...(plan.requiresExplicitApproval
            ? {
                authorization: {
                  fingerprint: plan.authorizationFingerprint,
                  approvedBy: input.approval?.approvedBy,
                  approvedAt: input.approval?.approvedAt,
                  execution: input.approval?.execution ?? ('once' as const),
                },
              }
            : {}),
        },
        ...(commandObserved ? {} : { error: describeStudioWorkspaceCommandFailure(execution) }),
      };
    } finally {
      await disposeStudioWorkspaceSourceTransaction(transaction);
    }
  });
}
