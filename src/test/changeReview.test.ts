import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

const cliSpec = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('CLI unavailable in this fixture');
  })
);
vi.mock('../utils/platformCapabilities.js', () => ({
  buildPackageRunnerSubprocessEnv: (env: unknown) => env,
  buildRapidkitExecutionSpec: cliSpec,
}));
import {
  parseReviewFiles,
  observeReviewTree,
  projectReviewImpact,
  buildChangeReview,
  changeReviewMarkdown,
} from '../core/changeReview.js';
const roots: string[] = [];
afterEach(async () => {
  cliSpec.mockReset();
  cliSpec.mockImplementation(() => {
    throw new Error('CLI unavailable in this fixture');
  });
  for (const root of roots.splice(0)) await fs.remove(root);
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-change-review-'));
  roots.push(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: path.join(root, 'absent-global-config'),
        GIT_CONFIG_NOSYSTEM: '1',
      },
    }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Review fixture');
  git('config', 'user.email', 'review@example.invalid');
  await fs.writeFile(path.join(root, 'a.txt'), 'before');
  git('add', '.');
  git(
    '-c',
    'commit.gpgsign=false',
    '-c',
    `core.hooksPath=${path.join(root, '.git', 'empty-hooks')}`,
    'commit',
    '-qm',
    'baseline'
  );
  return root;
}

describe('Change review observations', () => {
  it('parses NUL-delimited filenames without breaking whitespace or renames represented as add/delete', () => {
    expect(parseReviewFiles('M\0a b\0D\0old\0A\0new\0', 'odd\nname\0')).toEqual([
      { path: 'a b', status: 'M' },
      { path: 'new', status: 'A' },
      { path: 'odd\nname', status: '?' },
      { path: 'old', status: 'D' },
    ]);
  });
  it('invalidates content changes even when filenames and Git status are unchanged', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.txt'), 'first');
    const first = await observeReviewTree(root);
    await fs.writeFile(path.join(root, 'a.txt'), 'second');
    const second = await observeReviewTree(root);
    expect(first.files).toEqual(second.files);
    expect(first.fingerprint).not.toBe(second.fingerprint);
  });
  it('includes untracked files and deletions, without treating a clean tree as verified', async () => {
    const root = await fixture();
    await fs.remove(path.join(root, 'a.txt'));
    await fs.writeFile(path.join(root, 'new.txt'), 'new');
    const report = await buildChangeReview(root);
    expect(report.files).toEqual([
      { path: 'a.txt', status: 'D' },
      { path: 'new.txt', status: '?' },
    ]);
    expect(report.impactAvailable).toBe(false);
    expect(report.checks).toEqual([]);
    expect(changeReviewMarkdown(report)).toContain('No tests were run');
  });
  it('does not interpret an option as a comparison ref', async () => {
    await expect(observeReviewTree('/unused', '--output=elsewhere')).rejects.toThrow(
      'local branch'
    );
  });
  it('accepts a filename beginning with two dots without treating it as traversal', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, '..notes'), 'inside repository');
    expect((await observeReviewTree(root)).files).toContainEqual({ path: '..notes', status: '?' });
  });
  it('records the chosen ref and preserves impact reasoning in the handoff', async () => {
    const root = await fixture();
    const report = await buildChangeReview(root, 'HEAD');
    expect(report.requestedBase).toBe('HEAD');
    report.impactAvailable = true;
    report.impact = [
      { title: 'API', summary: 'Changed', origin: 'direct', reasons: ['depends on changed file'] },
    ];
    const text = changeReviewMarkdown(report);
    expect(text).toContain('Comparison ref: "HEAD"');
    expect(text).toContain('Evidence: depends on changed file');
    expect(text).toContain(JSON.stringify(root));
  });
  it('rejects subdirectory scope so Git and CLI cannot silently review different roots', async () => {
    const root = await fixture();
    const sub = path.join(root, 'nested');
    await fs.ensureDir(sub);
    await expect(observeReviewTree(sub)).rejects.toThrow('repository root');
  });
  it('consumes the installed CLI operation envelopes and real Git-aware impact without running project scripts', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, '.gitignore'), '.workspai/\n.rapidkit/\n');
    await fs.outputJson(path.join(root, '.workspai/workspace.json'), {
      workspace_name: 'review-fixture',
    });
    await fs.outputJson(path.join(root, 'api/.rapidkit/project.json'), {
      name: 'api',
      runtime: 'node',
      kit_name: 'express.standard',
    });
    await fs.outputJson(path.join(root, 'api/package.json'), {
      name: 'api',
      scripts: { test: 'node must-not-run.cjs' },
    });
    await fs.outputFile(path.join(root, 'api/index.js'), 'export const value = 1;');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    git('add', '.');
    git(
      '-c',
      'commit.gpgsign=false',
      '-c',
      `core.hooksPath=${path.join(root, '.git', 'empty-hooks')}`,
      'commit',
      '-qm',
      'workspace fixture'
    );
    const cliPath = path.resolve('node_modules/workspai/dist/index.js');
    execFileSync(
      process.execPath,
      [cliPath, 'workspace', 'snapshot', '--workspace', root, '--json'],
      { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }
    );
    await fs.writeFile(path.join(root, 'api/index.js'), 'export const value = 2;');
    cliSpec.mockImplementation(((args: string[]) => ({
      command: process.execPath,
      args: [cliPath, ...args],
      shell: false,
      env: {},
    })) as never);
    const review = await buildChangeReview(root);
    expect(review.impactAvailable, review.limitations.join('\n')).toBe(true);
    expect(review.files).toEqual([{ path: 'api/index.js', status: 'M' }]);
    expect(review.impact.length).toBeGreaterThan(0);
    expect(review.checks.length).toBeGreaterThan(0);
    expect(cliSpec).toHaveBeenCalledTimes(2);
  }, 45_000);
});

describe('CLI-owned impact projection', () => {
  const observation = {
    repositoryPath: '/repo',
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    fingerprint: 'digest',
    files: [{ path: 'src/a.ts', status: 'M' }],
  };
  const diff = {
    schemaVersion: 'workspace-model-diff.v1',
    fromRef: `git:${observation.base}`,
    git: { available: true, commit: observation.head },
    changes: [{ type: 'git.file.changed', target: 'git:src/a.ts' }],
  };
  const impact = {
    schemaVersion: 'workspace-impact.v1',
    fromRef: diff.fromRef,
    affectedProjects: [{ title: 'API', origin: 'direct', reasons: ['CLI reason'] }],
    transitiveImpact: [{ title: 'Consumer', origin: 'transitive' }],
    workspaceImpact: [],
    diff,
    verificationPlan: [
      {
        id: 'test',
        label: 'Run tests',
        display: 'npx workspai workspace run test',
        required: true,
      },
    ],
  };
  it('preserves CLI direct/transitive reasoning and keeps commands unexecuted', () => {
    const projected = projectReviewImpact(diff, impact, observation);
    expect(projected.impact.map((i) => i.origin)).toEqual(['direct', 'transitive']);
    expect(projected.checks[0].command).toBe('npx workspai workspace run test');
    expect(projected.checks[0]).not.toHaveProperty('passed');
  });
  it('does not interpret missing collections or mismatched impact evidence as clean', () => {
    expect(() =>
      projectReviewImpact(diff, { ...impact, affectedProjects: undefined }, observation)
    ).toThrow('Incomplete');
    expect(() =>
      projectReviewImpact(diff, { ...impact, diff: { ...diff, toHash: 'different' } }, observation)
    ).toThrow('matching diff');
    expect(() =>
      projectReviewImpact(diff, { ...impact, diff: { ...diff, changes: [] } }, observation)
    ).toThrow('every changed path');
  });
  it('rejects wrong-commit or unavailable Git evidence', () => {
    expect(() =>
      projectReviewImpact({ ...diff, git: { available: false } }, impact, observation)
    ).toThrow('does not cover');
    expect(() =>
      projectReviewImpact(
        { ...diff, git: { available: true, commit: 'c'.repeat(40) } },
        impact,
        observation
      )
    ).toThrow('does not cover');
  });
  it('rejects partial path coverage and a different impact baseline', () => {
    expect(() => projectReviewImpact({ ...diff, changes: [] }, impact, observation)).toThrow(
      'every changed path'
    );
    expect(() =>
      projectReviewImpact(diff, { ...impact, fromRef: 'git:other' }, observation)
    ).toThrow('does not cover');
  });
});
