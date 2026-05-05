/**
 * CLC6 — UX mode adapter for Incident Studio Guided/Standard/Expert presentation.
 *
 * Enforces the three mode contracts from section 0.8.3:
 *   Guided   — one primary CTA, minimal options, plain-language rationale.
 *   Standard — one primary + one secondary CTA, concise rationale.
 *   Expert   — all CTAs, full evidence breakdown, optional advanced actions.
 *
 * This is a pure presentation-policy adapter; it does not mutate source payloads.
 */

import type { IncidentUserMode } from './incidentStudioPreferences';

// ---------------------------------------------------------------------------
// Input shape — the full content available for a given board state
// ---------------------------------------------------------------------------

export type IncidentUxModeContentInput = {
  /** Primary recommended CTA label. Always required. */
  primaryCta: string;
  /**
   * Additional secondary CTAs available. In Guided mode all are suppressed;
   * in Standard mode only the first is surfaced; in Expert mode all are shown.
   */
  secondaryCtaLabels: string[];
  /**
   * Advanced/power-user actions (destructive, experimental, or batch).
   * Suppressed in Guided and Standard; shown in Expert only.
   */
  advancedActionLabels: string[];
  /**
   * Plain-language rationale: one sentence, no jargon.
   * Shown in Guided and Standard; may be augmented in Expert.
   */
  plainRationale: string;
  /**
   * Concise technical rationale for Standard mode (may be longer than plain).
   * If omitted falls back to plainRationale.
   */
  conciseRationale?: string;
  /**
   * Detailed evidence items for Expert mode (e.g., stack traces, confidence %).
   * Suppressed in Guided and Standard.
   */
  evidenceItems: string[];
};

// ---------------------------------------------------------------------------
// Output shape — the filtered presentation per mode
// ---------------------------------------------------------------------------

export type IncidentUxModePresentation = {
  mode: IncidentUserMode;
  /** Ordered list of CTA labels the user should see. */
  visibleCtaLabels: string[];
  /** Rationale text to surface. */
  rationale: string;
  /** Evidence detail items (empty for Guided/Standard). */
  visibleEvidenceItems: string[];
  /** Advanced action labels (empty unless Expert). */
  visibleAdvancedActionLabels: string[];
  /** True when advanced actions are intentionally hidden by mode policy. */
  advancedActionsHidden: boolean;
  /** Total CTA count surfaced to the user (invariant: >= 1). */
  ctaCount: number;
};

// ---------------------------------------------------------------------------
// Mode policy constants
// ---------------------------------------------------------------------------

/** Maximum number of CTAs surfaced per mode (primary counts toward this). */
const MAX_CTA_BY_MODE: Record<IncidentUserMode, number> = {
  guided: 1,
  standard: 2,
  expert: Infinity,
};

// ---------------------------------------------------------------------------
// Adapter function
// ---------------------------------------------------------------------------

/**
 * CLC6 adapter — applies mode presentation policy to a full content input.
 * Returns a deterministic, mode-appropriate presentation slice.
 */
export function applyIncidentUxModePolicy(
  mode: IncidentUserMode,
  input: IncidentUxModeContentInput
): IncidentUxModePresentation {
  const maxCtas = MAX_CTA_BY_MODE[mode];

  // Build the CTA list: always start with primary
  const ctaLabels: string[] = [input.primaryCta];

  if (mode === 'standard' || mode === 'expert') {
    for (const label of input.secondaryCtaLabels) {
      if (ctaLabels.length >= maxCtas) {
        break;
      }
      ctaLabels.push(label);
    }
  }

  // Advanced actions: Expert only
  const showAdvanced = mode === 'expert';
  const advancedLabels = showAdvanced ? [...input.advancedActionLabels] : [];

  if (showAdvanced) {
    for (const label of input.advancedActionLabels) {
      if (!ctaLabels.includes(label)) {
        ctaLabels.push(label);
      }
    }
  }

  // Rationale: Guided gets plain; Standard gets concise (or plain fallback); Expert gets concise
  let rationale: string;
  if (mode === 'guided') {
    rationale = input.plainRationale;
  } else {
    rationale = input.conciseRationale ?? input.plainRationale;
  }

  // Evidence: Expert only
  const evidenceItems = mode === 'expert' ? [...input.evidenceItems] : [];

  return {
    mode,
    visibleCtaLabels: ctaLabels,
    rationale,
    visibleEvidenceItems: evidenceItems,
    visibleAdvancedActionLabels: advancedLabels,
    advancedActionsHidden: !showAdvanced,
    ctaCount: ctaLabels.length,
  };
}

// ---------------------------------------------------------------------------
// Invariant check helpers (used in tests + gates)
// ---------------------------------------------------------------------------

/**
 * Returns true if the presentation satisfies the hard CTA count constraint
 * for its declared mode.
 *
 * Guided:   exactly 1 CTA.
 * Standard: 1 or 2 CTAs.
 * Expert:   1 or more CTAs (no upper bound).
 */
export function presentationSatisfiesCtaConstraint(
  presentation: IncidentUxModePresentation
): boolean {
  const count = presentation.ctaCount;
  switch (presentation.mode) {
    case 'guided':
      return count === 1;
    case 'standard':
      return count >= 1 && count <= 2;
    case 'expert':
      return count >= 1;
  }
}

/**
 * Returns true if evidence items are only surfaced in Expert mode.
 * This invariant must hold across every presentation produced by the adapter.
 */
export function presentationSatisfiesEvidenceConstraint(
  presentation: IncidentUxModePresentation
): boolean {
  if (presentation.mode !== 'expert') {
    return presentation.visibleEvidenceItems.length === 0;
  }
  return true;
}

/**
 * Returns true if advanced actions are only surfaced in Expert mode.
 */
export function presentationSatisfiesAdvancedActionsConstraint(
  presentation: IncidentUxModePresentation
): boolean {
  if (presentation.mode !== 'expert') {
    return (
      presentation.visibleAdvancedActionLabels.length === 0 &&
      presentation.advancedActionsHidden === true
    );
  }
  return presentation.advancedActionsHidden === false;
}
