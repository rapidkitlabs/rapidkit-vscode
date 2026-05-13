import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { WorkspaceMemoryService } from '../core/workspaceMemoryService';

describe('workspaceMemoryService', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-memory-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('sanitizes invalid memory schema and self-heals file content', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-schema');
    const memoryDir = path.join(wsPath, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      memoryPath,
      JSON.stringify(
        {
          context: '  Orders workspace  ',
          conventions: ['  Use ports/adapters  ', '', 42],
          decisions: ['  PostgreSQL over MongoDB  ', null],
          lastUpdated: 'invalid-date',
        },
        null,
        2
      )
    );

    const parsed = await svc.read(wsPath);

    expect(parsed.context).toBe('Orders workspace');
    expect(parsed.conventions).toEqual(['Use ports/adapters']);
    expect(parsed.decisions).toEqual(['PostgreSQL over MongoDB']);
    expect(parsed.lastUpdated).toBe('');

    const healed = JSON.parse(fs.readFileSync(memoryPath, 'utf8')) as {
      context: string;
      conventions: string[];
      decisions: string[];
      lastUpdated: string;
    };

    expect(healed.context).toBe('Orders workspace');
    expect(healed.conventions).toEqual(['Use ports/adapters']);
    expect(healed.decisions).toEqual(['PostgreSQL over MongoDB']);
    expect(healed.lastUpdated).not.toBe('');
    expect(Number.isNaN(Date.parse(healed.lastUpdated))).toBe(false);
  });

  it('backs up corrupt memory json and repairs file with defaults', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-corrupt');
    const memoryDir = path.join(wsPath, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(memoryPath, '{ invalid json', 'utf8');

    const parsed = await svc.read(wsPath);

    expect(parsed.context).toBe('');
    expect(parsed.conventions).toEqual([]);
    expect(parsed.decisions).toEqual([]);

    const repaired = JSON.parse(fs.readFileSync(memoryPath, 'utf8')) as {
      context: string;
      conventions: string[];
      decisions: string[];
      lastUpdated: string;
    };

    expect(repaired.context).toBe('');
    expect(repaired.conventions).toEqual([]);
    expect(repaired.decisions).toEqual([]);
    expect(repaired.lastUpdated).not.toBe('');

    const backupFiles = fs
      .readdirSync(memoryDir)
      .filter((name) => name.startsWith('workspace-memory.corrupt-') && name.endsWith('.json'));

    expect(backupFiles.length).toBeGreaterThan(0);
  });

  it('reads nearest ancestor memory for nested project paths', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const workspaceRoot = path.join(tempRoot, 'ws-nearest');
    const projectPath = path.join(workspaceRoot, 'services', 'billing-api');
    const memoryDir = path.join(workspaceRoot, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(projectPath, { recursive: true });
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      memoryPath,
      JSON.stringify(
        {
          context: 'Shared workspace memory',
          conventions: ['Always use repository interfaces'],
          decisions: ['Redis for rate limiting'],
          lastUpdated: '2026-04-20T00:00:00.000Z',
        },
        null,
        2
      )
    );

    const resolvedPath = await svc.resolveNearestMemoryPath(projectPath);
    const parsed = await svc.readNearest(projectPath);

    expect(resolvedPath).toBe(memoryPath);
    expect(parsed.context).toBe('Shared workspace memory');
    expect(parsed.conventions).toContain('Always use repository interfaces');
    expect(parsed.decisions).toContain('Redis for rate limiting');
  });

  it('redacts sensitive values from memory before returning and formatting prompt', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-redaction');
    const memoryDir = path.join(wsPath, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      memoryPath,
      JSON.stringify(
        {
          context: 'authorization: Bearer eyJ.long.token',
          conventions: ['api_key=prod-123-secret'],
          decisions: ['password: letmein'],
          lastUpdated: '2026-04-20T00:00:00.000Z',
        },
        null,
        2
      )
    );

    const parsed = await svc.read(wsPath);
    const prompt = svc.formatForPrompt(parsed);

    expect(parsed.context).toContain('[REDACTED]');
    expect(parsed.conventions[0]).toContain('[REDACTED]');
    expect(parsed.decisions[0]).toContain('[REDACTED]');
    expect(prompt).toContain('[REDACTED]');
    expect(prompt).not.toContain('prod-123-secret');
    expect(prompt).not.toContain('letmein');
    expect(prompt).not.toContain('eyJ.long.token');
  });

  it('sanitizes policy profile and derives local processing mode for sensitive repositories', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-policy-derived');
    const memoryDir = path.join(wsPath, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      memoryPath,
      JSON.stringify(
        {
          context: 'Sensitive repo',
          conventions: [],
          decisions: [],
          policyProfile: 'strict',
          sensitivity: 'sensitive',
          lastUpdated: '2026-04-20T00:00:00.000Z',
        },
        null,
        2
      )
    );

    const parsed = await svc.read(wsPath);
    const policy = svc.resolvePolicy(parsed);

    expect(parsed.policyProfile).toBe('strict');
    expect(parsed.sensitivity).toBe('sensitive');
    expect(parsed.localProcessingMode).toBe(true);
    expect(policy).toEqual({
      profile: 'strict',
      sensitivity: 'sensitive',
      localProcessingMode: true,
    });
  });

  it('falls back to balanced policy profile and keeps explicit local-processing override', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-policy-fallback');
    const memoryDir = path.join(wsPath, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      memoryPath,
      JSON.stringify(
        {
          context: 'General repo',
          conventions: [],
          decisions: [],
          policyProfile: 'unsupported-profile',
          sensitivity: 'normal',
          localProcessingMode: true,
          lastUpdated: '2026-04-20T00:00:00.000Z',
        },
        null,
        2
      )
    );

    const parsed = await svc.read(wsPath);

    expect(parsed.policyProfile).toBe('balanced');
    expect(parsed.sensitivity).toBe('normal');
    expect(parsed.localProcessingMode).toBe(true);
    expect(svc.formatForPrompt(parsed)).toContain('Memory policy: balanced');
  });
});
