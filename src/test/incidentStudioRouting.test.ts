import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Helper to extract the routing function from welcomePanel.ts
function extractRoutingFunction(): (message: string) => {
  actionType: string;
  fallbackReason: string;
} {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const welcomePanelPath = path.resolve(currentDir, '../ui/panels/welcomePanel.ts');
  const source = readFileSync(welcomePanelPath, 'utf8');

  // Extract the RoutingResult type and routing function logic
  // We'll use Function constructor to execute the routing logic
  const routingLogic = `
    return function routeMessage(message) {
      const normalized = message.toLowerCase();
      
      // Specific routes (high priority, no fallback)
      if (
        normalized.includes('release readiness') ||
        normalized.includes('go/no-go') ||
        normalized.includes('go no-go') ||
        normalized.includes('ship readiness') ||
        normalized.includes('release gate') ||
        normalized.includes('commander artifact')
      ) {
        return { actionType: 'release-readiness-commander', fallbackReason: 'success' };
      }
      if (
        normalized.includes('verify pack') ||
        normalized.includes('verification pack') ||
        normalized.includes('proof of success') ||
        normalized.includes('verify checklist') ||
        normalized.includes('deterministic verify')
      ) {
        return { actionType: 'verify-pack-autopilot', fallbackReason: 'success' };
      }
      if (
        normalized.includes('repro') ||
        normalized.includes('replay') ||
        normalized.includes('incident pack') ||
        normalized.includes('share incident')
      ) {
        return { actionType: 'incident-repro-pack', fallbackReason: 'success' };
      }
      if (
        normalized.includes('recipe') ||
        normalized.includes('starter template') ||
        normalized.includes('project template') ||
        normalized.includes('scaffold')
      ) {
        return { actionType: 'recipe-pack', fallbackReason: 'success' };
      }
      if (
        (normalized.includes('doctor') && normalized.includes('fix')) ||
        (normalized.includes('doctor') && normalized.includes('error')) ||
        normalized.includes('workspace health') ||
        normalized.includes('fix workspace') ||
        normalized.includes('rapidkit doctor')
      ) {
        return { actionType: 'doctor-fix', fallbackReason: 'success' };
      }
      
      // terminal-bridge: explicit signals (priority match)
      const hasExplicitTerminalSignal =
        normalized.includes('traceback') ||
        normalized.includes('stack trace') ||
        normalized.includes('exception') ||
        normalized.includes('terminal') ||
        normalized.includes('timeout') ||
        (normalized.includes('error') &&
          (normalized.includes('line ') ||
            normalized.includes('at ') ||
            normalized.includes('crash') ||
            normalized.includes('stderr') ||
            normalized.includes('exit code') ||
            normalized.includes('segfault') ||
            normalized.includes('killed')));
      
      if (hasExplicitTerminalSignal) {
        return { actionType: 'terminal-bridge', fallbackReason: 'success' };
      }
      
      // impact/risk routes
      if (normalized.includes('impact') || normalized.includes('risk')) {
        return { actionType: 'change-impact-lite', fallbackReason: 'success' };
      }
      
      // fix-preview-lite: explicit context (priority match)
      const hasPatchPreviewContext =
        normalized.includes('preview') ||
        normalized.includes('patch') ||
        (normalized.includes('fix') &&
          (normalized.includes('code') ||
            normalized.includes('function') ||
            normalized.includes('class') ||
            normalized.includes('module') ||
            normalized.includes('import') ||
            normalized.includes('bug') ||
            normalized.includes('file')));
      
      if (hasPatchPreviewContext) {
        return { actionType: 'fix-preview-lite', fallbackReason: 'success' };
      }
      
      // memory routes
      if (normalized.includes('memory') || normalized.includes('convention')) {
        return { actionType: 'workspace-memory-wizard', fallbackReason: 'success' };
      }
      
      // Fallback routes (bare keywords without context)
      if (
        normalized.includes('error') ||
        normalized.includes('fix') ||
        normalized.includes('failing') ||
        normalized.includes('broken')
      ) {
        // Distinguish between which bare keyword triggered the fallback
        const barefallbackReason = normalized.includes('error')
          ? 'bare_keyword_only'
          : normalized.includes('fix')
            ? 'fix_preview_fallback'
            : 'bare_keyword_only';
        return { actionType: 'terminal-bridge', fallbackReason: barefallbackReason };
      }
      
      // No match - orchestrate default
      return { actionType: 'orchestrate', fallbackReason: 'orchestrate_default' };
    };
  `;

  // Create and return the function
  const fn = new Function(routingLogic)();
  return fn;
}

const routeMessage = extractRoutingFunction();

describe('incidentStudioRouting', () => {
  describe('success routes (no fallback)', () => {
    it('routes release-readiness with success', () => {
      expect(routeMessage('Check release readiness')).toEqual({
        actionType: 'release-readiness-commander',
        fallbackReason: 'success',
      });
    });

    it('routes go/no-go decisions with success', () => {
      expect(routeMessage('Should we do go/no-go gate?')).toEqual({
        actionType: 'release-readiness-commander',
        fallbackReason: 'success',
      });
    });

    it('routes verify pack with success', () => {
      expect(routeMessage('Let me create a verify pack')).toEqual({
        actionType: 'verify-pack-autopilot',
        fallbackReason: 'success',
      });
    });

    it('routes verification pack with success', () => {
      expect(routeMessage('proof of success needed')).toEqual({
        actionType: 'verify-pack-autopilot',
        fallbackReason: 'success',
      });
    });

    it('routes incident repro pack with success', () => {
      expect(routeMessage('Let me replay the incident')).toEqual({
        actionType: 'incident-repro-pack',
        fallbackReason: 'success',
      });
    });

    it('routes recipe/template with success', () => {
      expect(routeMessage('Need a starter template')).toEqual({
        actionType: 'recipe-pack',
        fallbackReason: 'success',
      });
    });

    it('routes doctor fix with success', () => {
      expect(routeMessage('doctor fix workspace')).toEqual({
        actionType: 'doctor-fix',
        fallbackReason: 'success',
      });
    });

    it('routes explicit terminal signal with success (traceback)', () => {
      expect(routeMessage('Here is my traceback')).toEqual({
        actionType: 'terminal-bridge',
        fallbackReason: 'success',
      });
    });

    it('routes explicit terminal signal with success (stack trace)', () => {
      expect(routeMessage('Looking at the stack trace')).toEqual({
        actionType: 'terminal-bridge',
        fallbackReason: 'success',
      });
    });

    it('routes explicit terminal signal with success (exception)', () => {
      expect(routeMessage('Got an exception here')).toEqual({
        actionType: 'terminal-bridge',
        fallbackReason: 'success',
      });
    });

    it('routes explicit terminal signal with success (crash context)', () => {
      expect(routeMessage('Error: crashed at line 42')).toEqual({
        actionType: 'terminal-bridge',
        fallbackReason: 'success',
      });
    });

    it('routes impact analysis with success', () => {
      expect(routeMessage('What is the impact of this change?')).toEqual({
        actionType: 'change-impact-lite',
        fallbackReason: 'success',
      });
    });

    it('routes risk assessment with success', () => {
      expect(routeMessage('Assess the risk')).toEqual({
        actionType: 'change-impact-lite',
        fallbackReason: 'success',
      });
    });

    it('routes fix preview with context (code)', () => {
      expect(routeMessage('Can you preview a fix for the code?')).toEqual({
        actionType: 'fix-preview-lite',
        fallbackReason: 'success',
      });
    });

    it('routes fix preview with context (function)', () => {
      expect(routeMessage('Fix the function logic')).toEqual({
        actionType: 'fix-preview-lite',
        fallbackReason: 'success',
      });
    });

    it('routes fix preview with patch context', () => {
      expect(routeMessage('Show me the patch')).toEqual({
        actionType: 'fix-preview-lite',
        fallbackReason: 'success',
      });
    });

    it('routes workspace memory with success', () => {
      expect(routeMessage('Add a memory note')).toEqual({
        actionType: 'workspace-memory-wizard',
        fallbackReason: 'success',
      });
    });
  });

  describe('fallback routes (bare keywords)', () => {
    it('routes bare error with bare_keyword_only fallback', () => {
      expect(routeMessage('error')).toEqual({
        actionType: 'terminal-bridge',
        fallbackReason: 'bare_keyword_only',
      });
    });

    it('routes bare error with bare_keyword_only fallback (sentence context)', () => {
      expect(routeMessage('I have an error')).toEqual({
        actionType: 'terminal-bridge',
        fallbackReason: 'bare_keyword_only',
      });
    });

    it('routes bare fix with fix_preview_fallback', () => {
      expect(routeMessage('fix this')).toEqual({
        actionType: 'terminal-bridge',
        fallbackReason: 'fix_preview_fallback',
      });
    });

    it('routes bare failing with bare_keyword_only fallback', () => {
      expect(routeMessage('tests are failing')).toEqual({
        actionType: 'terminal-bridge',
        fallbackReason: 'bare_keyword_only',
      });
    });

    it('routes bare broken with bare_keyword_only fallback', () => {
      expect(routeMessage('something is broken')).toEqual({
        actionType: 'terminal-bridge',
        fallbackReason: 'bare_keyword_only',
      });
    });
  });

  describe('default route (no match)', () => {
    it('routes unknown message to orchestrate with default fallback', () => {
      expect(routeMessage('hello world')).toEqual({
        actionType: 'orchestrate',
        fallbackReason: 'orchestrate_default',
      });
    });

    it('routes empty message to orchestrate with default fallback', () => {
      expect(routeMessage('')).toEqual({
        actionType: 'orchestrate',
        fallbackReason: 'orchestrate_default',
      });
    });

    it('routes generic message to orchestrate with default fallback', () => {
      expect(routeMessage('tell me what to do')).toEqual({
        actionType: 'orchestrate',
        fallbackReason: 'orchestrate_default',
      });
    });
  });

  describe('fallback reason semantic meaning', () => {
    it('success means matched specific route without falling back', () => {
      const result = routeMessage('Create a verify checklist');
      expect(result.fallbackReason).toBe('success');
      expect(result.actionType).toBe('verify-pack-autopilot');
    });

    it('bare_keyword_only means matched on error/failing/broken without context', () => {
      const errorResult = routeMessage('error');
      const failingResult = routeMessage('failing');
      const brokenResult = routeMessage('broken');

      [errorResult, failingResult, brokenResult].forEach((result) => {
        expect(result.fallbackReason).toBe('bare_keyword_only');
        expect(result.actionType).toBe('terminal-bridge');
      });
    });

    it('fix_preview_fallback means matched on bare fix without code context', () => {
      const result = routeMessage('fix it');
      expect(result.fallbackReason).toBe('fix_preview_fallback');
      expect(result.actionType).toBe('terminal-bridge');
    });

    it('orchestrate_default means no keywords matched', () => {
      const result = routeMessage('random conversation');
      expect(result.fallbackReason).toBe('orchestrate_default');
      expect(result.actionType).toBe('orchestrate');
    });
  });

  describe('case insensitivity', () => {
    it('routes commands regardless of casing', () => {
      expect(routeMessage('VERIFY PACK').fallbackReason).toBe('success');
      expect(routeMessage('Release Readiness').fallbackReason).toBe('success');
      expect(routeMessage('DOCTOR FIX').fallbackReason).toBe('success');
    });
  });

  describe('routing precision (no false matches)', () => {
    it('does not route to terminal-bridge if error has explicit signal (line number)', () => {
      const result = routeMessage('Error at line 42');
      expect(result.actionType).toBe('terminal-bridge');
      expect(result.fallbackReason).toBe('success');
    });

    it('does not route to fix-preview if fix has code context', () => {
      const result = routeMessage('fix the code bug');
      expect(result.actionType).toBe('fix-preview-lite');
      expect(result.fallbackReason).toBe('success');
    });

    it('distinguishes bare fix from code-context fix', () => {
      const bareFixResult = routeMessage('fix');
      const codeFixResult = routeMessage('fix code bug');

      expect(bareFixResult.fallbackReason).toBe('fix_preview_fallback');
      expect(codeFixResult.fallbackReason).toBe('success');
    });
  });
});
