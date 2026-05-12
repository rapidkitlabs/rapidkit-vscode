/**
 * Confidence Provenance Breakdown UI Components
 *
 * Display confidence scores, source breakdown, and evidence traceability in the Incident Studio UI.
 * S4-003: Add confidence provenance breakdown in UI and export payload
 */

import type { ActionProvenance } from './incidentStudioEvidenceProvenance';
import { generateProvenanceBreakdown } from './incidentStudioEvidenceProvenance';

/**
 * UI component state for confidence display
 */
export interface ConfidenceUIState {
  actionId: string;
  showBreakdown: boolean;
  showExpertMode: boolean;
  expandedSourceType?: 'doctor' | 'graph' | 'telemetry' | 'user-context';
}

/**
 * Rendered confidence indicator for UI display
 */
export interface ConfidenceIndicator {
  confidence: 'high' | 'medium' | 'low';
  score: number; // 0-100
  label: string;
  color: 'success' | 'warning' | 'info';
  icon: string;
}

/**
 * Source entry for expert mode display
 */
export interface SourceEntry {
  sourceId: string;
  type: 'doctor' | 'graph' | 'telemetry' | 'user-context';
  label: string;
  timestamp: number;
  confidence: 'high' | 'medium' | 'low';
  metadata?: Record<string, unknown>;
  freshness: 'current' | 'recent' | 'stale'; // based on age
}

/**
 * Calculate freshness indicator based on source timestamp
 */
export function calculateSourceFreshness(
  timestamp: number,
  nowMs = Date.now()
): 'current' | 'recent' | 'stale' {
  const ageMs = nowMs - timestamp;
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours < 1) {
    return 'current';
  }
  if (ageHours < 24) {
    return 'recent';
  }
  return 'stale';
}

/**
 * Format timestamp for display
 */
export function formatSourceTimestamp(timestamp: number): string {
  const now = Date.now();
  const ageMs = now - timestamp;
  const ageSeconds = ageMs / 1000;
  const ageMinutes = ageSeconds / 60;
  const ageHours = ageMinutes / 60;
  const ageDays = ageHours / 24;

  if (ageSeconds < 60) {
    return 'just now';
  }
  if (ageMinutes < 60) {
    return `${Math.round(ageMinutes)}m ago`;
  }
  if (ageHours < 24) {
    return `${Math.round(ageHours)}h ago`;
  }
  if (ageDays < 7) {
    return `${Math.round(ageDays)}d ago`;
  }

  // Fallback to ISO date for older timestamps
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Convert provenance confidence level to UI indicator
 */
export function toConfidenceIndicator(provenance: ActionProvenance): ConfidenceIndicator {
  const breakdown = generateProvenanceBreakdown(provenance);
  const confidenceScore = breakdown.confidenceScore;

  let color: 'success' | 'warning' | 'info';
  let icon: string;

  if (provenance.overallConfidence === 'high') {
    color = 'success';
    icon = '✓';
  } else if (provenance.overallConfidence === 'medium') {
    color = 'warning';
    icon = '⚠';
  } else {
    color = 'info';
    icon = 'ⓘ';
  }

  return {
    confidence: provenance.overallConfidence,
    score: confidenceScore,
    label: `${provenance.overallConfidence.toUpperCase()} (${confidenceScore}%)`,
    color,
    icon,
  };
}

/**
 * Format source list for expert mode display
 */
export function formatSourcesForExpertDisplay(
  provenance: ActionProvenance,
  nowMs = Date.now()
): SourceEntry[] {
  return provenance.sources.map((source) => ({
    sourceId: source.sourceId,
    type: source.type,
    label: source.label,
    timestamp: source.timestamp,
    confidence: source.confidence,
    metadata: source.metadata,
    freshness: calculateSourceFreshness(source.timestamp, nowMs),
  }));
}

/**
 * Generate confidence tooltip text
 */
export function generateConfidenceTooltip(provenance: ActionProvenance): string {
  const breakdown = generateProvenanceBreakdown(provenance);
  const lines = [
    `Confidence: ${provenance.overallConfidence.toUpperCase()}`,
    `Score: ${breakdown.confidenceScore}%`,
    ``,
    `Evidence:`,
  ];

  // Access the sources structure - primary is a single source or null
  if (breakdown.sources.primary) {
    lines.push(`• Primary: ${breakdown.sources.primary.label}`);
  }
  if (breakdown.sources.secondary.length > 0) {
    lines.push(`• Secondary (${breakdown.sources.secondary.length})`);
  }
  if (breakdown.sources.weak.length > 0) {
    lines.push(`• Weak (${breakdown.sources.weak.length})`);
  }

  lines.push(``, breakdown.reasoning);

  return lines.join('\n');
}

/**
 * Generate HTML for confidence badge
 */
export function generateConfidenceBadgeHTML(provenance: ActionProvenance): string {
  const indicator = toConfidenceIndicator(provenance);
  const tooltip = generateConfidenceTooltip(provenance).replace(/"/g, '&quot;');

  const colorClass = {
    success: 'confidence-badge-success',
    warning: 'confidence-badge-warning',
    info: 'confidence-badge-info',
  }[indicator.color];

  return `
        <span class="confidence-badge ${colorClass}" title="${tooltip}" data-tooltip="true">
            <span class="confidence-icon">${indicator.icon}</span>
            <span class="confidence-label">${indicator.label}</span>
        </span>
    `;
}

/**
 * Generate HTML for expert source tree
 */
export function generateSourceTreeHTML(
  provenance: ActionProvenance,
  baseClass = 'source-tree'
): string {
  const sources = formatSourcesForExpertDisplay(provenance);

  // Group sources by type
  const byType: Record<string, SourceEntry[]> = {
    doctor: [],
    graph: [],
    telemetry: [],
    'user-context': [],
  };

  sources.forEach((source) => {
    byType[source.type].push(source);
  });

  const typeLabels: Record<string, string> = {
    doctor: '🏥 Doctor Analysis',
    graph: '📊 Architecture Graph',
    telemetry: '📡 Telemetry Signals',
    'user-context': '👤 User Context',
  };

  let html = `<div class="${baseClass}">`;

  // Render each source type with sources
  for (const [type, entries] of Object.entries(byType)) {
    if (entries.length === 0) {
      continue;
    }

    html += `
            <div class="source-type">
                <div class="source-type-header">
                    <span class="source-type-label">${typeLabels[type]}</span>
                    <span class="source-count">${entries.length}</span>
                </div>
                <div class="source-list">
        `;

    entries.forEach((source) => {
      const freshnessClass = `freshness-${source.freshness}`;
      const freshness = formatSourceTimestamp(source.timestamp);

      html += `
                <div class="source-entry ${freshnessClass}">
                    <div class="source-entry-header">
                        <span class="source-label">${source.label}</span>
                        <span class="source-confidence confidence-${source.confidence}">${source.confidence}</span>
                    </div>
                    <div class="source-entry-meta">
                        <span class="source-id">${source.sourceId}</span>
                        <span class="source-time">${freshness}</span>
                    </div>
                </div>
            `;
    });

    html += `
                </div>
            </div>
        `;
  }

  html += `</div>`;

  return html;
}

/**
 * Generate inline confidence indicator HTML (badge only, no tooltip)
 */
export function generateInlineConfidenceHTML(provenance: ActionProvenance): string {
  const indicator = toConfidenceIndicator(provenance);

  const colorClass = {
    success: 'confidence-badge-success',
    warning: 'confidence-badge-warning',
    info: 'confidence-badge-info',
  }[indicator.color];

  return `<span class="confidence-inline ${colorClass}">${indicator.icon}</span>`;
}

/**
 * Render audit trail for export display
 */
export function generateAuditTrailHTML(
  actionLabel: string,
  provenance: ActionProvenance,
  baseClass = 'audit-trail'
): string {
  const breakdown = generateProvenanceBreakdown(provenance);

  return `
        <div class="${baseClass}">
            <div class="audit-action-label">${actionLabel}</div>
            <div class="audit-sources">
                <div class="audit-source-ids">${breakdown.auditTrail}</div>
            </div>
            <div class="audit-reasoning">${breakdown.reasoning}</div>
        </div>
    `;
}

/**
 * Initialize confidence UI state for an action
 */
export function initializeConfidenceUIState(actionId: string): ConfidenceUIState {
  return {
    actionId,
    showBreakdown: false,
    showExpertMode: false,
  };
}

/**
 * Toggle breakdown display
 */
export function toggleConfidenceBreakdown(state: ConfidenceUIState): ConfidenceUIState {
  return {
    ...state,
    showBreakdown: !state.showBreakdown,
  };
}

/**
 * Toggle expert mode display
 */
export function toggleExpertMode(state: ConfidenceUIState): ConfidenceUIState {
  return {
    ...state,
    showExpertMode: !state.showExpertMode,
  };
}

/**
 * Set expanded source type in expert mode
 */
export function setExpandedSourceType(
  state: ConfidenceUIState,
  sourceType?: 'doctor' | 'graph' | 'telemetry' | 'user-context'
): ConfidenceUIState {
  return {
    ...state,
    expandedSourceType: state.expandedSourceType === sourceType ? undefined : sourceType,
  };
}
