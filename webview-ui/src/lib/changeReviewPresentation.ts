import type { ChangeReview } from '@workspai-contracts/changeReview';

export function reviewScopeMatches(report: ChangeReview, input: string): boolean {
  return (input.trim() || 'HEAD') === report.requestedBase;
}

export function summarizeReviewFiles(files: ChangeReview['files']) {
  return {
    added: files.filter((f) => f.status === 'A').length,
    modified: files.filter((f) => f.status === 'M').length,
    deleted: files.filter((f) => f.status === 'D').length,
    untracked: files.filter((f) => f.status === '?').length,
    other: files.filter((f) => !['A', 'M', 'D', '?'].includes(f.status)).length,
  };
}
