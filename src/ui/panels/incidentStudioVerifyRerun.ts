/**
 * Verify Command Rerun Management
 *
 * Manages execution state and history for verify commands, enabling
 * one-click rerun of failed executions with automatic state recovery.
 *
 * S3-001: One-click rerun flow for failed verify commands
 */

/**
 * Execution status of a verify command
 */
export type VerifyExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout';

/**
 * Single execution record for a verify command
 */
export interface VerifyCommandExecution {
  id: string; // Unique execution ID
  command: string; // The command that was executed
  status: VerifyExecutionStatus;
  output?: string; // Command output/error message
  exitCode?: number; // Process exit code
  timestamp: number; // When execution occurred
  duration?: number; // Execution duration in ms
}

/**
 * Rerunnable verify command state
 */
export interface VerifyCommandState {
  command: string;
  scope: 'workspace' | 'project';
  executions: VerifyCommandExecution[];
  lastExecution?: VerifyCommandExecution;
  isRunning: boolean;
}

/**
 * Result of a rerun attempt
 */
export interface RerunResult {
  success: boolean;
  executionId: string;
  message: string;
  previousExecution?: VerifyCommandExecution;
}

/**
 * Initialize new verify command state
 */
export function createVerifyCommandState(
  command: string,
  scope: 'workspace' | 'project'
): VerifyCommandState {
  return {
    command,
    scope,
    executions: [],
    isRunning: false,
  };
}

/**
 * Record a new execution attempt
 */
export function recordVerifyExecution(
  state: VerifyCommandState,
  status: VerifyExecutionStatus,
  output?: string,
  exitCode?: number,
  duration?: number
): VerifyCommandExecution {
  const execution: VerifyCommandExecution = {
    id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    command: state.command,
    status,
    output,
    exitCode,
    timestamp: Date.now(),
    duration,
  };

  state.executions.push(execution);
  state.lastExecution = execution;

  return execution;
}

/**
 * Check if verify command can be rerun
 * Returns false if: command is empty, currently running, or no previous execution
 */
export function canRerun(state: VerifyCommandState): boolean {
  return (
    state.command.length > 0 &&
    !state.isRunning &&
    state.lastExecution !== undefined &&
    state.lastExecution.status === 'failed'
  );
}

/**
 * Get reason why rerun is not available
 */
export function getRerunBlockReason(state: VerifyCommandState): string | null {
  if (state.command.length === 0) {
    return 'No command available to rerun';
  }
  if (state.isRunning) {
    return 'Command is currently executing';
  }
  if (!state.lastExecution) {
    return 'No previous execution to rerun';
  }
  if (state.lastExecution.status === 'success') {
    return 'Last execution succeeded; rerun only available for failed commands';
  }
  if (state.lastExecution.status === 'running') {
    return 'Command is still running';
  }

  return null;
}

/**
 * Prepare rerun by setting running state
 */
export function prepareRerun(state: VerifyCommandState): RerunResult {
  const blockReason = getRerunBlockReason(state);
  if (blockReason) {
    return {
      success: false,
      executionId: '',
      message: blockReason,
      previousExecution: state.lastExecution,
    };
  }

  state.isRunning = true;

  return {
    success: true,
    executionId: `exec_${Date.now()}_rerun`,
    message: `Rerunning: ${state.command}`,
    previousExecution: state.lastExecution,
  };
}

/**
 * Complete rerun execution
 */
export function completeRerun(
  state: VerifyCommandState,
  status: VerifyExecutionStatus,
  output?: string,
  exitCode?: number,
  duration?: number
): VerifyCommandExecution {
  state.isRunning = false;

  const execution = recordVerifyExecution(state, status, output, exitCode, duration);

  return execution;
}

/**
 * Get execution history
 */
export function getExecutionHistory(state: VerifyCommandState): VerifyCommandExecution[] {
  return [...state.executions];
}

/**
 * Get last successful execution
 */
export function getLastSuccessfulExecution(
  state: VerifyCommandState
): VerifyCommandExecution | null {
  for (let i = state.executions.length - 1; i >= 0; i--) {
    if (state.executions[i].status === 'success') {
      return state.executions[i];
    }
  }
  return null;
}

/**
 * Get last failed execution
 */
export function getLastFailedExecution(state: VerifyCommandState): VerifyCommandExecution | null {
  for (let i = state.executions.length - 1; i >= 0; i--) {
    if (state.executions[i].status === 'failed') {
      return state.executions[i];
    }
  }
  return null;
}

/**
 * Get execution statistics
 */
export function getExecutionStats(state: VerifyCommandState): {
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  lastAttemptStatus: VerifyExecutionStatus | null;
} {
  const total = state.executions.length;
  const successes = state.executions.filter((e) => e.status === 'success').length;
  const failures = state.executions.filter((e) => e.status === 'failed').length;

  return {
    totalAttempts: total,
    successCount: successes,
    failureCount: failures,
    successRate: total > 0 ? (successes / total) * 100 : 0,
    lastAttemptStatus: state.lastExecution?.status ?? null,
  };
}

/**
 * Clear execution history (useful for long-lived sessions)
 */
export function clearExecutionHistory(state: VerifyCommandState): void {
  state.executions = [];
  state.lastExecution = undefined;
}

/**
 * Format execution for display
 */
export function formatExecution(execution: VerifyCommandExecution): {
  timestamp: string;
  status: string;
  statusBadge: string;
  commandSummary: string;
  outputPreview: string;
  durationText: string;
} {
  const date = new Date(execution.timestamp);
  const timestamp = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const statusMap = {
    pending: { text: 'Pending', badge: '⧐' },
    running: { text: 'Running', badge: '●' },
    success: { text: 'Success', badge: '✓' },
    failed: { text: 'Failed', badge: '✕' },
    timeout: { text: 'Timeout', badge: '⏱' },
  };

  const statusInfo = statusMap[execution.status];
  const commandSummary =
    execution.command.length > 60 ? `${execution.command.substring(0, 57)}…` : execution.command;

  const outputPreview = execution.output
    ? execution.output.split('\n')[0].substring(0, 100)
    : '(no output)';

  const durationText = execution.duration ? `${execution.duration}ms` : '–';

  return {
    timestamp,
    status: statusInfo.text,
    statusBadge: statusInfo.badge,
    commandSummary,
    outputPreview,
    durationText,
  };
}
