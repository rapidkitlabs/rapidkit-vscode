#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receiptPath = path.join(extensionRoot, '.workspai-cli-local.json');
const args = process.argv.slice(2);
const clearOnly = args.includes('--clear');
const checkOnly = args.includes('--check');

function fail(message) {
  throw new Error(`[sync-cli-local] ${message}`);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? extensionRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    fail(`${command} ${commandArgs.join(' ')} exited with ${String(result.status)}.`);
  }
}

function requestedCliPath() {
  const cliFlagIndex = args.indexOf('--cli');
  if (cliFlagIndex >= 0) {
    return args[cliFlagIndex + 1] ?? '';
  }
  const positional = args.find((arg) => !arg.startsWith('--'));
  return positional ?? process.env.WORKSPAI_CLI_PACKAGE_PATH ?? '';
}

function resolveCliRoot() {
  const requested = requestedCliPath();
  const candidate = requested
    ? path.resolve(extensionRoot, requested)
    : path.resolve(extensionRoot, '..', 'workspai', 'packages', 'cli');
  if (!fs.existsSync(candidate)) {
    fail(
      `Workspai CLI package was not found at ${candidate}. Pass --cli /path/to/workspai/packages/cli.`
    );
  }
  return fs.realpathSync(candidate);
}

function readPackage(cliRoot) {
  const packagePath = path.join(cliRoot, 'package.json');
  if (!fs.existsSync(packagePath)) {
    fail(`CLI package manifest is missing: ${packagePath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (manifest.name !== 'workspai' || typeof manifest.version !== 'string') {
    fail(`Expected the workspai package, got ${String(manifest.name)}.`);
  }
  return manifest;
}

function writeReceipt(cliRoot, version) {
  const temporaryPath = `${receiptPath}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(
      {
        schemaVersion: 'workspai-vscode-local-cli-candidate.v1',
        cliPackagePath: cliRoot,
        cliVersion: version,
      },
      null,
      2
    )}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
  fs.renameSync(temporaryPath, receiptPath);
}

if (clearOnly) {
  fs.rmSync(receiptPath, { force: true });
  run(process.execPath, ['scripts/build-bundled-cli-runtime.mjs', '--release']);
  console.log('Local CLI candidate cleared; the verified release runtime is active.');
  process.exit(0);
}

const cliRoot = resolveCliRoot();
const cliPackage = readPackage(cliRoot);
const previousReceipt = fs.existsSync(receiptPath) ? fs.readFileSync(receiptPath) : null;
const environment = {
  ...process.env,
  WORKSPAI_CLI_PACKAGE_PATH: cliRoot,
  WORKSPAI_CLI_REPO_PATH: cliRoot,
  WORKSPAI_ALLOW_LOCAL_CLI_CANDIDATE: '1',
};

if (checkOnly) {
  if (!fs.existsSync(receiptPath)) {
    fail('Local CLI candidate receipt is missing. Run npm run sync:cli-local first.');
  }
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  if (receipt.cliPackagePath !== cliRoot || receipt.cliVersion !== cliPackage.version) {
    fail('Local CLI candidate receipt does not match the requested checkout. Sync it again.');
  }
  run(process.execPath, ['scripts/sync-import-stack-parity-snapshot.mjs', '--check'], {
    env: environment,
  });
  run(process.execPath, ['scripts/build-bundled-cli-runtime.mjs', '--check'], {
    env: environment,
  });
  console.log(`Local Workspai CLI candidate ${cliPackage.version} is synchronized.`);
  process.exit(0);
}

const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
run(corepack, ['npm', 'run', 'build'], { cwd: cliRoot, env: environment });
run(process.execPath, ['scripts/sync-import-stack-parity-snapshot.mjs'], {
  env: environment,
});
writeReceipt(cliRoot, cliPackage.version);

try {
  run(process.execPath, ['scripts/build-bundled-cli-runtime.mjs'], {
    env: environment,
  });
} catch (error) {
  if (previousReceipt) {
    fs.writeFileSync(receiptPath, previousReceipt, { mode: 0o600 });
  } else {
    fs.rmSync(receiptPath, { force: true });
  }
  throw error;
}

console.log(
  `Local Workspai CLI ${cliPackage.version} is active for extension development. ` +
    'F5 launch configurations explicitly allow this candidate; release builds ignore it.'
);
