import {
  detectStackFromBackendHints,
  detectStackFromMarkerSignals,
  type StackDetection,
  type BackendImportHints,
  type BackendImportMarkerSignals,
} from '../core/backendFrameworkContract';
export type {
  DetectedStack,
  StackConfidence,
  StackDetection,
} from '../core/backendFrameworkContract';

type ByopDiscoveryLike = BackendImportHints;

export type ProjectSignals = BackendImportMarkerSignals;

export function normalizeProjectName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.git$/i, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 64);
}

export function detectProjectStackFromSignals(signals: ProjectSignals): StackDetection {
  return detectStackFromMarkerSignals(signals);
}

export function detectProjectStackFromByopDiscovery(discovery: ByopDiscoveryLike): StackDetection {
  return detectStackFromBackendHints(discovery);
}

export function deriveProjectNameFromGitUrl(gitUrl: string): string {
  const trimmed = gitUrl.trim();
  if (!trimmed) {
    return 'imported-project';
  }

  const slashBased = trimmed.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  const lastSlashSegment = slashBased[slashBased.length - 1] || trimmed;

  const colonSegments = lastSlashSegment.split(':');
  const candidate = (colonSegments[colonSegments.length - 1] || lastSlashSegment).replace(
    /\.git$/i,
    ''
  );

  const normalized = normalizeProjectName(candidate);
  return normalized || 'imported-project';
}
