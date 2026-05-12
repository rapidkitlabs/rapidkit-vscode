/**
 * Evidence Provenance Tagging for Board Actions
 *
 * Attaches traceable evidence source references to each board action,
 * enabling full auditability and expert-mode drill-down.
 *
 * S4-001: Evidence provenance tags on critical recommendations
 */

/**
 * Evidence source metadata with traceability ID
 */
export interface EvidenceProvenanceSource {
  type: 'doctor' | 'graph' | 'telemetry' | 'user-context';
  sourceId: string; // Traceable ID: "doctor_check_123", "graph_edge_456", etc.
  label: string; // Human-readable: "Doctor Health Check", "System Graph Edge", etc.
  timestamp: number; // When evidence was collected
  confidence: 'high' | 'medium' | 'low';
  metadata?: Record<string, unknown>; // Source-specific details (check name, severity, etc.)
}

/**
 * Provenance record for a single board action
 */
export interface ActionProvenance {
  actionId: string;
  actionLabel: string;
  sources: EvidenceProvenanceSource[];
  overallConfidence: 'high' | 'medium' | 'low';
  sourceCount: number;
  sourceBreakdown: {
    doctor: number;
    graph: number;
    telemetry: number;
    userContext: number;
  };
  isAuditable: boolean; // True if has any provenance sources
  generatedAt: number;
}

/**
 * Provenance breakdown showing confidence reasoning
 */
export interface ProvenanceBreakdown {
  actionId: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number; // 0-100
  reasoning: string; // Human-readable explanation
  sources: {
    count: number;
    primary: EvidenceProvenanceSource | null;
    secondary: EvidenceProvenanceSource[];
    weak: EvidenceProvenanceSource[];
  };
  auditTrail: string; // For export: comma-separated source IDs
}

/**
 * Create a provenance record for a board action
 */
export function createActionProvenance(
  actionId: string,
  actionLabel: string,
  doctorSources?: EvidenceProvenanceSource[],
  graphSources?: EvidenceProvenanceSource[],
  telemetrySources?: EvidenceProvenanceSource[],
  userContextSources?: EvidenceProvenanceSource[]
): ActionProvenance {
  const sources: EvidenceProvenanceSource[] = [];
  const sourceBreakdown = { doctor: 0, graph: 0, telemetry: 0, userContext: 0 };

  // Aggregate all sources
  if (doctorSources) {
    sources.push(...doctorSources);
    sourceBreakdown.doctor = doctorSources.length;
  }
  if (graphSources) {
    sources.push(...graphSources);
    sourceBreakdown.graph = graphSources.length;
  }
  if (telemetrySources) {
    sources.push(...telemetrySources);
    sourceBreakdown.telemetry = telemetrySources.length;
  }
  if (userContextSources) {
    sources.push(...userContextSources);
    sourceBreakdown.userContext = userContextSources.length;
  }

  // Calculate overall confidence
  // High: 3+ sources OR doctor alone
  // Medium: 2 sources (any mix)
  // Low: 1 non-doctor source
  let overallConfidence: 'high' | 'medium' | 'low' = 'low';

  if (sources.length >= 3) {
    overallConfidence = 'high';
  } else if (sources.length === 2) {
    overallConfidence = 'medium';
  } else if (sources.length === 1) {
    overallConfidence = sources[0].type === 'doctor' ? 'high' : 'medium';
  }

  return {
    actionId,
    actionLabel,
    sources,
    overallConfidence,
    sourceCount: sources.length,
    sourceBreakdown,
    isAuditable: sources.length > 0,
    generatedAt: Date.now(),
  };
}

/**
 * Merge provenance records for the same action
 */
export function mergeProvenanceRecords(
  existing: ActionProvenance,
  additional: ActionProvenance
): ActionProvenance {
  // Deduplicate by sourceId
  const sourceMap = new Map<string, EvidenceProvenanceSource>();

  for (const source of existing.sources) {
    sourceMap.set(source.sourceId, source);
  }

  for (const source of additional.sources) {
    sourceMap.set(source.sourceId, source);
  }

  const mergedSources = Array.from(sourceMap.values());

  // Recalculate confidence with merged sources
  let overallConfidence: 'high' | 'medium' | 'low' = 'low';
  if (mergedSources.length >= 3) {
    overallConfidence = 'high';
  } else if (mergedSources.length === 2) {
    overallConfidence = 'medium';
  } else if (mergedSources.length === 1) {
    overallConfidence = mergedSources[0].type === 'doctor' ? 'high' : 'medium';
  }

  const sourceBreakdown = {
    doctor: mergedSources.filter((s) => s.type === 'doctor').length,
    graph: mergedSources.filter((s) => s.type === 'graph').length,
    telemetry: mergedSources.filter((s) => s.type === 'telemetry').length,
    userContext: mergedSources.filter((s) => s.type === 'user-context').length,
  };

  return {
    actionId: existing.actionId,
    actionLabel: existing.actionLabel,
    sources: mergedSources,
    overallConfidence,
    sourceCount: mergedSources.length,
    sourceBreakdown,
    isAuditable: mergedSources.length > 0,
    generatedAt: Date.now(),
  };
}

/**
 * Generate confidence breakdown with reasoning
 */
export function generateProvenanceBreakdown(provenance: ActionProvenance): ProvenanceBreakdown {
  const sortedSources = [...provenance.sources].sort((a, b) => {
    // Sort by confidence and type priority
    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    if (confDiff !== 0) {
      return confDiff;
    }

    const typeOrder = { doctor: 0, graph: 1, telemetry: 2, 'user-context': 3 };
    return typeOrder[a.type] - typeOrder[b.type];
  });

  const primary = sortedSources[0] || null;
  const secondary = sortedSources
    .slice(1)
    .filter((s) => s.confidence === 'high' || s.confidence === 'medium');
  const weak = sortedSources.slice(1).filter((s) => s.confidence === 'low');

  // Calculate confidence score (0-100)
  let confidenceScore = 0;
  if (provenance.sourceCount === 0) {
    confidenceScore = 0;
  } else if (provenance.sourceCount === 1) {
    confidenceScore = provenance.sources[0].type === 'doctor' ? 85 : 60;
  } else if (provenance.sourceCount === 2) {
    confidenceScore = 70;
  } else {
    // 3+ sources
    confidenceScore = 85 + Math.min(15, (provenance.sourceCount - 3) * 5);
  }

  // Generate human-readable reasoning
  let reasoning = '';
  if (provenance.sourceCount === 0) {
    reasoning = 'No corroborating evidence available yet.';
  } else if (provenance.sourceCount === 1) {
    const source = provenance.sources[0];
    if (source.type === 'doctor') {
      reasoning = `Based on direct ${source.label}. Doctor analysis is highest confidence.`;
    } else if (source.type === 'graph') {
      reasoning = `Based on ${source.label}. Architecture analysis provides medium confidence.`;
    } else if (source.type === 'telemetry') {
      reasoning = `Based on ${source.label}. Runtime signals provide medium confidence.`;
    } else {
      reasoning = `Based on ${source.label}. User context provided.`;
    }
  } else if (provenance.sourceCount === 2) {
    const types = new Set(provenance.sources.map((s) => s.type));
    const typeNames = Array.from(types).join(' and ');
    reasoning = `Corroborated by ${typeNames}. Two independent signals increase confidence.`;
  } else {
    reasoning = `Supported by ${provenance.sourceCount} independent evidence sources. High confidence from multiple corroborating signals.`;
  }

  const auditTrail = sortedSources.map((s) => s.sourceId).join(', ');

  return {
    actionId: provenance.actionId,
    confidence: provenance.overallConfidence,
    confidenceScore: Math.min(100, Math.max(0, confidenceScore)),
    reasoning,
    sources: { count: provenance.sourceCount, primary, secondary, weak },
    auditTrail,
  };
}

/**
 * Format provenance for expert-mode display
 */
export function formatProvenanceForExpertDisplay(provenance: ActionProvenance): {
  sourceList: string[];
  auditTree: Array<{ type: string; sources: string[] }>;
  metadata: Record<string, unknown>;
} {
  const sourceList = provenance.sources.map((s) => `${s.sourceId}: ${s.label} (${s.confidence})`);

  const auditTree: Array<{ type: string; sources: string[] }> = [
    {
      type: 'doctor',
      sources: provenance.sources.filter((s) => s.type === 'doctor').map((s) => s.sourceId),
    },
    {
      type: 'graph',
      sources: provenance.sources.filter((s) => s.type === 'graph').map((s) => s.sourceId),
    },
    {
      type: 'telemetry',
      sources: provenance.sources.filter((s) => s.type === 'telemetry').map((s) => s.sourceId),
    },
    {
      type: 'user-context',
      sources: provenance.sources.filter((s) => s.type === 'user-context').map((s) => s.sourceId),
    },
  ].filter((item) => item.sources.length > 0);

  return {
    sourceList,
    auditTree,
    metadata: {
      actionId: provenance.actionId,
      actionLabel: provenance.actionLabel,
      sourceCount: provenance.sourceCount,
      sourceBreakdown: provenance.sourceBreakdown,
      isAuditable: provenance.isAuditable,
      generatedAt: new Date(provenance.generatedAt).toISOString(),
    },
  };
}

/**
 * Export provenance to audit trail format
 */
export function exportProvenanceAuditTrail(provenances: ActionProvenance[]): {
  exportedAt: number;
  actionCount: number;
  auditableCount: number;
  sources: Array<{
    actionId: string;
    actionLabel: string;
    sourceIds: string[];
    confidence: string;
    breakdown: ActionProvenance['sourceBreakdown'];
  }>;
} {
  return {
    exportedAt: Date.now(),
    actionCount: provenances.length,
    auditableCount: provenances.filter((p) => p.isAuditable).length,
    sources: provenances.map((p) => ({
      actionId: p.actionId,
      actionLabel: p.actionLabel,
      sourceIds: p.sources.map((s) => s.sourceId),
      confidence: p.overallConfidence,
      breakdown: p.sourceBreakdown,
    })),
  };
}
