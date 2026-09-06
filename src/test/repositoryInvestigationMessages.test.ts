import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  search: vi.fn(),
  read: vi.fn(),
  open: vi.fn(),
}));
vi.mock('../core/repositoryAnalysis.js', () => ({
  analyzeRemoteRepository: mocks.analyze,
  searchRepositoryAnalysis: mocks.search,
  deleteRepositoryAnalysis: vi.fn(),
}));
vi.mock('fs-extra', () => ({
  default: {
    readFile: mocks.read,
    realpath: async (p: string) => p,
    stat: async () => ({ isFile: () => true, size: 100 }),
  },
}));
vi.mock('vscode', () => ({
  workspace: { openTextDocument: mocks.open },
  window: { showTextDocument: vi.fn() },
  Uri: { file: (p: string) => p },
  Range: class {},
}));
import { tryDispatchRepositoryAnalysisWebviewMessage } from '../ui/panels/welcomePanelRepositoryAnalysisMessages';
import type { RepositoryAnalysisMessageHost } from '../ui/panels/welcomePanelRepositoryAnalysisMessages';
const report = {
  requestId: 'analysis',
  repository: { localPath: '/storage/repository-analysis/repo/source' },
  artifacts: {
    graph: '/storage/repository-analysis/repo/graph.json',
    workspacePath: '/storage/repository-analysis/repo/workspace',
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(Buffer.from('graph'));
  mocks.analyze.mockResolvedValue(report);
  mocks.search.mockResolvedValue({ entities: [], proofs: [] });
});
const host = () =>
  ({
    context: { globalStorageUri: { fsPath: '/storage' } },
    postWebviewMessage: vi.fn(),
  }) as unknown as RepositoryAnalysisMessageHost;
async function start(h: RepositoryAnalysisMessageHost) {
  await tryDispatchRepositoryAnalysisWebviewMessage(h, 'analyzeRemoteRepository', {
    requestId: 'analysis',
  });
}
describe('Investigation host authority', () => {
  it('opens a retained source proof and rejects modified source content', async () => {
    const h = host();
    await start(h);
    mocks.search.mockResolvedValue({
      proofs: [{ id: 'source', artifact: '../source/index.ts', line: 2 }],
    });
    mocks.open.mockResolvedValue({ lineCount: 10 });
    await tryDispatchRepositoryAnalysisWebviewMessage(h, 'searchRepositoryAnalysis', {
      analysisId: 'analysis',
      query: 'entry',
    });
    await tryDispatchRepositoryAnalysisWebviewMessage(h, 'openRepositorySearchProof', {
      analysisId: 'analysis',
      proofId: 'source',
    });
    expect(mocks.open).toHaveBeenCalledWith('/storage/repository-analysis/repo/source/index.ts');
    mocks.open.mockClear();
    mocks.search.mockResolvedValue({
      proofs: [{ id: 'source', artifact: '../source/index.ts', contentHash: 'old-hash' }],
    });
    await tryDispatchRepositoryAnalysisWebviewMessage(h, 'searchRepositoryAnalysis', {
      analysisId: 'analysis',
      query: 'entry',
    });
    await tryDispatchRepositoryAnalysisWebviewMessage(h, 'openRepositorySearchProof', {
      analysisId: 'analysis',
      proofId: 'source',
    });
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it('rejects invented analysis IDs without searching', async () => {
    const h = host();
    await start(h);
    await tryDispatchRepositoryAnalysisWebviewMessage(h, 'searchRepositoryAnalysis', {
      analysisId: 'other',
      requestId: 's',
      query: 'api',
    });
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it('rejects graph drift before search', async () => {
    const h = host();
    await start(h);
    mocks.read.mockResolvedValue(Buffer.from('new graph'));
    await tryDispatchRepositoryAnalysisWebviewMessage(h, 'searchRepositoryAnalysis', {
      analysisId: 'analysis',
      requestId: 's',
      query: 'api',
    });
    expect(mocks.search).not.toHaveBeenCalled();
    expect(h.postWebviewMessage).toHaveBeenCalledWith(
      'repositorySearchFailed',
      expect.objectContaining({ error: expect.stringContaining('changed') })
    );
  });
  it('never opens a path supplied by the webview instead of a retained proof', async () => {
    const h = host();
    await start(h);
    await tryDispatchRepositoryAnalysisWebviewMessage(h, 'openRepositorySearchProof', {
      analysisId: 'analysis',
      proofId: 'invented',
      path: '/etc/passwd',
    });
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it('rejects an indexed proof escaping the analyzed source root', async () => {
    const h = host();
    await start(h);
    mocks.search.mockResolvedValue({ proofs: [{ id: 'bad', artifact: '../../../../etc/passwd' }] });
    await tryDispatchRepositoryAnalysisWebviewMessage(h, 'searchRepositoryAnalysis', {
      analysisId: 'analysis',
      query: 'api',
    });
    await tryDispatchRepositoryAnalysisWebviewMessage(h, 'openRepositorySearchProof', {
      analysisId: 'analysis',
      proofId: 'bad',
    });
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
