import crypto from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import releasePolicy from '../../contracts/extension-cli-release-policy.v1.json';
import {
  BundledCliRuntimeError,
  configureBundledCliRuntimeStorage,
  resetBundledCliRuntimeForTests,
  resolveBundledCliRuntime,
} from '../core/bundledCliRuntime';

const createdRoots: string[] = [];
const originalOverride = process.env.WORKSPAI_BUNDLED_CLI_ROOT;
const originalDisable = process.env.WORKSPAI_DISABLE_BUNDLED_CLI;
const originalAllowLocalCandidate = process.env.WORKSPAI_ALLOW_LOCAL_CLI_CANDIDATE;

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function createRuntimeFixture(
  version = releasePolicy.verifiedCliVersion,
  channel: 'release' | 'local-candidate' = 'release',
  distribution: 'release' | 'development-host' | 'local-vsix' = channel === 'release'
    ? 'release'
    : 'development-host'
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-vscode-cli-runtime-'));
  createdRoots.push(root);
  fs.ensureDirSync(path.join(root, 'dist'));
  fs.ensureDirSync(path.join(root, 'terminal-bin'));
  fs.writeFileSync(path.join(root, 'launcher.cjs'), "void import('./dist/index.mjs');\n");
  fs.writeFileSync(path.join(root, 'dist', 'index.mjs'), 'export const runtime = true;\n');
  fs.writeFileSync(path.join(root, 'terminal-bin', 'workspai'), '#!/bin/sh\nexit 0\n');
  fs.writeFileSync(path.join(root, 'terminal-bin', 'workspai.cmd'), '@exit /b 0\r\n');
  fs.writeJsonSync(path.join(root, 'package.json'), { name: 'fixture', version });
  const files = [
    'dist/index.mjs',
    'launcher.cjs',
    'package.json',
    'terminal-bin/workspai',
    'terminal-bin/workspai.cmd',
  ].map((relativePath) => {
    const filePath = path.join(root, relativePath);
    return {
      path: relativePath,
      size: fs.statSync(filePath).size,
      sha256: sha256(filePath),
    };
  });
  fs.writeJsonSync(path.join(root, 'manifest.json'), {
    schemaVersion: 'workspai-vscode-bundled-cli-runtime.v1',
    channel,
    distribution,
    cli: { name: 'workspai', version },
    entry: 'launcher.cjs',
    terminal: { bin: 'terminal-bin', command: 'workspai' },
    integrity: 'sha256',
    files,
  });
  return root;
}

afterEach(() => {
  if (originalOverride === undefined) {
    delete process.env.WORKSPAI_BUNDLED_CLI_ROOT;
  } else {
    process.env.WORKSPAI_BUNDLED_CLI_ROOT = originalOverride;
  }
  if (originalDisable === undefined) {
    delete process.env.WORKSPAI_DISABLE_BUNDLED_CLI;
  } else {
    process.env.WORKSPAI_DISABLE_BUNDLED_CLI = originalDisable;
  }
  if (originalAllowLocalCandidate === undefined) {
    delete process.env.WORKSPAI_ALLOW_LOCAL_CLI_CANDIDATE;
  } else {
    process.env.WORKSPAI_ALLOW_LOCAL_CLI_CANDIDATE = originalAllowLocalCandidate;
  }
  resetBundledCliRuntimeForTests();
  for (const root of createdRoots.splice(0)) {
    fs.removeSync(root);
  }
});

describe('bundled Workspai CLI runtime', () => {
  it('returns an integrity-verified runtime bound to the release policy version', () => {
    const root = createRuntimeFixture();
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-vscode-storage-'));
    createdRoots.push(storageRoot);
    configureBundledCliRuntimeStorage(storageRoot);
    process.env.WORKSPAI_BUNDLED_CLI_ROOT = root;
    delete process.env.WORKSPAI_DISABLE_BUNDLED_CLI;

    const runtime = resolveBundledCliRuntime();

    expect(runtime).toMatchObject({
      root,
      version: releasePolicy.verifiedCliVersion,
      channel: 'release',
      distribution: 'release',
      command: process.execPath,
      argsPrefix: [path.join(root, 'launcher.cjs')],
      terminalCommand: 'workspai',
      env: { ELECTRON_RUN_AS_NODE: '1', WORKSPAI_EXTENSION_RUNTIME: '1' },
    });
    expect(runtime?.terminalBin).toContain(path.join(storageRoot, 'cli-terminal'));
    expect(runtime?.terminalBin).not.toBe(path.join(root, 'terminal-bin'));
    expect(fs.readFileSync(path.join(runtime!.terminalBin, 'workspai'), 'utf8')).toBe(
      fs.readFileSync(path.join(root, 'terminal-bin', 'workspai'), 'utf8')
    );
    if (process.platform !== 'win32') {
      expect(fs.statSync(path.join(runtime!.terminalBin, 'workspai')).mode & 0o777).toBe(0o700);
    }
  });

  it('accepts a compatible local candidate only in an explicitly enabled development host', () => {
    const root = createRuntimeFixture('999.0.0', 'local-candidate');
    process.env.WORKSPAI_BUNDLED_CLI_ROOT = root;
    delete process.env.WORKSPAI_ALLOW_LOCAL_CLI_CANDIDATE;

    expect(() => resolveBundledCliRuntime()).toThrowError(BundledCliRuntimeError);

    process.env.WORKSPAI_ALLOW_LOCAL_CLI_CANDIDATE = '1';
    resetBundledCliRuntimeForTests();
    expect(resolveBundledCliRuntime()).toMatchObject({
      root,
      version: '999.0.0',
      channel: 'local-candidate',
      distribution: 'development-host',
    });
  });

  it('accepts an integrity-bound local VSIX candidate without a development-host flag', () => {
    const root = createRuntimeFixture('999.0.0', 'local-candidate', 'local-vsix');
    process.env.WORKSPAI_BUNDLED_CLI_ROOT = root;
    delete process.env.WORKSPAI_ALLOW_LOCAL_CLI_CANDIDATE;

    expect(resolveBundledCliRuntime()).toMatchObject({
      root,
      version: '999.0.0',
      channel: 'local-candidate',
      distribution: 'local-vsix',
    });
  });

  it('fails closed when a declared runtime file changes', () => {
    const root = createRuntimeFixture();
    fs.appendFileSync(path.join(root, 'dist', 'index.mjs'), 'tampered\n');
    process.env.WORKSPAI_BUNDLED_CLI_ROOT = root;

    expect(() => resolveBundledCliRuntime()).toThrowError(BundledCliRuntimeError);
    try {
      resolveBundledCliRuntime();
    } catch (error) {
      expect(error).toMatchObject({ code: 'runtime-corrupt' });
    }
  });

  it('rejects a runtime version that differs from the verified CLI contract', () => {
    const root = createRuntimeFixture('0.0.0');
    process.env.WORKSPAI_BUNDLED_CLI_ROOT = root;

    expect(() => resolveBundledCliRuntime()).toThrowError(BundledCliRuntimeError);
    try {
      resolveBundledCliRuntime();
    } catch (error) {
      expect(error).toMatchObject({ code: 'runtime-incompatible' });
    }
  });

  it('reports an explicitly configured missing runtime instead of falling back to npm', () => {
    process.env.WORKSPAI_BUNDLED_CLI_ROOT = path.join(os.tmpdir(), 'missing-workspai-runtime');

    expect(() => resolveBundledCliRuntime()).toThrowError(BundledCliRuntimeError);
    try {
      resolveBundledCliRuntime();
    } catch (error) {
      expect(error).toMatchObject({ code: 'runtime-missing' });
    }
  });
});
