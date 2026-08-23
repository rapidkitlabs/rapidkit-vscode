#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(repoRoot, 'dist', 'workspai-runtime');
const manifestPath = path.join(runtimeRoot, 'manifest.json');
const releasePolicyPath = path.join(repoRoot, 'contracts', 'extension-cli-release-policy.v1.json');
const packagePath = path.join(repoRoot, 'package.json');
const localCandidateConfigPath = path.join(repoRoot, '.workspai-cli-local.json');
const checkOnly = process.argv.includes('--check');
const releaseOnly = process.argv.includes('--release');
const runtimeLauncherPath = path.join(runtimeRoot, 'launcher.cjs');
const terminalBinRoot = path.join(runtimeRoot, 'terminal-bin');

const RUNTIME_LAUNCHER_SOURCE = `'use strict';

// Commander auto-detects packaged Electron and otherwise treats argv[1] as the
// first user command. Workspai is running as a Node CLI here, so preserve the
// ordinary Node argv contract even when VS Code is the executable host.
if (process.versions.electron && !process.defaultApp) {
  Object.defineProperty(process, 'defaultApp', {
    value: true,
    configurable: true,
  });
}

void import('./dist/index.mjs').catch((error) => {
  process.stderr.write(
    \`Workspai embedded runtime failed: \${error instanceof Error ? error.message : String(error)}\\n\`
  );
  process.exitCode = 1;
});
`;

function terminalLauncherSources(channel) {
  return {
    posix: `#!/bin/sh
set -eu
if [ -z "\${WORKSPAI_EXTENSION_NODE:-}" ]; then
  echo "Workspai terminal runtime is unavailable. Reload the extension window and retry." >&2
  exit 1
fi
if [ -z "\${WORKSPAI_EXTENSION_CLI_ENTRY:-}" ]; then
  echo "Workspai terminal entry is unavailable. Reload the extension window and retry." >&2
  exit 1
fi
ELECTRON_RUN_AS_NODE=1 WORKSPAI_EXTENSION_RUNTIME=1 WORKSPAI_CLI_RUNTIME_CHANNEL=${channel} \\
  exec "$WORKSPAI_EXTENSION_NODE" "$WORKSPAI_EXTENSION_CLI_ENTRY" "$@"
`,
    windows: `@echo off\r
setlocal\r
if not defined WORKSPAI_EXTENSION_NODE (\r
  echo Workspai terminal runtime is unavailable. Reload the extension window and retry. 1>&2\r
  exit /b 1\r
)\r
if not defined WORKSPAI_EXTENSION_CLI_ENTRY (\r
  echo Workspai terminal entry is unavailable. Reload the extension window and retry. 1>&2\r
  exit /b 1\r
)\r
set "ELECTRON_RUN_AS_NODE=1"\r
set "WORKSPAI_EXTENSION_RUNTIME=1"\r
set "WORKSPAI_CLI_RUNTIME_CHANNEL=${channel}"\r
"%WORKSPAI_EXTENSION_NODE%" "%WORKSPAI_EXTENSION_CLI_ENTRY%" %*\r
exit /b %ERRORLEVEL%\r
`,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listFiles(root, directory = root) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(root, absolutePath));
    } else if (entry.isFile()) {
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      if (relativePath !== 'manifest.json') {
        result.push(relativePath);
      }
    }
  }
  return result.sort((left, right) => left.localeCompare(right));
}

function parseVersion(value, label) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value));
  if (!match) {
    throw new Error(`${label} must be a valid semantic version, got ${String(value)}.`);
  }
  return {
    value: String(value),
    parts: match.slice(1, 4).map((part) => Number(part)),
    prerelease: match[4] ?? '',
  };
}

function versionAtLeast(candidate, minimum) {
  const left = parseVersion(candidate, 'Local CLI version');
  const right = parseVersion(minimum, 'Minimum CLI version');
  for (let index = 0; index < left.parts.length; index += 1) {
    if (left.parts[index] !== right.parts[index]) {
      return left.parts[index] > right.parts[index];
    }
  }
  if (left.prerelease && !right.prerelease) {
    return false;
  }
  return true;
}

function readLocalCandidateConfig() {
  if (releaseOnly) {
    return null;
  }
  const environmentPath = process.env.WORKSPAI_CLI_PACKAGE_PATH?.trim();
  if (environmentPath) {
    return { cliPackagePath: path.resolve(environmentPath), source: 'environment' };
  }
  if (!fs.existsSync(localCandidateConfigPath)) {
    return null;
  }
  const config = readJson(localCandidateConfigPath);
  if (
    config.schemaVersion !== 'workspai-vscode-local-cli-candidate.v1' ||
    typeof config.cliPackagePath !== 'string' ||
    !path.isAbsolute(config.cliPackagePath)
  ) {
    throw new Error(
      'The local CLI candidate receipt is invalid. Run npm run sync:cli-local again.'
    );
  }
  return { cliPackagePath: path.resolve(config.cliPackagePath), source: 'receipt' };
}

function runtimeDescriptor() {
  const extensionPackage = readJson(packagePath);
  const releasePolicy = readJson(releasePolicyPath);
  const localCandidate = readLocalCandidateConfig();
  if (localCandidate) {
    const sourcePackagePath = path.join(localCandidate.cliPackagePath, 'package.json');
    if (!fs.existsSync(sourcePackagePath)) {
      throw new Error(
        'The configured local Workspai CLI checkout is unavailable. Run npm run clear:cli-local or sync it again.'
      );
    }
    const sourcePackage = readJson(sourcePackagePath);
    if (sourcePackage.name !== 'workspai') {
      throw new Error(
        `Local CLI candidate must identify package workspai, got ${String(sourcePackage.name)}.`
      );
    }
    if (!versionAtLeast(sourcePackage.version, releasePolicy.minimumCliVersion)) {
      throw new Error(
        `Local CLI candidate ${String(sourcePackage.version)} is older than the extension minimum ` +
          `${String(releasePolicy.minimumCliVersion)}.`
      );
    }
    return {
      sourceRoot: localCandidate.cliPackagePath,
      version: sourcePackage.version,
      channel: 'local-candidate',
      distribution:
        process.env.WORKSPAI_LOCAL_CLI_DISTRIBUTION === 'local-vsix'
          ? 'local-vsix'
          : 'development-host',
    };
  }
  const declaredVersion = extensionPackage.devDependencies?.workspai;
  if (declaredVersion !== releasePolicy.verifiedCliVersion) {
    throw new Error(
      `Bundled CLI dependency ${String(declaredVersion)} must exactly match verified CLI ` +
        `${String(releasePolicy.verifiedCliVersion)}.`
    );
  }
  return {
    sourceRoot: path.join(repoRoot, 'node_modules', 'workspai'),
    version: releasePolicy.verifiedCliVersion,
    channel: 'release',
    distribution: 'release',
  };
}

function resolveDependencyRoot(packageName, parentRoot) {
  let current = parentRoot;
  while (current !== path.dirname(current)) {
    const candidate = path.join(current, 'node_modules', ...packageName.split('/'));
    const manifestPath = path.join(candidate, 'package.json');
    if (fs.existsSync(manifestPath) && readJson(manifestPath).name === packageName) {
      return candidate;
    }
    current = path.dirname(current);
  }
  throw new Error(`Could not resolve package metadata for bundled dependency ${packageName}.`);
}

function writeThirdPartyNotices(sourceRoot) {
  const queue = Object.keys({
    ...(readJson(path.join(sourceRoot, 'package.json')).dependencies ?? {}),
    ...(readJson(path.join(sourceRoot, 'package.json')).optionalDependencies ?? {}),
  }).map((name) => ({ name, parentRoot: sourceRoot }));
  const packages = [];
  const seen = new Set();

  while (queue.length > 0) {
    const item = queue.shift();
    let dependencyRoot;
    try {
      dependencyRoot = resolveDependencyRoot(item.name, item.parentRoot);
    } catch (error) {
      if (
        (readJson(path.join(item.parentRoot, 'package.json')).optionalDependencies ?? {})[item.name]
      ) {
        continue;
      }
      throw error;
    }
    const manifest = readJson(path.join(dependencyRoot, 'package.json'));
    const identity = `${manifest.name}@${manifest.version}`;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);

    const licenseFile = fs
      .readdirSync(dependencyRoot)
      .find((file) => /^(license|licence|copying)(\.[a-z0-9]+)?$/i.test(file));
    const noticeName = identity.replace(/[^a-zA-Z0-9._-]+/g, '_');
    let bundledLicense;
    if (licenseFile) {
      bundledLicense = `licenses/${noticeName}.txt`;
      fs.mkdirSync(path.join(runtimeRoot, 'licenses'), { recursive: true });
      fs.copyFileSync(
        path.join(dependencyRoot, licenseFile),
        path.join(runtimeRoot, bundledLicense)
      );
    }
    packages.push({
      name: manifest.name,
      version: manifest.version,
      license: manifest.license ?? 'UNKNOWN',
      repository:
        typeof manifest.repository === 'string'
          ? manifest.repository
          : (manifest.repository?.url ?? undefined),
      bundledLicense,
    });

    const children = {
      ...(manifest.dependencies ?? {}),
      ...(manifest.optionalDependencies ?? {}),
    };
    for (const child of Object.keys(children)) {
      queue.push({ name: child, parentRoot: dependencyRoot });
    }
  }

  packages.sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`)
  );
  fs.writeFileSync(
    path.join(runtimeRoot, 'THIRD_PARTY_NOTICES.json'),
    `${JSON.stringify(
      {
        schemaVersion: 'workspai-vscode-third-party-notices.v1',
        generatedFrom: `workspai@${readJson(path.join(sourceRoot, 'package.json')).version}`,
        packages,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

function validateRuntime(version, channel, distribution) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Bundled CLI manifest is missing: ${manifestPath}`);
  }
  const manifest = readJson(manifestPath);
  if (manifest.schemaVersion !== 'workspai-vscode-bundled-cli-runtime.v1') {
    throw new Error('Bundled CLI manifest schema is incompatible.');
  }
  if (manifest.channel !== channel) {
    throw new Error(
      `Bundled CLI runtime channel is ${String(manifest.channel)}; expected ${channel}.`
    );
  }
  if (manifest.distribution !== distribution) {
    throw new Error(
      `Bundled CLI runtime distribution is ${String(
        manifest.distribution
      )}; expected ${distribution}.`
    );
  }
  if (manifest.cli?.name !== 'workspai' || manifest.cli?.version !== version) {
    throw new Error(
      `Bundled CLI manifest identifies ${String(manifest.cli?.name)}@${String(
        manifest.cli?.version
      )}; expected workspai@${version}.`
    );
  }
  if (manifest.terminal?.bin !== 'terminal-bin' || manifest.terminal?.command !== 'workspai') {
    throw new Error('Bundled CLI terminal launcher contract is incompatible.');
  }
  const declaredFiles = Array.isArray(manifest.files) ? manifest.files : [];
  const actualFiles = listFiles(runtimeRoot);
  const declaredPaths = declaredFiles
    .map((entry) => entry.path)
    .sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(declaredPaths) !== JSON.stringify(actualFiles)) {
    throw new Error('Bundled CLI runtime file inventory drifted from its integrity manifest.');
  }
  for (const terminalLauncher of ['terminal-bin/workspai', 'terminal-bin/workspai.cmd']) {
    if (!declaredPaths.includes(terminalLauncher)) {
      throw new Error(`Bundled CLI terminal launcher is missing: ${terminalLauncher}`);
    }
  }
  for (const entry of declaredFiles) {
    const filePath = path.resolve(runtimeRoot, entry.path);
    const relative = path.relative(runtimeRoot, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Bundled CLI manifest path escapes the runtime: ${entry.path}`);
    }
    const stat = fs.statSync(filePath);
    if (stat.size !== entry.size || sha256(filePath) !== entry.sha256) {
      throw new Error(`Bundled CLI runtime integrity check failed for ${entry.path}.`);
    }
  }
  return manifest;
}

async function buildRuntime({ sourceRoot, version, channel, distribution }) {
  const sourcePackagePath = path.join(sourceRoot, 'package.json');
  const sourceEntry = path.join(sourceRoot, 'dist', 'index.js');
  if (!fs.existsSync(sourcePackagePath) || !fs.existsSync(sourceEntry)) {
    throw new Error(
      'The exact Workspai CLI development dependency is unavailable. Run npm install first.'
    );
  }
  const sourcePackage = readJson(sourcePackagePath);
  if (sourcePackage.name !== 'workspai' || sourcePackage.version !== version) {
    throw new Error(
      `Installed CLI is ${String(sourcePackage.name)}@${String(
        sourcePackage.version
      )}; expected workspai@${version}.`
    );
  }

  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(runtimeRoot, 'dist'), { recursive: true });

  await esbuild.build({
    entryPoints: [sourceEntry],
    outfile: path.join(runtimeRoot, 'dist', 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    legalComments: 'none',
    sourcemap: false,
    banner: {
      js: "import { createRequire as __workspaiCreateRequire } from 'node:module'; const require = __workspaiCreateRequire(import.meta.url);",
    },
  });

  fs.writeFileSync(runtimeLauncherPath, RUNTIME_LAUNCHER_SOURCE, 'utf8');
  fs.mkdirSync(terminalBinRoot, { recursive: true });
  const terminalLaunchers = terminalLauncherSources(channel);
  fs.writeFileSync(path.join(terminalBinRoot, 'workspai'), terminalLaunchers.posix, {
    encoding: 'utf8',
    mode: 0o755,
  });
  fs.writeFileSync(path.join(terminalBinRoot, 'workspai.cmd'), terminalLaunchers.windows, 'utf8');

  const runtimePackage = {
    name: 'workspai-embedded-runtime',
    version,
    private: true,
    type: 'module',
    license: sourcePackage.license,
    sourcePackage: `workspai@${version}`,
  };
  fs.writeFileSync(
    path.join(runtimeRoot, 'package.json'),
    `${JSON.stringify(runtimePackage, null, 2)}\n`,
    'utf8'
  );

  for (const assetDirectory of ['contracts', 'templates', 'data']) {
    const source = path.join(sourceRoot, assetDirectory);
    if (fs.existsSync(source)) {
      fs.cpSync(source, path.join(runtimeRoot, assetDirectory), { recursive: true });
    }
  }
  for (const assetFile of [
    'LICENSE',
    'workspai.config.example.cjs',
    'rapidkit.config.example.cjs',
  ]) {
    const source = path.join(sourceRoot, assetFile);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(runtimeRoot, assetFile));
    }
  }

  writeThirdPartyNotices(sourceRoot);

  const files = listFiles(runtimeRoot).map((relativePath) => {
    const filePath = path.join(runtimeRoot, relativePath);
    const stat = fs.statSync(filePath);
    return {
      path: relativePath,
      size: stat.size,
      sha256: sha256(filePath),
    };
  });
  const manifest = {
    schemaVersion: 'workspai-vscode-bundled-cli-runtime.v1',
    channel,
    distribution,
    cli: { name: 'workspai', version },
    entry: 'launcher.cjs',
    terminal: { bin: 'terminal-bin', command: 'workspai' },
    integrity: 'sha256',
    files,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

const descriptor = runtimeDescriptor();
if (!checkOnly) {
  await buildRuntime(descriptor);
}
const manifest = validateRuntime(descriptor.version, descriptor.channel, descriptor.distribution);
console.log(
  `Bundled Workspai CLI runtime ${manifest.cli.version} (${manifest.channel}) verified ` +
    `(${manifest.files.length} files).`
);
