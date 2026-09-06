import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryAnalysisReport } from '../contracts/repositoryAnalysis';
const mocks = vi.hoisted(() => ({ run: vi.fn(), spec: vi.fn() }));
vi.mock('../utils/exec.js', () => ({ run: mocks.run }));
vi.mock('../utils/platformCapabilities.js', () => ({ buildRapidkitExecutionSpec: mocks.spec }));
import { searchRepositoryAnalysis } from '../core/repositoryAnalysis';

const report = {
  artifacts: {
    workspacePath: '/analysis/workspace-root/analysis',
    graph: '/analysis/workspace-root/analysis/.workspai/reports/graph.json',
  },
} as RepositoryAnalysisReport;
const result = {
  schemaVersion: 'workspace-knowledge-search.v1',
  entities: [],
  proofs: [],
  relations: [],
  relatedEntities: [],
  totalMatches: 0,
  truncated: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.spec.mockImplementation((args) => ({ command: 'workspai', args, env: {}, shell: false }));
  mocks.run.mockResolvedValue({ exitCode: 0, stdout: JSON.stringify(result), stderr: '' });
});
describe('Repository investigation retrieval', () => {
  it('uses the full captured artifact and a fixed bounded limit, never a visual filter or shell query', async () => {
    expect(await searchRepositoryAnalysis(report, 'authentication')).toEqual(result);
    expect(mocks.spec).toHaveBeenCalledWith([
      'workspace',
      'graph',
      'search',
      'authentication',
      '--from',
      report.artifacts.graph,
      '--workspace',
      report.artifacts.workspacePath,
      '--limit',
      '8',
      '--json',
    ]);
    expect(mocks.run).toHaveBeenCalledWith(
      'workspai',
      expect.any(Array),
      expect.objectContaining({ shell: false })
    );
  });
  it.each(['', 'x'.repeat(501), 'two\nlines'])(
    'rejects an invalid question before executing',
    async (query) => {
      await expect(searchRepositoryAnalysis(report, query)).rejects.toThrow('1–500');
      expect(mocks.run).not.toHaveBeenCalled();
    }
  );
  it('does not interpret a malformed response as no results', async () => {
    mocks.run.mockResolvedValue({ exitCode: 0, stdout: '{}', stderr: '' });
    await expect(searchRepositoryAnalysis(report, 'routing')).rejects.toThrow('supported');
  });
});
