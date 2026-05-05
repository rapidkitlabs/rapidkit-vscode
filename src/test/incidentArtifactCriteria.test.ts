/**
 * CLC7 — Artifact-level success criteria golden tests.
 *
 * Validates that each artifact family produces correct per-criterion pass/fail
 * results and a human-readable summary label surfaceable in the UI.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateArtifactSuccessCriteria,
  type VerifyArtifactInput,
  type DiagnosisArtifactInput,
  type SandboxArtifactInput,
  type RollbackArtifactInput,
  type ReproArtifactInput,
} from '../../webview-ui/src/lib/incidentArtifactCriteria';

// ---------------------------------------------------------------------------
// CLC7-A: Verify artifact
// ---------------------------------------------------------------------------

describe('CLC7-A Verify artifact criteria', () => {
  it('overall pass when run completed, zero errors, at least one passed, zero warnings', () => {
    const input: VerifyArtifactInput = {
      kind: 'verify',
      runCompleted: true,
      errors: 0,
      passed: 5,
      warnings: 0,
    };
    const ev = evaluateArtifactSuccessCriteria(input);
    expect(ev.artifactKind).toBe('verify');
    expect(ev.overallStatus).toBe('pass');
    expect(ev.summaryLabel).toMatch(/safe to proceed/i);
  });

  it('overall fail when errors > 0', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'verify',
      runCompleted: true,
      errors: 2,
      passed: 3,
      warnings: 0,
    });
    expect(ev.overallStatus).toBe('fail');
    expect(ev.summaryLabel).toMatch(/failed/i);
    const errCrit = ev.criteria.find((c) => c.label === 'Zero errors')!;
    expect(errCrit.status).toBe('fail');
    expect(errCrit.detail).toContain('2 errors');
  });

  it('overall fail when run did not complete', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'verify',
      runCompleted: false,
      errors: 0,
      passed: 0,
      warnings: 0,
    });
    expect(ev.overallStatus).toBe('fail');
    const runCrit = ev.criteria.find((c) => c.label === 'Run completed')!;
    expect(runCrit.status).toBe('fail');
  });

  it('partial when warnings present but no errors', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'verify',
      runCompleted: true,
      errors: 0,
      passed: 3,
      warnings: 2,
    });
    expect(ev.overallStatus).toBe('partial');
    expect(ev.summaryLabel).toMatch(/warnings/i);
    const warnCrit = ev.criteria.find((c) => c.label === 'Warnings')!;
    expect(warnCrit.status).toBe('partial');
    expect(warnCrit.detail).toContain('2 warnings');
  });

  it('criteria array contains exactly 4 rows', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'verify',
      runCompleted: true,
      errors: 0,
      passed: 1,
      warnings: 0,
    });
    expect(ev.criteria).toHaveLength(4);
  });

  it('singular grammar: "1 error" not "1 errors"', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'verify',
      runCompleted: true,
      errors: 1,
      passed: 1,
      warnings: 1,
    });
    const errCrit = ev.criteria.find((c) => c.label === 'Zero errors')!;
    expect(errCrit.detail).toBe('1 error');
    const warnCrit = ev.criteria.find((c) => c.label === 'Warnings')!;
    expect(warnCrit.detail).toBe('1 warning');
  });
});

// ---------------------------------------------------------------------------
// CLC7-B: Diagnosis artifact
// ---------------------------------------------------------------------------

describe('CLC7-B Diagnosis artifact criteria', () => {
  it('overall pass for high-confidence with files and sources', () => {
    const input: DiagnosisArtifactInput = {
      kind: 'diagnosis',
      confidence: 0.91,
      confidenceBand: 'high',
      relatedFilesCount: 3,
      signalSourcesCount: 2,
    };
    const ev = evaluateArtifactSuccessCriteria(input);
    expect(ev.artifactKind).toBe('diagnosis');
    expect(ev.overallStatus).toBe('pass');
    expect(ev.summaryLabel).toMatch(/ready to plan/i);
  });

  it('overall fail when confidence band is low', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'diagnosis',
      confidence: 0.22,
      confidenceBand: 'low',
      relatedFilesCount: 1,
      signalSourcesCount: 1,
    });
    expect(ev.overallStatus).toBe('fail');
    expect(ev.summaryLabel).toMatch(/clarification required/i);
    const confCrit = ev.criteria.find((c) => c.label === 'Confidence band')!;
    expect(confCrit.status).toBe('fail');
  });

  it('partial when no related files but confidence is high', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'diagnosis',
      confidence: 0.85,
      confidenceBand: 'high',
      relatedFilesCount: 0,
      signalSourcesCount: 2,
    });
    expect(ev.overallStatus).toBe('partial');
    expect(ev.summaryLabel).toMatch(/partially known/i);
  });

  it('overall fail when no signal sources', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'diagnosis',
      confidence: 0.6,
      confidenceBand: 'medium',
      relatedFilesCount: 2,
      signalSourcesCount: 0,
    });
    expect(ev.overallStatus).toBe('fail');
    const srcCrit = ev.criteria.find((c) => c.label === 'Signal sources')!;
    expect(srcCrit.status).toBe('fail');
  });

  it('confidence detail shows percentage', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'diagnosis',
      confidence: 0.87,
      confidenceBand: 'high',
      relatedFilesCount: 1,
      signalSourcesCount: 1,
    });
    const confCrit = ev.criteria.find((c) => c.label === 'Confidence band')!;
    expect(confCrit.detail).toContain('87%');
  });

  it('criteria array contains exactly 3 rows', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'diagnosis',
      confidence: 0.9,
      confidenceBand: 'high',
      relatedFilesCount: 1,
      signalSourcesCount: 1,
    });
    expect(ev.criteria).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// CLC7-C: Sandbox artifact
// ---------------------------------------------------------------------------

describe('CLC7-C Sandbox artifact criteria', () => {
  it('overall pass when simulation passed, safeToApply, no failed commands', () => {
    const input: SandboxArtifactInput = {
      kind: 'sandbox',
      status: 'passed',
      safeToApply: true,
      commandCount: 4,
      failedCommandCount: 0,
    };
    const ev = evaluateArtifactSuccessCriteria(input);
    expect(ev.artifactKind).toBe('sandbox');
    expect(ev.overallStatus).toBe('pass');
    expect(ev.summaryLabel).toMatch(/safe to apply/i);
  });

  it('overall fail when safeToApply is false', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'sandbox',
      status: 'failed',
      safeToApply: false,
      commandCount: 2,
      failedCommandCount: 1,
    });
    expect(ev.overallStatus).toBe('fail');
    expect(ev.summaryLabel).toMatch(/blocked/i);
  });

  it('partial when status is skipped', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'sandbox',
      status: 'skipped',
      safeToApply: false,
      commandCount: 0,
      failedCommandCount: 0,
    });
    // skipped → simulation criterion is partial; safeToApply=false → fail
    expect(ev.overallStatus).toBe('fail');
    const simCrit = ev.criteria.find((c) => c.label === 'Simulation completed')!;
    expect(simCrit.status).toBe('partial');
  });

  it('fail detail shows failed/total command count', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'sandbox',
      status: 'failed',
      safeToApply: false,
      commandCount: 5,
      failedCommandCount: 2,
    });
    const cmdCrit = ev.criteria.find((c) => c.label === 'All commands passed')!;
    expect(cmdCrit.detail).toContain('2 failed / 5 total');
  });

  it('criteria array contains exactly 3 rows', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'sandbox',
      status: 'passed',
      safeToApply: true,
      commandCount: 1,
      failedCommandCount: 0,
    });
    expect(ev.criteria).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// CLC7-D: Rollback artifact
// ---------------------------------------------------------------------------

describe('CLC7-D Rollback artifact criteria', () => {
  it('overall pass when succeeded and no failed files', () => {
    const input: RollbackArtifactInput = {
      kind: 'rollback',
      status: 'succeeded',
      restoredFilesCount: 3,
      failedFilesCount: 0,
    };
    const ev = evaluateArtifactSuccessCriteria(input);
    expect(ev.artifactKind).toBe('rollback');
    expect(ev.overallStatus).toBe('pass');
    expect(ev.summaryLabel).toMatch(/restored/i);
  });

  it('overall fail when status is failed', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'rollback',
      status: 'failed',
      restoredFilesCount: 0,
      failedFilesCount: 2,
    });
    expect(ev.overallStatus).toBe('fail');
    expect(ev.summaryLabel).toMatch(/inconsistent/i);
  });

  it('partial when status is skipped', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'rollback',
      status: 'skipped',
      restoredFilesCount: 0,
      failedFilesCount: 0,
    });
    expect(ev.overallStatus).toBe('partial');
    expect(ev.summaryLabel).toMatch(/manual check/i);
  });

  it('partial when status is partial', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'rollback',
      status: 'partial',
      restoredFilesCount: 2,
      failedFilesCount: 1,
    });
    expect(ev.overallStatus).toBe('fail'); // failedFilesCount > 0 → files-restored criterion fails
    const filesCrit = ev.criteria.find((c) => c.label === 'Files restored')!;
    expect(filesCrit.status).toBe('fail');
  });

  it('criteria array contains exactly 2 rows', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'rollback',
      status: 'succeeded',
      restoredFilesCount: 1,
      failedFilesCount: 0,
    });
    expect(ev.criteria).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// CLC7-E: Repro artifact
// ---------------------------------------------------------------------------

describe('CLC7-E Repro artifact criteria', () => {
  it('overall pass when captured, redacted, zero secrets', () => {
    const input: ReproArtifactInput = {
      kind: 'repro',
      status: 'captured',
      redactionApplied: true,
      secretsLeakCount: 0,
    };
    const ev = evaluateArtifactSuccessCriteria(input);
    expect(ev.artifactKind).toBe('repro');
    expect(ev.overallStatus).toBe('pass');
    expect(ev.summaryLabel).toMatch(/safe to share/i);
  });

  it('overall fail when secrets leaked', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'repro',
      status: 'captured',
      redactionApplied: true,
      secretsLeakCount: 1,
    });
    expect(ev.overallStatus).toBe('fail');
    expect(ev.summaryLabel).toMatch(/do not share/i);
    const secretCrit = ev.criteria.find((c) => c.label === 'Zero secrets leaked')!;
    expect(secretCrit.status).toBe('fail');
    expect(secretCrit.detail).toContain('1 secret leaked');
  });

  it('overall fail when redaction was not applied', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'repro',
      status: 'captured',
      redactionApplied: false,
      secretsLeakCount: 0,
    });
    expect(ev.overallStatus).toBe('fail');
    const redactCrit = ev.criteria.find((c) => c.label === 'Redaction applied')!;
    expect(redactCrit.status).toBe('fail');
    expect(redactCrit.detail).toMatch(/secrets may be present/);
  });

  it('partial when status is skipped', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'repro',
      status: 'skipped',
      redactionApplied: true,
      secretsLeakCount: 0,
    });
    expect(ev.overallStatus).toBe('partial');
    expect(ev.summaryLabel).toMatch(/manual capture/i);
  });

  it('plural grammar: "2 secrets leaked" not "2 secret leaked"', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'repro',
      status: 'captured',
      redactionApplied: true,
      secretsLeakCount: 2,
    });
    const secretCrit = ev.criteria.find((c) => c.label === 'Zero secrets leaked')!;
    expect(secretCrit.detail).toBe('2 secrets leaked');
  });

  it('criteria array contains exactly 3 rows', () => {
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'repro',
      status: 'captured',
      redactionApplied: true,
      secretsLeakCount: 0,
    });
    expect(ev.criteria).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// CLC7-F: Cross-artifact invariants
// ---------------------------------------------------------------------------

describe('CLC7-F Cross-artifact invariants', () => {
  it('every evaluation has a non-empty summaryLabel', () => {
    const inputs = [
      { kind: 'verify' as const, runCompleted: true, errors: 0, passed: 1, warnings: 0 },
      {
        kind: 'diagnosis' as const,
        confidence: 0.9,
        confidenceBand: 'high' as const,
        relatedFilesCount: 1,
        signalSourcesCount: 1,
      },
      {
        kind: 'sandbox' as const,
        status: 'passed' as const,
        safeToApply: true,
        commandCount: 1,
        failedCommandCount: 0,
      },
      {
        kind: 'rollback' as const,
        status: 'succeeded' as const,
        restoredFilesCount: 1,
        failedFilesCount: 0,
      },
      {
        kind: 'repro' as const,
        status: 'captured' as const,
        redactionApplied: true,
        secretsLeakCount: 0,
      },
    ];
    inputs.forEach((input) => {
      const ev = evaluateArtifactSuccessCriteria(input);
      expect(ev.summaryLabel.length).toBeGreaterThan(0);
    });
  });

  it('every evaluation has at least one criterion', () => {
    const inputs = [
      { kind: 'verify' as const, runCompleted: true, errors: 0, passed: 1, warnings: 0 },
      {
        kind: 'diagnosis' as const,
        confidence: 0.9,
        confidenceBand: 'high' as const,
        relatedFilesCount: 1,
        signalSourcesCount: 1,
      },
      {
        kind: 'sandbox' as const,
        status: 'passed' as const,
        safeToApply: true,
        commandCount: 1,
        failedCommandCount: 0,
      },
      {
        kind: 'rollback' as const,
        status: 'succeeded' as const,
        restoredFilesCount: 1,
        failedFilesCount: 0,
      },
      {
        kind: 'repro' as const,
        status: 'captured' as const,
        redactionApplied: true,
        secretsLeakCount: 0,
      },
    ];
    inputs.forEach((input) => {
      const ev = evaluateArtifactSuccessCriteria(input);
      expect(ev.criteria.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('every criterion has a non-empty label and description', () => {
    const inputs = [
      { kind: 'verify' as const, runCompleted: true, errors: 0, passed: 1, warnings: 0 },
      {
        kind: 'diagnosis' as const,
        confidence: 0.9,
        confidenceBand: 'high' as const,
        relatedFilesCount: 1,
        signalSourcesCount: 1,
      },
    ];
    inputs.forEach((input) => {
      const ev = evaluateArtifactSuccessCriteria(input);
      ev.criteria.forEach((c) => {
        expect(c.label.length).toBeGreaterThan(0);
        expect(c.description.length).toBeGreaterThan(0);
      });
    });
  });

  it('overallStatus is fail when any criterion is fail (not partial)', () => {
    // verify: errors > 0 is a hard fail
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'verify',
      runCompleted: true,
      errors: 3,
      passed: 0,
      warnings: 0,
    });
    expect(ev.overallStatus).toBe('fail');
  });

  it('overallStatus is pass only when ALL criteria are pass', () => {
    // If even one is partial, overall cannot be pass
    const ev = evaluateArtifactSuccessCriteria({
      kind: 'verify',
      runCompleted: true,
      errors: 0,
      passed: 1,
      warnings: 1,
    });
    // warnings=1 → partial → overall is partial, not pass
    expect(ev.overallStatus).not.toBe('pass');
  });

  it('artifactKind matches the input kind for all families', () => {
    expect(
      evaluateArtifactSuccessCriteria({
        kind: 'verify',
        runCompleted: true,
        errors: 0,
        passed: 1,
        warnings: 0,
      }).artifactKind
    ).toBe('verify');
    expect(
      evaluateArtifactSuccessCriteria({
        kind: 'diagnosis',
        confidence: 0.9,
        confidenceBand: 'high',
        relatedFilesCount: 1,
        signalSourcesCount: 1,
      }).artifactKind
    ).toBe('diagnosis');
    expect(
      evaluateArtifactSuccessCriteria({
        kind: 'sandbox',
        status: 'passed',
        safeToApply: true,
        commandCount: 1,
        failedCommandCount: 0,
      }).artifactKind
    ).toBe('sandbox');
    expect(
      evaluateArtifactSuccessCriteria({
        kind: 'rollback',
        status: 'succeeded',
        restoredFilesCount: 1,
        failedFilesCount: 0,
      }).artifactKind
    ).toBe('rollback');
    expect(
      evaluateArtifactSuccessCriteria({
        kind: 'repro',
        status: 'captured',
        redactionApplied: true,
        secretsLeakCount: 0,
      }).artifactKind
    ).toBe('repro');
  });
});
