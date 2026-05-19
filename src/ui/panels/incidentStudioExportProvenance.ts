/**
 * Export Artifacts with Source Coverage
 *
 * Extends artifact export (verify pack, release readiness, repro pack) to include
 * complete evidence provenance metadata for audit trail and governance.
 *
 * S4-002: Include doctor, graph, telemetry, and user context source coverage in exports
 */

import type { ActionProvenance } from './incidentStudioEvidenceProvenance';

/**
 * Artifact export with full evidence coverage
 */
export interface ArtifactWithProvenance<T = object> {
  artifact: T;
  provenanceMetadata: {
    exportedAt: number;
    exportedAtIso: string;
    artifactId: string;
    artifactType: 'verify-pack' | 'release-readiness' | 'repro-pack';
    actionProvenances: ActionProvenance[];
    auditSummary: {
      totalActions: number;
      auditableActions: number;
      highConfidenceCount: number;
      mediumConfidenceCount: number;
      lowConfidenceCount: number;
    };
    sourceCoverage: {
      doctor: number;
      graph: number;
      telemetry: number;
      userContext: number;
      total: number;
    };
  };
}

/**
 * Verify pack with evidence provenance
 */
export interface VerifyPackExport {
  packId: string;
  commands: Array<{
    command: string;
    required: boolean;
    scope: 'workspace' | 'project';
  }>;
  qualityScore: number;
  readiness: 'ready' | 'partial' | 'unready';
  blockedReasons: string[];
  generatedAt: number;
}

/**
 * Release readiness artifact with source coverage
 */
export interface ReleaseReadinessExport {
  artifactId: string;
  decision: 'go' | 'no-go';
  confidence: number;
  blockers: string[];
  evidence: {
    verifyPackContractStatus: string;
    sandboxStatus: string;
    scopeKnown: boolean;
    verifyPathPresent: boolean;
    rollbackPathPresent: boolean;
    doctorWarnings: number;
    doctorErrors: number;
  };
  generatedAt: number;
  workspacePath: string;
}

/**
 * Repro pack with evidence references
 */
export interface ReproPackExport {
  packId: string;
  actionType: string;
  riskLevel: string;
  relatedFiles: string[];
  blockedReasons: string[];
  verifyChecklist: string[];
  likelyFailureMode?: string;
  generatedAt: number;
}

/**
 * Wrap artifact export with complete provenance metadata
 */
export function wrapArtifactWithProvenance<T extends object>(
  artifact: T,
  artifactId: string,
  artifactType: 'verify-pack' | 'release-readiness' | 'repro-pack',
  actionProvenances: ActionProvenance[]
): ArtifactWithProvenance<T> {
  // Calculate coverage statistics
  const sourceCoverage = {
    doctor: actionProvenances.reduce((sum, p) => sum + p.sourceBreakdown.doctor, 0),
    graph: actionProvenances.reduce((sum, p) => sum + p.sourceBreakdown.graph, 0),
    telemetry: actionProvenances.reduce((sum, p) => sum + p.sourceBreakdown.telemetry, 0),
    userContext: actionProvenances.reduce((sum, p) => sum + p.sourceBreakdown.userContext, 0),
    total: actionProvenances.reduce((sum, p) => sum + p.sourceCount, 0),
  };

  // Count confidence levels
  const auditSummary = {
    totalActions: actionProvenances.length,
    auditableActions: actionProvenances.filter((p) => p.isAuditable).length,
    highConfidenceCount: actionProvenances.filter((p) => p.overallConfidence === 'high').length,
    mediumConfidenceCount: actionProvenances.filter((p) => p.overallConfidence === 'medium').length,
    lowConfidenceCount: actionProvenances.filter((p) => p.overallConfidence === 'low').length,
  };

  const now = Date.now();

  return {
    artifact,
    provenanceMetadata: {
      exportedAt: now,
      exportedAtIso: new Date(now).toISOString(),
      artifactId,
      artifactType,
      actionProvenances,
      auditSummary,
      sourceCoverage,
    },
  };
}

/**
 * Export verify pack with full evidence coverage
 */
export function exportVerifyPackWithProvenance(
  packId: string,
  commands: Array<{ command: string; required: boolean; scope: 'workspace' | 'project' }>,
  qualityScore: number,
  readiness: 'ready' | 'partial' | 'unready',
  blockedReasons: string[],
  actionProvenances: ActionProvenance[]
): ArtifactWithProvenance<VerifyPackExport> {
  const verifyPack: VerifyPackExport = {
    packId,
    commands,
    qualityScore,
    readiness,
    blockedReasons,
    generatedAt: Date.now(),
  };

  return wrapArtifactWithProvenance(verifyPack, packId, 'verify-pack', actionProvenances);
}

/**
 * Export release readiness with full evidence coverage
 */
export function exportReleaseReadinessWithProvenance(
  artifactId: string,
  decision: 'go' | 'no-go',
  confidence: number,
  blockers: string[],
  evidence: ReleaseReadinessExport['evidence'],
  workspacePath: string,
  actionProvenances: ActionProvenance[]
): ArtifactWithProvenance<ReleaseReadinessExport> {
  const releaseReadiness: ReleaseReadinessExport = {
    artifactId,
    decision,
    confidence,
    blockers,
    evidence,
    generatedAt: Date.now(),
    workspacePath,
  };

  return wrapArtifactWithProvenance(
    releaseReadiness,
    artifactId,
    'release-readiness',
    actionProvenances
  );
}

/**
 * Export repro pack with full evidence coverage
 */
export function exportReproPackWithProvenance(
  packId: string,
  actionType: string,
  riskLevel: string,
  relatedFiles: string[],
  blockedReasons: string[],
  verifyChecklist: string[],
  actionProvenances: ActionProvenance[],
  likelyFailureMode?: string
): ArtifactWithProvenance<ReproPackExport> {
  const reproPack: ReproPackExport = {
    packId,
    actionType,
    riskLevel,
    relatedFiles,
    blockedReasons,
    verifyChecklist,
    likelyFailureMode,
    generatedAt: Date.now(),
  };

  return wrapArtifactWithProvenance(reproPack, packId, 'repro-pack', actionProvenances);
}

/**
 * Format artifact export as human-readable audit note
 */
export function formatArtifactAuditNote<T extends object>(
  wrapped: ArtifactWithProvenance<T>
): string {
  const meta = wrapped.provenanceMetadata;
  const coverage = meta.sourceCoverage;
  const summary = meta.auditSummary;

  // Calculate integrity score for reasoning
  const integrity = calculateExportIntegrityScore(wrapped);

  const lines = [
    `# Artifact Audit Report`,
    ``,
    `**Artifact Type:** ${meta.artifactType}`,
    `**Artifact ID:** ${meta.artifactId}`,
    `**Exported At:** ${meta.exportedAtIso}`,
    `**Integrity Score:** ${integrity.score}/100 - ${integrity.reasoning}`,
    ``,
    `## Evidence Coverage`,
    ``,
    `- Doctor Analysis: ${coverage.doctor} sources`,
    `- Architecture Graph: ${coverage.graph} sources`,
    `- Telemetry Signals: ${coverage.telemetry} sources`,
    `- User Context: ${coverage.userContext} sources`,
    `- **Total Evidence Points:** ${coverage.total}`,
    ``,
    `## Action Auditability`,
    ``,
    `- Total Actions: ${summary.totalActions}`,
    `- Auditable: ${summary.auditableActions} (${summary.totalActions > 0 ? Math.round((summary.auditableActions / summary.totalActions) * 100) : 0}%)`,
    `- High Confidence: ${summary.highConfidenceCount}`,
    `- Medium Confidence: ${summary.mediumConfidenceCount}`,
    `- Low Confidence: ${summary.lowConfidenceCount}`,
    ``,
    `## Audit Trail`,
    ``,
  ];

  // Add action-level audit entries
  meta.actionProvenances.forEach((ap) => {
    const sourceIds = ap.sources.map((s) => s.sourceId).join(', ');
    lines.push(`- **${ap.actionLabel}** (${ap.overallConfidence}): ${sourceIds || '(no sources)'}`);
  });

  return lines.join('\n');
}

/**
 * Format artifact export for JSON with metadata
 */
export function formatArtifactAsJson<T extends Record<string, unknown>>(
  wrapped: ArtifactWithProvenance<T>,
  indent = 2
): string {
  // Create a structured export including both artifact and provenance
  const exportData = {
    version: '1.0',
    exportedAt: wrapped.provenanceMetadata.exportedAtIso,
    artifact: wrapped.artifact,
    provenance: {
      artifactType: wrapped.provenanceMetadata.artifactType,
      artifactId: wrapped.provenanceMetadata.artifactId,
      auditSummary: wrapped.provenanceMetadata.auditSummary,
      sourceCoverage: wrapped.provenanceMetadata.sourceCoverage,
      actions: wrapped.provenanceMetadata.actionProvenances.map((ap) => ({
        actionId: ap.actionId,
        actionLabel: ap.actionLabel,
        confidence: ap.overallConfidence,
        sourceCount: ap.sourceCount,
        sourceIds: ap.sources.map((s) => s.sourceId),
        sourceBreakdown: ap.sourceBreakdown,
      })),
    },
  };

  return JSON.stringify(exportData, null, indent);
}

/**
 * Calculate export integrity score (0-100)
 */
export function calculateExportIntegrityScore<T extends object>(
  wrapped: ArtifactWithProvenance<T>
): {
  score: number;
  auditability: number;
  coverage: number;
  reasoning: string;
} {
  const meta = wrapped.provenanceMetadata;
  const summary = meta.auditSummary;
  const coverage = meta.sourceCoverage;

  // Auditability score: % of actions with sources
  const auditability =
    summary.totalActions > 0 ? (summary.auditableActions / summary.totalActions) * 100 : 0;

  // Coverage score: weight by source type quality
  // Doctor = 40 points each, Graph = 30 points, Telemetry = 20 points, UserContext = 10 points
  const maxCoveragePoints = summary.auditableActions * 40; // Assume all doctor coverage is ideal
  const coveragePoints =
    coverage.doctor * 40 +
    coverage.graph * 30 +
    coverage.telemetry * 20 +
    coverage.userContext * 10;
  const coverage_score = maxCoveragePoints > 0 ? (coveragePoints / maxCoveragePoints) * 100 : 0;

  // Confidence boost: more high-confidence actions = better
  const confidenceBoost =
    summary.totalActions > 0 ? (summary.highConfidenceCount / summary.totalActions) * 100 : 0;

  // Overall integrity score (0-100)
  // Weighted average: auditability 50%, coverage 30%, confidence 20%
  const score = Math.min(
    100,
    Math.round(auditability * 0.5 + coverage_score * 0.3 + confidenceBoost * 0.2)
  );

  let reasoning = '';
  if (score >= 85) {
    reasoning = 'Excellent: Comprehensive evidence coverage with high confidence actions';
  } else if (score >= 70) {
    reasoning = 'Good: Solid evidence coverage with mostly medium-high confidence';
  } else if (score >= 50) {
    reasoning = 'Fair: Partial evidence coverage; recommend expanding verification sources';
  } else {
    reasoning = 'Limited: Insufficient evidence; high-risk for governance approval';
  }

  return {
    score,
    auditability: Math.round(auditability),
    coverage: Math.round(coverage_score),
    reasoning,
  };
}

/**
 * Verify export meets governance requirements
 */
export function verifyExportGovernanceCompliance<T extends Record<string, unknown>>(
  wrapped: ArtifactWithProvenance<T>,
  minAuditablePercent = 80,
  minHighConfidencePercent = 50
): {
  compliant: boolean;
  violations: string[];
  warnings: string[];
} {
  const meta = wrapped.provenanceMetadata;
  const summary = meta.auditSummary;
  const coverage = meta.sourceCoverage;
  const violations: string[] = [];
  const warnings: string[] = [];

  // Check auditability
  const auditablePercent =
    summary.totalActions > 0 ? (summary.auditableActions / summary.totalActions) * 100 : 0;
  if (auditablePercent < minAuditablePercent) {
    violations.push(
      `Only ${Math.round(auditablePercent)}% of actions are auditable (required: ${minAuditablePercent}%)`
    );
  }

  // Check high confidence
  const highConfidencePercent =
    summary.totalActions > 0 ? (summary.highConfidenceCount / summary.totalActions) * 100 : 0;
  if (highConfidencePercent < minHighConfidencePercent) {
    warnings.push(
      `Only ${Math.round(highConfidencePercent)}% of actions are high confidence (recommended: ${minHighConfidencePercent}%)`
    );
  }

  // Check coverage diversity
  if (coverage.doctor === 0) {
    warnings.push('No doctor analysis in evidence coverage');
  }
  if (coverage.graph === 0 && coverage.telemetry === 0) {
    warnings.push('Minimal system analysis evidence (missing graph or telemetry)');
  }

  return {
    compliant: violations.length === 0,
    violations,
    warnings,
  };
}
