/**
 * Unit tests for Verify Command Rerun Management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createVerifyCommandState,
  recordVerifyExecution,
  canRerun,
  getRerunBlockReason,
  prepareRerun,
  completeRerun,
  getExecutionHistory,
  getLastSuccessfulExecution,
  getLastFailedExecution,
  getExecutionStats,
  clearExecutionHistory,
  formatExecution,
  type VerifyCommandState,
} from '../ui/panels/incidentStudioVerifyRerun';

describe('incidentStudioVerifyRerun', () => {
  let state: VerifyCommandState;

  beforeEach(() => {
    state = createVerifyCommandState('rapidkit doctor project', 'project');
  });

  describe('createVerifyCommandState', () => {
    it('should initialize with empty execution history', () => {
      expect(state.command).toBe('rapidkit doctor project');
      expect(state.scope).toBe('project');
      expect(state.executions).toHaveLength(0);
      expect(state.isRunning).toBe(false);
    });
  });

  describe('recordVerifyExecution', () => {
    it('should create and record execution', () => {
      const execution = recordVerifyExecution(state, 'success', 'All checks passed', 0, 1500);

      expect(execution.command).toBe('rapidkit doctor project');
      expect(execution.status).toBe('success');
      expect(execution.output).toBe('All checks passed');
      expect(execution.exitCode).toBe(0);
      expect(execution.duration).toBe(1500);
      expect(state.lastExecution).toBe(execution);
    });

    it('should add to execution history', () => {
      recordVerifyExecution(state, 'failed', 'Error', 1);
      recordVerifyExecution(state, 'success', 'OK', 0);

      expect(state.executions).toHaveLength(2);
      expect(state.lastExecution?.status).toBe('success');
    });
  });

  describe('canRerun', () => {
    it('should allow rerun after failed execution', () => {
      recordVerifyExecution(state, 'failed', 'Error', 1);

      expect(canRerun(state)).toBe(true);
    });

    it('should not allow rerun after success', () => {
      recordVerifyExecution(state, 'success', 'OK', 0);

      expect(canRerun(state)).toBe(false);
    });

    it('should not allow rerun while running', () => {
      recordVerifyExecution(state, 'failed', 'Error', 1);
      state.isRunning = true;

      expect(canRerun(state)).toBe(false);
    });

    it('should not allow rerun with no previous execution', () => {
      expect(canRerun(state)).toBe(false);
    });

    it('should not allow rerun with empty command', () => {
      state.command = '';
      recordVerifyExecution(state, 'failed', 'Error', 1);

      expect(canRerun(state)).toBe(false);
    });
  });

  describe('getRerunBlockReason', () => {
    it('should return null when rerun is allowed', () => {
      recordVerifyExecution(state, 'failed', 'Error', 1);

      expect(getRerunBlockReason(state)).toBeNull();
    });

    it('should explain block when no command', () => {
      state.command = '';
      expect(getRerunBlockReason(state)).toContain('No command');
    });

    it('should explain block when running', () => {
      recordVerifyExecution(state, 'failed', 'Error', 1);
      state.isRunning = true;

      expect(getRerunBlockReason(state)).toContain('currently executing');
    });

    it('should explain block when no previous execution', () => {
      expect(getRerunBlockReason(state)).toContain('No previous execution');
    });

    it('should explain block when last execution succeeded', () => {
      recordVerifyExecution(state, 'success', 'OK', 0);

      expect(getRerunBlockReason(state)).toContain('succeeded');
    });
  });

  describe('prepareRerun', () => {
    it('should mark as running when prepare succeeds', () => {
      recordVerifyExecution(state, 'failed', 'Error', 1);
      const result = prepareRerun(state);

      expect(result.success).toBe(true);
      expect(state.isRunning).toBe(true);
      expect(result.message).toContain('Rerunning');
    });

    it('should return failure when rerun not allowed', () => {
      recordVerifyExecution(state, 'success', 'OK', 0);
      const result = prepareRerun(state);

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('completeRerun', () => {
    it('should mark as not running and record execution', () => {
      recordVerifyExecution(state, 'failed', 'Error', 1);
      prepareRerun(state);
      const execution = completeRerun(state, 'success', 'Retry succeeded', 0, 1200);

      expect(state.isRunning).toBe(false);
      expect(execution.status).toBe('success');
      expect(state.executions).toHaveLength(2);
    });
  });

  describe('getExecutionHistory', () => {
    it('should return copy of execution history', () => {
      recordVerifyExecution(state, 'failed', 'E1', 1);
      recordVerifyExecution(state, 'success', 'S1', 0);

      const history = getExecutionHistory(state);

      expect(history).toHaveLength(2);
      expect(history[0].status).toBe('failed');
      expect(history[1].status).toBe('success');
    });

    it('should return empty array for no executions', () => {
      const history = getExecutionHistory(state);

      expect(history).toHaveLength(0);
    });
  });

  describe('getLastSuccessfulExecution', () => {
    it('should return most recent success', () => {
      recordVerifyExecution(state, 'failed', 'E1', 1);
      recordVerifyExecution(state, 'success', 'S1', 0);
      recordVerifyExecution(state, 'failed', 'E2', 1);

      const success = getLastSuccessfulExecution(state);

      expect(success?.output).toBe('S1');
    });

    it('should return null if no success', () => {
      recordVerifyExecution(state, 'failed', 'E1', 1);
      recordVerifyExecution(state, 'failed', 'E2', 1);

      const success = getLastSuccessfulExecution(state);

      expect(success).toBeNull();
    });
  });

  describe('getLastFailedExecution', () => {
    it('should return most recent failure', () => {
      recordVerifyExecution(state, 'success', 'S1', 0);
      recordVerifyExecution(state, 'failed', 'E1', 1);
      recordVerifyExecution(state, 'success', 'S2', 0);
      recordVerifyExecution(state, 'failed', 'E2', 1);

      const failure = getLastFailedExecution(state);

      expect(failure?.output).toBe('E2');
    });

    it('should return null if no failure', () => {
      recordVerifyExecution(state, 'success', 'S1', 0);

      const failure = getLastFailedExecution(state);

      expect(failure).toBeNull();
    });
  });

  describe('getExecutionStats', () => {
    it('should calculate success and failure counts', () => {
      recordVerifyExecution(state, 'success', 'S1', 0);
      recordVerifyExecution(state, 'failed', 'E1', 1);
      recordVerifyExecution(state, 'success', 'S2', 0);
      recordVerifyExecution(state, 'failed', 'E2', 1);

      const stats = getExecutionStats(state);

      expect(stats.totalAttempts).toBe(4);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(2);
      expect(stats.successRate).toBe(50);
    });

    it('should handle zero executions', () => {
      const stats = getExecutionStats(state);

      expect(stats.totalAttempts).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.successRate).toBe(0);
    });

    it('should report last attempt status', () => {
      recordVerifyExecution(state, 'failed', 'E1', 1);

      const stats = getExecutionStats(state);

      expect(stats.lastAttemptStatus).toBe('failed');
    });
  });

  describe('clearExecutionHistory', () => {
    it('should clear all executions', () => {
      recordVerifyExecution(state, 'success', 'S1', 0);
      recordVerifyExecution(state, 'failed', 'E1', 1);

      clearExecutionHistory(state);

      expect(state.executions).toHaveLength(0);
      expect(state.lastExecution).toBeUndefined();
    });
  });

  describe('formatExecution', () => {
    it('should format execution for display', () => {
      const execution = recordVerifyExecution(state, 'failed', 'Connection timeout', 124, 5000);
      const formatted = formatExecution(execution);

      expect(formatted.status).toBe('Failed');
      expect(formatted.statusBadge).toBe('✕');
      expect(formatted.commandSummary).toBe('rapidkit doctor project');
      expect(formatted.outputPreview).toBe('Connection timeout');
      expect(formatted.durationText).toBe('5000ms');
    });

    it('should handle long commands with truncation', () => {
      const longCmd =
        'this is a very long command that exceeds sixty characters and should be truncated with ellipsis';
      state.command = longCmd;
      const execution = recordVerifyExecution(state, 'success', 'OK', 0);
      const formatted = formatExecution(execution);

      expect(formatted.commandSummary).toContain('…');
      expect(formatted.commandSummary.length).toBeLessThanOrEqual(60);
    });

    it('should show correct status badges', () => {
      const statuses: Array<[string, string]> = [
        ['pending', '⧐'],
        ['running', '●'],
        ['success', '✓'],
        ['failed', '✕'],
        ['timeout', '⏱'],
      ];

      statuses.forEach(([statusName, badge]) => {
        state.command = `cmd_${statusName}`;
        const execution = recordVerifyExecution(state, statusName as any, 'output', 0);
        const formatted = formatExecution(execution);

        expect(formatted.statusBadge).toBe(badge);
      });
    });
  });

  describe('rerun workflow contract', () => {
    it('should enable full rerun workflow', () => {
      // Initial execution fails
      recordVerifyExecution(state, 'failed', 'Timeout', 124, 3000);
      expect(canRerun(state)).toBe(true);

      // Prepare rerun
      const prepResult = prepareRerun(state);
      expect(prepResult.success).toBe(true);
      expect(state.isRunning).toBe(true);

      // Complete rerun with success
      const completeResult = completeRerun(state, 'success', 'Passed', 0, 2500);
      expect(state.isRunning).toBe(false);
      expect(completeResult.status).toBe('success');

      // Now rerun is blocked (last execution succeeded)
      expect(canRerun(state)).toBe(false);
      expect(getRerunBlockReason(state)).toContain('succeeded');
    });

    it('should track stats through multiple reruns', () => {
      recordVerifyExecution(state, 'failed', 'E1', 1);
      prepareRerun(state);
      completeRerun(state, 'failed', 'E1', 1);

      prepareRerun(state);
      completeRerun(state, 'success', 'OK', 0);

      const stats = getExecutionStats(state);
      expect(stats.totalAttempts).toBe(3);
      expect(stats.failureCount).toBe(2);
      expect(stats.successCount).toBe(1);
      expect(stats.successRate).toBeCloseTo(33.33, 1);
    });
  });
});
