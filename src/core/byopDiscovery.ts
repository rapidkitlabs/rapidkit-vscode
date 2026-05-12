/**
 * C02: BYOP Discovery Pipeline
 *
 * Automatically detect runtime, framework, topology, and entry points
 * from any backend repository, enabling import-first analysis for
 * unsupported stacks.
 *
 * Discovery sources (in priority order):
 * 1. detectFromPackageManager - package.json, pyproject.toml, go.mod, etc
 * 2. detectFromDockerfile - Extract base image and RUN commands
 * 3. detectFromEntryPoints - Find main.py, server.js, main.go, etc
 * 4. detectFromImports - Sample top-level imports in source files
 * 5. detectFromBuildConfig - Makefile, docker-compose.yml, tox.ini, etc
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  normalizeBackendFrameworkLabel,
  normalizeBackendRuntimeLabel,
} from './backendFrameworkContract';
import { getAllProfiles, getFrameworkProfile } from './byopFrameworkProfiles';

// ============================================================================
// Types
// ============================================================================

export type RuntimeType = 'python' | 'nodejs' | 'go' | 'java' | 'ruby' | 'csharp' | 'unknown';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface DiscoverySignal {
  source: DiscoverySource;
  framework?: string;
  runtime?: RuntimeType;
  confidence?: number; // 0-1
  evidence?: string; // What file or pattern was matched
  reason?: string;
}

export type DiscoverySource =
  | 'packageManager'
  | 'dockerfile'
  | 'entryPoint'
  | 'imports'
  | 'buildConfig'
  | 'unknown';

export interface SignalSet {
  source: DiscoverySource;
  signals: DiscoverySignal[];
  timestamp: string; // ISO timestamp
}

export interface DiscoveryResult {
  projectPath: string;
  runtime: RuntimeType;
  framework?: string;
  version?: string;
  entryPoint?: string;
  confidenceLevel: ConfidenceLevel;
  reason: string; // Explanation of discovery process
  signalBreakdown: SignalSet[]; // All signals collected (for transparency)
  detectedAt: string; // ISO timestamp
}

export interface PartialTopology {
  serviceCount?: number;
  dataStoreTypes?: string[];
  apiFramework?: string;
  queue?: string;
}

// ============================================================================
// BYOP Discovery Engine
// ============================================================================

export class ByopDiscoveryEngine {
  private projectPath: string;
  private signals: SignalSet[] = [];

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Main discovery method
   * Runs all detection sources and merges signals into final result
   */
  async discover(): Promise<DiscoveryResult> {
    this.signals = [];

    // Collect signals from all sources
    await Promise.all([
      this.detectFromPackageManager(),
      this.detectFromDockerfile(),
      this.detectFromEntryPoints(),
      this.detectFromImports(),
      this.detectFromBuildConfig(),
    ]);

    // Merge signals and determine runtime/framework
    const { runtime, framework, confidenceLevel, reason } = this.mergeSignals();

    return {
      projectPath: this.projectPath,
      runtime,
      framework,
      confidenceLevel,
      reason,
      signalBreakdown: this.signals,
      detectedAt: new Date().toISOString(),
    };
  }

  /**
   * Detect from package managers (npm, pip, go.mod, etc)
   */
  private async detectFromPackageManager(): Promise<void> {
    const signalSet: SignalSet = {
      source: 'packageManager',
      signals: [],
      timestamp: new Date().toISOString(),
    };

    const manifestSpecs: Array<{ fileName: string; runtime: RuntimeType }> = [
      { fileName: 'package.json', runtime: 'nodejs' },
      { fileName: 'pyproject.toml', runtime: 'python' },
      { fileName: 'requirements.txt', runtime: 'python' },
      { fileName: 'go.mod', runtime: 'go' },
      { fileName: 'pom.xml', runtime: 'java' },
      { fileName: 'build.gradle', runtime: 'java' },
      { fileName: 'build.gradle.kts', runtime: 'java' },
      { fileName: 'Gemfile', runtime: 'ruby' },
    ];

    const csprojFiles = this.findFilesWithExtension(this.projectPath, '.csproj', 3).map((f) => ({
      fileName: this.toProjectRelative(f),
      runtime: 'csharp' as RuntimeType,
    }));

    const runtimeHintAdded = new Set<RuntimeType>();
    const allSpecs = [...manifestSpecs, ...csprojFiles];
    for (const spec of allSpecs) {
      const manifestPath = path.isAbsolute(spec.fileName)
        ? spec.fileName
        : path.join(this.projectPath, spec.fileName);
      if (!this.fileExists(manifestPath)) {
        continue;
      }

      const content = fs.readFileSync(manifestPath, 'utf-8');
      const rel = this.toProjectRelative(manifestPath);

      if (!runtimeHintAdded.has(spec.runtime)) {
        runtimeHintAdded.add(spec.runtime);
        signalSet.signals.push({
          source: 'packageManager',
          runtime: spec.runtime,
          confidence: 0.72,
          evidence: `${rel} present`,
        });
      }

      const frameworkSignals = this.detectFrameworkSignalsFromManifest(content, spec.runtime, rel);
      signalSet.signals.push(...frameworkSignals);
    }

    this.dedupeSignals(signalSet.signals);

    if (signalSet.signals.length > 0) {
      this.signals.push(signalSet);
    }
  }

  /**
   * Detect from Dockerfile
   */
  private async detectFromDockerfile(): Promise<void> {
    const dockerfilePath = path.join(this.projectPath, 'Dockerfile');
    if (!this.fileExists(dockerfilePath)) {
      return;
    }

    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');
    const signalSet: SignalSet = {
      source: 'dockerfile',
      signals: [],
      timestamp: new Date().toISOString(),
    };

    // Extract base image
    const baseImageMatch = dockerfileContent.match(/FROM\s+([^\s:]+):?([^\s]*)/);
    if (baseImageMatch) {
      const baseImage = baseImageMatch[1];
      const version = baseImageMatch[2];

      if (baseImage.includes('python')) {
        signalSet.signals.push({
          source: 'dockerfile',
          runtime: 'python',
          confidence: 0.95,
          evidence: `Dockerfile base image: ${baseImage}:${version}`,
        });
      } else if (baseImage.includes('node')) {
        signalSet.signals.push({
          source: 'dockerfile',
          runtime: 'nodejs',
          confidence: 0.95,
          evidence: `Dockerfile base image: ${baseImage}:${version}`,
        });
      } else if (baseImage.includes('golang')) {
        signalSet.signals.push({
          source: 'dockerfile',
          runtime: 'go',
          confidence: 0.95,
          evidence: `Dockerfile base image: ${baseImage}:${version}`,
        });
      } else if (baseImage.includes('openjdk') || baseImage.includes('java')) {
        signalSet.signals.push({
          source: 'dockerfile',
          runtime: 'java',
          confidence: 0.95,
          evidence: `Dockerfile base image: ${baseImage}:${version}`,
        });
      } else if (baseImage.includes('ruby')) {
        signalSet.signals.push({
          source: 'dockerfile',
          runtime: 'ruby',
          confidence: 0.95,
          evidence: `Dockerfile base image: ${baseImage}:${version}`,
        });
      }
    }

    // Extract frameworks from RUN commands
    const runCommands = dockerfileContent.match(/RUN\s+(.+?)(?:\n|$)/g) || [];
    runCommands.forEach((cmd) => {
      if (cmd.includes('pip install fastapi') || cmd.includes('fastapi')) {
        signalSet.signals.push({
          source: 'dockerfile',
          framework: 'fastapi',
          confidence: 0.85,
          evidence: 'Dockerfile RUN command mentions fastapi',
        });
      }
      if (cmd.includes('npm install') && cmd.includes('@nestjs')) {
        signalSet.signals.push({
          source: 'dockerfile',
          framework: 'nestjs',
          confidence: 0.85,
          evidence: 'Dockerfile RUN command installs @nestjs packages',
        });
      }
    });

    if (signalSet.signals.length > 0) {
      this.signals.push(signalSet);
    }
  }

  /**
   * Detect from entry points (main.py, server.js, etc)
   */
  private async detectFromEntryPoints(): Promise<void> {
    const signalSet: SignalSet = {
      source: 'entryPoint',
      signals: [],
      timestamp: new Date().toISOString(),
    };

    const sourceFiles = this.findFilesWithExtension(this.projectPath, '.py', 7)
      .concat(this.findFilesWithExtension(this.projectPath, '.ts', 7))
      .concat(this.findFilesWithExtension(this.projectPath, '.js', 7))
      .concat(this.findFilesWithExtension(this.projectPath, '.go', 7))
      .concat(this.findFilesWithExtension(this.projectPath, '.java', 8))
      .concat(this.findFilesWithExtension(this.projectPath, '.rb', 7))
      .concat(this.findFilesWithExtension(this.projectPath, '.cs', 8));

    for (const profile of getAllProfiles()) {
      const byFilePattern = sourceFiles.filter((filePath) => {
        const rel = this.toProjectRelative(filePath);
        return profile.filePatterns.some((pattern) => pattern.test(rel));
      });

      const candidates = byFilePattern.length > 0 ? byFilePattern : sourceFiles;
      for (const filePath of candidates.slice(0, 60)) {
        const content = safeRead(filePath);
        if (!content) {
          continue;
        }
        const rel = this.toProjectRelative(filePath);
        const hasEntryPattern = profile.entryPointPatterns.some((pattern) => pattern.test(content));
        const hasSignalPattern = profile.detectionSignals
          .filter((signal) => signal.source === 'entrypoint')
          .some((signal) => this.matchesPattern(signal.pattern, content));

        if (!hasEntryPattern && !hasSignalPattern) {
          continue;
        }

        signalSet.signals.push({
          source: 'entryPoint',
          runtime: profile.runtime as RuntimeType,
          framework: profile.name,
          confidence: this.maxSignalWeight(profile, 'entrypoint', hasEntryPattern ? 0.92 : 0.86),
          evidence: `Entrypoint pattern matched for ${profile.name} in ${rel}`,
        });
        break;
      }
    }

    this.dedupeSignals(signalSet.signals);

    if (signalSet.signals.length > 0) {
      this.signals.push(signalSet);
    }
  }

  /**
   * Detect from source file imports
   */
  private async detectFromImports(): Promise<void> {
    const signalSet: SignalSet = {
      source: 'imports',
      signals: [],
      timestamp: new Date().toISOString(),
    };

    const files = this.findFilesWithExtension(this.projectPath, '.py', 7)
      .concat(this.findFilesWithExtension(this.projectPath, '.ts', 7))
      .concat(this.findFilesWithExtension(this.projectPath, '.js', 7))
      .concat(this.findFilesWithExtension(this.projectPath, '.go', 7))
      .concat(this.findFilesWithExtension(this.projectPath, '.java', 8))
      .concat(this.findFilesWithExtension(this.projectPath, '.rb', 7))
      .concat(this.findFilesWithExtension(this.projectPath, '.cs', 8));

    const foundFrameworks = new Set<string>();
    for (const filePath of files.slice(0, 180)) {
      const content = safeRead(filePath);
      if (!content) {
        continue;
      }
      const importsSample = content.split('\n').slice(0, 80).join('\n');
      const rel = this.toProjectRelative(filePath);

      for (const profile of getAllProfiles()) {
        if (foundFrameworks.has(profile.name)) {
          continue;
        }
        const hasImportSignal = profile.detectionSignals
          .filter((signal) => signal.source === 'imports')
          .some((signal) => this.matchesPattern(signal.pattern, importsSample));

        if (!hasImportSignal) {
          continue;
        }

        foundFrameworks.add(profile.name);
        signalSet.signals.push({
          source: 'imports',
          runtime: profile.runtime as RuntimeType,
          framework: profile.name,
          confidence: this.maxSignalWeight(profile, 'imports', 0.82),
          evidence: `Import pattern matched for ${profile.name} in ${rel}`,
        });
      }
    }

    this.dedupeSignals(signalSet.signals);

    if (signalSet.signals.length > 0) {
      this.signals.push(signalSet);
    }
  }

  /**
   * Detect from build config (Makefile, docker-compose.yml, tox.ini)
   */
  private async detectFromBuildConfig(): Promise<void> {
    const signalSet: SignalSet = {
      source: 'buildConfig',
      signals: [],
      timestamp: new Date().toISOString(),
    };

    // Check Makefile
    const makefilePath = path.join(this.projectPath, 'Makefile');
    if (this.fileExists(makefilePath)) {
      const makefileContent = fs.readFileSync(makefilePath, 'utf-8');
      if (makefileContent.includes('pytest') || makefileContent.includes('python')) {
        signalSet.signals.push({
          source: 'buildConfig',
          runtime: 'python',
          confidence: 0.7,
          evidence: 'Makefile contains python/pytest commands',
        });
      }
      if (makefileContent.includes('npm') || makefileContent.includes('yarn')) {
        signalSet.signals.push({
          source: 'buildConfig',
          runtime: 'nodejs',
          confidence: 0.7,
          evidence: 'Makefile contains npm/yarn commands',
        });
      }
    }

    // Check docker-compose.yml
    const dockerComposePath = path.join(this.projectPath, 'docker-compose.yml');
    if (this.fileExists(dockerComposePath)) {
      const dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf-8');
      if (dockerComposeContent.includes('python')) {
        signalSet.signals.push({
          source: 'buildConfig',
          runtime: 'python',
          confidence: 0.7,
          evidence: 'docker-compose.yml contains python service',
        });
      }
      if (dockerComposeContent.includes('node')) {
        signalSet.signals.push({
          source: 'buildConfig',
          runtime: 'nodejs',
          confidence: 0.7,
          evidence: 'docker-compose.yml contains node service',
        });
      }
      if (dockerComposeContent.includes('openjdk') || dockerComposeContent.includes('java')) {
        signalSet.signals.push({
          source: 'buildConfig',
          runtime: 'java',
          confidence: 0.68,
          evidence: 'docker-compose.yml contains java/openjdk service',
        });
      }
      if (dockerComposeContent.includes('ruby')) {
        signalSet.signals.push({
          source: 'buildConfig',
          runtime: 'ruby',
          confidence: 0.68,
          evidence: 'docker-compose.yml contains ruby service',
        });
      }
      if (dockerComposeContent.includes('dotnet')) {
        signalSet.signals.push({
          source: 'buildConfig',
          runtime: 'csharp',
          confidence: 0.68,
          evidence: 'docker-compose.yml contains dotnet service',
        });
      }
    }

    const pomPath = path.join(this.projectPath, 'pom.xml');
    if (this.fileExists(pomPath)) {
      const pom = fs.readFileSync(pomPath, 'utf-8');
      signalSet.signals.push({
        source: 'buildConfig',
        runtime: 'java',
        confidence: 0.72,
        evidence: 'pom.xml present',
      });
      if (/spring-boot|org\.springframework\.boot/i.test(pom)) {
        signalSet.signals.push({
          source: 'buildConfig',
          runtime: 'java',
          framework: 'spring',
          confidence: 0.9,
          evidence: 'pom.xml contains Spring Boot dependencies',
        });
      }
    }

    const gemfilePath = path.join(this.projectPath, 'Gemfile');
    if (this.fileExists(gemfilePath)) {
      const gemfile = fs.readFileSync(gemfilePath, 'utf-8');
      signalSet.signals.push({
        source: 'buildConfig',
        runtime: 'ruby',
        confidence: 0.72,
        evidence: 'Gemfile present',
      });
      if (/gem\s+['"]rails['"]/i.test(gemfile)) {
        signalSet.signals.push({
          source: 'buildConfig',
          runtime: 'ruby',
          framework: 'rails',
          confidence: 0.9,
          evidence: 'Gemfile contains rails gem',
        });
      }
    }

    const csprojFiles = this.findFilesWithExtension(this.projectPath, '.csproj', 3);
    if (csprojFiles.length > 0) {
      signalSet.signals.push({
        source: 'buildConfig',
        runtime: 'csharp',
        confidence: 0.72,
        evidence: `${this.toProjectRelative(csprojFiles[0])} present`,
      });
      const csprojContent = safeRead(csprojFiles[0]);
      if (/Microsoft\.AspNetCore/i.test(csprojContent)) {
        signalSet.signals.push({
          source: 'buildConfig',
          runtime: 'csharp',
          framework: 'dotnet',
          confidence: 0.9,
          evidence: 'csproj contains Microsoft.AspNetCore packages',
        });
      }
    }

    this.dedupeSignals(signalSet.signals);

    if (signalSet.signals.length > 0) {
      this.signals.push(signalSet);
    }
  }

  /**
   * Merge all signals and determine final runtime/framework
   */
  private mergeSignals(): {
    runtime: RuntimeType;
    framework?: string;
    confidenceLevel: ConfidenceLevel;
    reason: string;
  } {
    const runtimeVotes: Record<RuntimeType, number> = {
      python: 0,
      nodejs: 0,
      go: 0,
      java: 0,
      ruby: 0,
      csharp: 0,
      unknown: 0,
    };

    const frameworkVotes: Record<string, number> = {};
    let runtimeSignalCount = 0;

    // Count votes from all signals
    this.signals.forEach((signalSet) => {
      signalSet.signals.forEach((signal) => {
        if (signal.runtime) {
          runtimeVotes[signal.runtime] += signal.confidence ?? 0.5;
          runtimeSignalCount += 1;
        }
        if (signal.framework) {
          frameworkVotes[signal.framework] =
            (frameworkVotes[signal.framework] ?? 0) + (signal.confidence ?? 0.5);
        }
      });
    });

    // Determine winning runtime
    let maxRuntime: RuntimeType = 'unknown';
    let maxRuntimeScore = 0;
    Object.entries(runtimeVotes).forEach(([runtime, score]) => {
      if (score > maxRuntimeScore) {
        maxRuntimeScore = score;
        maxRuntime = runtime as RuntimeType;
      }
    });

    // Determine winning framework
    let framework: string | undefined = undefined;
    let maxFrameworkScore = 0;
    Object.entries(frameworkVotes).forEach(([fw, score]) => {
      if (score > maxFrameworkScore) {
        maxFrameworkScore = score;
        framework = fw;
      }
    });

    if (maxRuntime === 'unknown' && framework) {
      const normalizedRuntime = this.toDiscoveryRuntime(normalizeBackendRuntimeLabel(framework));
      if (normalizedRuntime !== 'unknown') {
        maxRuntime = normalizedRuntime;
      }

      const profile = getFrameworkProfile(framework as any);
      if (profile) {
        maxRuntime = profile.runtime as RuntimeType;
      }
    }

    // Calculate confidence level
    let confidenceLevel: ConfidenceLevel = 'low';
    const averageConfidence = runtimeSignalCount > 0 ? maxRuntimeScore / runtimeSignalCount : 0;
    if (averageConfidence >= 0.7) {
      confidenceLevel = 'high';
    } else if (averageConfidence >= 0.45) {
      confidenceLevel = 'medium';
    } else {
      confidenceLevel = 'low';
    }

    // Build reason
    let reason = `Discovery completed with ${runtimeSignalCount} runtime signals. `;
    if (maxRuntime !== 'unknown') {
      reason += `Runtime: ${maxRuntime} (confidence: ${confidenceLevel}).`;
    } else {
      reason += 'Runtime: Could not determine (defaulting to unknown).';
    }
    if (framework) {
      reason += ` Framework: ${framework}.`;
    }

    return {
      runtime: maxRuntime,
      framework,
      confidenceLevel,
      reason,
    };
  }

  private detectFrameworkSignalsFromManifest(
    content: string,
    runtime: RuntimeType,
    fileName: string
  ): DiscoverySignal[] {
    const matches: DiscoverySignal[] = [];
    for (const profile of getAllProfiles()) {
      if (profile.runtime !== runtime) {
        continue;
      }

      let bestWeight = 0;
      for (const signal of profile.detectionSignals.filter((s) => s.source === 'packageManager')) {
        if (this.matchesPattern(signal.pattern, content)) {
          bestWeight = Math.max(bestWeight, signal.weight);
        }
      }

      for (const depPattern of profile.dependencyPatterns) {
        if (depPattern.test(content)) {
          bestWeight = Math.max(bestWeight, 0.9);
        }
      }

      if (bestWeight <= 0) {
        continue;
      }

      matches.push({
        source: 'packageManager',
        runtime,
        framework: profile.name,
        confidence: Math.min(0.99, Math.max(0.78, bestWeight)),
        evidence: `Dependency pattern matched for ${profile.name} in ${fileName}`,
      });
    }

    return matches;
  }

  private matchesPattern(pattern: RegExp | string, content: string): boolean {
    if (typeof pattern === 'string') {
      return content.includes(pattern);
    }
    return pattern.test(content);
  }

  private maxSignalWeight(
    profile: ReturnType<typeof getAllProfiles>[number],
    source: 'packageManager' | 'imports' | 'entrypoint',
    fallback: number
  ): number {
    const candidates = profile.detectionSignals.filter((signal) => signal.source === source);
    if (candidates.length === 0) {
      return fallback;
    }
    return Math.max(...candidates.map((c) => c.weight));
  }

  private dedupeSignals(signals: DiscoverySignal[]): void {
    const seen = new Set<string>();
    const next: DiscoverySignal[] = [];
    for (const signal of signals) {
      const canonicalSignal = this.canonicalizeSignal(signal);
      const key = `${canonicalSignal.source}|${canonicalSignal.runtime ?? ''}|${canonicalSignal.framework ?? ''}|${canonicalSignal.evidence ?? ''}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      next.push(canonicalSignal);
    }
    signals.splice(0, signals.length, ...next);
  }

  private canonicalizeSignal(signal: DiscoverySignal): DiscoverySignal {
    if (!signal.framework) {
      return signal;
    }

    const canonicalFramework = normalizeBackendFrameworkLabel(signal.framework);
    if (canonicalFramework === 'unknown') {
      return signal;
    }

    return {
      ...signal,
      framework: canonicalFramework,
    };
  }

  private toDiscoveryRuntime(
    runtime: ReturnType<typeof normalizeBackendRuntimeLabel>
  ): RuntimeType {
    if (runtime === 'node') {
      return 'nodejs';
    }
    if (runtime === 'dotnet') {
      return 'csharp';
    }
    if (runtime === 'python' || runtime === 'go' || runtime === 'java' || runtime === 'ruby') {
      return runtime;
    }
    return 'unknown';
  }

  private toProjectRelative(filePath: string): string {
    return path.relative(this.projectPath, filePath).replace(/\\/g, '/');
  }

  /**
   * Helper: Check if file exists
   */
  private fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Helper: Find files with given extension
   */
  private findFilesWithExtension(
    dir: string,
    ext: string,
    maxDepth: number,
    currentDepth: number = 0
  ): string[] {
    const files: string[] = [];

    if (currentDepth >= maxDepth) {
      return files;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith(ext)) {
          files.push(fullPath);
        } else if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules'
        ) {
          files.push(...this.findFilesWithExtension(fullPath, ext, maxDepth, currentDepth + 1));
        }
      }
    } catch {
      // Ignore directory read errors
    }

    return files;
  }
}

function safeRead(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}
