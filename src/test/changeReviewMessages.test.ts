import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({
  trusted: true,
  pick: vi.fn(),
  copy: vi.fn(),
  build: vi.fn(),
  observe: vi.fn(),
}));
vi.mock('vscode', () => ({
  workspace: {
    get isTrusted() {
      return mocks.trusted;
    },
    workspaceFolders: [],
  },
  window: { showOpenDialog: mocks.pick },
  env: { clipboard: { writeText: mocks.copy } },
}));
vi.mock('../core/changeReview.js', () => ({
  buildChangeReview: mocks.build,
  observeReviewTree: mocks.observe,
  changeReviewMarkdown: () => 'report',
}));
import { tryDispatchChangeReviewMessage } from '../ui/panels/welcomePanelChangeReviewMessages.js';
import type { RepositoryAnalysisMessageHost } from '../ui/panels/welcomePanelRepositoryAnalysisMessages.js';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.trusted = true;
});
const host = () =>
  ({ context: {}, postWebviewMessage: vi.fn() }) as unknown as RepositoryAnalysisMessageHost;
describe('Change Review host authority', () => {
  it('refuses CLI and Git work in an untrusted workspace', async () => {
    mocks.trusted = false;
    const h = host();
    await tryDispatchChangeReviewMessage(h, 'reviewLocalChanges', { requestId: 'r' });
    expect(mocks.pick).not.toHaveBeenCalled();
    expect(mocks.build).not.toHaveBeenCalled();
    expect(h.postWebviewMessage).toHaveBeenCalledWith(
      'changeReviewFailed',
      expect.objectContaining({ requestId: 'r' })
    );
  });
  it('takes the directory from the native picker, not a webview path', async () => {
    mocks.pick.mockResolvedValue([{ fsPath: '/chosen' }]);
    mocks.build.mockResolvedValue({ id: 'review' });
    await tryDispatchChangeReviewMessage(host(), 'reviewLocalChanges', {
      requestId: 'r',
      repositoryPath: '/injected',
      base: 'main',
    });
    expect(mocks.build).toHaveBeenCalledWith('/chosen', 'main');
  });
  it('does nothing when directory selection is cancelled', async () => {
    mocks.pick.mockResolvedValue(undefined);
    const h = host();
    await tryDispatchChangeReviewMessage(h, 'reviewLocalChanges', { requestId: 'r' });
    expect(mocks.build).not.toHaveBeenCalled();
    expect(h.postWebviewMessage).toHaveBeenCalledWith('changeReviewCancelled', { requestId: 'r' });
  });
  it('checks content freshness before copying and rejects stale evidence', async () => {
    mocks.pick.mockResolvedValue([{ fsPath: '/chosen' }]);
    mocks.build.mockResolvedValue({
      id: 'review',
      repositoryPath: '/chosen',
      base: 'base',
      requestedBase: 'main',
      fingerprint: 'before',
    });
    const h = host();
    await tryDispatchChangeReviewMessage(h, 'reviewLocalChanges', { requestId: 'r' });
    mocks.observe.mockResolvedValue({ fingerprint: 'after' });
    await tryDispatchChangeReviewMessage(h, 'copyChangeReview', {
      requestId: 'copy',
      reviewId: 'review',
    });
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(mocks.observe).toHaveBeenCalledWith('/chosen', 'main');
    expect(h.postWebviewMessage).toHaveBeenCalledWith('changeReviewFreshness', {
      requestId: 'copy',
      reviewId: 'review',
      stale: true,
    });
  });
  it('refuses refresh with an obsolete review ID instead of selecting a different scope', async () => {
    const h = host();
    await tryDispatchChangeReviewMessage(h, 'refreshChangeReview', {
      requestId: 'r',
      reviewId: 'old',
    });
    expect(mocks.pick).not.toHaveBeenCalled();
    expect(mocks.build).not.toHaveBeenCalled();
    expect(h.postWebviewMessage).toHaveBeenCalledWith(
      'changeReviewFailed',
      expect.objectContaining({ requestId: 'r' })
    );
  });
  it('only acknowledges a successful copy after the clipboard operation finishes', async () => {
    const h = host();
    mocks.pick.mockResolvedValue([{ fsPath: '/chosen' }]);
    mocks.build.mockResolvedValue({
      id: 'review',
      repositoryPath: '/chosen',
      requestedBase: 'main',
      fingerprint: 'same',
    });
    await tryDispatchChangeReviewMessage(h, 'reviewLocalChanges', { requestId: 'r' });
    mocks.observe.mockResolvedValue({ fingerprint: 'same' });
    let finish!: () => void;
    mocks.copy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const pending = tryDispatchChangeReviewMessage(h, 'copyChangeReview', {
      requestId: 'copy',
      reviewId: 'review',
    });
    await vi.waitFor(() => expect(mocks.copy).toHaveBeenCalled());
    expect(h.postWebviewMessage).not.toHaveBeenCalledWith(
      'changeReviewFreshness',
      expect.anything()
    );
    expect(h.postWebviewMessage).not.toHaveBeenCalledWith('changeReviewCopied', expect.anything());
    await tryDispatchChangeReviewMessage(h, 'refreshChangeReview', {
      requestId: 'overlap',
      reviewId: 'review',
    });
    expect(h.postWebviewMessage).toHaveBeenCalledWith('changeReviewFailed', {
      requestId: 'overlap',
      error: 'A review is already running.',
    });
    finish();
    await pending;
    expect(h.postWebviewMessage).toHaveBeenCalledWith('changeReviewCopied', { requestId: 'copy' });
  });
  it('keeps directory authority on refresh and releases the busy lock after failure', async () => {
    const h = host();
    mocks.pick.mockResolvedValue([{ fsPath: '/chosen' }]);
    mocks.build.mockResolvedValueOnce({ id: 'review', repositoryPath: '/chosen' });
    await tryDispatchChangeReviewMessage(h, 'reviewLocalChanges', { requestId: 'r' });
    mocks.build.mockRejectedValueOnce(new Error('Git unavailable'));
    await tryDispatchChangeReviewMessage(h, 'refreshChangeReview', {
      requestId: 'refresh',
      reviewId: 'review',
      repositoryPath: '/injected',
      base: 'main',
    });
    expect(mocks.build).toHaveBeenLastCalledWith('/chosen', 'main');
    mocks.build.mockResolvedValueOnce({ id: 'next', repositoryPath: '/chosen' });
    await tryDispatchChangeReviewMessage(h, 'refreshChangeReview', {
      requestId: 'retry',
      reviewId: 'review',
    });
    expect(h.postWebviewMessage).toHaveBeenCalledWith(
      'changeReviewCompleted',
      expect.objectContaining({ requestId: 'retry' })
    );
  });
});
