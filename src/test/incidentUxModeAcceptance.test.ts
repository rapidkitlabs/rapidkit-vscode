/**
 * CLC6 — Role/mode acceptance tests for Guided/Standard/Expert presentation.
 *
 * These tests prove that:
 * 1. CTA ambiguity is reduced per mode (Guided=1, Standard≤2, Expert=all).
 * 2. Evidence and advanced actions are only surfaced in Expert mode.
 * 3. The same top incident scenarios are completable across all three modes.
 * 4. Mode invariants hold even when optional content is missing.
 */

import { describe, it, expect } from 'vitest';
import {
  applyIncidentUxModePolicy,
  presentationSatisfiesCtaConstraint,
  presentationSatisfiesEvidenceConstraint,
  presentationSatisfiesAdvancedActionsConstraint,
  type IncidentUxModeContentInput,
} from '../../webview-ui/src/lib/incidentUxModeAdapter';
import type { IncidentUserMode } from '../../webview-ui/src/lib/incidentStudioPreferences';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Richest possible content input: multiple secondaries, advanced, evidence */
const FULL_CONTENT: IncidentUxModeContentInput = {
  primaryCta: 'Run verify checks',
  secondaryCtaLabels: ['Open diff preview', 'Explain diagnosis'],
  advancedActionLabels: ['Force rollback', 'Restart sandbox'],
  plainRationale: 'A runtime error was detected. Run verify to confirm the fix.',
  conciseRationale:
    'RuntimeError detected in service layer. Verify-path confirms fix before apply.',
  evidenceItems: [
    'Stack trace: TypeError at routes/user.ts:42',
    'Confidence: 87%',
    'Affected modules: user-service, auth-middleware',
  ],
};

/** Minimal content: no secondaries, no advanced, no evidence, no conciseRationale */
const MINIMAL_CONTENT: IncidentUxModeContentInput = {
  primaryCta: 'Start diagnosis',
  secondaryCtaLabels: [],
  advancedActionLabels: [],
  plainRationale: 'No context available yet. Start diagnosis to learn more.',
  evidenceItems: [],
};

const MODES: IncidentUserMode[] = ['guided', 'standard', 'expert'];

// ---------------------------------------------------------------------------
// CLC6-A: Guided mode acceptance
// ---------------------------------------------------------------------------

describe('CLC6-A Guided mode acceptance', () => {
  it('shows exactly one CTA (primary only)', () => {
    const p = applyIncidentUxModePolicy('guided', FULL_CONTENT);
    expect(p.ctaCount).toBe(1);
    expect(p.visibleCtaLabels).toEqual(['Run verify checks']);
  });

  it('uses plain-language rationale, not concise technical rationale', () => {
    const p = applyIncidentUxModePolicy('guided', FULL_CONTENT);
    expect(p.rationale).toBe(FULL_CONTENT.plainRationale);
    expect(p.rationale).not.toContain('RuntimeError detected in service layer');
  });

  it('suppresses all secondary CTAs', () => {
    const p = applyIncidentUxModePolicy('guided', FULL_CONTENT);
    expect(p.visibleCtaLabels).not.toContain('Open diff preview');
    expect(p.visibleCtaLabels).not.toContain('Explain diagnosis');
  });

  it('suppresses all advanced actions and marks them hidden', () => {
    const p = applyIncidentUxModePolicy('guided', FULL_CONTENT);
    expect(p.visibleAdvancedActionLabels).toHaveLength(0);
    expect(p.advancedActionsHidden).toBe(true);
  });

  it('shows no evidence items', () => {
    const p = applyIncidentUxModePolicy('guided', FULL_CONTENT);
    expect(p.visibleEvidenceItems).toHaveLength(0);
  });

  it('satisfies all three invariants with full content', () => {
    const p = applyIncidentUxModePolicy('guided', FULL_CONTENT);
    expect(presentationSatisfiesCtaConstraint(p)).toBe(true);
    expect(presentationSatisfiesEvidenceConstraint(p)).toBe(true);
    expect(presentationSatisfiesAdvancedActionsConstraint(p)).toBe(true);
  });

  it('satisfies invariants with minimal content (no optional fields)', () => {
    const p = applyIncidentUxModePolicy('guided', MINIMAL_CONTENT);
    expect(p.ctaCount).toBe(1);
    expect(p.rationale).toBe(MINIMAL_CONTENT.plainRationale);
    expect(presentationSatisfiesCtaConstraint(p)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CLC6-B: Standard mode acceptance
// ---------------------------------------------------------------------------

describe('CLC6-B Standard mode acceptance', () => {
  it('shows primary plus one secondary CTA (max 2)', () => {
    const p = applyIncidentUxModePolicy('standard', FULL_CONTENT);
    expect(p.ctaCount).toBe(2);
    expect(p.visibleCtaLabels[0]).toBe('Run verify checks');
    expect(p.visibleCtaLabels[1]).toBe('Open diff preview');
  });

  it('does NOT surface third or later secondary CTAs', () => {
    const p = applyIncidentUxModePolicy('standard', FULL_CONTENT);
    expect(p.visibleCtaLabels).not.toContain('Explain diagnosis');
  });

  it('uses concise rationale when available', () => {
    const p = applyIncidentUxModePolicy('standard', FULL_CONTENT);
    expect(p.rationale).toBe(FULL_CONTENT.conciseRationale);
  });

  it('falls back to plain rationale when conciseRationale is absent', () => {
    const input: IncidentUxModeContentInput = { ...FULL_CONTENT, conciseRationale: undefined };
    const p = applyIncidentUxModePolicy('standard', input);
    expect(p.rationale).toBe(FULL_CONTENT.plainRationale);
  });

  it('suppresses advanced actions and marks them hidden', () => {
    const p = applyIncidentUxModePolicy('standard', FULL_CONTENT);
    expect(p.visibleAdvancedActionLabels).toHaveLength(0);
    expect(p.advancedActionsHidden).toBe(true);
  });

  it('shows no evidence items', () => {
    const p = applyIncidentUxModePolicy('standard', FULL_CONTENT);
    expect(p.visibleEvidenceItems).toHaveLength(0);
  });

  it('satisfies all three invariants with full content', () => {
    const p = applyIncidentUxModePolicy('standard', FULL_CONTENT);
    expect(presentationSatisfiesCtaConstraint(p)).toBe(true);
    expect(presentationSatisfiesEvidenceConstraint(p)).toBe(true);
    expect(presentationSatisfiesAdvancedActionsConstraint(p)).toBe(true);
  });

  it('shows only primary CTA when no secondaries exist (minimal content)', () => {
    const p = applyIncidentUxModePolicy('standard', MINIMAL_CONTENT);
    expect(p.ctaCount).toBe(1);
    expect(presentationSatisfiesCtaConstraint(p)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CLC6-C: Expert mode acceptance
// ---------------------------------------------------------------------------

describe('CLC6-C Expert mode acceptance', () => {
  it('shows all CTAs: primary + all secondaries + advanced actions', () => {
    const p = applyIncidentUxModePolicy('expert', FULL_CONTENT);
    expect(p.visibleCtaLabels).toContain('Run verify checks');
    expect(p.visibleCtaLabels).toContain('Open diff preview');
    expect(p.visibleCtaLabels).toContain('Explain diagnosis');
    expect(p.visibleCtaLabels).toContain('Force rollback');
    expect(p.visibleCtaLabels).toContain('Restart sandbox');
  });

  it('shows all evidence items', () => {
    const p = applyIncidentUxModePolicy('expert', FULL_CONTENT);
    expect(p.visibleEvidenceItems).toHaveLength(3);
    expect(p.visibleEvidenceItems).toContain('Confidence: 87%');
  });

  it('surfaces advanced actions and marks them NOT hidden', () => {
    const p = applyIncidentUxModePolicy('expert', FULL_CONTENT);
    expect(p.visibleAdvancedActionLabels).toContain('Force rollback');
    expect(p.visibleAdvancedActionLabels).toContain('Restart sandbox');
    expect(p.advancedActionsHidden).toBe(false);
  });

  it('uses concise rationale (same as standard)', () => {
    const p = applyIncidentUxModePolicy('expert', FULL_CONTENT);
    expect(p.rationale).toBe(FULL_CONTENT.conciseRationale);
  });

  it('satisfies all three invariants with full content', () => {
    const p = applyIncidentUxModePolicy('expert', FULL_CONTENT);
    expect(presentationSatisfiesCtaConstraint(p)).toBe(true);
    expect(presentationSatisfiesEvidenceConstraint(p)).toBe(true);
    expect(presentationSatisfiesAdvancedActionsConstraint(p)).toBe(true);
  });

  it('expert CTA count is always >= 1 even with minimal content', () => {
    const p = applyIncidentUxModePolicy('expert', MINIMAL_CONTENT);
    expect(p.ctaCount).toBeGreaterThanOrEqual(1);
    expect(presentationSatisfiesCtaConstraint(p)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CLC6-D: Cross-mode scenario acceptance — same scenario, all three modes
// ---------------------------------------------------------------------------

describe('CLC6-D Cross-mode scenario: runtime error triage', () => {
  const scenario: IncidentUxModeContentInput = {
    primaryCta: 'Run verify: npm test',
    secondaryCtaLabels: ['Show diff', 'Explain root cause'],
    advancedActionLabels: ['Force rollback to last commit', 'Open sandbox simulation'],
    plainRationale: 'A crash was found. Run tests to confirm the fix works.',
    conciseRationale: 'TypeError in auth-service. Verify with `npm test` before applying patch.',
    evidenceItems: [
      'Error: TypeError: Cannot read property "id" of undefined at auth.ts:88',
      'Confidence: 91%',
      'Related files: auth.ts, middleware/session.ts',
      'Suggested fix: add null-check guard at auth.ts:88',
    ],
  };

  MODES.forEach((mode) => {
    it(`mode=${mode}: user can reach next action (primary CTA always present)`, () => {
      const p = applyIncidentUxModePolicy(mode, scenario);
      expect(p.visibleCtaLabels[0]).toBe('Run verify: npm test');
      expect(p.ctaCount).toBeGreaterThanOrEqual(1);
    });

    it(`mode=${mode}: all mode invariants pass`, () => {
      const p = applyIncidentUxModePolicy(mode, scenario);
      expect(presentationSatisfiesCtaConstraint(p)).toBe(true);
      expect(presentationSatisfiesEvidenceConstraint(p)).toBe(true);
      expect(presentationSatisfiesAdvancedActionsConstraint(p)).toBe(true);
    });
  });

  it('Guided exposes fewer CTAs than Standard', () => {
    const g = applyIncidentUxModePolicy('guided', scenario);
    const s = applyIncidentUxModePolicy('standard', scenario);
    expect(g.ctaCount).toBeLessThan(s.ctaCount);
  });

  it('Standard exposes fewer CTAs than Expert', () => {
    const s = applyIncidentUxModePolicy('standard', scenario);
    const e = applyIncidentUxModePolicy('expert', scenario);
    expect(s.ctaCount).toBeLessThan(e.ctaCount);
  });

  it('only Expert exposes evidence items (not Guided or Standard)', () => {
    expect(applyIncidentUxModePolicy('guided', scenario).visibleEvidenceItems).toHaveLength(0);
    expect(applyIncidentUxModePolicy('standard', scenario).visibleEvidenceItems).toHaveLength(0);
    expect(
      applyIncidentUxModePolicy('expert', scenario).visibleEvidenceItems.length
    ).toBeGreaterThan(0);
  });

  it('only Expert exposes advanced action labels', () => {
    expect(applyIncidentUxModePolicy('guided', scenario).visibleAdvancedActionLabels).toHaveLength(
      0
    );
    expect(
      applyIncidentUxModePolicy('standard', scenario).visibleAdvancedActionLabels
    ).toHaveLength(0);
    expect(
      applyIncidentUxModePolicy('expert', scenario).visibleAdvancedActionLabels.length
    ).toBeGreaterThan(0);
  });
});

describe('CLC6-D Cross-mode scenario: pre-change impact assessment', () => {
  const scenario: IncidentUxModeContentInput = {
    primaryCta: 'Review impact scope',
    secondaryCtaLabels: ['Open affected files'],
    advancedActionLabels: ['Run sandbox simulation'],
    plainRationale: 'This change affects multiple services. Review impact before continuing.',
    conciseRationale: 'Impact: user-service, payment-api (3 files). Scope unknown for 2 modules.',
    evidenceItems: [
      'Affected: user-service/handler.ts, payment-api/charge.ts',
      'Unknown scope: legacy-adapter, db-migrator',
      'Risk: high (mutating action)',
    ],
  };

  MODES.forEach((mode) => {
    it(`mode=${mode}: primary CTA always reachable`, () => {
      const p = applyIncidentUxModePolicy(mode, scenario);
      expect(p.visibleCtaLabels[0]).toBe('Review impact scope');
    });

    it(`mode=${mode}: invariants pass`, () => {
      const p = applyIncidentUxModePolicy(mode, scenario);
      expect(presentationSatisfiesCtaConstraint(p)).toBe(true);
      expect(presentationSatisfiesEvidenceConstraint(p)).toBe(true);
      expect(presentationSatisfiesAdvancedActionsConstraint(p)).toBe(true);
    });
  });
});

describe('CLC6-D Cross-mode scenario: doctor fix with verify path', () => {
  const scenario: IncidentUxModeContentInput = {
    primaryCta: 'Run: rapidkit doctor --fix',
    secondaryCtaLabels: ['Show doctor report'],
    advancedActionLabels: ['Force full re-index'],
    plainRationale: 'Doctor found issues. Run the fix command to resolve them.',
    conciseRationale: 'Doctor: 3 errors, 1 warning. Fix targets missing env vars + stale lock.',
    evidenceItems: [
      'Error: missing ENV_KEY in .env',
      'Error: stale package-lock.json',
      'Warning: outdated node version (18 < 20)',
    ],
  };

  MODES.forEach((mode) => {
    it(`mode=${mode}: primary CTA always reachable`, () => {
      const p = applyIncidentUxModePolicy(mode, scenario);
      expect(p.visibleCtaLabels[0]).toBe('Run: rapidkit doctor --fix');
    });

    it(`mode=${mode}: invariants pass`, () => {
      const p = applyIncidentUxModePolicy(mode, scenario);
      expect(presentationSatisfiesCtaConstraint(p)).toBe(true);
      expect(presentationSatisfiesEvidenceConstraint(p)).toBe(true);
      expect(presentationSatisfiesAdvancedActionsConstraint(p)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// CLC6-E: Invariant proofs across all mode × content combinations
// ---------------------------------------------------------------------------

describe('CLC6-E Mode adapter invariants (exhaustive)', () => {
  const contents: [string, IncidentUxModeContentInput][] = [
    ['full content', FULL_CONTENT],
    ['minimal content', MINIMAL_CONTENT],
  ];

  MODES.forEach((mode) => {
    contents.forEach(([label, content]) => {
      it(`mode=${mode}, ${label}: ctaCount >= 1 (never zero)`, () => {
        const p = applyIncidentUxModePolicy(mode, content);
        expect(p.ctaCount).toBeGreaterThanOrEqual(1);
      });

      it(`mode=${mode}, ${label}: primary CTA is always first in visibleCtaLabels`, () => {
        const p = applyIncidentUxModePolicy(mode, content);
        expect(p.visibleCtaLabels[0]).toBe(content.primaryCta);
      });

      it(`mode=${mode}, ${label}: mode field matches input mode`, () => {
        const p = applyIncidentUxModePolicy(mode, content);
        expect(p.mode).toBe(mode);
      });

      it(`mode=${mode}, ${label}: all three invariant checks pass`, () => {
        const p = applyIncidentUxModePolicy(mode, content);
        expect(presentationSatisfiesCtaConstraint(p)).toBe(true);
        expect(presentationSatisfiesEvidenceConstraint(p)).toBe(true);
        expect(presentationSatisfiesAdvancedActionsConstraint(p)).toBe(true);
      });
    });
  });
});
