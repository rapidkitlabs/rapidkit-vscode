#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, 'src');

const DEFAULT_BUDGET = {
  maxProductionAny: 185,
  maxVoidError: 0,
  maxExplicitAnySuppressions: 4,
};

function walkTsFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'test') {
        continue;
      }
      out.push(...walkTsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.ts')) {
      out.push(fullPath);
    }
  }

  return out;
}

function countMatches(content, regex) {
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

function toRelative(p) {
  return path.relative(projectRoot, p).replace(/\\/g, '/');
}

function run() {
  if (!fs.existsSync(srcRoot)) {
    console.error('[stabilization-debt-budget] src/ directory not found.');
    process.exit(2);
  }

  const files = walkTsFiles(srcRoot);

  let productionAny = 0;
  let voidError = 0;
  let explicitAnySuppressions = 0;

  const topAnyFiles = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');

    const anyInFile = countMatches(content, /\bany\b/g);
    if (anyInFile > 0) {
      topAnyFiles.push({ filePath: toRelative(filePath), count: anyInFile });
      productionAny += anyInFile;
    }

    voidError += countMatches(content, /\bvoid\s+error\s*;/g);
    explicitAnySuppressions += countMatches(
      content,
      /eslint-disable-next-line\s+@typescript-eslint\/no-explicit-any/g
    );
  }

  topAnyFiles.sort((a, b) => b.count - a.count);

  const failures = [];
  if (productionAny > DEFAULT_BUDGET.maxProductionAny) {
    failures.push(
      `production any count ${productionAny} exceeds budget ${DEFAULT_BUDGET.maxProductionAny}`
    );
  }
  if (voidError > DEFAULT_BUDGET.maxVoidError) {
    failures.push(`silent catch marker "void error;" count ${voidError} exceeds budget 0`);
  }
  if (explicitAnySuppressions > DEFAULT_BUDGET.maxExplicitAnySuppressions) {
    failures.push(
      `no-explicit-any suppression count ${explicitAnySuppressions} exceeds budget ${DEFAULT_BUDGET.maxExplicitAnySuppressions}`
    );
  }

  console.log('[stabilization-debt-budget] summary');
  console.log(`- productionAny: ${productionAny}`);
  console.log(`- voidError: ${voidError}`);
  console.log(`- explicitAnySuppressions: ${explicitAnySuppressions}`);

  console.log('[stabilization-debt-budget] top any files');
  for (const row of topAnyFiles.slice(0, 10)) {
    console.log(`- ${row.filePath}: ${row.count}`);
  }

  if (failures.length > 0) {
    console.error('[stabilization-debt-budget] FAILED');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('[stabilization-debt-budget] PASSED');
}

run();
