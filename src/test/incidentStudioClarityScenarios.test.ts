/**
 * CLC4 — Flow-level tests proving user-completable clarity for top incident scenarios.
 *
 * Each test walks a user through a complete Detect -> Diagnose -> Plan -> Verify -> Learn
 * loop and asserts:
 *   - Each phase returns exactly one primary next action (never empty, never multiple).
 *   - Mutation-ready language is suppressed until all required fields are present.
 *   - Decision clarity transitions correctly from blocked to complete.
 *   - Presentation tone follows the correct warning -> success progression.
 *
 * Covered scenarios:
 *   S1: Runtime/terminal error triage (service crash)
 *   S2: Pre-change impact assessment before touching a critical service
 *   S3: Doctor-reported health failure with fix and verify
 */

import { describe, expect, it } from 'vitest';

import {
  normalizeIncidentActionResultPayload,
  buildIncidentActionExecutionMetadata,
} from '../../webview-ui/src/lib/incidentStudioPayload';
import {
  getPhaseNextAction,
  getDecisionClarityWordingPolicy,
  getActionResultPresentation,
  type IncidentPhaseContext,
} from '../../webview-ui/src/lib/incidentStudioVerifyPolicy';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function assertOneAction(action: ReturnType<typeof getPhaseNextAction>): void {
  expect(action.primaryAction.length).toBeGreaterThan(0);
  expect(action.rationale.length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Scenario S1: Runtime / terminal error → triage → fix → verify
// ---------------------------------------------------------------------------

describe('CLC4 S1: Runtime error triage flow', () => {
  it('S1.1 detect — workspace not ready initially → downgraded to clarification', () => {
    const ctx: IncidentPhaseContext = {
      workspaceReady: false,
      diagnosisReady: false,
      planReady: false,
      verifyReady: false,
      priorResolutionAvailable: false,
    };
    const action = getPhaseNextAction('detect', ctx);
    assertOneAction(action);
    expect(action.downgraded).toBe(true);
  });

  it('S1.2 detect — workspace ready → one confident health-check action', () => {
    const ctx: IncidentPhaseContext = {
      workspaceReady: true,
      diagnosisReady: false,
      planReady: false,
      verifyReady: false,
      priorResolutionAvailable: false,
    };
    const action = getPhaseNextAction('detect', ctx);
    assertOneAction(action);
    expect(action.downgraded).toBe(false);
  });

  it('S1.3 diagnose — doctor evidence arrives → one root-cause analysis action', () => {
    const ctx: IncidentPhaseContext = {
      workspaceReady: true,
      diagnosisReady: true,
      planReady: false,
      verifyReady: false,
      priorResolutionAvailable: false,
    };
    const action = getPhaseNextAction('diagnose', ctx);
    assertOneAction(action);
    expect(action.downgraded).toBe(false);
  });

  it('S1.4 plan — decision clarity is blocked while rollback missing', () => {
    const policy = buildIncidentActionExecutionMetadata('inline-command');
    const result = normalizeIncidentActionResultPayload({
      success: false,
      verificationRequired: true,
      verifyPolicy: policy,
      outputSummary: 'inline-command - blocked by decision clarity contract: rollbackPlan',
      diagnosis: {
        confidence: 78,
        confidenceBand: 'high',
        signalSources: ['doctor-evidence'],
        relatedFiles: ['src/orders/service.ts'],
      },
    });

    const wordingPolicy = getDecisionClarityWordingPolicy({
      mutationReady: result.decisionClarity?.mutationReady ?? false,
      requiredMissingFields: result.decisionClarity?.requiredMissingFields ?? [],
      verificationRequired: result.verificationRequired ?? false,
    });

    expect(wordingPolicy.mutationReadyLabel).toBeNull();
    expect(wordingPolicy.cardState).toBe('blocked');
    expect(getActionResultPresentation(result).tone).toBe('warning');
  });

  it('S1.5 verify — verify path now present → one run-verify action', () => {
    const ctx: IncidentPhaseContext = {
      workspaceReady: true,
      diagnosisReady: true,
      planReady: true,
      verifyReady: true,
      priorResolutionAvailable: false,
    };
    const action = getPhaseNextAction('verify', ctx);
    assertOneAction(action);
    expect(action.downgraded).toBe(false);
  });

  it('S1.6 verify — all clarity fields present → decision clarity complete → tone success', () => {
    const policy = buildIncidentActionExecutionMetadata('inline-command');
    const result = normalizeIncidentActionResultPayload({
      success: true,
      verificationRequired: false,
      verifyPolicy: policy,
      outputSummary: 'inline-command - result shown in conversation above',
      diagnosis: {
        confidence: 88,
        confidenceBand: 'high',
        signalSources: ['doctor-evidence', 'system-graph'],
        relatedFiles: ['src/orders/service.ts'],
      },
      verifyCommandPack: {
        qualityScore: 92,
        readiness: 'ready',
        rationale: 'deterministic verify available',
        commands: [
          {
            label: 'integration test',
            command: 'npm run test:integration',
            scope: 'project',
            required: true,
          },
        ],
        blockedReasons: [],
      },
      rollback: {
        attempted: false,
        status: 'skipped',
        candidateFiles: ['src/orders/service.ts'],
        restoredFiles: [],
        failedFiles: [],
        suggestedNextStep: 'git checkout src/orders/service.ts',
      },
    });

    const wordingPolicy = getDecisionClarityWordingPolicy({
      mutationReady: result.decisionClarity?.mutationReady ?? false,
      requiredMissingFields: result.decisionClarity?.requiredMissingFields ?? [],
      verificationRequired: result.verificationRequired ?? false,
    });

    expect(wordingPolicy.mutationReadyLabel).toBe('yes');
    expect(wordingPolicy.cardState).toBe('complete');
    expect(getActionResultPresentation(result).tone).toBe('success');
  });

  it('S1.7 learn — no prior resolution → one memory-save action', () => {
    const ctx: IncidentPhaseContext = {
      workspaceReady: true,
      diagnosisReady: true,
      planReady: true,
      verifyReady: true,
      priorResolutionAvailable: false,
    };
    const action = getPhaseNextAction('learn', ctx);
    assertOneAction(action);
    expect(action.downgraded).toBe(false);
    expect(action.primaryAction).toMatch(/save|memory/i);
  });
});

// ---------------------------------------------------------------------------
// Scenario S2: Pre-change impact assessment before touching a critical service
// ---------------------------------------------------------------------------

describe('CLC4 S2: Pre-change impact assessment flow', () => {
  it('S2.1 detect → diagnose — both phase actions are confident and non-empty', () => {
    const readyCtx: IncidentPhaseContext = {
      workspaceReady: true,
      diagnosisReady: true,
      planReady: false,
      verifyReady: false,
      priorResolutionAvailable: false,
    };
    const detectAction = getPhaseNextAction('detect', readyCtx);
    const diagnoseAction = getPhaseNextAction('diagnose', readyCtx);
    assertOneAction(detectAction);
    assertOneAction(diagnoseAction);
    expect(detectAction.downgraded).toBe(false);
    expect(diagnoseAction.downgraded).toBe(false);
  });

  it('S2.2 plan — apply-module-gen action blocked when decision clarity is incomplete', () => {
    const policy = buildIncidentActionExecutionMetadata('apply-module-gen');
    const result = normalizeIncidentActionResultPayload({
      success: false,
      verificationRequired: true,
      verifyPolicy: policy,
      outputSummary: 'apply-module-gen - blocked by decision clarity contract: impactScope',
      diagnosis: {
        confidence: 60,
        confidenceBand: 'medium',
        signalSources: ['system-graph'],
        relatedFiles: [],
      },
    });

    expect(result.decisionClarity?.mutationReady).toBe(false);
    expect(result.decisionClarity?.requiredMissingFields).toContain('impactScope');
    expect(getActionResultPresentation(result).tone).toBe('warning');
  });

  it('S2.3 plan → verify — plan action is one impact-review step', () => {
    const ctx: IncidentPhaseContext = {
      workspaceReady: true,
      diagnosisReady: true,
      planReady: true,
      verifyReady: true,
      priorResolutionAvailable: false,
    };
    const planAction = getPhaseNextAction('plan', ctx);
    const verifyAction = getPhaseNextAction('verify', ctx);
    assertOneAction(planAction);
    assertOneAction(verifyAction);
    expect(planAction.primaryAction).toMatch(/review/i);
    expect(verifyAction.primaryAction).toMatch(/run/i);
  });

  it('S2.4 verify — apply-module-gen clears all CLC1 fields → mutation ready', () => {
    const policy = buildIncidentActionExecutionMetadata('apply-module-gen');
    const result = normalizeIncidentActionResultPayload({
      success: true,
      verificationRequired: false,
      verifyPolicy: policy,
      outputSummary: 'apply-module-gen - result shown in conversation above',
      diagnosis: {
        confidence: 82,
        confidenceBand: 'high',
        signalSources: ['system-graph', 'doctor-evidence'],
        relatedFiles: ['src/payments/service.ts', 'src/payments/controller.ts'],
      },
      verifyCommandPack: {
        qualityScore: 88,
        readiness: 'ready',
        rationale: 'deterministic verify available via integration suite',
        commands: [
          {
            label: 'integration test',
            command: 'npm run test:integration',
            scope: 'project',
            required: true,
          },
        ],
        blockedReasons: [],
      },
      rollback: {
        attempted: false,
        status: 'skipped',
        candidateFiles: ['src/payments/service.ts'],
        restoredFiles: [],
        failedFiles: [],
        suggestedNextStep: 'git checkout src/payments/service.ts',
      },
    });

    const wordingPolicy = getDecisionClarityWordingPolicy({
      mutationReady: result.decisionClarity?.mutationReady ?? false,
      requiredMissingFields: result.decisionClarity?.requiredMissingFields ?? [],
      verificationRequired: result.verificationRequired ?? false,
    });

    expect(wordingPolicy.mutationReadyLabel).toBe('yes');
    expect(getActionResultPresentation(result).tone).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// Scenario S3: Doctor health failure → fix → verify
// ---------------------------------------------------------------------------

describe('CLC4 S3: Doctor health failure fix flow', () => {
  it('S3.1 detect + diagnose — doctor-fix policy is verify-first', () => {
    const policy = buildIncidentActionExecutionMetadata('doctor-fix');
    expect(policy.requiresVerifyPath).toBe(true);
  });

  it('S3.2 plan — doctor-fix without verify path is blocked', () => {
    const policy = buildIncidentActionExecutionMetadata('doctor-fix');
    const result = normalizeIncidentActionResultPayload({
      success: false,
      verificationRequired: true,
      verifyPolicy: policy,
      outputSummary: 'doctor-fix - verification required before completion claim',
    });
    expect(getActionResultPresentation(result).tone).toBe('warning');
    expect(getActionResultPresentation(result).title).toBe('Verification required');
  });

  it('S3.3 verify — downgraded when no verify command is available', () => {
    const ctx: IncidentPhaseContext = {
      workspaceReady: true,
      diagnosisReady: true,
      planReady: true,
      verifyReady: false,
      priorResolutionAvailable: false,
    };
    const action = getPhaseNextAction('verify', ctx);
    assertOneAction(action);
    expect(action.downgraded).toBe(true);
  });

  it('S3.4 verify — doctor-fix completes after evidence passes', () => {
    const policy = buildIncidentActionExecutionMetadata('doctor-fix');
    const result = normalizeIncidentActionResultPayload({
      success: true,
      verificationRequired: false,
      verifyPolicy: policy,
      outputSummary: 'doctor-fix - result shown in conversation above',
      evidence: {
        source: 'doctor-last-run',
        passed: 8,
        warnings: 0,
        errors: 0,
      },
    });
    expect(getActionResultPresentation(result).tone).toBe('success');
    expect(result.evidence?.errors).toBe(0);
  });

  it('S3.5 learn — prior resolution exists → update memory action', () => {
    const ctx: IncidentPhaseContext = {
      workspaceReady: true,
      diagnosisReady: true,
      planReady: true,
      verifyReady: true,
      priorResolutionAvailable: true,
    };
    const action = getPhaseNextAction('learn', ctx);
    assertOneAction(action);
    expect(action.primaryAction).toMatch(/compare|update/i);
    expect(action.downgraded).toBe(false);
  });

  it('S3.6 full loop invariant — mutation-ready language never appears on blocked state', () => {
    // Simulate the transition: blocked → cleared
    const policy = buildIncidentActionExecutionMetadata('doctor-fix');

    const blockedResult = normalizeIncidentActionResultPayload({
      success: false,
      verificationRequired: true,
      verifyPolicy: policy,
      outputSummary: 'doctor-fix - blocked by decision clarity contract: nextStep',
      diagnosis: {
        confidence: 55,
        confidenceBand: 'medium',
        signalSources: ['doctor-evidence'],
        relatedFiles: [],
      },
    });

    const blockedWording = getDecisionClarityWordingPolicy({
      mutationReady: blockedResult.decisionClarity?.mutationReady ?? false,
      requiredMissingFields: blockedResult.decisionClarity?.requiredMissingFields ?? [],
      verificationRequired: blockedResult.verificationRequired ?? false,
    });

    // Must never show mutation-ready while blocked
    expect(blockedWording.mutationReadyLabel).toBeNull();
    expect(blockedWording.cardHeading).not.toMatch(/ready|success|complete|apply/i);

    // After fix: verify evidence present
    const clearedResult = normalizeIncidentActionResultPayload({
      success: true,
      verificationRequired: false,
      verifyPolicy: policy,
      outputSummary: 'doctor-fix - result shown in conversation above',
      evidence: {
        source: 'doctor-last-run',
        passed: 5,
        warnings: 0,
        errors: 0,
      },
    });

    expect(getActionResultPresentation(clearedResult).tone).toBe('success');
  });
});
