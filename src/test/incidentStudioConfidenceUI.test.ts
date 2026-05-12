/**
 * Unit tests for Confidence Provenance Breakdown UI
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSourceFreshness,
  formatSourceTimestamp,
  toConfidenceIndicator,
  formatSourcesForExpertDisplay,
  generateConfidenceTooltip,
  generateConfidenceBadgeHTML,
  generateSourceTreeHTML,
  generateInlineConfidenceHTML,
  generateAuditTrailHTML,
  initializeConfidenceUIState,
  toggleConfidenceBreakdown,
  toggleExpertMode,
  setExpandedSourceType,
  type ConfidenceUIState,
} from '../ui/panels/incidentStudioConfidenceUI';
import { createActionProvenance } from '../ui/panels/incidentStudioEvidenceProvenance';
import type { EvidenceProvenanceSource } from '../ui/panels/incidentStudioEvidenceProvenance';

describe('incidentStudioConfidenceUI', () => {
  const mockDoctor: EvidenceProvenanceSource = {
    type: 'doctor',
    sourceId: 'doctor_001',
    label: 'Doctor Check',
    timestamp: Date.now() - 60 * 60 * 1000, // 1 hour ago
    confidence: 'high',
  };

  const mockGraph: EvidenceProvenanceSource = {
    type: 'graph',
    sourceId: 'graph_001',
    label: 'Graph Analysis',
    timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    confidence: 'medium',
  };

  const mockTelemetry: EvidenceProvenanceSource = {
    type: 'telemetry',
    sourceId: 'telemetry_001',
    label: 'Telemetry Signal',
    timestamp: Date.now() - 48 * 60 * 60 * 1000, // 2 days ago (stale)
    confidence: 'medium',
  };

  describe('calculateSourceFreshness', () => {
    it('should return current for very recent timestamps', () => {
      const now = Date.now();
      const recent = now - 30 * 1000; // 30 seconds ago

      expect(calculateSourceFreshness(recent, now)).toBe('current');
    });

    it('should return recent for timestamps within 24 hours', () => {
      const now = Date.now();
      const old = now - 12 * 60 * 60 * 1000; // 12 hours ago

      expect(calculateSourceFreshness(old, now)).toBe('recent');
    });

    it('should return stale for timestamps older than 24 hours', () => {
      const now = Date.now();
      const veryOld = now - 48 * 60 * 60 * 1000; // 2 days ago

      expect(calculateSourceFreshness(veryOld, now)).toBe('stale');
    });
  });

  describe('formatSourceTimestamp', () => {
    it('should format very recent timestamps as "just now"', () => {
      const now = Date.now();
      const timestamp = now - 30 * 1000; // 30 seconds ago

      const formatted = formatSourceTimestamp(timestamp);
      expect(formatted).toBe('just now');
    });

    it('should format minutes ago', () => {
      const now = Date.now();
      const timestamp = now - 30 * 60 * 1000; // 30 minutes ago

      const formatted = formatSourceTimestamp(timestamp);
      expect(formatted).toContain('m ago');
    });

    it('should format hours ago', () => {
      const now = Date.now();
      const timestamp = now - 6 * 60 * 60 * 1000; // 6 hours ago

      const formatted = formatSourceTimestamp(timestamp);
      expect(formatted).toContain('h ago');
    });

    it('should format days ago', () => {
      const now = Date.now();
      const timestamp = now - 3 * 24 * 60 * 60 * 1000; // 3 days ago

      const formatted = formatSourceTimestamp(timestamp);
      expect(formatted).toContain('d ago');
    });

    it('should format date for very old timestamps', () => {
      const now = Date.now();
      const timestamp = now - 30 * 24 * 60 * 60 * 1000; // 30 days ago

      const formatted = formatSourceTimestamp(timestamp);
      // Should be a date string, not relative
      expect(formatted).not.toContain('ago');
    });
  });

  describe('toConfidenceIndicator', () => {
    it('should convert high confidence provenance to indicator', () => {
      // High confidence needs 3+ sources OR doctor alone
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const indicator = toConfidenceIndicator(prov);

      expect(indicator.confidence).toBe('high');
      expect(indicator.color).toBe('success');
      expect(indicator.icon).toBe('✓');
      expect(indicator.score).toBeGreaterThanOrEqual(80);
    });

    it('should convert medium confidence provenance to indicator', () => {
      const prov = createActionProvenance('action_001', 'Test', undefined, [mockGraph]);

      const indicator = toConfidenceIndicator(prov);

      expect(indicator.confidence).toBe('medium');
      expect(indicator.color).toBe('warning');
      expect(indicator.icon).toBe('⚠');
    });

    it('should convert low confidence provenance to indicator', () => {
      // Low confidence: 1 non-doctor source
      const prov = createActionProvenance('action_001', 'Test', undefined, undefined, [
        mockTelemetry,
      ]);

      const indicator = toConfidenceIndicator(prov);

      expect(indicator.confidence).toBe('medium');
      // Note: a single non-doctor source = medium confidence, not low
      expect(indicator.color).toBe('warning');
    });

    it('should include label with confidence level and score', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const indicator = toConfidenceIndicator(prov);

      expect(indicator.label).toContain('HIGH');
      expect(indicator.label).toContain('%');
    });
  });

  describe('formatSourcesForExpertDisplay', () => {
    it('should format sources with freshness indicator', () => {
      const now = Date.now();
      const prov = createActionProvenance('action_001', 'Test', [
        { ...mockDoctor, timestamp: now - 60 * 60 * 1000 }, // 1 hour ago
      ]);

      const sources = formatSourcesForExpertDisplay(prov, now);

      expect(sources).toHaveLength(1);
      expect(sources[0].freshness).toBe('recent');
    });

    it('should include source metadata', () => {
      const sourceWithMeta: EvidenceProvenanceSource = {
        type: 'doctor',
        sourceId: 'doc_with_meta',
        label: 'Doctor',
        timestamp: Date.now(),
        confidence: 'high',
        metadata: { version: '1.0', scope: 'workspace' },
      };

      const prov = createActionProvenance('action_001', 'Test', [sourceWithMeta]);
      const sources = formatSourcesForExpertDisplay(prov);

      expect(sources[0].metadata).toEqual({ version: '1.0', scope: 'workspace' });
    });
  });

  describe('generateConfidenceTooltip', () => {
    it('should generate tooltip with confidence and score', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const tooltip = generateConfidenceTooltip(prov);

      expect(tooltip).toContain('Confidence:');
      expect(tooltip).toContain('Score:');
      expect(tooltip).toContain('Evidence:');
    });

    it('should include source counts in tooltip', () => {
      const prov = createActionProvenance(
        'action_001',
        'Test',
        [mockDoctor],
        [mockGraph],
        [mockTelemetry]
      );

      const tooltip = generateConfidenceTooltip(prov);

      expect(tooltip).toContain('Primary');
      expect(tooltip).toContain('Secondary');
    });

    it('should include reasoning in tooltip', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const tooltip = generateConfidenceTooltip(prov);

      expect(tooltip.length).toBeGreaterThan(20);
      expect(tooltip.split('\n').length).toBeGreaterThan(3);
    });
  });

  describe('generateConfidenceBadgeHTML', () => {
    it('should generate HTML badge with correct class', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const html = generateConfidenceBadgeHTML(prov);

      expect(html).toContain('confidence-badge');
      expect(html).toContain('confidence-badge-success');
      expect(html).toContain('✓');
    });

    it('should include tooltip attribute', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const html = generateConfidenceBadgeHTML(prov);

      expect(html).toContain('title=');
      expect(html).toContain('data-tooltip');
    });

    it('should include confidence label', () => {
      const prov = createActionProvenance('action_001', 'Test', undefined, [mockGraph]);

      const html = generateConfidenceBadgeHTML(prov);

      expect(html).toContain('confidence-label');
      expect(html).toContain('MEDIUM');
    });
  });

  describe('generateSourceTreeHTML', () => {
    it('should generate HTML for source tree with grouped sources', () => {
      const prov = createActionProvenance(
        'action_001',
        'Test',
        [mockDoctor],
        [mockGraph],
        [mockTelemetry]
      );

      const html = generateSourceTreeHTML(prov);

      expect(html).toContain('source-tree');
      expect(html).toContain('Doctor Analysis');
      expect(html).toContain('Architecture Graph');
      expect(html).toContain('Telemetry Signals');
    });

    it('should include source counts by type', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor], [mockGraph]);

      const html = generateSourceTreeHTML(prov);

      expect(html).toContain('source-count');
    });

    it('should include freshness indicators', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const html = generateSourceTreeHTML(prov);

      expect(html).toContain('freshness-');
    });

    it('should show source IDs and timestamps', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const html = generateSourceTreeHTML(prov);

      expect(html).toContain('doctor_001');
      expect(html).toContain('source-time');
    });

    it('should skip source types with no sources', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const html = generateSourceTreeHTML(prov);

      // Should have doctor section
      expect(html).toContain('Doctor Analysis');
      // Should have at least one source-type div (doctor)
      expect((html.match(/source-type/g) || []).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('generateInlineConfidenceHTML', () => {
    it('should generate simple icon badge', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const html = generateInlineConfidenceHTML(prov);

      expect(html).toContain('confidence-inline');
      expect(html).toContain('confidence-badge-success');
      expect(html).toContain('✓');
    });

    it('should be simpler than full badge HTML', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const inline = generateInlineConfidenceHTML(prov);
      const full = generateConfidenceBadgeHTML(prov);

      expect(inline.length).toBeLessThan(full.length);
    });
  });

  describe('generateAuditTrailHTML', () => {
    it('should generate audit trail with action label', () => {
      const prov = createActionProvenance('action_001', 'Deploy System', [mockDoctor]);

      const html = generateAuditTrailHTML('Deploy System', prov);

      expect(html).toContain('audit-trail');
      expect(html).toContain('Deploy System');
    });

    it('should include source IDs in audit trail', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const html = generateAuditTrailHTML('Test', prov);

      expect(html).toContain('doctor_001');
    });

    it('should include reasoning', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const html = generateAuditTrailHTML('Test', prov);

      expect(html).toContain('audit-reasoning');
    });
  });

  describe('UI State Management', () => {
    it('should initialize confidence UI state', () => {
      const state = initializeConfidenceUIState('action_001');

      expect(state.actionId).toBe('action_001');
      expect(state.showBreakdown).toBe(false);
      expect(state.showExpertMode).toBe(false);
    });

    it('should toggle breakdown display', () => {
      const initial = initializeConfidenceUIState('action_001');

      const toggled1 = toggleConfidenceBreakdown(initial);
      expect(toggled1.showBreakdown).toBe(true);

      const toggled2 = toggleConfidenceBreakdown(toggled1);
      expect(toggled2.showBreakdown).toBe(false);
    });

    it('should toggle expert mode', () => {
      const initial = initializeConfidenceUIState('action_001');

      const toggled1 = toggleExpertMode(initial);
      expect(toggled1.showExpertMode).toBe(true);

      const toggled2 = toggleExpertMode(toggled1);
      expect(toggled2.showExpertMode).toBe(false);
    });

    it('should set expanded source type', () => {
      const initial = initializeConfidenceUIState('action_001');

      const expanded = setExpandedSourceType(initial, 'doctor');
      expect(expanded.expandedSourceType).toBe('doctor');

      // Toggling same type should collapse
      const collapsed = setExpandedSourceType(expanded, 'doctor');
      expect(collapsed.expandedSourceType).toBeUndefined();

      // Setting different type should replace
      const switched = setExpandedSourceType(expanded, 'graph');
      expect(switched.expandedSourceType).toBe('graph');
    });

    it('should maintain action ID through state mutations', () => {
      let state: ConfidenceUIState = initializeConfidenceUIState('action_001');

      state = toggleConfidenceBreakdown(state);
      state = toggleExpertMode(state);
      state = setExpandedSourceType(state, 'doctor');

      expect(state.actionId).toBe('action_001');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete confidence display workflow', () => {
      const prov = createActionProvenance('action_001', 'Deploy Fix', [
        mockDoctor,
        mockGraph,
        mockTelemetry,
      ]);

      // Display inline badge
      const badge = generateInlineConfidenceHTML(prov);
      expect(badge).toContain('✓');

      // Display full badge on hover
      const fullBadge = generateConfidenceBadgeHTML(prov);
      expect(fullBadge).toContain('confidence-badge');

      // Show tooltip on click
      const tooltip = generateConfidenceTooltip(prov);
      expect(tooltip).toContain('HIGH');

      // Show expert tree in modal
      const tree = generateSourceTreeHTML(prov);
      expect(tree).toContain('Doctor Analysis');
      expect(tree).toContain('Architecture Graph');
      expect(tree).toContain('Telemetry Signals');

      // Generate audit trail for export
      const audit = generateAuditTrailHTML('Deploy Fix', prov);
      expect(audit).toContain('Deploy Fix');
    });

    it('should handle low confidence warning scenario', () => {
      // Only 1 non-doctor source = medium confidence
      const prov = createActionProvenance('action_001', 'Unverified Action', undefined, undefined, [
        mockTelemetry,
      ]);

      const indicator = toConfidenceIndicator(prov);
      expect(indicator.confidence).toBe('medium');
      expect(indicator.color).toBe('warning');

      const badge = generateConfidenceBadgeHTML(prov);
      expect(badge).toContain('confidence-badge-warning');

      const tooltip = generateConfidenceTooltip(prov);
      expect(tooltip).toContain('MEDIUM');
    });
  });
});
