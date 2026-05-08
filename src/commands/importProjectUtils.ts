export type StackConfidence = 'high' | 'medium' | 'low';
export type DetectedStack =
  | 'fastapi'
  | 'django'
  | 'flask'
  | 'nestjs'
  | 'express'
  | 'koa'
  | 'go'
  | 'springboot'
  | 'rails'
  | 'dotnet'
  | 'unknown';

export interface StackDetection {
  stack: DetectedStack;
  confidence: StackConfidence;
}

type ByopDiscoveryLike = {
  framework?: string;
  runtime?: string;
  confidenceLevel?: StackConfidence;
};

export interface ProjectSignals {
  hasPyProject: boolean;
  hasGoMod: boolean;
  hasPomXml: boolean;
  hasGradle: boolean;
  hasGradleKts: boolean;
  hasPackageJson: boolean;
  hasNestDependency: boolean;
}

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
  if (signals.hasPyProject) {
    return { stack: 'unknown', confidence: 'medium' };
  }

  if (signals.hasNestDependency) {
    return { stack: 'nestjs', confidence: 'high' };
  }

  if (signals.hasPackageJson) {
    return { stack: 'unknown', confidence: 'medium' };
  }

  if (signals.hasGoMod) {
    return { stack: 'go', confidence: 'high' };
  }

  if (signals.hasPomXml || signals.hasGradle || signals.hasGradleKts) {
    return { stack: 'springboot', confidence: 'high' };
  }

  return { stack: 'unknown', confidence: 'low' };
}

export function detectProjectStackFromByopDiscovery(discovery: ByopDiscoveryLike): StackDetection {
  const framework = String(discovery.framework || '')
    .trim()
    .toLowerCase();
  const runtime = String(discovery.runtime || '')
    .trim()
    .toLowerCase();
  const confidence: StackConfidence =
    discovery.confidenceLevel === 'high' ||
    discovery.confidenceLevel === 'medium' ||
    discovery.confidenceLevel === 'low'
      ? discovery.confidenceLevel
      : 'low';

  if (framework === 'fastapi') {
    return { stack: 'fastapi', confidence };
  }
  if (framework === 'django') {
    return { stack: 'django', confidence };
  }
  if (framework === 'flask') {
    return { stack: 'flask', confidence };
  }
  if (framework === 'nestjs') {
    return { stack: 'nestjs', confidence };
  }
  if (framework === 'express') {
    return { stack: 'express', confidence };
  }
  if (framework === 'koa') {
    return { stack: 'koa', confidence };
  }
  if (framework === 'gin' || framework === 'echo' || runtime === 'go') {
    return { stack: 'go', confidence };
  }
  if (framework === 'spring' || framework === 'springboot' || runtime === 'java') {
    return { stack: 'springboot', confidence };
  }
  if (framework === 'rails' || runtime === 'ruby') {
    return { stack: 'rails', confidence };
  }
  if (framework === 'dotnet' || runtime === 'csharp') {
    return { stack: 'dotnet', confidence };
  }

  return { stack: 'unknown', confidence };
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
