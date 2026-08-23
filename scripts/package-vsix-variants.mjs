#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runVSCE } from './vsce-package-runner.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionPackage = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')
);
const receiptPath = path.join(repositoryRoot, '.workspai-cli-local.json');
const args = process.argv.slice(2);
const releaseOnly = args.includes('--release-only');
const localOnly = args.includes('--local-only');

if (releaseOnly && localOnly) {
  throw new Error('Choose either --release-only or --local-only, not both.');
}

function cliArgument() {
  const index = args.indexOf('--cli');
  return index >= 0 ? (args[index + 1] ?? '') : '';
}

function runNode(scriptArgs, env = process.env) {
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: repositoryRoot,
    env,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${scriptArgs.join(' ')} failed with exit code ${String(result.status)}.`);
  }
}

function listJsonFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith('.json') ? [absolutePath] : [];
  });
}

function snapshotContractMirrors() {
  const roots = [
    path.join(repositoryRoot, 'contracts'),
    path.join(repositoryRoot, 'src', 'contracts'),
  ];
  const files = new Map();
  for (const root of roots) {
    for (const filePath of listJsonFiles(root)) {
      files.set(filePath, fs.readFileSync(filePath));
    }
  }
  return { roots, files };
}

function restoreContractMirrors(snapshot) {
  for (const root of snapshot.roots) {
    for (const filePath of listJsonFiles(root)) {
      if (!snapshot.files.has(filePath)) {
        fs.rmSync(filePath, { force: true });
      }
    }
  }
  for (const [filePath, content] of snapshot.files) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
}

function withPinnedReleaseContracts(action) {
  const snapshot = snapshotContractMirrors();
  try {
    runNode(['scripts/sync-import-stack-parity-snapshot.mjs', '--release-package']);
    action();
  } finally {
    restoreContractMirrors(snapshot);
  }
}

function packageArtifact({ channel, output, cliVersion }) {
  const environment = {
    ...process.env,
    WORKSPAI_VSIX_CHANNEL: channel,
    ...(channel === 'local-candidate' ? { WORKSPAI_LOCAL_CLI_DISTRIBUTION: 'local-vsix' } : {}),
  };
  const status = runVSCE(['package', '--no-dependencies', '--out', output], {
    cwd: repositoryRoot,
    env: environment,
  });
  if (status !== 0) {
    throw new Error(`${channel} VSIX packaging failed with exit code ${String(status)}.`);
  }

  const inspectArgs = [
    'scripts/inspect-vsix-artifact.mjs',
    '--artifact',
    output,
    '--channel',
    channel,
  ];
  if (cliVersion) {
    inspectArgs.push('--cli-version', cliVersion);
  }
  runNode(inspectArgs, environment);
  console.log(`Created ${channel} VSIX: ${output}`);
}

function packageRelease() {
  withPinnedReleaseContracts(() => {
    packageArtifact({
      channel: 'release',
      output: `rapidkit-vscode-${extensionPackage.version}.vsix`,
    });
  });
}

function packageLocal() {
  const syncArgs = ['scripts/sync-local-cli-candidate.mjs'];
  const requestedCli = cliArgument();
  if (requestedCli) {
    syncArgs.push('--cli', requestedCli);
  }
  runNode(syncArgs);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const cliVersion = String(receipt.cliVersion ?? 'unknown');
  const safeCliVersion = cliVersion.replace(/[^0-9A-Za-z.-]+/g, '-');
  try {
    packageArtifact({
      channel: 'local-candidate',
      cliVersion,
      output: `rapidkit-vscode-${extensionPackage.version}-local-cli-${safeCliVersion}.vsix`,
    });
  } finally {
    // The packaged copy keeps its explicit local-vsix authorization. Restore
    // the ordinary development-host runtime so F5 and check:cli-local retain
    // their narrower authorization contract even when packaging fails.
    runNode(['scripts/build-bundled-cli-runtime.mjs']);
  }
}

if (localOnly) {
  packageLocal();
} else if (releaseOnly) {
  packageRelease();
} else {
  const failures = [];
  try {
    packageRelease();
  } catch (error) {
    failures.push(error);
    console.error(`Release VSIX failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    packageLocal();
  } catch (error) {
    failures.push(error);
    console.error(`Local VSIX failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'One or more VSIX variants failed to package.');
  }
}
