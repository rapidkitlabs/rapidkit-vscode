import { describe, expect, it } from 'vitest';

import { buildVerifyPackPlan, toVerifyPackCommandStrings } from '../core/verifyPackProfiles';

describe('verifyPackProfiles', () => {
  it('builds a python verify plan for fastapi projects', () => {
    const plan = buildVerifyPackPlan({
      projectType: 'fastapi.ddd',
      projectPath: '/workspace/services/orders-api',
    });

    expect(plan.profileId).toBe('python-backend');
    expect(plan.confidence).toBe('high');
    expect(plan.commands.map((item) => item.phase)).toEqual([
      'health',
      'lint',
      'typecheck',
      'test',
      'build',
      'smoke',
    ]);
    expect(toVerifyPackCommandStrings(plan)).toContain('pytest -q');
  });

  it('builds a node verify plan and respects pnpm package manager hint', () => {
    const plan = buildVerifyPackPlan({
      projectType: 'nestjs.pnpm',
      projectPath: '/workspace/apps/api-gateway',
    });

    expect(plan.profileId).toBe('node-backend');
    expect(plan.commands[1]).toMatchObject({
      phase: 'lint',
      command: 'pnpm',
      args: ['run', 'lint'],
    });
    expect(toVerifyPackCommandStrings(plan)).toContain('pnpm run typecheck');
  });

  it('returns generic fallback plan for unknown stacks', () => {
    const plan = buildVerifyPackPlan({
      projectType: 'unknown-kit',
      projectPath: '/workspace/legacy-service',
    });

    expect(plan.profileId).toBe('generic-backend');
    expect(plan.confidence).toBe('low');
    expect(plan.commands.map((item) => item.phase)).toEqual(['health', 'test', 'smoke']);
    expect(toVerifyPackCommandStrings(plan, 2)).toEqual(['rapidkit doctor', 'rapidkit doctor']);
  });
});
