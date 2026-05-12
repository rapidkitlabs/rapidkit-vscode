/**
 * Verify Execution Diff and Comparison
 *
 * Compares execution outputs to show what changed between
 * failed and passed verify runs, enabling quick diagnosis of changes.
 *
 * S3-002: Quick diff view between last failed and last passed verify evidence
 */

/**
 * Diff line with change type
 */
export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber?: number;
}

/**
 * Diff summary with statistics
 */
export interface DiffSummary {
  addedLines: number;
  removedLines: number;
  unchangedLines: number;
  totalLines: number;
  changePercentage: number;
  hasSignificantChanges: boolean;
}

/**
 * Execution comparison result
 */
export interface ExecutionComparison {
  failedOutput: string;
  passedOutput: string;
  diffLines: DiffLine[];
  summary: DiffSummary;
  similarityScore: number; // 0-100, where 100 = identical
}

/**
 * Split text into lines, handling different line endings
 */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line !== undefined && line !== null);
}

/**
 * Simple line-based diff using longest common subsequence approach
 */
export function computeLineDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const diffLines: DiffLine[] = [];

  // Track which lines we've processed
  const processedOld = new Set<number>();
  const processedNew = new Set<number>();

  // First pass: match identical lines
  for (let i = 0; i < oldLines.length; i++) {
    for (let j = 0; j < newLines.length; j++) {
      if (oldLines[i] === newLines[j] && !processedOld.has(i) && !processedNew.has(j)) {
        processedOld.add(i);
        processedNew.add(j);
        break;
      }
    }
  }

  // Build diff by comparing old and new
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx < oldLines.length && newIdx < newLines.length) {
      if (oldLines[oldIdx] === newLines[newIdx]) {
        // Lines match
        diffLines.push({
          type: 'unchanged',
          content: oldLines[oldIdx],
          lineNumber: oldIdx + 1,
        });
        oldIdx++;
        newIdx++;
      } else {
        // Lines differ - need to determine if it's an add or remove
        // Look ahead to find next matching line
        let oldMatch = -1;
        let newMatch = -1;

        for (let i = oldIdx + 1; i < oldLines.length; i++) {
          if (oldLines[i] === newLines[newIdx]) {
            oldMatch = i;
            break;
          }
        }

        for (let j = newIdx + 1; j < newLines.length; j++) {
          if (newLines[j] === oldLines[oldIdx]) {
            newMatch = j;
            break;
          }
        }

        // If we found a match in old, current new line is added
        if (oldMatch >= 0 && (newMatch < 0 || oldMatch - oldIdx <= newMatch - newIdx)) {
          diffLines.push({
            type: 'removed',
            content: oldLines[oldIdx],
            lineNumber: oldIdx + 1,
          });
          oldIdx++;
        } else {
          // Otherwise current old line is removed and new is added
          if (newMatch >= 0) {
            diffLines.push({
              type: 'added',
              content: newLines[newIdx],
            });
            newIdx++;
          } else {
            diffLines.push({
              type: 'removed',
              content: oldLines[oldIdx],
              lineNumber: oldIdx + 1,
            });
            oldIdx++;
          }
        }
      }
    } else if (oldIdx < oldLines.length) {
      // Remaining old lines are removed
      diffLines.push({
        type: 'removed',
        content: oldLines[oldIdx],
        lineNumber: oldIdx + 1,
      });
      oldIdx++;
    } else {
      // Remaining new lines are added
      diffLines.push({
        type: 'added',
        content: newLines[newIdx],
      });
      newIdx++;
    }
  }

  return diffLines;
}

/**
 * Calculate diff summary statistics
 */
export function calculateDiffSummary(diffLines: DiffLine[]): DiffSummary {
  let addedLines = 0;
  let removedLines = 0;
  let unchangedLines = 0;

  diffLines.forEach((line) => {
    if (line.type === 'added') {
      addedLines++;
    } else if (line.type === 'removed') {
      removedLines++;
    } else {
      unchangedLines++;
    }
  });

  const totalLines = diffLines.length;
  const changedLines = addedLines + removedLines;
  const changePercentage = totalLines > 0 ? (changedLines / totalLines) * 100 : 0;
  const hasSignificantChanges = changedLines > 0;

  return {
    addedLines,
    removedLines,
    unchangedLines,
    totalLines,
    changePercentage: Math.round(changePercentage * 100) / 100,
    hasSignificantChanges,
  };
}

/**
 * Calculate similarity score between two text blocks
 * 0 = completely different, 100 = identical
 */
export function calculateSimilarity(text1: string, text2: string): number {
  if (text1 === text2) {
    return 100;
  }

  if (text1.length === 0 || text2.length === 0) {
    return 0;
  }

  const lines1 = splitLines(text1);
  const lines2 = splitLines(text2);

  const diffLines = computeLineDiff(lines1, lines2);
  const unchanged = diffLines.filter((l) => l.type === 'unchanged').length;
  const maxLines = Math.max(lines1.length, lines2.length);

  return Math.round((unchanged / maxLines) * 100);
}

/**
 * Compare two execution outputs
 */
export function compareExecutions(failedOutput: string, passedOutput: string): ExecutionComparison {
  const failedLines = splitLines(failedOutput);
  const passedLines = splitLines(passedOutput);

  const diffLines = computeLineDiff(failedLines, passedLines);
  const summary = calculateDiffSummary(diffLines);
  const similarityScore = calculateSimilarity(failedOutput, passedOutput);

  return {
    failedOutput,
    passedOutput,
    diffLines,
    summary,
    similarityScore,
  };
}

/**
 * Format diff for display (with context)
 */
export function formatDiffForDisplay(
  comparison: ExecutionComparison,
  contextLines: number = 2
): {
  sections: Array<{
    header: string;
    lines: DiffLine[];
  }>;
  summary: string;
} {
  const sections: Array<{ header: string; lines: DiffLine[] }> = [];
  let currentSection: DiffLine[] = [];
  let lastChangeIdx = -1;

  // Group changes with context
  comparison.diffLines.forEach((line, idx) => {
    if (line.type !== 'unchanged') {
      lastChangeIdx = idx;
    }

    // If we're within context distance of a change, include this line
    const distToChange = Math.abs(idx - lastChangeIdx);
    const withinContext =
      distToChange <= contextLines ||
      (idx < comparison.diffLines.length - 1 &&
        comparison.diffLines
          .slice(idx + 1, idx + 1 + contextLines)
          .some((l) => l.type !== 'unchanged'));

    if (withinContext) {
      currentSection.push(line);
    } else if (currentSection.length > 0) {
      sections.push({
        header: `Lines ${currentSection[0].lineNumber || '?'}-${currentSection[currentSection.length - 1].lineNumber || '?'}`,
        lines: currentSection,
      });
      currentSection = [];
    }
  });

  if (currentSection.length > 0) {
    sections.push({
      header: `Lines ${currentSection[0].lineNumber || '?'}-${currentSection[currentSection.length - 1].lineNumber || '?'}`,
      lines: currentSection,
    });
  }

  const summary = `${comparison.summary.removedLines} removed, ${comparison.summary.addedLines} added (${comparison.similarityScore}% similar)`;

  return { sections, summary };
}

/**
 * Get key differences summary (most important changes)
 */
export function extractKeyDifferences(
  comparison: ExecutionComparison,
  maxItems: number = 5
): string[] {
  const changes = comparison.diffLines.filter((l) => l.type !== 'unchanged');
  const result: string[] = [];

  // Prioritize error/warning lines
  const errorChanges = changes.filter((l) =>
    /error|failed|exception|warning|critical/i.test(l.content)
  );

  const toShow = [...errorChanges, ...changes.filter((l) => !errorChanges.includes(l))].slice(
    0,
    maxItems
  );

  toShow.forEach((line) => {
    const prefix = line.type === 'added' ? '✓ Added' : '✕ Removed';
    result.push(`${prefix}: ${line.content.substring(0, 80)}`);
  });

  return result;
}

/**
 * Check if diff indicates likely fix
 */
export function indicatesSuccessfulFix(comparison: ExecutionComparison): {
  isLikelyFix: boolean;
  indicators: string[];
  confidence: number;
} {
  const indicators: string[] = [];
  let confidence = 0;

  // Check if error lines were removed
  const errorLinesRemoved = comparison.diffLines.filter(
    (l) => l.type === 'removed' && /error|failed|exception/i.test(l.content)
  ).length;

  if (errorLinesRemoved > 0) {
    indicators.push('Error messages removed');
    confidence += 30;
  }

  // Check if success indicators were added
  const successLinesAdded = comparison.diffLines.filter(
    (l) => l.type === 'added' && /success|passed|ok|complete|done/i.test(l.content)
  ).length;

  if (successLinesAdded > 0) {
    indicators.push('Success indicators added');
    confidence += 30;
  }

  // Check similarity
  if (comparison.similarityScore < 50) {
    indicators.push('Significant changes detected');
    confidence += 20;
  } else if (comparison.similarityScore > 80) {
    indicators.push('Minor changes only');
    confidence -= 10;
  }

  return {
    isLikelyFix: confidence >= 30,
    indicators,
    confidence: Math.max(0, Math.min(100, confidence)),
  };
}
