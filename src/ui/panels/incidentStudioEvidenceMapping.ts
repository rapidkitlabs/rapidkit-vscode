/**
 * Evidence Mapping for Incident Studio Recommendations
 *
 * Tracks the source of evidence supporting each recommendation and provides
 * confidence indicators based on evidence quality and redundancy.
 *
 * S2-005: Maps recommendations to doctor/graph/telemetry sources with
 * evidence ID badges for complete traceability.
 */

/**
 * Evidence source types - where a recommendation gets its support from
 */
export type EvidenceSourceType = 'doctor' | 'graph' | 'telemetry' | 'composite';

/**
 * Individual evidence source with metadata
 */
export interface EvidenceSource {
  type: EvidenceSourceType;
  id: string; // e.g., "doctor_001", "graph_system", "telemetry_route_precision"
  label: string; // Human-readable label
  confidence: 'high' | 'medium' | 'low'; // Quality signal
  timestamp?: number; // When evidence was collected
}

/**
 * Recommendation evidence mapping
 */
export interface RecommendationEvidence {
  recommendationId: string;
  sources: EvidenceSource[];
  overallConfidence: 'high' | 'medium' | 'low';
  evidenceCount: number;
  sourceBreakdown: {
    doctor: number;
    graph: number;
    telemetry: number;
  };
}

/**
 * Evidence badge for UI display
 */
export interface EvidenceBadge {
  id: string;
  label: string;
  type: EvidenceSourceType;
  confidence: 'high' | 'medium' | 'low';
  tooltip: string;
}

/**
 * Map a recommendation to its evidence sources
 * Determines confidence based on source types and count
 */
export function mapRecommendationEvidence(
  recommendationId: string,
  doctorEvidence?: string[],
  graphEvidence?: string[],
  telemetryEvidence?: string[]
): RecommendationEvidence {
  const sources: EvidenceSource[] = [];
  const sourceBreakdown = { doctor: 0, graph: 0, telemetry: 0 };

  // Doctor evidence (highest priority - direct analysis)
  if (doctorEvidence && doctorEvidence.length > 0) {
    doctorEvidence.forEach((_id, idx) => {
      sources.push({
        type: 'doctor',
        id: `doctor_${idx}`,
        label: `Doctor ${idx + 1}`,
        confidence: 'high',
      });
      sourceBreakdown.doctor++;
    });
  }

  // Graph evidence (system architecture analysis)
  if (graphEvidence && graphEvidence.length > 0) {
    graphEvidence.forEach((_id, idx) => {
      sources.push({
        type: 'graph',
        id: `graph_${idx}`,
        label: `Architecture ${idx + 1}`,
        confidence: 'medium',
      });
      sourceBreakdown.graph++;
    });
  }

  // Telemetry evidence (runtime behavior)
  if (telemetryEvidence && telemetryEvidence.length > 0) {
    telemetryEvidence.forEach((_id, idx) => {
      sources.push({
        type: 'telemetry',
        id: `telemetry_${idx}`,
        label: `Signal ${idx + 1}`,
        confidence: 'medium',
      });
      sourceBreakdown.telemetry++;
    });
  }

  // Determine overall confidence based on evidence count and types
  // 3+ sources = high confidence (multiple corroborating signals)
  // 2 sources = medium confidence (some corroboration)
  // 1 source = type-dependent confidence (doctor=high, others=medium)
  // 0 sources = low confidence
  let overallConfidence: 'high' | 'medium' | 'low' = 'low';

  if (sources.length >= 3) {
    // Multiple evidence sources provides high confidence
    overallConfidence = 'high';
  } else if (sources.length === 2) {
    // Two sources (any combination) = medium confidence
    overallConfidence = 'medium';
  } else if (sources.length === 1) {
    // Single source - confidence depends on type
    const singleSource = sources[0];
    overallConfidence = singleSource.confidence;
  }

  return {
    recommendationId,
    sources,
    overallConfidence,
    evidenceCount: sources.length,
    sourceBreakdown,
  };
}

/**
 * Generate badges for display in UI
 */
export function generateEvidenceBadges(evidence: RecommendationEvidence): EvidenceBadge[] {
  return evidence.sources.map((source) => ({
    id: source.id,
    label: source.label,
    type: source.type,
    confidence: source.confidence,
    tooltip: `Evidence from ${source.type}: ${source.label}`,
  }));
}

/**
 * Format evidence summary for display
 */
export function formatEvidenceSummary(evidence: RecommendationEvidence): string {
  const parts: string[] = [];

  if (evidence.sourceBreakdown.doctor > 0) {
    parts.push(`${evidence.sourceBreakdown.doctor} doctor`);
  }
  if (evidence.sourceBreakdown.graph > 0) {
    parts.push(`${evidence.sourceBreakdown.graph} arch`);
  }
  if (evidence.sourceBreakdown.telemetry > 0) {
    parts.push(`${evidence.sourceBreakdown.telemetry} signal`);
  }

  if (parts.length === 0) {
    return 'No evidence';
  }

  return `${parts.join(' + ')} evidence`;
}

/**
 * Get confidence indicator for display
 */
export function getConfidenceIndicator(confidence: 'high' | 'medium' | 'low'): {
  icon: string;
  label: string;
  color: string;
} {
  const indicators = {
    high: { icon: '✓', label: 'High', color: '#10b981' }, // green
    medium: { icon: '◐', label: 'Medium', color: '#f59e0b' }, // amber
    low: { icon: '○', label: 'Low', color: '#6b7280' }, // gray
  };
  return indicators[confidence];
}

/**
 * Merge evidence from multiple sources
 * Used when a recommendation appears in multiple analysis passes
 */
export function mergeEvidenceSources(
  existing: RecommendationEvidence,
  additional: RecommendationEvidence
): RecommendationEvidence {
  // Deduplicate sources by ID
  const sourceMap = new Map<string, EvidenceSource>();
  [...existing.sources, ...additional.sources].forEach((source) => {
    if (!sourceMap.has(source.id)) {
      sourceMap.set(source.id, source);
    }
  });

  const mergedSources = Array.from(sourceMap.values());
  const mergedBreakdown = {
    doctor: mergedSources.filter((s) => s.type === 'doctor').length,
    graph: mergedSources.filter((s) => s.type === 'graph').length,
    telemetry: mergedSources.filter((s) => s.type === 'telemetry').length,
  };

  // Recalculate confidence based on merged sources
  let mergedConfidence: 'high' | 'medium' | 'low' = 'low';
  if (mergedSources.length >= 3) {
    // Multiple evidence sources provides high confidence
    mergedConfidence = 'high';
  } else if (mergedSources.length === 2) {
    // Two sources = medium confidence
    mergedConfidence = 'medium';
  } else if (mergedSources.length === 1) {
    // Single source - confidence depends on type
    mergedConfidence = mergedSources[0].confidence;
  }

  return {
    recommendationId: existing.recommendationId,
    sources: mergedSources,
    overallConfidence: mergedConfidence,
    evidenceCount: mergedSources.length,
    sourceBreakdown: mergedBreakdown,
  };
}

/**
 * Filter recommendations by confidence level
 */
export function filterByConfidence(
  recommendations: RecommendationEvidence[],
  minimumConfidence: 'high' | 'medium' | 'low'
): RecommendationEvidence[] {
  const confidenceLevels = { high: 3, medium: 2, low: 1 };
  const minimum = confidenceLevels[minimumConfidence];

  return recommendations.filter((rec) => {
    const recLevel = confidenceLevels[rec.overallConfidence];
    return recLevel >= minimum;
  });
}

/**
 * Calculate evidence coverage across all recommendations
 */
export function calculateEvidenceCoverage(recommendations: RecommendationEvidence[]): {
  totalRecommendations: number;
  high: number;
  medium: number;
  low: number;
  averageSourceCount: number;
} {
  const counts = {
    high: recommendations.filter((r) => r.overallConfidence === 'high').length,
    medium: recommendations.filter((r) => r.overallConfidence === 'medium').length,
    low: recommendations.filter((r) => r.overallConfidence === 'low').length,
  };

  const totalSources = recommendations.reduce((sum, r) => sum + r.evidenceCount, 0);
  const averageSourceCount = recommendations.length > 0 ? totalSources / recommendations.length : 0;

  return {
    totalRecommendations: recommendations.length,
    ...counts,
    averageSourceCount: Math.round(averageSourceCount * 10) / 10, // Round to 1 decimal
  };
}
