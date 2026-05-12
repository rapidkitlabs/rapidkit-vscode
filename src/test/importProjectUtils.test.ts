import { describe, expect, it } from 'vitest';

import {
  deriveProjectNameFromGitUrl,
  detectProjectStackFromByopDiscovery,
  detectProjectStackFromSignals,
  normalizeProjectName,
} from '../commands/importProjectUtils';
import { INCIDENT_STUDIO_SUPPORTED_KIT_FIXTURES } from './fixtures/incidentStudioGraphFixtures';

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

    it('maps Studio-expanded framework aliases to the closest supported import stack', () => {
      expect(
        detectProjectStackFromByopDiscovery({
          framework: 'gofiber',
          runtime: 'go',
          confidenceLevel: 'high',
        })
      ).toEqual({ stack: 'go', confidence: 'high' });

      expect(
        detectProjectStackFromByopDiscovery({
          framework: 'gogin',
          runtime: 'go',
          confidenceLevel: 'medium',
        })
      ).toEqual({ stack: 'go', confidence: 'medium' });

      expect(
        detectProjectStackFromByopDiscovery({
          framework: 'springboot',
          runtime: 'java',
          confidenceLevel: 'high',
        })
      ).toEqual({ stack: 'springboot', confidence: 'high' });
    });

    it('maps runtime-level hints without overclaiming generic java/ruby stacks', () => {
      expect(
        detectProjectStackFromByopDiscovery({ runtime: 'go', confidenceLevel: 'medium' })
      ).toEqual({ stack: 'go', confidence: 'medium' });

      expect(
        detectProjectStackFromByopDiscovery({ runtime: 'ruby', confidenceLevel: 'low' })
      ).toEqual({ stack: 'unknown', confidence: 'low' });

      expect(
        detectProjectStackFromByopDiscovery({ runtime: 'java', confidenceLevel: 'high' })
      ).toEqual({ stack: 'unknown', confidence: 'high' });

      expect(
        detectProjectStackFromByopDiscovery({ runtime: 'csharp', confidenceLevel: 'high' })
      ).toEqual({ stack: 'dotnet', confidence: 'high' });
    });

    it('does not overclaim unsupported import stacks for broader backend frameworks', () => {
      expect(
        detectProjectStackFromByopDiscovery({
          framework: 'fastify',
          runtime: 'nodejs',
          confidenceLevel: 'high',
        })
      ).toEqual({ stack: 'unknown', confidence: 'high' });

      expect(
        detectProjectStackFromByopDiscovery({
          framework: 'laravel',
          runtime: 'php',
          confidenceLevel: 'medium',
        })
      ).toEqual({ stack: 'unknown', confidence: 'medium' });
    });

    it('keeps Incident Studio fixture breadth aligned with BYOP import stack mapping', () => {
      const expectedStacksByFramework = {
        fastapi: 'fastapi',
        django: 'django',
        flask: 'flask',
        nestjs: 'nestjs',
        express: 'express',
        koa: 'koa',
        gofiber: 'go',
        gogin: 'go',
        echo: 'go',
        rails: 'rails',
        dotnet: 'dotnet',
        springboot: 'springboot',
      } as const;

      for (const fixture of INCIDENT_STUDIO_SUPPORTED_KIT_FIXTURES) {
        expect(
          detectProjectStackFromByopDiscovery({
            framework: fixture.framework,
            confidenceLevel: 'high',
          })
        ).toEqual({
          stack: expectedStacksByFramework[fixture.framework],
          confidence: 'high',
        });
      }
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
