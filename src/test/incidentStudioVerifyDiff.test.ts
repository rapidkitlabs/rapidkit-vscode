/**
 * Unit tests for Verify Execution Diff and Comparison
 */

import { describe, it, expect } from 'vitest';
import {
  splitLines,
  computeLineDiff,
  calculateDiffSummary,
  calculateSimilarity,
  compareExecutions,
  formatDiffForDisplay,
  extractKeyDifferences,
  indicatesSuccessfulFix,
} from '../ui/panels/incidentStudioVerifyDiff';

describe('incidentStudioVerifyDiff', () => {
  describe('splitLines', () => {
    it('should split text into lines', () => {
      const text = 'line1\nline2\nline3';
      const lines = splitLines(text);

      expect(lines).toEqual(['line1', 'line2', 'line3']);
    });

    it('should handle different line endings', () => {
      const text = 'line1\r\nline2\nline3';
      const lines = splitLines(text);

      expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle empty lines', () => {
      const text = 'line1\n\nline3';
      const lines = splitLines(text);

      expect(lines).toEqual(['line1', '', 'line3']);
    });
  });

  describe('computeLineDiff', () => {
    it('should identify added lines', () => {
      const oldLines = ['line1', 'line2'];
      const newLines = ['line1', 'new', 'line2'];
      const diff = computeLineDiff(oldLines, newLines);

      expect(diff.some((d) => d.type === 'added' && d.content === 'new')).toBe(true);
    });

    it('should identify removed lines', () => {
      const oldLines = ['line1', 'removed', 'line2'];
      const newLines = ['line1', 'line2'];
      const diff = computeLineDiff(oldLines, newLines);

      expect(diff.some((d) => d.type === 'removed' && d.content === 'removed')).toBe(true);
    });

    it('should identify unchanged lines', () => {
      const oldLines = ['line1', 'line2'];
      const newLines = ['line1', 'line2'];
      const diff = computeLineDiff(oldLines, newLines);

      expect(diff.filter((d) => d.type === 'unchanged')).toHaveLength(2);
    });

    it('should handle empty diffs', () => {
      const oldLines = ['same'];
      const newLines = ['same'];
      const diff = computeLineDiff(oldLines, newLines);

      expect(diff.length).toBe(1);
      expect(diff[0].type).toBe('unchanged');
    });
  });

  describe('calculateDiffSummary', () => {
    it('should count changes correctly', () => {
      const diff = [
        { type: 'unchanged' as const, content: 'line1' },
        { type: 'added' as const, content: 'new' },
        { type: 'removed' as const, content: 'old' },
      ];

      const summary = calculateDiffSummary(diff);

      expect(summary.unchangedLines).toBe(1);
      expect(summary.addedLines).toBe(1);
      expect(summary.removedLines).toBe(1);
      expect(summary.totalLines).toBe(3);
    });

    it('should calculate change percentage', () => {
      const diff = [
        { type: 'unchanged' as const, content: 'line1' },
        { type: 'added' as const, content: 'new' },
      ];

      const summary = calculateDiffSummary(diff);

      expect(summary.changePercentage).toBeCloseTo(50, 0);
    });

    it('should mark significant changes', () => {
      const diff = [
        { type: 'unchanged' as const, content: 'line1' },
        { type: 'added' as const, content: 'new' },
      ];

      const summary = calculateDiffSummary(diff);

      expect(summary.hasSignificantChanges).toBe(true);
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 100 for identical text', () => {
      const text = 'line1\nline2';
      const similarity = calculateSimilarity(text, text);

      expect(similarity).toBe(100);
    });

    it('should return 0 for empty text', () => {
      const similarity = calculateSimilarity('', 'line1');

      expect(similarity).toBe(0);
    });

    it('should calculate partial similarity', () => {
      const old = 'line1\nline2\nline3';
      const new_text = 'line1\nchanged\nline3';
      const similarity = calculateSimilarity(old, new_text);

      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(100);
    });
  });

  describe('compareExecutions', () => {
    it('should create comparison with diff', () => {
      const failed = 'Error: Connection failed\nTimeout: 5000ms';
      const passed = 'Success: Connection established\nDuration: 2000ms';

      const comparison = compareExecutions(failed, passed);

      expect(comparison.failedOutput).toBe(failed);
      expect(comparison.passedOutput).toBe(passed);
      expect(comparison.diffLines.length).toBeGreaterThan(0);
      expect(comparison.summary).toBeDefined();
      expect(comparison.similarityScore).toBeDefined();
    });

    it('should mark identical executions as 100% similar', () => {
      const text = 'Output line 1\nOutput line 2';
      const comparison = compareExecutions(text, text);

      expect(comparison.similarityScore).toBe(100);
    });
  });

  describe('formatDiffForDisplay', () => {
    it('should format diff with context', () => {
      const failed = 'line1\nerror\nline2';
      const passed = 'line1\nfixed\nline2';
      const comparison = compareExecutions(failed, passed);

      const formatted = formatDiffForDisplay(comparison, 1);

      expect(formatted.sections.length).toBeGreaterThan(0);
      expect(formatted.summary).toBeDefined();
      expect(formatted.summary).toContain('%');
    });

    it('should include summary statistics', () => {
      const comparison = compareExecutions('old1\nold2\nold3', 'old1\nnew2\nold3');
      const formatted = formatDiffForDisplay(comparison);

      expect(formatted.summary).toContain('removed');
      expect(formatted.summary).toContain('added');
    });
  });

  describe('extractKeyDifferences', () => {
    it('should extract error lines as priorities', () => {
      const comparison = compareExecutions(
        'Error: Connection failed\nWarning: Retrying',
        'Success: Connected\nInfo: Ready'
      );

      const diffs = extractKeyDifferences(comparison, 5);

      expect(diffs.length).toBeGreaterThan(0);
      expect(diffs.some((d) => /Error|Warning/i.test(d))).toBe(true);
    });

    it('should limit to maxItems', () => {
      const failed = Array(10).fill('error line').join('\n');
      const passed = Array(10).fill('success line').join('\n');
      const comparison = compareExecutions(failed, passed);

      const diffs = extractKeyDifferences(comparison, 3);

      expect(diffs.length).toBeLessThanOrEqual(3);
    });
  });

  describe('indicatesSuccessfulFix', () => {
    it('should detect removal of error lines', () => {
      const comparison = compareExecutions(
        'Error: Database connection failed\nError: Retry timeout',
        'Success: Connected\nSuccess: Queries working'
      );

      const result = indicatesSuccessfulFix(comparison);

      expect(result.isLikelyFix).toBe(true);
      expect(result.indicators).toContain('Error messages removed');
    });

    it('should detect addition of success indicators', () => {
      const comparison = compareExecutions(
        'Checking...\nWaiting...',
        'Checking...\nSuccess!\nWaiting...\nCompleted'
      );

      const result = indicatesSuccessfulFix(comparison);

      expect(result.indicators).toContain('Success indicators added');
    });

    it('should not mark minor changes as fix', () => {
      const comparison = compareExecutions(
        'Output line 1\nOutput line 2',
        'Output line 1\nOutput line 2 (same)'
      );

      const result = indicatesSuccessfulFix(comparison);

      expect(result.isLikelyFix).toBe(false);
    });

    it('should calculate confidence score', () => {
      const comparison = compareExecutions('Error occurred\nRetrying...', 'Success!\nNo errors');

      const result = indicatesSuccessfulFix(comparison);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('diff algorithm correctness', () => {
    it('should handle complex multi-line diffs', () => {
      const old = 'header\nold1\nold2\nshared\nold3\nfooter';
      const new_text = 'header\nnew1\nnew2\nshared\nfooter';

      const comparison = compareExecutions(old, new_text);

      // The diff should show that we removed old1, old2, old3 and added new1, new2
      expect(comparison.summary.hasSignificantChanges).toBe(true);
      expect(comparison.summary.removedLines).toBeGreaterThan(0);
      expect(comparison.summary.addedLines).toBeGreaterThan(0);
    });

    it('should preserve line numbers in diff', () => {
      const old = 'line1\nline2\nline3';
      const new_text = 'line1\nline2\nline3';

      const comparison = compareExecutions(old, new_text);
      const unchangedLines = comparison.diffLines.filter((l) => l.type === 'unchanged');

      expect(unchangedLines.length).toBe(3);
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical failed-to-passed comparison', () => {
      const failed = `[ERROR] Database connection failed
[ERROR] Timeout waiting for pool
Retrying in 5 seconds...
[ERROR] Still unable to connect`;

      const passed = `[INFO] Attempting database connection
[SUCCESS] Connection established
[INFO] Connection pool ready
[INFO] All checks passed`;

      const comparison = compareExecutions(failed, passed);

      expect(comparison.similarityScore).toBeLessThan(50);
      expect(comparison.summary.hasSignificantChanges).toBe(true);

      const result = indicatesSuccessfulFix(comparison);
      expect(result.isLikelyFix).toBe(true);
    });

    it('should handle identical retry scenario', () => {
      const output = `Checking deployment status...
Service: api (healthy)
Service: database (healthy)
Overall: OK`;

      const comparison = compareExecutions(output, output);

      expect(comparison.similarityScore).toBe(100);
      expect(comparison.summary.hasSignificantChanges).toBe(false);

      const result = indicatesSuccessfulFix(comparison);
      expect(result.isLikelyFix).toBe(false); // No changes means likely same issue
    });
  });
});
