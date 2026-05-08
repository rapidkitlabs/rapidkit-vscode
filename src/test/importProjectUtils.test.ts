import { describe, expect, it } from 'vitest';

import {
  deriveProjectNameFromGitUrl,
  detectProjectStackFromByopDiscovery,
  detectProjectStackFromSignals,
  normalizeProjectName,
} from '../commands/importProjectUtils';

describe('importProjectUtils', () => {
  describe('detectProjectStackFromSignals', () => {
    it('treats pyproject-only projects as unknown medium in fallback mode', () => {
      const result = detectProjectStackFromSignals({
        hasPyProject: true,
        hasGoMod: true,
        hasPomXml: true,
        hasGradle: false,
        hasGradleKts: false,
        hasPackageJson: true,
        hasNestDependency: true,
      });

      expect(result).toEqual({ stack: 'unknown', confidence: 'medium' });
    });

    it('detects nestjs when nest dependency exists', () => {
      const result = detectProjectStackFromSignals({
        hasPyProject: false,
        hasGoMod: false,
        hasPomXml: false,
        hasGradle: false,
        hasGradleKts: false,
        hasPackageJson: true,
        hasNestDependency: true,
      });

      expect(result).toEqual({ stack: 'nestjs', confidence: 'high' });
    });

    it('returns unknown medium for generic package.json projects', () => {
      const result = detectProjectStackFromSignals({
        hasPyProject: false,
        hasGoMod: false,
        hasPomXml: false,
        hasGradle: false,
        hasGradleKts: false,
        hasPackageJson: true,
        hasNestDependency: false,
      });

      expect(result).toEqual({ stack: 'unknown', confidence: 'medium' });
    });

    it('detects go and springboot markers', () => {
      const goResult = detectProjectStackFromSignals({
        hasPyProject: false,
        hasGoMod: true,
        hasPomXml: false,
        hasGradle: false,
        hasGradleKts: false,
        hasPackageJson: false,
        hasNestDependency: false,
      });
      const springResult = detectProjectStackFromSignals({
        hasPyProject: false,
        hasGoMod: false,
        hasPomXml: false,
        hasGradle: true,
        hasGradleKts: false,
        hasPackageJson: false,
        hasNestDependency: false,
      });

      expect(goResult).toEqual({ stack: 'go', confidence: 'high' });
      expect(springResult).toEqual({ stack: 'springboot', confidence: 'high' });
    });

    it('returns unknown low when no markers are present', () => {
      const result = detectProjectStackFromSignals({
        hasPyProject: false,
        hasGoMod: false,
        hasPomXml: false,
        hasGradle: false,
        hasGradleKts: false,
        hasPackageJson: false,
        hasNestDependency: false,
      });

      expect(result).toEqual({ stack: 'unknown', confidence: 'low' });
    });
  });

  describe('detectProjectStackFromByopDiscovery', () => {
    it('maps direct framework hits from BYOP discovery', () => {
      expect(
        detectProjectStackFromByopDiscovery({
          framework: 'fastapi',
          runtime: 'python',
          confidenceLevel: 'high',
        })
      ).toEqual({ stack: 'fastapi', confidence: 'high' });

      expect(
        detectProjectStackFromByopDiscovery({
          framework: 'express',
          runtime: 'nodejs',
          confidenceLevel: 'medium',
        })
      ).toEqual({ stack: 'express', confidence: 'medium' });

      expect(
        detectProjectStackFromByopDiscovery({
          framework: 'spring',
          runtime: 'java',
          confidenceLevel: 'high',
        })
      ).toEqual({ stack: 'springboot', confidence: 'high' });
    });

    it('maps runtime-level go/ruby/csharp discovery when framework is generic', () => {
      expect(
        detectProjectStackFromByopDiscovery({ runtime: 'go', confidenceLevel: 'medium' })
      ).toEqual({ stack: 'go', confidence: 'medium' });

      expect(
        detectProjectStackFromByopDiscovery({ runtime: 'ruby', confidenceLevel: 'low' })
      ).toEqual({ stack: 'rails', confidence: 'low' });

      expect(
        detectProjectStackFromByopDiscovery({ runtime: 'csharp', confidenceLevel: 'high' })
      ).toEqual({ stack: 'dotnet', confidence: 'high' });
    });
  });

  describe('deriveProjectNameFromGitUrl', () => {
    it('derives names from https and ssh git urls', () => {
      expect(deriveProjectNameFromGitUrl('https://github.com/acme/orders-api.git')).toBe(
        'orders-api'
      );
      expect(deriveProjectNameFromGitUrl('git@github.com:acme/payment.service.git')).toBe(
        'payment.service'
      );
    });

    it('handles trailing slashes and empty input safely', () => {
      expect(deriveProjectNameFromGitUrl('https://github.com/acme/repo/')).toBe('repo');
      expect(deriveProjectNameFromGitUrl('   ')).toBe('imported-project');
    });

    it('normalizes unsafe characters and collapses separators', () => {
      expect(normalizeProjectName('  My Cool Repo!!!  ')).toBe('my-cool-repo');
      expect(deriveProjectNameFromGitUrl('ssh://gitlab.local/team/Inventory Service.git')).toBe(
        'inventory-service'
      );
    });
  });
});
