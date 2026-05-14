import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildIncidentReplayQuery,
  buildLinkSafeExportBundle,
  parseImportedReproBundle,
  toLinkSafePath,
} from '../ui/panels/incidentReproPackUtils';

describe('incidentReproPackUtils', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('converts absolute paths to link-safe paths', () => {
    expect(toLinkSafePath('/tmp/workspace/src/orders/service.ts')).toBe('orders/service.ts');
    expect(toLinkSafePath('src/orders.ts')).toBe('src/orders.ts');
    expect(toLinkSafePath('   ')).toBe('');
  });

  it('builds a replay query with blocked reasons and verification checklist', () => {
    const query = buildIncidentReplayQuery({
      packId: 'repro-001',
      replayPayload: {
        actionType: 'incident-repro-pack',
        riskLevel: 'high',
        likelyFailureMode: 'database migration drift',
        verifyChecklist: ['Run doctor workspace', 'Run targeted API smoke tests'],
        blockedReasons: ['affected scope is incomplete'],
        relatedFiles: ['src/orders/service.ts', 'tests/orders.test.ts'],
      },
    });

    expect(query).toContain(
      'Replay this incident repro pack in Incident Studio using a verify-first flow.'
    );
    expect(query).toContain('Pack ID: repro-001');
    expect(query).toContain('Risk level: high');
    expect(query).toContain('1. Run doctor workspace');
    expect(query).toContain('1. affected scope is incomplete');
    expect(query).toContain('Related files: orders/service.ts, tests/orders.test.ts');
  });

  it('builds a link-safe export bundle with redacted conversation and shortened file paths', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));

    const bundle = buildLinkSafeExportBundle(
      {
        packId: 'repro-002',
        status: 'captured',
        capturedAt: '2026-05-01T09:30:00.000Z',
        workspacePath: '/tmp/company/private-workspace',
        conversationId: 'conv-secret',
        actionId: 'action-77',
        redaction: {
          policy: 'incident-studio-default',
          applied: true,
          redactedFields: ['token'],
        },
        summary: {
          historyTurns: 4,
          hasDoctorEvidence: true,
          hasRollbackEvidence: false,
          hasSandboxEvidence: true,
          hasPredictiveWarning: true,
          verifySuccess: false,
          affectedFilesCount: 3,
          blockedReasonCount: 1,
        },
        replayPayload: {
          workspacePath: '/tmp/company/private-workspace',
          conversationId: 'conv-secret',
          actionType: 'incident-repro-pack',
          riskLevel: 'critical',
          likelyFailureMode: 'token=abc123 leaked in logs',
          verifyChecklist: ['Run doctor workspace', 'Run smoke tests'],
          blockedReasons: ['scope unknown'],
          relatedFiles: [
            '/tmp/company/private-workspace/src/orders/service.ts',
            '/tmp/company/private-workspace/tests/orders/replay.test.ts',
          ],
        },
        exportHint: 'safe handoff',
      },
      'private-workspace'
    );

    expect(bundle).toEqual({
      schema_version: 'incident_repro_pack.v1',
      bundle_type: 'link-safe-payload',
      generated_at: '2026-05-01T10:00:00.000Z',
      source: 'workspai-incident-studio',
      incident_repro_pack: {
        packId: 'repro-002',
        status: 'captured',
        capturedAt: '2026-05-01T09:30:00.000Z',
        schemaVersion: 'v1',
        workspacePath: 'private-workspace',
        conversationId: '[REDACTED]',
        actionId: 'action-77',
        redaction: {
          policy: 'incident-studio-default',
          applied: true,
          redactedFields: ['token', 'workspacePath', 'conversationId'],
        },
        summary: {
          historyTurns: 4,
          hasDoctorEvidence: true,
          hasRollbackEvidence: false,
          hasSandboxEvidence: true,
          hasPredictiveWarning: true,
          verifySuccess: false,
          affectedFilesCount: 3,
          blockedReasonCount: 1,
        },
        replayPayload: {
          workspacePath: 'private-workspace',
          conversationId: '[REDACTED]',
          actionType: 'incident-repro-pack',
          riskLevel: 'critical',
          likelyFailureMode: 'token=abc123 leaked in logs',
          verifyChecklist: ['Run doctor workspace', 'Run smoke tests'],
          blockedReasons: ['scope unknown'],
          relatedFiles: ['orders/service.ts', 'orders/replay.test.ts'],
        },
        exportHint: 'safe handoff',
        sensitivity: {
          label: 'confidential',
          reason: 'Critical-risk replay payload with redacted sensitive fields.',
        },
      },
      replay_entrypoint: {
        pack_id: 'repro-002',
        workspace_hint: 'private-workspace',
        action_type: 'incident-repro-pack',
        risk_level: 'critical',
        sensitivity_label: 'confidential',
        verify_checklist: ['Run doctor workspace', 'Run smoke tests'],
      },
      memory_influence_audit: [],
    });
  });

  it('buildLinkSafeExportBundle: keeps memory influence audit timeline link-safe and artifact-linked', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));

    const bundle = buildLinkSafeExportBundle(
      {
        packId: 'repro-005',
        status: 'captured',
        actionId: 'action-005',
        workspacePath: '/tmp/company/private-workspace',
        replayPayload: {
          workspacePath: '/tmp/company/private-workspace',
          conversationId: 'conv-secret',
          actionType: 'incident-repro-pack',
          riskLevel: 'high',
          verifyChecklist: ['Run doctor workspace'],
          blockedReasons: [],
          relatedFiles: [],
        },
        memoryInfluenceAuditTimeline: [
          {
            memoryEventId: 'memory-action-005-decision',
            timestamp: '2026-05-01T09:59:30.000Z',
            source: 'workspace-memory',
            influenceKind: 'decision',
            summary: 'token=abc123 influenced verify gating',
            policyProfile: 'strict',
            sensitivity: 'sensitive',
            localProcessingMode: true,
            decisionArtifacts: {
              actionId: 'action-005',
              reproPackId: 'repro-005',
              releaseReadinessArtifactId: 'rrc-005',
            },
          },
        ],
      },
      'private-workspace'
    );

    expect(bundle.memory_influence_audit).toEqual([
      {
        memoryEventId: 'memory-action-005-decision',
        timestamp: '2026-05-01T09:59:30.000Z',
        source: 'workspace-memory',
        influenceKind: 'decision',
        summary: 'token=[REDACTED] influenced verify gating',
        policyProfile: 'strict',
        sensitivity: 'sensitive',
        localProcessingMode: true,
        decisionArtifacts: {
          actionId: 'action-005',
          reproPackId: 'repro-005',
          releaseReadinessArtifactId: 'rrc-005',
        },
      },
    ]);
  });

  it('buildLinkSafeExportBundle: redacts bearer and token literals in audit summaries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));

    const bundle = buildLinkSafeExportBundle(
      {
        packId: 'repro-006',
        status: 'captured',
        actionId: 'action-006',
        workspacePath: '/tmp/company/private-workspace',
        replayPayload: {
          workspacePath: '/tmp/company/private-workspace',
          conversationId: 'conv-secret',
          actionType: 'incident-repro-pack',
          riskLevel: 'high',
          verifyChecklist: ['Run doctor workspace'],
          blockedReasons: [],
          relatedFiles: [],
        },
        memoryInfluenceAuditTimeline: [
          {
            memoryEventId: 'memory-action-006-policy',
            timestamp: '2026-05-01T09:59:30.000Z',
            source: 'workspace-memory',
            influenceKind: 'policy',
            summary:
              'authorization: Bearer sk-super-secret-token and github_pat_12345678901234567890123456789012',
            policyProfile: 'strict',
            sensitivity: 'sensitive',
            localProcessingMode: true,
            decisionArtifacts: {
              actionId: 'action-006',
              reproPackId: 'repro-006',
            },
          },
        ],
      },
      'private-workspace'
    );

    expect(bundle.memory_influence_audit[0]?.summary).toContain('[REDACTED]');
    expect(bundle.memory_influence_audit[0]?.summary).not.toContain('sk-super-secret-token');
    expect(bundle.memory_influence_audit[0]?.summary).not.toContain('github_pat_');
    expect(bundle.memory_influence_audit[0]?.summary).not.toContain('Bearer sk-');
  });

  it('buildLinkSafeExportBundle: enforces canonical decision artifact linkage for memory audit entries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));

    const bundle = buildLinkSafeExportBundle(
      {
        packId: 'repro-007',
        status: 'captured',
        actionId: 'action-007',
        workspacePath: '/tmp/company/private-workspace',
        replayPayload: {
          workspacePath: '/tmp/company/private-workspace',
          conversationId: 'conv-secret',
          actionType: 'incident-repro-pack',
          riskLevel: 'high',
          verifyChecklist: ['Run doctor workspace'],
          blockedReasons: [],
          relatedFiles: [],
        },
        memoryInfluenceAuditTimeline: [
          {
            memoryEventId: 'memory-action-007-policy',
            timestamp: '2026-05-01T09:59:30.000Z',
            source: 'incident-replay-learning',
            influenceKind: 'artifact-link',
            summary: 'replay learning updated rollback sequencing',
            policyProfile: 'balanced',
            sensitivity: 'normal',
            localProcessingMode: false,
            decisionArtifacts: {
              actionId: 'some-other-action',
              reproPackId: 'some-other-pack',
              releaseReadinessArtifactId: 'rrc-007',
            },
          },
        ],
      },
      'private-workspace'
    );

    expect(bundle.memory_influence_audit[0]?.decisionArtifacts).toEqual({
      actionId: 'action-007',
      reproPackId: 'repro-007',
      releaseReadinessArtifactId: 'rrc-007',
    });
  });

  it('parses imported snake_case bundles into a replay-ready payload', () => {
    const parsed = parseImportedReproBundle({
      incident_repro_pack: {
        packId: ' imported-001 ',
        replayPayload: {
          workspacePath: ' demo-workspace ',
          actionType: ' incident-repro-pack ',
          riskLevel: 'medium',
          likelyFailureMode: 'cache miss storm',
          verifyChecklist: ['Run smoke suite', '   ', 123],
          blockedReasons: ['missing impacted tests', null],
          relatedFiles: ['src/cache.ts', '', 'src/cache.ts'],
        },
      },
    } as unknown as Record<string, unknown>);

    expect(parsed).toEqual({
      packId: 'imported-001',
      replayPayload: {
        workspacePath: 'demo-workspace',
        actionType: 'incident-repro-pack',
        riskLevel: 'medium',
        likelyFailureMode: 'cache miss storm',
        verifyChecklist: ['Run smoke suite'],
        blockedReasons: ['missing impacted tests'],
        relatedFiles: ['src/cache.ts', 'src/cache.ts'],
      },
    });
  });

  it('rejects bundles with no replay payload', () => {
    expect(() => parseImportedReproBundle({ incident_repro_pack: { packId: 'broken' } })).toThrow(
      'Invalid incident repro bundle: replayPayload is missing.'
    );
  });

  // ── toLinkSafePath edge cases ──────────────────────────────────────────────

  it('toLinkSafePath: handles Windows-style backslash paths', () => {
    expect(toLinkSafePath('C:\\Users\\dev\\workspace\\src\\orders\\service.ts')).toBe(
      'orders/service.ts'
    );
  });

  it('toLinkSafePath: preserves short paths of exactly two segments', () => {
    expect(toLinkSafePath('src/app.ts')).toBe('src/app.ts');
    // single-segment after filtering: returns normalized string as-is
    expect(toLinkSafePath('/onlyone')).toBe('/onlyone');
  });

  // ── buildIncidentReplayQuery edge cases ───────────────────────────────────

  it('buildIncidentReplayQuery: uses fallback text when lists are empty', () => {
    const query = buildIncidentReplayQuery({
      packId: 'repro-empty',
      replayPayload: {
        actionType: 'incident-repro-pack',
        riskLevel: 'low',
        verifyChecklist: [],
        blockedReasons: [],
        relatedFiles: [],
      },
    });

    expect(query).toContain('1. Run deterministic verification checks before claiming completion.');
    expect(query).toContain('1. No blocked reasons were captured in this pack.');
    expect(query).toContain('Related files: none captured');
    expect(query).not.toContain('Likely failure mode');
  });

  it('buildIncidentReplayQuery: truncates verifyChecklist and blockedReasons at 8 items', () => {
    const nineItems = Array.from({ length: 9 }, (_, i) => `step-${i + 1}`);
    const query = buildIncidentReplayQuery({
      packId: 'repro-trunc',
      replayPayload: {
        actionType: 'incident-repro-pack',
        riskLevel: 'medium',
        verifyChecklist: nineItems,
        blockedReasons: nineItems,
        relatedFiles: [],
      },
    });

    expect(query).toContain('8. step-8');
    expect(query).not.toContain('9. step-9');
  });

  it('buildIncidentReplayQuery: truncates relatedFiles at 10 items', () => {
    const elevenFiles = Array.from({ length: 11 }, (_, i) => `src/file-${i + 1}.ts`);
    const query = buildIncidentReplayQuery({
      packId: 'repro-files',
      replayPayload: {
        actionType: 'incident-repro-pack',
        riskLevel: 'critical',
        verifyChecklist: [],
        blockedReasons: [],
        relatedFiles: elevenFiles,
      },
    });

    expect(query).toContain('src/file-10.ts');
    expect(query).not.toContain('src/file-11.ts');
  });

  it('buildIncidentReplayQuery: redacts sensitive literals from likelyFailureMode and checklists', () => {
    const query = buildIncidentReplayQuery({
      packId: 'repro-redaction',
      replayPayload: {
        actionType: 'incident-repro-pack',
        riskLevel: 'high',
        likelyFailureMode: 'Bearer sk-very-secret-token leaked in stdout',
        verifyChecklist: ['authorization: Bearer abc123'],
        blockedReasons: ['token=github_pat_verySecretTokenValue'],
        relatedFiles: ['src/security.ts'],
      },
    });

    expect(query).toContain('[REDACTED]');
    expect(query).not.toContain('sk-very-secret-token');
    expect(query).not.toContain('github_pat_verySecretTokenValue');
  });

  it('buildIncidentReplayQuery: normalizes absolute related file paths to link-safe hints', () => {
    const query = buildIncidentReplayQuery({
      packId: 'repro-safe-paths',
      replayPayload: {
        actionType: 'incident-repro-pack',
        riskLevel: 'medium',
        verifyChecklist: [],
        blockedReasons: [],
        relatedFiles: [
          '/home/dev/private-workspace/src/orders/service.ts',
          'C:\\Users\\dev\\private-workspace\\src\\orders\\controller.ts',
        ],
      },
    });

    expect(query).toContain('Related files: orders/service.ts, orders/controller.ts');
    expect(query).not.toContain('/home/dev/private-workspace');
    expect(query).not.toContain('C:\\Users\\dev');
  });

  it('buildIncidentReplayQuery: injects rollback/recovery guards for high-risk replay', () => {
    const query = buildIncidentReplayQuery({
      packId: 'repro-high-risk-guard',
      replayPayload: {
        actionType: 'incident-repro-pack',
        riskLevel: 'critical',
        likelyFailureMode: 'migration drift',
        verifyChecklist: ['Run deterministic verify checks'],
        blockedReasons: ['scope confidence is below threshold'],
        relatedFiles: ['src/migrations/apply.ts'],
      },
    });

    expect(query).toContain(
      'Document one deterministic rollback/restore command before execution.'
    );
    expect(query).toContain(
      'Rollback path is mandatory for high-risk replay until explicitly documented.'
    );
  });

  it('buildIncidentReplayQuery: avoids duplicate rollback guards when rollback evidence is present', () => {
    const query = buildIncidentReplayQuery({
      packId: 'repro-high-risk-existing-rollback',
      replayPayload: {
        actionType: 'incident-repro-pack',
        riskLevel: 'high',
        likelyFailureMode: 'service instability',
        verifyChecklist: ['Run rollback drill in staging before deploy'],
        blockedReasons: ['Rollback path already documented in runbook'],
        relatedFiles: ['src/release/runbook.md'],
      },
    });

    expect(
      query.includes('Document one deterministic rollback/restore command before execution.')
    ).toBe(false);
    expect(
      query.includes('Rollback path is mandatory for high-risk replay until explicitly documented.')
    ).toBe(false);
  });

  // ── buildLinkSafeExportBundle edge cases ──────────────────────────────────

  it('buildLinkSafeExportBundle: falls back to basename when workspaceName is blank', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));

    const bundle = buildLinkSafeExportBundle(
      {
        packId: 'repro-003',
        status: 'captured',
        workspacePath: '/home/user/my-project',
        replayPayload: {
          workspacePath: '/home/user/my-project',
          conversationId: 'conv-x',
          actionType: 'incident-repro-pack',
          riskLevel: 'low',
          verifyChecklist: [],
          blockedReasons: [],
          relatedFiles: [],
        },
      },
      '   ' // blank → should fall back to 'my-project'
    );

    expect(bundle.incident_repro_pack.workspacePath).toBe('my-project');
    expect(bundle.incident_repro_pack.replayPayload.workspacePath).toBe('my-project');
    expect(bundle.incident_repro_pack.sensitivity.label).toBe('internal');
  });

  it('buildLinkSafeExportBundle: normalises unknown riskLevel to high', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));

    const bundle = buildLinkSafeExportBundle(
      {
        packId: 'repro-004',
        status: 'captured',
        workspacePath: '/workspace',
        replayPayload: {
          workspacePath: '/workspace',
          conversationId: 'conv-y',
          actionType: 'incident-repro-pack',
          riskLevel: 'unknown' as any,
          verifyChecklist: [],
          blockedReasons: [],
          relatedFiles: [],
        },
      },
      'workspace'
    );

    expect(bundle.incident_repro_pack.replayPayload.riskLevel).toBe('high');
    expect(bundle.replay_entrypoint.risk_level).toBe('high');
    expect(bundle.replay_entrypoint.sensitivity_label).toBe('restricted');
  });

  it('buildLinkSafeExportBundle: preserves failed/skipped status without normalising', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));

    for (const status of ['failed', 'skipped'] as const) {
      const bundle = buildLinkSafeExportBundle(
        {
          packId: `repro-${status}`,
          status,
          workspacePath: '/ws',
          replayPayload: {
            workspacePath: '/ws',
            conversationId: 'c',
            actionType: 'incident-repro-pack',
            riskLevel: 'medium',
            verifyChecklist: [],
            blockedReasons: [],
            relatedFiles: [],
          },
        },
        'ws'
      );

      expect(bundle.incident_repro_pack.status).toBe(status);
    }
  });

  it('buildLinkSafeExportBundle: handles missing optional fields gracefully', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));

    const bundle = buildLinkSafeExportBundle(
      {
        packId: 'repro-min',
        status: 'captured',
        workspacePath: '/ws',
        replayPayload: {
          workspacePath: '/ws',
          conversationId: 'c',
          actionType: 'incident-repro-pack',
          riskLevel: 'high',
          verifyChecklist: [],
          blockedReasons: [],
          relatedFiles: [],
        },
        // no summary, no redaction, no exportHint, no capturedAt, no actionId
      },
      'ws'
    );

    expect(bundle.incident_repro_pack.summary.historyTurns).toBe(0);
    expect(bundle.incident_repro_pack.summary.hasDoctorEvidence).toBe(false);
    expect(bundle.incident_repro_pack.actionId).toBe('incident-repro-pack');
    expect(bundle.incident_repro_pack.capturedAt).toBe('2026-05-01T10:00:00.000Z');
    expect(bundle.incident_repro_pack.redaction.redactedFields).toContain('workspacePath');
    expect(bundle.incident_repro_pack.redaction.redactedFields).toContain('conversationId');
    expect(bundle.incident_repro_pack.exportHint).toContain('Link-safe payload');
    expect(bundle.incident_repro_pack.sensitivity.label).toBe('restricted');
  });

  // ── parseImportedReproBundle edge cases ───────────────────────────────────

  it('parseImportedReproBundle: accepts camelCase incidentReproPack format', () => {
    const parsed = parseImportedReproBundle({
      incidentReproPack: {
        packId: 'camel-001',
        replayPayload: {
          actionType: 'incident-repro-pack',
          riskLevel: 'low',
          verifyChecklist: ['check docker'],
          blockedReasons: [],
          relatedFiles: [],
        },
      },
    } as unknown as Record<string, unknown>);

    expect(parsed.packId).toBe('camel-001');
    expect(parsed.replayPayload.riskLevel).toBe('low');
  });

  it('parseImportedReproBundle: accepts direct root-level packId format', () => {
    const parsed = parseImportedReproBundle({
      packId: 'direct-001',
      replayPayload: {
        actionType: 'incident-repro-pack',
        riskLevel: 'critical',
        verifyChecklist: [],
        blockedReasons: [],
        relatedFiles: [],
      },
    } as unknown as Record<string, unknown>);

    expect(parsed.packId).toBe('direct-001');
    expect(parsed.replayPayload.riskLevel).toBe('critical');
  });

  it('parseImportedReproBundle: rejects bundle with no recognisable pack root', () => {
    expect(() =>
      parseImportedReproBundle({ unrecognised_field: 'garbage' } as Record<string, unknown>)
    ).toThrow('Invalid incident repro bundle: incident_repro_pack payload is missing.');
  });

  it('parseImportedReproBundle: auto-generates packId when it is blank or missing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));

    const parsed = parseImportedReproBundle({
      incident_repro_pack: {
        packId: '   ',
        replayPayload: {
          actionType: 'incident-repro-pack',
          riskLevel: 'low',
          verifyChecklist: [],
          blockedReasons: [],
          relatedFiles: [],
        },
      },
    } as unknown as Record<string, unknown>);

    expect(parsed.packId).toMatch(/^imported-/);
  });

  it('parseImportedReproBundle: defaults unknown riskLevel to high', () => {
    const parsed = parseImportedReproBundle({
      incident_repro_pack: {
        packId: 'risk-test',
        replayPayload: {
          actionType: 'incident-repro-pack',
          riskLevel: 'extreme', // not in enum
          verifyChecklist: [],
          blockedReasons: [],
          relatedFiles: [],
        },
      },
    } as unknown as Record<string, unknown>);

    expect(parsed.replayPayload.riskLevel).toBe('high');
  });

  it('parseImportedReproBundle: coerces non-array list fields to empty arrays', () => {
    const parsed = parseImportedReproBundle({
      incident_repro_pack: {
        packId: 'list-coerce',
        replayPayload: {
          actionType: 'incident-repro-pack',
          riskLevel: 'medium',
          verifyChecklist: 'should be array',
          blockedReasons: null,
          relatedFiles: 42,
        },
      },
    } as unknown as Record<string, unknown>);

    expect(parsed.replayPayload.verifyChecklist).toEqual([]);
    expect(parsed.replayPayload.blockedReasons).toEqual([]);
    expect(parsed.replayPayload.relatedFiles).toEqual([]);
  });

  it('parseImportedReproBundle: omits workspacePath when absent or blank', () => {
    const withoutPath = parseImportedReproBundle({
      incident_repro_pack: {
        packId: 'no-path',
        replayPayload: {
          actionType: 'incident-repro-pack',
          riskLevel: 'low',
          verifyChecklist: [],
          blockedReasons: [],
          relatedFiles: [],
        },
      },
    } as unknown as Record<string, unknown>);

    expect(withoutPath.replayPayload.workspacePath).toBeUndefined();

    const withBlankPath = parseImportedReproBundle({
      incident_repro_pack: {
        packId: 'blank-path',
        replayPayload: {
          workspacePath: '   ',
          actionType: 'incident-repro-pack',
          riskLevel: 'low',
          verifyChecklist: [],
          blockedReasons: [],
          relatedFiles: [],
        },
      },
    } as unknown as Record<string, unknown>);

    expect(withBlankPath.replayPayload.workspacePath).toBeUndefined();
  });

  it('parseImportedReproBundle: defaults actionType to incident-repro-pack when missing', () => {
    const parsed = parseImportedReproBundle({
      incident_repro_pack: {
        packId: 'no-action',
        replayPayload: {
          riskLevel: 'high',
          verifyChecklist: [],
          blockedReasons: [],
          relatedFiles: [],
        },
      },
    } as unknown as Record<string, unknown>);

    expect(parsed.replayPayload.actionType).toBe('incident-repro-pack');
  });

  it('parseImportedReproBundle: sanitizes imported sensitive text fields before replay', () => {
    const parsed = parseImportedReproBundle({
      incident_repro_pack: {
        packId: 'sanitize-imported-text',
        replayPayload: {
          actionType: 'incident-repro-pack',
          riskLevel: 'high',
          likelyFailureMode: 'Bearer sk-live-secret-token leaked in logs',
          verifyChecklist: ['authorization: Bearer abc123'],
          blockedReasons: ['token=ghp_SECRET_SHOULD_NOT_LEAK'],
          relatedFiles: ['src/security.ts'],
        },
      },
    } as unknown as Record<string, unknown>);

    expect(parsed.replayPayload.likelyFailureMode).toContain('[REDACTED]');
    expect(parsed.replayPayload.likelyFailureMode).not.toContain('sk-live-secret-token');
    expect(parsed.replayPayload.verifyChecklist[0]).toContain('[REDACTED]');
    expect(parsed.replayPayload.blockedReasons[0]).toContain('[REDACTED]');
  });

  it('parseImportedReproBundle: normalizes imported workspace and file paths to link-safe hints', () => {
    const parsed = parseImportedReproBundle({
      incident_repro_pack: {
        packId: 'sanitize-imported-paths',
        replayPayload: {
          workspacePath: '/home/dev/private-client/project-alpha',
          actionType: 'incident-repro-pack',
          riskLevel: 'medium',
          verifyChecklist: [],
          blockedReasons: [],
          relatedFiles: [
            '/home/dev/private-client/project-alpha/src/orders/service.ts',
            'C:\\Users\\dev\\project-alpha\\src\\orders\\controller.ts',
          ],
        },
      },
    } as unknown as Record<string, unknown>);

    expect(parsed.replayPayload.workspacePath).toBe('private-client/project-alpha');
    expect(parsed.replayPayload.relatedFiles).toEqual([
      'orders/service.ts',
      'orders/controller.ts',
    ]);
  });
});
