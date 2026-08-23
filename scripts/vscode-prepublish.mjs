#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const channel = process.env.WORKSPAI_VSIX_CHANNEL?.trim() || 'release';
if (channel !== 'release' && channel !== 'local-candidate') {
  throw new Error(`Unsupported VSIX build channel: ${channel}`);
}

const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const buildScript = channel === 'release' ? 'build:release' : 'build';
const result = spawnSync(corepack, ['npm', 'run', buildScript], {
  env: process.env,
  encoding: 'utf8',
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`${buildScript} failed with exit code ${String(result.status)}.`);
}
