import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PROJECT_KNOWLEDGE_GRAPH_REFERENCE_SCHEMA_VERSION,
  readProjectKnowledgeGraphReference,
} from '../core/projectKnowledgeGraphReferenceReader.js';
import { PROJECT_KNOWLEDGE_GRAPH_REFERENCE_PATH } from '../core/workspaceIntelligencePaths.js';

const tempDirectories: string[] = [];

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSort);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, stableSort(record[key])])
  );
}

function hashCanonicalJson(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableSort(value)))
    .digest('hex');
}

function reference(projectName = 'api', sourceHash = 'a'.repeat(64)) {
  const payload = {
    schemaVersion: PROJECT_KNOWLEDGE_GRAPH_REFERENCE_SCHEMA_VERSION,
    generatedAt: '2026-08-28T12:00:00.000Z',
    project: { name: projectName },
    canonical: {
      graph: 'workspace:.workspai/reports/workspace-knowledge-graph.json',
      boundedQuery: `workspai workspace graph search <task-query> --scope project:${projectName} --limit 12 --json`,
      sourceHash,
      projectionHash: 'b'.repeat(64),
    },
    summary: { entityCount: 12, relationCount: 9, proofCount: 7 },
  };
  return {
    ...payload,
    integrity: {
      algorithm: 'sha256',
      payloadHash: hashCanonicalJson(payload),
      portable: true,
      absolutePathsEmitted: false,
    },
  };
}

async function projectWithReference(value: unknown): Promise<string> {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-project-graph-ref-'));
  tempDirectories.push(projectPath);
  const artifactPath = path.join(projectPath, PROJECT_KNOWLEDGE_GRAPH_REFERENCE_PATH);
  await fs.ensureDir(path.dirname(artifactPath));
  await fs.writeJson(artifactPath, value);
  return projectPath;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.remove(directory)));
});

describe('project Knowledge Graph reference reader', () => {
  it('accepts a portable reference bound to the selected project and canonical Graph', async () => {
    const value = reference();
    const projectPath = await projectWithReference(value);

    await expect(
      readProjectKnowledgeGraphReference({
        projectPath,
        expectedProjectName: 'api',
        canonicalGraph: { source: { hash: 'a'.repeat(64) } },
      })
    ).resolves.toMatchObject({ kind: 'valid', reference: value });
  });

  it('rejects payload tampering even when the artifact remains structurally valid', async () => {
    const value = reference();
    value.summary.entityCount += 1;
    const projectPath = await projectWithReference(value);

    await expect(readProjectKnowledgeGraphReference({ projectPath })).resolves.toMatchObject({
      kind: 'incompatible',
      error: expect.stringContaining('payload hash'),
    });
  });

  it('rejects a reference stale against the canonical workspace Graph', async () => {
    const projectPath = await projectWithReference(reference());

    await expect(
      readProjectKnowledgeGraphReference({
        projectPath,
        canonicalGraph: { source: { hash: 'c'.repeat(64) } },
      })
    ).resolves.toMatchObject({
      kind: 'incompatible',
      error: expect.stringContaining('stale'),
    });
  });
});
