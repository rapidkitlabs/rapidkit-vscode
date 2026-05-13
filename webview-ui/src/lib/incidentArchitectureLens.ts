import type {
  IncidentSystemGraphNode,
  NormalizedIncidentImpactAssessmentPayload,
  NormalizedIncidentPredictiveWarningPayload,
  NormalizedIncidentReleaseGateEvidencePayload,
  NormalizedIncidentSystemGraphSnapshotPayload,
} from './incidentStudioPayload';

export type IncidentArchitectureLensModel = {
  title: string;
  statusLabel: string;
  headline: string;
  graphSummary: string;
  riskTone: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  confidenceLabel: 'low' | 'medium' | 'high';
  confidenceSummary: string;
  impactContractTag?: string;
  blocked: boolean;
  reasons: string[];
  affectedModules: string[];
  affectedFiles: string[];
  affectedTests: string[];
  focusNodes: Array<{
    id: string;
    label: string;
    type: string;
    confidence: number;
    filePath?: string;
    symbolName?: string;
    startLine?: number;
  }>;
  verifyChecklist: string[];
  blockedReasons: string[];
  nextSafeAction?: string;
};

function uniqueNonEmpty(values: Array<string | undefined>, maxItems: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function toRiskTone(riskLevel?: string): IncidentArchitectureLensModel['riskTone'] {
  const normalized = (riskLevel || '').trim().toLowerCase();
  if (normalized === 'critical') {
    return 'critical';
  }
  if (normalized === 'high') {
    return 'high';
  }
  if (normalized === 'medium') {
    return 'medium';
  }
  if (normalized === 'low') {
    return 'low';
  }
  return 'unknown';
}

function toConfidenceLabel(confidence: number): IncidentArchitectureLensModel['confidenceLabel'] {
  if (confidence >= 80) {
    return 'high';
  }
  if (confidence >= 55) {
    return 'medium';
  }
  return 'low';
}

function formatNodeType(nodeType: IncidentSystemGraphNode['type']): string {
  if (nodeType === 'datastore') {
    return 'Datastore';
  }
  return nodeType.charAt(0).toUpperCase() + nodeType.slice(1);
}

function summarizeFocusNodes(
  graphSnapshot?: NormalizedIncidentSystemGraphSnapshotPayload | null
): IncidentArchitectureLensModel['focusNodes'] {
  if (!graphSnapshot?.nodes?.length) {
    return [];
  }

  return [...graphSnapshot.nodes]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 4)
    .map((node) => ({
      id: node.id,
      label: node.label,
      type: formatNodeType(node.type),
      confidence: node.confidence,
      filePath: node.filePath,
      symbolName: node.symbolName,
      startLine: node.startLine,
    }));
}

export function buildIncidentArchitectureLens(input: {
  graphSnapshot?: NormalizedIncidentSystemGraphSnapshotPayload | null;
  impactAssessment?: NormalizedIncidentImpactAssessmentPayload | null;
  predictiveWarning?: NormalizedIncidentPredictiveWarningPayload | null;
  releaseGateEvidence?: NormalizedIncidentReleaseGateEvidencePayload | null;
}): IncidentArchitectureLensModel | null {
  const { graphSnapshot, impactAssessment, predictiveWarning, releaseGateEvidence } = input;

  if (!graphSnapshot && !impactAssessment && !predictiveWarning && !releaseGateEvidence) {
    return null;
  }

  const blockedReasons = uniqueNonEmpty(releaseGateEvidence?.blockedReasons ?? [], 3);
  const blocked = blockedReasons.length > 0;
  const riskTone = toRiskTone(impactAssessment?.riskLevel);
  const contractConfidence = impactAssessment?.impactScoreContract?.confidence;
  const confidenceValue =
    typeof contractConfidence === 'number'
      ? contractConfidence
      : (impactAssessment?.confidence ?? 0);
  const confidenceLabel = toConfidenceLabel(confidenceValue);
  const confidenceSummary = `${confidenceLabel} confidence (${confidenceValue}%)`;
  const impactContractTag = impactAssessment?.impactScoreContract
    ? `${impactAssessment.impactScoreContract.schemaVersion} · ${impactAssessment.impactScoreContract.scoringModelVersion}`
    : undefined;
  const graphSummary = graphSnapshot
    ? `${graphSnapshot.summary.supportedTopology} · ${graphSnapshot.summary.nodeCount} nodes · ${graphSnapshot.summary.edgeCount} edges`
    : 'Graph snapshot pending';

  const reasons = uniqueNonEmpty(
    [
      ...(impactAssessment?.rationale ?? []),
      impactAssessment?.impactScoreContract?.crossServiceBoundaryPaths?.length
        ? `Boundary paths: ${impactAssessment.impactScoreContract.crossServiceBoundaryPaths
            .slice(0, 2)
            .join(', ')}`
        : undefined,
      predictiveWarning?.telemetrySeed?.evidenceSources?.length
        ? `Signals: ${predictiveWarning.telemetrySeed.evidenceSources.join(', ')}`
        : undefined,
      impactContractTag ? `Impact contract: ${impactContractTag}` : undefined,
      releaseGateEvidence
        ? `Gate state: scope ${releaseGateEvidence.scopeKnown ? 'known' : 'unknown'}, verify ${releaseGateEvidence.verifyPathPresent ? 'ready' : 'missing'}, rollback ${releaseGateEvidence.rollbackPathPresent ? 'ready' : 'missing'}`
        : undefined,
    ],
    4
  );

  const verifyChecklist = uniqueNonEmpty(
    [...(impactAssessment?.verifyChecklist ?? []), ...(predictiveWarning?.verifyChecklist ?? [])],
    4
  );

  const statusParts = uniqueNonEmpty(
    [
      blocked ? 'Blocked' : 'Review ready',
      impactAssessment?.riskLevel ? `${impactAssessment.riskLevel} risk` : undefined,
      confidenceSummary,
    ],
    3
  );

  const headline =
    impactAssessment?.likelyFailureMode ||
    predictiveWarning?.predictedFailure ||
    (blocked
      ? 'Mutation is blocked until affected scope, verification, and rollback evidence are explicit.'
      : 'System graph evidence is ready for architecture-aware impact review.');

  const title = blocked
    ? 'Architecture lens: review before mutation'
    : predictiveWarning
      ? 'Architecture lens: predicted blast radius'
      : impactAssessment
        ? 'Architecture lens: current blast radius'
        : 'Architecture lens: system graph loaded';

  return {
    title,
    statusLabel: statusParts.join(' · '),
    headline,
    graphSummary,
    riskTone,
    confidenceLabel,
    confidenceSummary,
    impactContractTag,
    blocked,
    reasons,
    affectedModules: uniqueNonEmpty(impactAssessment?.affectedModules ?? [], 5),
    affectedFiles: uniqueNonEmpty(impactAssessment?.affectedFiles ?? [], 5),
    affectedTests: uniqueNonEmpty(impactAssessment?.affectedTests ?? [], 4),
    focusNodes: summarizeFocusNodes(graphSnapshot),
    verifyChecklist,
    blockedReasons,
    nextSafeAction: predictiveWarning?.nextSafeAction,
  };
}
