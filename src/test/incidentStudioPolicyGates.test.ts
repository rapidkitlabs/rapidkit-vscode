/**
 * Unit tests for Incident Studio Policy Gate Enforcement
 */

import { describe, it, expect } from 'vitest';
import {
  enforceVerifyCompletionGates,
  formatGateStatus,
  isVerifyCompletionPremature,
  extractGateBlockedReasons,
  type PolicyGateStatus,
  type PolicyGateEnforcementResult,
} from '../ui/panels/incidentStudioPolicyGates';

describe('incidentStudioPolicyGates', () => {
  describe('enforceVerifyCompletionGates', () => {
    it('should allow verify completion when all gates pass', () => {
      const gateStatus: PolicyGateStatus = {
        verifyPhaseReachPass: true,
        bridgeRouteCompletionPass: true,
        overallPass: true,
      };

      const result = enforceVerifyCompletionGates(gateStatus);

      expect(result.canCompleteVerify).toBe(true);
      expect(result.violations.length).toBe(0);
      expect(result.blockedReasons.length).toBe(0);
      expect(result.fallbackGuidance).toBeNull();
    });

    it('should block verify completion when verify phase reach fails', () => {
      const gateStatus: PolicyGateStatus = {
        verifyPhaseReachPass: false,
        bridgeRouteCompletionPass: true,
        overallPass: false,
      };

      const result = enforceVerifyCompletionGates(gateStatus);

      expect(result.canCompleteVerify).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.blockedReasons).toContain('Verify phase reach < minimum threshold');

      const violation = result.violations.find((v) => v.gate === 'VERIFY_PHASE_REACH');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('should block verify completion when bridge route completion fails', () => {
      const gateStatus: PolicyGateStatus = {
        verifyPhaseReachPass: true,
        bridgeRouteCompletionPass: false,
        overallPass: false,
      };

      const result = enforceVerifyCompletionGates(gateStatus);

      expect(result.canCompleteVerify).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.blockedReasons).toContain('Bridge route completion < minimum threshold');

      const violation = result.violations.find((v) => v.gate === 'BRIDGE_ROUTE_COMPLETION');
      expect(violation).toBeDefined();
    });

    it('should block verify completion when both gates fail', () => {
      const gateStatus: PolicyGateStatus = {
        verifyPhaseReachPass: false,
        bridgeRouteCompletionPass: false,
        overallPass: false,
      };

      const result = enforceVerifyCompletionGates(gateStatus);

      expect(result.canCompleteVerify).toBe(false);
      expect(result.violations.length).toBe(2);
      expect(result.blockedReasons.length).toBe(2);
    });

    it('should provide fallback guidance when gates are blocked', () => {
      const gateStatus: PolicyGateStatus = {
        verifyPhaseReachPass: false,
        bridgeRouteCompletionPass: true,
        overallPass: false,
      };

      const result = enforceVerifyCompletionGates(gateStatus);

      expect(result.fallbackGuidance).toBeDefined();
      expect(result.fallbackGuidance).toContain('Verify completion blocked');
      expect(result.fallbackGuidance).toContain('Suggested next steps');
    });

    it('should handle null gate status (warming up)', () => {
      const result = enforceVerifyCompletionGates(null);

      expect(result.canCompleteVerify).toBe(false);
      expect(result.violations.length).toBe(0);
    });

    it('should handle undefined gate status', () => {
      const result = enforceVerifyCompletionGates(undefined);

      expect(result.canCompleteVerify).toBe(false);
    });
  });

  describe('formatGateStatus', () => {
    it('should format healthy gate status', () => {
      const gateStatus: PolicyGateStatus = {
        verifyPhaseReachPass: true,
        bridgeRouteCompletionPass: true,
        overallPass: true,
      };

      const formatted = formatGateStatus(gateStatus);

      expect(formatted).toContain('✓ pass');
      expect(formatted).toContain('✓ All gates healthy');
    });

    it('should format partial gate status', () => {
      const gateStatus: PolicyGateStatus = {
        verifyPhaseReachPass: false,
        bridgeRouteCompletionPass: true,
        overallPass: false,
      };

      const formatted = formatGateStatus(gateStatus);

      expect(formatted).toContain('✗ fail');
      expect(formatted).toContain('✗ Verify blocked by gates');
    });

    it('should format null/warming up status', () => {
      const formatted = formatGateStatus(null);

      expect(formatted).toContain('warming up');
      expect(formatted).toContain('not enough telemetry');
    });
  });

  describe('isVerifyCompletionPremature', () => {
    it('should return false when all gates pass', () => {
      const gateStatus: PolicyGateStatus = {
        verifyPhaseReachPass: true,
        bridgeRouteCompletionPass: true,
        overallPass: true,
      };

      const result = isVerifyCompletionPremature(gateStatus);

      expect(result.isPremature).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should return true when gates not satisfied', () => {
      const gateStatus: PolicyGateStatus = {
        verifyPhaseReachPass: false,
        bridgeRouteCompletionPass: true,
        overallPass: false,
      };

      const result = isVerifyCompletionPremature(gateStatus);

      expect(result.isPremature).toBe(true);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('verify phase reach');
    });

    it('should return true when warming up', () => {
      const result = isVerifyCompletionPremature(null);

      expect(result.isPremature).toBe(true);
      expect(result.reason).toContain('warming up');
    });

    it('should list all failed gates in reason', () => {
      const gateStatus: PolicyGateStatus = {
        verifyPhaseReachPass: false,
        bridgeRouteCompletionPass: false,
        overallPass: false,
      };

      const result = isVerifyCompletionPremature(gateStatus);

      expect(result.reason).toContain('verify phase reach');
      expect(result.reason).toContain('bridge route completion');
    });
  });

  describe('extractGateBlockedReasons', () => {
    it('should extract blocked reasons from result', () => {
      const result: PolicyGateEnforcementResult = {
        canCompleteVerify: false,
        violations: [],
        blockedReasons: [
          'Verify phase reach < minimum threshold',
          'Bridge route completion < minimum threshold',
        ],
        fallbackGuidance: null,
      };

      const extracted = extractGateBlockedReasons(result);

      expect(extracted.reasons).toHaveLength(2);
      expect(extracted.summary).toContain('Gates blocked');
      expect(extracted.summary).toContain('Verify phase reach');
    });

    it('should handle empty blocked reasons', () => {
      const result: PolicyGateEnforcementResult = {
        canCompleteVerify: true,
        violations: [],
        blockedReasons: [],
        fallbackGuidance: null,
      };

      const extracted = extractGateBlockedReasons(result);

      expect(extracted.reasons).toHaveLength(0);
      expect(extracted.summary).toBe('No gates blocked');
    });

    it('should join multiple reasons with semicolon', () => {
      const result: PolicyGateEnforcementResult = {
        canCompleteVerify: false,
        violations: [],
        blockedReasons: ['Reason 1', 'Reason 2', 'Reason 3'],
        fallbackGuidance: null,
      };

      const extracted = extractGateBlockedReasons(result);

      expect(extracted.summary).toBe('Gates blocked: Reason 1; Reason 2; Reason 3');
    });
  });

  describe('gate enforcement contracts', () => {
    it('should never allow completion without overallPass true', () => {
      const scenarios: PolicyGateStatus[] = [
        { verifyPhaseReachPass: true, bridgeRouteCompletionPass: true, overallPass: false },
        { verifyPhaseReachPass: false, bridgeRouteCompletionPass: true, overallPass: false },
        { verifyPhaseReachPass: true, bridgeRouteCompletionPass: false, overallPass: false },
      ];

      scenarios.forEach((gateStatus) => {
        const result = enforceVerifyCompletionGates(gateStatus);
        expect(result.canCompleteVerify).toBe(false);
      });
    });

    it('should require all individual gates to pass when overallPass is true', () => {
      const gateStatus: PolicyGateStatus = {
        verifyPhaseReachPass: true,
        bridgeRouteCompletionPass: true,
        overallPass: true,
      };

      const result = enforceVerifyCompletionGates(gateStatus);

      expect(result.violations.length).toBe(0);
      expect(result.canCompleteVerify).toBe(true);
    });
  });
});
