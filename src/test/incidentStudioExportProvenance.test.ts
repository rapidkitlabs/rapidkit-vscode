/**
 * Unit tests for Export Provenance with Source Coverage
 */

import { describe, it, expect } from 'vitest';
import {
  wrapArtifactWithProvenance,
  exportVerifyPackWithProvenance,
  exportReleaseReadinessWithProvenance,
  exportReproPackWithProvenance,
  formatArtifactAuditNote,
  formatArtifactAsJson,
  calculateExportIntegrityScore,
  verifyExportGovernanceCompliance,
  type ArtifactWithProvenance,
  type VerifyPackExport,
} from '../ui/panels/incidentStudioExportProvenance';
import {
  createActionProvenance,
  type EvidenceProvenanceSource,
} from '../ui/panels/incidentStudioEvidenceProvenance';

describe('incidentStudioExportProvenance', () => {
  const mockDoctor: EvidenceProvenanceSource = {
    type: 'doctor',
    sourceId: 'doctor_001',
    label: 'Doctor Check',
    timestamp: Date.now(),
    confidence: 'high',
  };

  const mockGraph: EvidenceProvenanceSource = {
    type: 'graph',
    sourceId: 'graph_001',
    label: 'Graph Analysis',
    timestamp: Date.now(),
    confidence: 'medium',
  };

  const mockTelemetry: EvidenceProvenanceSource = {
    type: 'telemetry',
    sourceId: 'telemetry_001',
    label: 'Telemetry Signal',
    timestamp: Date.now(),
    confidence: 'medium',
  };

  describe('wrapArtifactWithProvenance', () => {
    it('should wrap artifact with provenance metadata', () => {
      const artifact = { data: 'test' };
      const provenance = createActionProvenance('action_001', 'Test Action', [mockDoctor]);

      const wrapped = wrapArtifactWithProvenance(artifact, 'artifact_001', 'verify-pack', [
        provenance,
      ]);

      expect(wrapped.artifact).toEqual(artifact);
      expect(wrapped.provenanceMetadata.artifactId).toBe('artifact_001');
      expect(wrapped.provenanceMetadata.artifactType).toBe('verify-pack');
      expect(wrapped.provenanceMetadata.actionProvenances).toHaveLength(1);
    });

    it('should calculate source coverage correctly', () => {
      const prov1 = createActionProvenance('action_001', 'Action 1', [mockDoctor], [mockGraph]);
      const prov2 = createActionProvenance('action_002', 'Action 2', undefined, undefined, [
        mockTelemetry,
      ]);

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [prov1, prov2]);

      expect(wrapped.provenanceMetadata.sourceCoverage.doctor).toBe(1);
      expect(wrapped.provenanceMetadata.sourceCoverage.graph).toBe(1);
      expect(wrapped.provenanceMetadata.sourceCoverage.telemetry).toBe(1);
      expect(wrapped.provenanceMetadata.sourceCoverage.total).toBe(3);
    });

    it('should count audit summary correctly', () => {
      const prov1 = createActionProvenance('action_001', 'High Confidence', [mockDoctor]);
      const prov2 = createActionProvenance('action_002', 'Medium Confidence', [mockGraph]);
      const prov3 = createActionProvenance('action_003', 'No Evidence');

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [
        prov1,
        prov2,
        prov3,
      ]);

      const summary = wrapped.provenanceMetadata.auditSummary;
      expect(summary.totalActions).toBe(3);
      expect(summary.auditableActions).toBe(2);
      expect(summary.highConfidenceCount).toBe(1);
      expect(summary.mediumConfidenceCount).toBe(1);
      expect(summary.lowConfidenceCount).toBe(1);
    });
  });

  describe('exportVerifyPackWithProvenance', () => {
    it('should export verify pack with complete provenance', () => {
      const provenance = createActionProvenance('action_001', 'Run Verify', [mockDoctor]);

      const exported = exportVerifyPackWithProvenance(
        'pack_001',
        [{ command: 'npm test', required: true, scope: 'workspace' }],
        85,
        'ready',
        [],
        [provenance]
      );

      expect(exported.artifact.packId).toBe('pack_001');
      expect(exported.artifact.qualityScore).toBe(85);
      expect(exported.provenanceMetadata.artifactType).toBe('verify-pack');
      expect(exported.provenanceMetadata.auditSummary.auditableActions).toBe(1);
    });

    it('should include blocked reasons in export', () => {
      const provenance = createActionProvenance('action_001', 'Blocked Action', [mockDoctor]);

      const exported = exportVerifyPackWithProvenance(
        'pack_002',
        [],
        50,
        'partial',
        ['Test coverage below 80%', 'Database migration pending'],
        [provenance]
      );

      expect(exported.artifact.blockedReasons).toHaveLength(2);
      expect(exported.artifact.readiness).toBe('partial');
    });
  });

  describe('exportReleaseReadinessWithProvenance', () => {
    it('should export release readiness with provenance', () => {
      const provenance = createActionProvenance(
        'action_001',
        'Release Check',
        [mockDoctor],
        [mockGraph]
      );

      const exported = exportReleaseReadinessWithProvenance(
        'release_001',
        'go',
        92,
        [],
        {
          verifyPackContractStatus: 'compliant',
          sandboxStatus: 'passed',
          scopeKnown: true,
          verifyPathPresent: true,
          rollbackPathPresent: true,
          doctorWarnings: 0,
          doctorErrors: 0,
        },
        '/workspace',
        [provenance]
      );

      expect(exported.artifact.decision).toBe('go');
      expect(exported.artifact.confidence).toBe(92);
      expect(exported.provenanceMetadata.sourceCoverage.doctor).toBe(1);
      expect(exported.provenanceMetadata.sourceCoverage.graph).toBe(1);
    });
  });

  describe('exportReproPackWithProvenance', () => {
    it('should export repro pack with evidence coverage', () => {
      const provenance = createActionProvenance('action_001', 'Repro Step', [mockDoctor]);

      const exported = exportReproPackWithProvenance(
        'repro_001',
        'terminal-bridge',
        'high',
        ['src/main.ts', 'src/utils.ts'],
        [],
        ['Check logs', 'Verify database connection'],
        [provenance],
        'Database timeout'
      );

      expect(exported.artifact.packId).toBe('repro_001');
      expect(exported.artifact.likelyFailureMode).toBe('Database timeout');
      expect(exported.provenanceMetadata.auditSummary.auditableActions).toBe(1);
    });
  });

  describe('formatArtifactAuditNote', () => {
    it('should format artifact as human-readable audit note', () => {
      const provenance = createActionProvenance(
        'action_001',
        'Deploy Fix',
        [mockDoctor],
        [mockGraph]
      );

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [provenance]);
      const note = formatArtifactAuditNote(wrapped);

      expect(note).toContain('# Artifact Audit Report');
      expect(note).toContain('**Artifact Type:** verify-pack');
      expect(note).toContain('Doctor Analysis: 1 sources');
      expect(note).toContain('Deploy Fix');
    });

    it('should include coverage statistics in note', () => {
      const prov1 = createActionProvenance('action_001', 'Action 1', [mockDoctor]);
      const prov2 = createActionProvenance('action_002', 'Action 2', undefined, [mockGraph]);

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [prov1, prov2]);
      const note = formatArtifactAuditNote(wrapped);

      expect(note).toContain('Doctor Analysis: 1 sources');
      expect(note).toContain('Architecture Graph: 1 sources');
      expect(note).toContain('Auditable: 2 (100%)');
    });

    it('should list all actions with confidence levels', () => {
      const prov1 = createActionProvenance('action_001', 'High Conf', [mockDoctor]);
      const prov2 = createActionProvenance('action_002', 'Medium Conf', [mockGraph]);

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [prov1, prov2]);
      const note = formatArtifactAuditNote(wrapped);

      expect(note).toContain('**High Conf** (high)');
      expect(note).toContain('**Medium Conf** (medium)');
    });
  });

  describe('formatArtifactAsJson', () => {
    it('should format artifact as valid JSON with metadata', () => {
      const provenance = createActionProvenance('action_001', 'Test', [mockDoctor]);
      const artifact = { packId: 'pack_001', commands: [] };

      const wrapped = wrapArtifactWithProvenance(artifact, 'artifact_001', 'verify-pack', [
        provenance,
      ]);
      const json = formatArtifactAsJson(wrapped);

      const parsed = JSON.parse(json);
      expect(parsed.version).toBe('1.0');
      expect(parsed.artifact.packId).toBe('pack_001');
      expect(parsed.provenance.artifactId).toBe('artifact_001');
    });

    it('should include action-level source IDs in JSON', () => {
      const provenance = createActionProvenance('action_001', 'Test', [mockDoctor, mockGraph]);

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [provenance]);
      const json = formatArtifactAsJson(wrapped);
      const parsed = JSON.parse(json);

      const action = parsed.provenance.actions[0];
      expect(action.sourceIds).toContain('doctor_001');
      expect(action.sourceIds).toContain('graph_001');
    });

    it('should support custom indentation', () => {
      const provenance = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [provenance]);
      const json = formatArtifactAsJson(wrapped, 4);

      // Should have 4-space indentation
      expect(json).toContain('    ');
    });
  });

  describe('calculateExportIntegrityScore', () => {
    it('should calculate high integrity score for fully auditable export', () => {
      const prov1 = createActionProvenance('action_001', 'Action 1', [
        mockDoctor,
        mockGraph,
        mockTelemetry,
      ]);
      const prov2 = createActionProvenance('action_002', 'Action 2', [mockDoctor]);

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [prov1, prov2]);
      const score = calculateExportIntegrityScore(wrapped);

      expect(score.score).toBeGreaterThanOrEqual(85);
      expect(score.auditability).toBe(100);
    });

    it('should calculate lower score for partially auditable export', () => {
      const prov1 = createActionProvenance('action_001', 'Auditable', [mockDoctor]);
      const prov2 = createActionProvenance('action_002', 'Not Auditable');

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [prov1, prov2]);
      const score = calculateExportIntegrityScore(wrapped);

      expect(score.score).toBeLessThan(100);
      expect(score.auditability).toBe(50);
    });

    it('should provide reasoning based on score', () => {
      const prov = createActionProvenance('action_001', 'Test', [mockDoctor]);

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [prov]);
      const score = calculateExportIntegrityScore(wrapped);

      expect(score.reasoning).toBeTruthy();
      expect(
        ['Excellent', 'Good', 'Fair', 'Limited'].some((r) => score.reasoning.includes(r))
      ).toBe(true);
    });
  });

  describe('verifyExportGovernanceCompliance', () => {
    it('should pass compliance for fully auditable export with high confidence', () => {
      const prov1 = createActionProvenance('action_001', 'Action 1', [mockDoctor]);
      const prov2 = createActionProvenance('action_002', 'Action 2', [mockDoctor]);

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [prov1, prov2]);
      const compliance = verifyExportGovernanceCompliance(wrapped, 80, 50);

      expect(compliance.compliant).toBe(true);
      expect(compliance.violations).toHaveLength(0);
    });

    it('should fail compliance for low auditability', () => {
      const prov1 = createActionProvenance('action_001', 'Auditable', [mockDoctor]);
      const prov2 = createActionProvenance('action_002', 'Not Auditable');
      const prov3 = createActionProvenance('action_003', 'Not Auditable');

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [
        prov1,
        prov2,
        prov3,
      ]);
      const compliance = verifyExportGovernanceCompliance(wrapped, 80, 50);

      expect(compliance.compliant).toBe(false);
      expect(compliance.violations.length).toBeGreaterThan(0);
    });

    it('should warn about missing doctor analysis', () => {
      const prov = createActionProvenance('action_001', 'Graph Only', undefined, [mockGraph]);

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [prov]);
      const compliance = verifyExportGovernanceCompliance(wrapped);

      expect(compliance.warnings.some((w) => w.includes('No doctor analysis'))).toBe(true);
    });

    it('should warn about low confidence actions', () => {
      const prov1 = createActionProvenance('action_001', 'Low Conf', [mockGraph]);
      const prov2 = createActionProvenance('action_002', 'Also Low Conf', [mockTelemetry]);

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [prov1, prov2]);
      const compliance = verifyExportGovernanceCompliance(wrapped, 80, 70);

      expect(compliance.warnings.length).toBeGreaterThan(0);
    });

    it('should support custom compliance thresholds', () => {
      // Create provenances with different confidence levels
      const lowConfProv = createActionProvenance('action_001', 'Low Conf', [mockGraph]);
      const highConfProv = createActionProvenance('action_002', 'High Conf', [mockDoctor]);
      const noSourceProv = createActionProvenance('action_003', 'No Source');

      const wrapped = wrapArtifactWithProvenance({}, 'artifact_001', 'verify-pack', [
        lowConfProv,
        highConfProv,
        noSourceProv,
      ]);

      // Default thresholds (80% auditable, 50% high confidence)
      // 2/3 auditable = 67% < 80%, so should fail
      const defaultCompliance = verifyExportGovernanceCompliance(wrapped);
      expect(defaultCompliance.compliant).toBe(false);

      // Very permissive thresholds: should pass
      const permissive = verifyExportGovernanceCompliance(wrapped, 50, 20);
      expect(permissive.compliant).toBe(true);

      // Very strict thresholds: should fail
      const strict = verifyExportGovernanceCompliance(wrapped, 90, 90);
      expect(strict.compliant).toBe(false);
    });
  });

  describe('export integration scenarios', () => {
    it('should handle complete release readiness export workflow', () => {
      const provenances = [
        // High confidence: doctor + graph + telemetry = 3 sources
        createActionProvenance('action_001', 'Verify Command', [
          mockDoctor,
          mockGraph,
          mockTelemetry,
        ]),
        // High confidence: doctor + telemetry = 2 sources (doctor alone = high)
        createActionProvenance('action_002', 'Deploy', [mockDoctor, mockTelemetry]),
      ];

      const exported = exportReleaseReadinessWithProvenance(
        'release_complete',
        'go',
        95,
        [],
        {
          verifyPackContractStatus: 'compliant',
          sandboxStatus: 'passed',
          scopeKnown: true,
          verifyPathPresent: true,
          rollbackPathPresent: true,
          doctorWarnings: 0,
          doctorErrors: 0,
        },
        '/workspace',
        provenances
      );

      // Verify export integrity
      const integrity = calculateExportIntegrityScore(exported);
      expect(integrity.score).toBeGreaterThanOrEqual(80);

      // Verify governance compliance
      const compliance = verifyExportGovernanceCompliance(exported, 100, 100);
      expect(compliance.compliant).toBe(true);

      // Generate audit note
      const note = formatArtifactAuditNote(exported);
      expect(note).toContain('# Artifact Audit Report');
      expect(['Excellent', 'Good'].some((r) => note.includes(r))).toBe(true);

      // Export as JSON
      const json = formatArtifactAsJson(exported);
      const parsed = JSON.parse(json);
      expect(parsed.provenance.auditSummary.auditableActions).toBe(2);
    });
  });
});
