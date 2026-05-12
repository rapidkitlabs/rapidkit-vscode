/**
 * Unit tests for Evidence Provenance Tagging
 */

import { describe, it, expect } from 'vitest';
import {
  createActionProvenance,
  mergeProvenanceRecords,
  generateProvenanceBreakdown,
  formatProvenanceForExpertDisplay,
  exportProvenanceAuditTrail,
  type EvidenceProvenanceSource,
} from '../ui/panels/incidentStudioEvidenceProvenance';

describe('incidentStudioEvidenceProvenance', () => {
  const mockDoctorSource: EvidenceProvenanceSource = {
    type: 'doctor',
    sourceId: 'doctor_health_check_001',
    label: 'Doctor Health Check',
    timestamp: Date.now(),
    confidence: 'high',
    metadata: { checkName: 'workspace-health', severity: 'error' },
  };

  const mockGraphSource: EvidenceProvenanceSource = {
    type: 'graph',
    sourceId: 'graph_edge_impact_002',
    label: 'Graph Edge Impact',
    timestamp: Date.now(),
    confidence: 'medium',
    metadata: { edgeType: 'dependency', impactedNodes: 3 },
  };

  const mockTelemetrySource: EvidenceProvenanceSource = {
    type: 'telemetry',
    sourceId: 'telemetry_route_precision_003',
    label: 'Route Precision Signal',
    timestamp: Date.now(),
    confidence: 'medium',
    metadata: { signal: 'route_precision', value: 0.92 },
  };

  describe('createActionProvenance', () => {
    it('should create provenance with doctor source only', () => {
      const provenance = createActionProvenance('action_001', 'Fix Database Connection', [
        mockDoctorSource,
      ]);

      expect(provenance.actionId).toBe('action_001');
      expect(provenance.actionLabel).toBe('Fix Database Connection');
      expect(provenance.sources).toHaveLength(1);
      expect(provenance.sources[0].type).toBe('doctor');
      expect(provenance.overallConfidence).toBe('high');
      expect(provenance.isAuditable).toBe(true);
    });

    it('should create provenance with multiple sources', () => {
      const provenance = createActionProvenance(
        'action_002',
        'Restart Service',
        [mockDoctorSource],
        [mockGraphSource],
        [mockTelemetrySource]
      );

      expect(provenance.sources).toHaveLength(3);
      expect(provenance.overallConfidence).toBe('high');
      expect(provenance.sourceBreakdown.doctor).toBe(1);
      expect(provenance.sourceBreakdown.graph).toBe(1);
      expect(provenance.sourceBreakdown.telemetry).toBe(1);
    });

    it('should calculate medium confidence for two sources', () => {
      const provenance = createActionProvenance(
        'action_003',
        'Deploy Patch',
        [mockDoctorSource],
        [mockGraphSource]
      );

      expect(provenance.sources).toHaveLength(2);
      expect(provenance.overallConfidence).toBe('medium');
    });

    it('should mark as not auditable when no sources', () => {
      const provenance = createActionProvenance('action_004', 'Unknown Action');

      expect(provenance.sources).toHaveLength(0);
      expect(provenance.isAuditable).toBe(false);
      expect(provenance.overallConfidence).toBe('low');
    });

    it('should calculate high confidence with doctor alone', () => {
      const provenance = createActionProvenance('action_005', 'Apply Fix', [mockDoctorSource]);

      expect(provenance.sources).toHaveLength(1);
      expect(provenance.overallConfidence).toBe('high');
    });

    it('should calculate medium confidence with single non-doctor source', () => {
      const provenance = createActionProvenance('action_006', 'Run Verify', undefined, [
        mockGraphSource,
      ]);

      expect(provenance.sources).toHaveLength(1);
      expect(provenance.overallConfidence).toBe('medium');
    });
  });

  describe('mergeProvenanceRecords', () => {
    it('should merge provenance from two records', () => {
      const prov1 = createActionProvenance('action_001', 'Fix DB', [mockDoctorSource]);
      const prov2 = createActionProvenance('action_001', 'Fix DB', undefined, [mockGraphSource]);

      const merged = mergeProvenanceRecords(prov1, prov2);

      expect(merged.sources).toHaveLength(2);
      expect(merged.overallConfidence).toBe('medium');
      expect(merged.sourceBreakdown.doctor).toBe(1);
      expect(merged.sourceBreakdown.graph).toBe(1);
    });

    it('should deduplicate sources by sourceId', () => {
      const prov1 = createActionProvenance('action_002', 'Restart', [
        mockDoctorSource,
        mockGraphSource,
      ]);
      const prov2 = createActionProvenance('action_002', 'Restart', [mockDoctorSource]); // Duplicate doctor

      const merged = mergeProvenanceRecords(prov1, prov2);

      expect(merged.sources).toHaveLength(2); // Doctor not duplicated
      expect(merged.sources.every((s) => new Set([s.sourceId]).size === 1)).toBe(true);
    });

    it('should upgrade confidence when merging increases source count', () => {
      const prov1 = createActionProvenance('action_003', 'Deploy', [mockDoctorSource]);
      const prov2 = createActionProvenance(
        'action_003',
        'Deploy',
        undefined,
        [mockGraphSource],
        [mockTelemetrySource]
      );

      const merged = mergeProvenanceRecords(prov1, prov2);

      expect(merged.sources).toHaveLength(3);
      expect(merged.overallConfidence).toBe('high');
    });
  });

  describe('generateProvenanceBreakdown', () => {
    it('should generate breakdown for single doctor source', () => {
      const provenance = createActionProvenance('action_001', 'Fix', [mockDoctorSource]);
      const breakdown = generateProvenanceBreakdown(provenance);

      expect(breakdown.confidence).toBe('high');
      expect(breakdown.confidenceScore).toBeGreaterThanOrEqual(80);
      expect(breakdown.sources.primary).toBe(mockDoctorSource);
      expect(breakdown.reasoning).toContain('Doctor');
    });

    it('should generate breakdown for multiple sources', () => {
      const provenance = createActionProvenance(
        'action_002',
        'Complex Fix',
        [mockDoctorSource],
        [mockGraphSource],
        [mockTelemetrySource]
      );
      const breakdown = generateProvenanceBreakdown(provenance);

      expect(breakdown.confidence).toBe('high');
      expect(breakdown.confidenceScore).toBeGreaterThan(80);
      expect(breakdown.sources.count).toBe(3);
      expect(breakdown.reasoning).toContain('multiple');
    });

    it('should generate audit trail from provenance', () => {
      const provenance = createActionProvenance(
        'action_003',
        'Action',
        [mockDoctorSource],
        [mockGraphSource]
      );
      const breakdown = generateProvenanceBreakdown(provenance);

      expect(breakdown.auditTrail).toContain('doctor_health_check_001');
      expect(breakdown.auditTrail).toContain('graph_edge_impact_002');
    });

    it('should generate reasoning for no evidence', () => {
      const provenance = createActionProvenance('action_004', 'Unknown');
      const breakdown = generateProvenanceBreakdown(provenance);

      expect(breakdown.confidence).toBe('low');
      expect(breakdown.confidenceScore).toBe(0);
      expect(breakdown.reasoning).toContain('No corroborating evidence');
    });

    it('should categorize sources by confidence level', () => {
      const weakTelemetry: EvidenceProvenanceSource = {
        ...mockTelemetrySource,
        confidence: 'low',
      };

      const provenance = createActionProvenance(
        'action_005',
        'Mixed Confidence',
        [mockDoctorSource],
        [mockGraphSource],
        [weakTelemetry]
      );
      const breakdown = generateProvenanceBreakdown(provenance);

      expect(breakdown.sources.primary?.type).toBe('doctor');
      expect(breakdown.sources.secondary.some((s) => s.type === 'graph')).toBe(true);
      expect(breakdown.sources.weak.some((s) => s.type === 'telemetry')).toBe(true);
    });
  });

  describe('formatProvenanceForExpertDisplay', () => {
    it('should format provenance for expert display', () => {
      const provenance = createActionProvenance(
        'action_001',
        'Complex Operation',
        [mockDoctorSource],
        [mockGraphSource]
      );
      const formatted = formatProvenanceForExpertDisplay(provenance);

      expect(formatted.sourceList).toHaveLength(2);
      expect(formatted.sourceList[0]).toContain('doctor_health_check_001');
      expect(formatted.auditTree.length).toBeGreaterThan(0);
      expect(formatted.metadata.actionId).toBe('action_001');
      expect(formatted.metadata.sourceCount).toBe(2);
    });

    it('should build audit tree by source type', () => {
      const provenance = createActionProvenance(
        'action_002',
        'Multi-source',
        [mockDoctorSource],
        [mockGraphSource],
        [mockTelemetrySource]
      );
      const formatted = formatProvenanceForExpertDisplay(provenance);

      const types = formatted.auditTree.map((t) => t.type);
      expect(types).toContain('doctor');
      expect(types).toContain('graph');
      expect(types).toContain('telemetry');
    });

    it('should exclude empty source types from audit tree', () => {
      const provenance = createActionProvenance('action_003', 'Single Source', [mockDoctorSource]);
      const formatted = formatProvenanceForExpertDisplay(provenance);

      expect(formatted.auditTree).toHaveLength(1);
      expect(formatted.auditTree[0].type).toBe('doctor');
    });
  });

  describe('exportProvenanceAuditTrail', () => {
    it('should export audit trail for multiple actions', () => {
      const prov1 = createActionProvenance('action_001', 'Fix 1', [mockDoctorSource]);
      const prov2 = createActionProvenance(
        'action_002',
        'Fix 2',
        [mockGraphSource],
        [mockTelemetrySource]
      );

      const trail = exportProvenanceAuditTrail([prov1, prov2]);

      expect(trail.actionCount).toBe(2);
      expect(trail.auditableCount).toBe(2);
      expect(trail.sources).toHaveLength(2);
      expect(trail.sources[0].actionId).toBe('action_001');
    });

    it('should count only auditable actions', () => {
      const prov1 = createActionProvenance('action_001', 'Auditable', [mockDoctorSource]);
      const prov2 = createActionProvenance('action_002', 'Not Auditable'); // No sources

      const trail = exportProvenanceAuditTrail([prov1, prov2]);

      expect(trail.actionCount).toBe(2);
      expect(trail.auditableCount).toBe(1);
    });

    it('should include confidence and breakdown in export', () => {
      const prov = createActionProvenance(
        'action_001',
        'Action',
        [mockDoctorSource],
        [mockGraphSource]
      );
      const trail = exportProvenanceAuditTrail([prov]);

      const item = trail.sources[0];
      expect(item.confidence).toBe('medium');
      expect(item.breakdown.doctor).toBe(1);
      expect(item.breakdown.graph).toBe(1);
    });

    it('should include source IDs for audit trail', () => {
      const prov = createActionProvenance(
        'action_001',
        'Complex',
        [mockDoctorSource],
        [mockGraphSource]
      );
      const trail = exportProvenanceAuditTrail([prov]);

      const item = trail.sources[0];
      expect(item.sourceIds).toContain('doctor_health_check_001');
      expect(item.sourceIds).toContain('graph_edge_impact_002');
    });
  });

  describe('provenance integration scenarios', () => {
    it('should track provenance through action lifecycle', () => {
      // Initial provenance with doctor evidence
      let provenance = createActionProvenance('action_critical', 'Critical Fix', [
        mockDoctorSource,
      ]);
      expect(provenance.overallConfidence).toBe('high');

      // Additional graph evidence discovered
      const additionalProvenance = createActionProvenance(
        'action_critical',
        'Critical Fix',
        undefined,
        [mockGraphSource]
      );
      provenance = mergeProvenanceRecords(provenance, additionalProvenance);
      expect(provenance.sources).toHaveLength(2);

      // Export for audit
      const trail = exportProvenanceAuditTrail([provenance]);
      expect(trail.auditableCount).toBe(1);
      expect(trail.sources[0].sourceIds).toHaveLength(2);
    });

    it('should escalate confidence as evidence accumulates', () => {
      const sources = [
        [mockDoctorSource], // high
        [mockDoctorSource, mockGraphSource], // medium
        [mockDoctorSource, mockGraphSource, mockTelemetrySource], // high
      ];

      const confidences = sources.map((src) => {
        const prov = createActionProvenance(`action_${src[0].sourceId}`, 'Action', src);
        return prov.overallConfidence;
      });

      expect(confidences).toEqual(['high', 'medium', 'high']);
    });

    it('should properly handle user-context sources', () => {
      const userSource: EvidenceProvenanceSource = {
        type: 'user-context',
        sourceId: 'user_manual_confirmation',
        label: 'User Manual Confirmation',
        timestamp: Date.now(),
        confidence: 'high',
      };

      const provenance = createActionProvenance(
        'action_001',
        'User-Validated Fix',
        undefined,
        undefined,
        undefined,
        [userSource]
      );

      expect(provenance.sourceBreakdown.userContext).toBe(1);
      expect(provenance.sources[0].type).toBe('user-context');
    });
  });
});
