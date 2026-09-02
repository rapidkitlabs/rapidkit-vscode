import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import fs from 'fs-extra';
import path from 'node:path';
import { promisify } from 'node:util';

export type StudioWorkspaceSourceSnapshot = {
  fingerprint: string;
  files: Record<string, string>;
  symlinks: Record<string, string>;
};

export type StudioWorkspaceSourceTransaction = {
  id: string;
  workspacePath: string;
  scopePath: string;
  backupPath: string;
  before: StudioWorkspaceSourceSnapshot;
  fileModes: Record<string, number>;
  symlinkTypes: Record<string, 'file' | 'dir' | 'junction'>;
};

export type StudioWorkspaceSourceRollback = {
  transactionId: string;
  changedPaths: string[];
  restoredFingerprint: string;
};

const EXCLUDED_DIRECTORY_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.workspai',
  '.rapidkit',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  'node_modules',
  'coverage',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
]);

const MAX_SOURCE_FILES = 30_000;
const MAX_SOURCE_FILE_BYTES = 16 * 1024 * 1024;
const execFileAsync = promisify(execFile);

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isGeneratedAgentSurface(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return (
    normalized === '.workspai-workspace' ||
    normalized === 'AGENTS.md' ||
    normalized === 'CLAUDE.md' ||
    /^(?:\.claude\/rules|\.cursor\/rules|\.github\/(?:agents|instructions|prompts|skills))\//.test(
      normalized
    )
  );
}

async function gitSnapshotCandidates(scopePath: string): Promise<string[] | undefined> {
  try {
    const rootResult = await execFileAsync(
      'git',
      ['-C', scopePath, 'rev-parse', '--show-toplevel'],
      {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      }
    );
    const gitRoot = path.resolve(rootResult.stdout.trim());
    const listing = await execFileAsync(
      'git',
      ['-C', gitRoot, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
      }
    );
    return listing.stdout
      .split('\0')
      .filter(Boolean)
      .map((entry) => path.resolve(gitRoot, entry))
      .filter((candidate) => isInside(scopePath, candidate));
  } catch {
    return undefined;
  }
}

async function traversalSnapshotCandidates(scopePath: string): Promise<string[] | undefined> {
  const candidates: string[] = [];
  const pending = [scopePath];
  let visitedFiles = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) {
        continue;
      }
      visitedFiles += 1;
      if (visitedFiles > MAX_SOURCE_FILES) {
        return undefined;
      }
      candidates.push(absolutePath);
    }
  }
  return candidates;
}

export async function captureStudioWorkspaceSourceSnapshot(input: {
  workspacePath: string;
  scopePath?: string;
}): Promise<StudioWorkspaceSourceSnapshot | undefined> {
  const workspacePath = path.resolve(input.workspacePath);
  const scopePath = path.resolve(input.scopePath ?? workspacePath);
  if (!isInside(workspacePath, scopePath)) {
    return undefined;
  }

  const candidates =
    (await gitSnapshotCandidates(scopePath)) ?? (await traversalSnapshotCandidates(scopePath));
  if (!candidates || candidates.length > MAX_SOURCE_FILES) {
    return undefined;
  }
  const files: Record<string, string> = {};
  const symlinks: Record<string, string> = {};
  for (const absolutePath of candidates) {
    const relativePath = path.relative(workspacePath, absolutePath).replace(/\\/g, '/');
    if (isGeneratedAgentSurface(relativePath)) {
      continue;
    }
    const stat = await fs.lstat(absolutePath).catch(() => undefined);
    if (stat?.isSymbolicLink()) {
      const target = await fs.readlink(absolutePath).catch(() => undefined);
      if (target === undefined) {
        continue;
      }
      symlinks[relativePath] = target;
      files[relativePath] = crypto.createHash('sha256').update(`symlink\0${target}`).digest('hex');
      continue;
    }
    if (!stat?.isFile() || stat.size > MAX_SOURCE_FILE_BYTES) {
      continue;
    }
    const content = await fs.readFile(absolutePath).catch(() => undefined);
    if (!content) {
      continue;
    }
    files[relativePath] = crypto.createHash('sha256').update(content).digest('hex');
  }

  const fingerprint = crypto
    .createHash('sha256')
    .update(
      Object.entries(files)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([relativePath, sha256]) => `${relativePath}\0${sha256}`)
        .join('\n')
    )
    .digest('hex');
  return { fingerprint, files, symlinks };
}

export function diffStudioWorkspaceSourceSnapshots(
  before: StudioWorkspaceSourceSnapshot | undefined,
  after: StudioWorkspaceSourceSnapshot | undefined
): string[] {
  if (!before || !after) {
    return [];
  }
  const paths = new Set([...Object.keys(before.files), ...Object.keys(after.files)]);
  return [...paths]
    .filter((relativePath) => before.files[relativePath] !== after.files[relativePath])
    .sort();
}

/**
 * Creates a private, content-complete checkpoint for project-owned source.
 *
 * The ordinary snapshot above intentionally stores hashes only because it is
 * also used for cheap mutation detection. An executable transaction needs the
 * original bytes as well: a command can partially rewrite or delete a file
 * before it fails. The checkpoint is kept outside the workspace and uses
 * copy-on-write cloning where the host filesystem supports it.
 */
export async function beginStudioWorkspaceSourceTransaction(input: {
  workspacePath: string;
  scopePath?: string;
}): Promise<StudioWorkspaceSourceTransaction | undefined> {
  const workspacePath = path.resolve(input.workspacePath);
  const scopePath = path.resolve(input.scopePath ?? workspacePath);
  if (!isInside(workspacePath, scopePath)) {
    return undefined;
  }
  const before = await captureStudioWorkspaceSourceSnapshot({ workspacePath, scopePath });
  if (!before) {
    return undefined;
  }
  const backupPath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-studio-checkpoint-'));
  const fileModes: Record<string, number> = {};
  const symlinkTypes: Record<string, 'file' | 'dir' | 'junction'> = {};
  try {
    for (const relativePath of Object.keys(before.files)) {
      const sourcePath = path.resolve(workspacePath, relativePath);
      const targetPath = path.resolve(backupPath, relativePath);
      if (!isInside(workspacePath, sourcePath) || !isInside(backupPath, targetPath)) {
        throw new Error(`Source checkpoint path escaped its transaction boundary: ${relativePath}`);
      }
      const stat = await fs.lstat(sourcePath);
      fileModes[relativePath] = stat.mode;
      if (stat.isSymbolicLink()) {
        const targetStat = await fs.stat(sourcePath).catch(() => undefined);
        symlinkTypes[relativePath] = targetStat?.isDirectory()
          ? process.platform === 'win32'
            ? 'junction'
            : 'dir'
          : 'file';
        continue;
      }
      await fs.ensureDir(path.dirname(targetPath));
      await fs.copyFile(sourcePath, targetPath, fsConstants.COPYFILE_FICLONE);
    }
    return {
      id: crypto.randomUUID(),
      workspacePath,
      scopePath,
      backupPath,
      before,
      fileModes,
      symlinkTypes,
    };
  } catch (error) {
    await fs.remove(backupPath);
    throw error;
  }
}

export async function inspectStudioWorkspaceSourceTransaction(
  transaction: StudioWorkspaceSourceTransaction
): Promise<{ after: StudioWorkspaceSourceSnapshot; changedPaths: string[] } | undefined> {
  const after = await captureStudioWorkspaceSourceSnapshot({
    workspacePath: transaction.workspacePath,
    scopePath: transaction.scopePath,
  });
  return after
    ? {
        after,
        changedPaths: diffStudioWorkspaceSourceSnapshots(transaction.before, after),
      }
    : undefined;
}

export async function rollbackStudioWorkspaceSourceTransaction(
  transaction: StudioWorkspaceSourceTransaction,
  changedPaths?: readonly string[]
): Promise<StudioWorkspaceSourceRollback> {
  const inspected = changedPaths
    ? undefined
    : await inspectStudioWorkspaceSourceTransaction(transaction);
  const paths = [...(changedPaths ?? inspected?.changedPaths ?? [])].sort();
  const createdDirectories = new Set<string>();

  for (const relativePath of paths) {
    const destination = path.resolve(transaction.workspacePath, relativePath);
    if (!isInside(transaction.workspacePath, destination)) {
      throw new Error(`Rollback path escaped the workspace: ${relativePath}`);
    }
    if (transaction.before.files[relativePath]) {
      const symlinkTarget = transaction.before.symlinks[relativePath];
      if (symlinkTarget !== undefined) {
        await fs.remove(destination);
        await fs.ensureDir(path.dirname(destination));
        await fs.symlink(
          symlinkTarget,
          destination,
          transaction.symlinkTypes[relativePath] ?? 'file'
        );
        continue;
      }
      const backup = path.resolve(transaction.backupPath, relativePath);
      if (!isInside(transaction.backupPath, backup) || !(await fs.pathExists(backup))) {
        throw new Error(`Rollback checkpoint is missing source content: ${relativePath}`);
      }
      await fs.ensureDir(path.dirname(destination));
      await fs.copyFile(backup, destination);
      await fs.chmod(destination, transaction.fileModes[relativePath] ?? 0o644);
      continue;
    }
    await fs.remove(destination);
    let directory = path.dirname(destination);
    while (isInside(transaction.scopePath, directory) && directory !== transaction.scopePath) {
      createdDirectories.add(directory);
      directory = path.dirname(directory);
    }
  }

  for (const directory of [...createdDirectories].sort(
    (left, right) => right.length - left.length
  )) {
    const entries = await fs.readdir(directory).catch(() => undefined);
    if (entries?.length === 0) {
      await fs.rmdir(directory).catch(() => undefined);
    }
  }

  const restored = await captureStudioWorkspaceSourceSnapshot({
    workspacePath: transaction.workspacePath,
    scopePath: transaction.scopePath,
  });
  if (!restored || restored.fingerprint !== transaction.before.fingerprint) {
    throw new Error(
      'Studio could not prove that the workspace source checkpoint was restored exactly.'
    );
  }
  return {
    transactionId: transaction.id,
    changedPaths: paths,
    restoredFingerprint: restored.fingerprint,
  };
}

export async function disposeStudioWorkspaceSourceTransaction(
  transaction: StudioWorkspaceSourceTransaction
): Promise<void> {
  await fs.remove(transaction.backupPath);
}
