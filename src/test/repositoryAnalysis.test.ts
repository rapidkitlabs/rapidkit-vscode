import { describe, expect, it } from 'vitest';

import { deriveRepositoryInsights, normalizePublicRepositoryUrl } from '../core/repositoryAnalysis';

describe('repository analysis URL boundary', () => {
  it('normalizes supported public repository roots', () => {
    expect(normalizePublicRepositoryUrl('https://github.com/chistiq/workspai')).toEqual({
      url: 'https://github.com/chistiq/workspai.git',
      host: 'github.com',
      owner: 'chistiq',
      name: 'workspai',
    });
    expect(normalizePublicRepositoryUrl('https://gitlab.com/group/repo.git/').url).toBe(
      'https://gitlab.com/group/repo.git'
    );
    expect(normalizePublicRepositoryUrl('https://gitlab.com/group/platform/repo').owner).toBe(
      'group/platform'
    );
  });

  it.each([
    'http://github.com/chistiq/workspai',
    'https://token@github.com/chistiq/workspai',
    'https://localhost/chistiq/workspai',
    'https://github.com/chistiq/workspai/issues/1',
    'https://github.com/chistiq/workspai?token=secret',
    'git@github.com:chistiq/workspai.git',
  ])('rejects unsafe or non-root input: %s', (value) => {
    expect(() => normalizePublicRepositoryUrl(value)).toThrow();
  });
});

describe('repository analysis decision support', () => {
  const graph = {
    quality: { portable: true, entityProofCoverageRatio: 0.92 },
    total: { entities: 80, relations: 100, proofs: 90 },
  } as Parameters<typeof deriveRepositoryInsights>[0]['graph'];
  const doctor = {
    canonical: true,
    verdict: 'passed',
    blockers: [],
    advisories: [],
    affectedProjectNames: [],
    findings: [],
    counts: {
      projectsScanned: 1,
      affectedProjects: 0,
      blockingCauses: 0,
      advisoryFindings: 0,
      unknownFindings: 0,
      repairableFindings: 0,
    },
  } as Parameters<typeof deriveRepositoryInsights>[0]['doctor'];

  it('keeps remote execution unverified even with portable evidence and lifecycle capabilities', () => {
    const result = deriveRepositoryInsights({
      model: {
        projects: [
          {
            commands: { supported: ['npm test', 'npm run build'] },
            governance: {
              ci: { status: 'repository' },
              release: { status: 'repository' },
              ownership: { status: 'repository' },
            },
          },
        ],
      },
      doctor,
      graph,
      readinessStatus: 'passed',
      failedStages: 0,
      connected: [{ id: 'api', label: 'API', kind: 'service', connections: 18 }],
    });

    expect(result.webAgent.verdict).toBe('conditional');
    expect(result.delivery).toMatchObject({ verdict: 'ready', ciProjects: 1 });
    expect(result.changeSurface).toMatchObject({ verdict: 'concentrated', hotspotCount: 1 });
    expect(result.security.verdict).toBe('unknown');
  });

  it('does not convert a Doctor security finding into a clean security claim', () => {
    const result = deriveRepositoryInsights({
      model: { projects: [] },
      doctor: {
        ...doctor,
        verdict: 'blocked',
        findings: [
          {
            id: 'dependency-audit',
            symptom: 'A dependency vulnerability was reported',
            status: 'blocking',
            issueClass: 'security',
          },
        ],
        counts: { ...doctor.counts, blockingCauses: 1 },
      },
      graph,
      readinessStatus: 'blocked',
      failedStages: 0,
      connected: [],
    });

    expect(result.webAgent.verdict).toBe('blocked');
    expect(result.security).toMatchObject({ verdict: 'attention', findingCount: 1 });
    expect(result.security.claimBoundary).toContain('not a substitute');
  });

  it('retains a blocked intelligence gate even when Doctor has no blocker', () => {
    const result = deriveRepositoryInsights({
      model: { projects: [] },
      doctor,
      graph,
      readinessStatus: 'blocked',
      failedStages: 0,
      connected: [],
    });
    expect(result.webAgent.verdict).toBe('blocked');
    expect(result.webAgent.gaps).toContain('The intelligence gate has not passed');
    expect(result.security.verdict).toBe('unknown');
  });

  it('does not count unobserved declarations or arbitrary statuses as observed delivery controls', () => {
    const result = deriveRepositoryInsights({
      model: {
        projects: [
          {
            governance: {
              ci: { status: 'external-declared' },
              release: { status: 'invented' },
              ownership: { status: 'unknown' },
            },
          },
        ],
      },
      doctor,
      graph,
      readinessStatus: 'passed',
      failedStages: 0,
      connected: [],
    });
    expect(result.delivery).toMatchObject({
      ciProjects: 0,
      releaseProjects: 0,
      ownershipProjects: 0,
      verdict: 'unknown',
    });
  });
});
