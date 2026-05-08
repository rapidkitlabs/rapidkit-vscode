import { describe, expect, it } from 'vitest';

import { routeIncidentActionTypeFromMessage } from '../ui/panels/incidentRouting';

describe('incidentStudioRouting', () => {
  describe('success routes (no fallback)', () => {
    it('routes release-readiness with success', () => {
      expect(routeIncidentActionTypeFromMessage('Check release readiness')).toEqual({
        actionType: 'release-readiness-commander',
        fallbackReason: 'success',
      });
    });

    it('routes verify pack with success', () => {
      expect(routeIncidentActionTypeFromMessage('Let me create a verify pack')).toEqual({
        actionType: 'verify-pack-autopilot',
        fallbackReason: 'success',
      });
    });

    it('routes browser smoke flow with success', () => {
      expect(routeIncidentActionTypeFromMessage('verify ui and open browser')).toEqual({
        actionType: 'browser-smoke-test',
        fallbackReason: 'success',
      });
    });

    it('routes incident repro flow with success', () => {
      expect(routeIncidentActionTypeFromMessage('share incident replay pack')).toEqual({
        actionType: 'incident-repro-pack',
        fallbackReason: 'success',
      });
    });

    it('routes devops intent to doctor-fix path', () => {
      expect(
        routeIncidentActionTypeFromMessage('help me fix ci/cd pipeline and kubernetes drift')
      ).toEqual({
        actionType: 'doctor-fix',
        fallbackReason: 'success',
      });
    });

    it('routes database/schema intent to impact-first path', () => {
      expect(
        routeIncidentActionTypeFromMessage('review schema migration risk before apply')
      ).toEqual({
        actionType: 'change-impact-lite',
        fallbackReason: 'success',
      });
    });

    it('routes docs intent to memory/convention path', () => {
      expect(routeIncidentActionTypeFromMessage('write docs and readme for this module')).toEqual({
        actionType: 'workspace-memory-wizard',
        fallbackReason: 'success',
      });
    });

    it('routes architecture/risk intent to impact path', () => {
      expect(
        routeIncidentActionTypeFromMessage('analyze architecture blast radius and risk')
      ).toEqual({
        actionType: 'change-impact-lite',
        fallbackReason: 'success',
      });
    });
  });

  describe('fallback routes (bare keywords)', () => {
    it('routes bare error with bare_keyword_only fallback', () => {
      expect(routeIncidentActionTypeFromMessage('error')).toEqual({
        actionType: 'terminal-bridge',
        fallbackReason: 'bare_keyword_only',
      });
    });

    it('routes bare fix with fix_preview_fallback', () => {
      expect(routeIncidentActionTypeFromMessage('fix this')).toEqual({
        actionType: 'terminal-bridge',
        fallbackReason: 'fix_preview_fallback',
      });
    });
  });

  describe('default route (no match)', () => {
    it('routes unknown message to orchestrate with default fallback', () => {
      expect(routeIncidentActionTypeFromMessage('hello world')).toEqual({
        actionType: 'orchestrate',
        fallbackReason: 'orchestrate_default',
      });
    });
  });
});
