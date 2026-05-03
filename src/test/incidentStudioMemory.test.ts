import { describe, expect, it } from 'vitest';

import {
  buildIncidentMemoryEnrichmentSuggestion,
  buildIncidentMemoryPromptHint,
  buildIncidentMemoryReuseSnapshot,
  mergeIncidentReplayLearningIntoMemory,
  prependIncidentMemoryReuseBlock,
  shouldAttachIncidentMemoryReuse,
} from '../ui/panels/incidentStudioMemory';

describe('incidentStudioMemory', () => {
  it('returns null when no memory hints exist', () => {
    expect(buildIncidentMemoryReuseSnapshot({})).toBeNull();
  });

  it('builds a deterministic snapshot from workspace memory and doctor fixes', () => {
    const snapshot = buildIncidentMemoryReuseSnapshot({
      workspaceMemoryContext: 'Payments platform with FastAPI and worker queues',
      conventions: ['Always run lint before tests'],
      decisions: ['Use Redis as cache and queue broker'],
      doctorFixCommands: ['rapidkit doctor workspace --fix'],
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.heading).toBe('Worked previously in this workspace:');
    expect(snapshot?.bullets.some((line) => line.includes('Use Redis as cache'))).toBe(true);
    expect(snapshot?.bullets.some((line) => line.includes('doctor workspace --fix'))).toBe(true);
  });

  it('attaches reuse block only for first query and keeps fallback deterministic', () => {
    const snapshot = buildIncidentMemoryReuseSnapshot({
      decisions: ['Prefer additive DB migrations before destructive changes'],
    });

    expect(shouldAttachIncidentMemoryReuse(1, snapshot)).toBe(true);
    expect(shouldAttachIncidentMemoryReuse(2, snapshot)).toBe(false);
    expect(shouldAttachIncidentMemoryReuse(1, null)).toBe(false);

    const baseText = 'What happened: migration checksum mismatch.';
    const enriched = prependIncidentMemoryReuseBlock(baseText, snapshot);
    expect(enriched.startsWith('Worked previously in this workspace:')).toBe(true);

    const alreadyPrefixed = prependIncidentMemoryReuseBlock(enriched, snapshot);
    expect(alreadyPrefixed).toBe(enriched);
  });

  it('builds explicit first-response prompt hint when snapshot exists', () => {
    const snapshot = buildIncidentMemoryReuseSnapshot({
      decisions: ['Use feature flags for risky rollouts'],
    });

    const hint = buildIncidentMemoryPromptHint(snapshot);
    expect(hint).toContain('FIRST_RESPONSE_MEMORY_RULE:');
    expect(hint).toContain('Worked previously in this workspace:');
  });

  it('merges verified replay learning into workspace memory as reusable decisions and conventions', () => {
    const merged = mergeIncidentReplayLearningIntoMemory(
      {
        context: 'Orders backend',
        conventions: ['Always run lint before tests'],
        decisions: ['Use additive DB migrations'],
        lastUpdated: '2026-05-01T00:00:00.000Z',
      },
      {
        packId: 'repro-42',
        actionType: 'incident-repro-pack',
        riskLevel: 'high',
        likelyFailureMode: 'migration checksum mismatch',
        verifyChecklist: ['pnpm test --filter orders-api', 'rapidkit doctor workspace'],
        blockedReasons: ['unknown migration order'],
        relatedFiles: ['src/orders/migrations/001.sql', 'src/orders/service.ts'],
      }
    );

    expect(merged.decisions[0]).toContain('Incident replay repro-42 (high)');
    expect(merged.decisions[0]).toContain('migration checksum mismatch');
    expect(merged.decisions[0]).toContain('Verify with: pnpm test --filter orders-api');
    expect(merged.conventions[0]).toBe('Replay verify-first rule: pnpm test --filter orders-api');
  });

  it('dedupes replay learning entries when the same verified pack is merged again', () => {
    const base = mergeIncidentReplayLearningIntoMemory(
      {
        context: 'Orders backend',
        conventions: [],
        decisions: [],
        lastUpdated: '',
      },
      {
        packId: 'repro-42',
        actionType: 'incident-repro-pack',
        riskLevel: 'medium',
        verifyChecklist: ['rapidkit doctor workspace'],
        blockedReasons: [],
        relatedFiles: ['src/orders/service.ts'],
      }
    );

    const mergedAgain = mergeIncidentReplayLearningIntoMemory(base, {
      packId: 'repro-42',
      actionType: 'incident-repro-pack',
      riskLevel: 'medium',
      verifyChecklist: ['rapidkit doctor workspace'],
      blockedReasons: [],
      relatedFiles: ['src/orders/service.ts'],
    });

    expect(mergedAgain.decisions).toHaveLength(1);
    expect(mergedAgain.conventions).toHaveLength(1);
  });

  it('builds context-aware memory enrichment suggestion for successful incidents', () => {
    const suggestion = buildIncidentMemoryEnrichmentSuggestion({
      verifySuccess: true,
      actionType: 'inline-command',
      likelyFailureMode: 'migration checksum mismatch',
      verifyChecklist: ['pnpm test --filter orders-api'],
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.title).toBe('Verification passed - capture reusable memory');
    expect(suggestion?.summary).toContain('Primary verify step: pnpm test --filter orders-api');
    expect(suggestion?.summary).toContain('Failure mode: migration checksum mismatch');
    expect(suggestion?.questions[1]).toContain('migration checksum mismatch');
  });

  it('does not build memory enrichment suggestion when verification fails', () => {
    expect(
      buildIncidentMemoryEnrichmentSuggestion({
        verifySuccess: false,
        actionType: 'inline-command',
        verifyChecklist: ['pnpm test'],
      })
    ).toBeNull();
  });
});
