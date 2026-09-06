import { describe, expect, it } from 'vitest';
import type { ChangeReview } from '../contracts/changeReview';
import {
  reviewScopeMatches,
  summarizeReviewFiles,
} from '../../webview-ui/src/lib/changeReviewPresentation';

describe('Review presentation evidence boundaries', () => {
  it('does not make an old report copyable by checking a different reference', () => {
    const report = { requestedBase: 'main' } as ChangeReview;
    expect(reviewScopeMatches(report, ' main ')).toBe(true);
    expect(reviewScopeMatches(report, 'HEAD')).toBe(false);
    expect(reviewScopeMatches(report, '')).toBe(false);
    expect(reviewScopeMatches({ requestedBase: 'HEAD' } as ChangeReview, '')).toBe(true);
  });
  it('accounts for every path without calling unknown status modified', () => {
    const counts = summarizeReviewFiles(
      ['M', 'A', 'D', '?', 'T'].map((status) => ({ path: status, status }))
    );
    expect(counts).toEqual({ modified: 1, added: 1, deleted: 1, untracked: 1, other: 1 });
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(5);
  });
});
