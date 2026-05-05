/**
 * CLC7 — Artifact-level success criteria for Incident Studio UI.
 *
 * Defines explicit, machine-evaluable success criteria for each artifact type
 * that Incident Studio can produce. These criteria are surfaced in the UI as
 * a pass/fail card — not buried in logs — so the user always knows what
 * "success" means for a given action before and after execution.
 *
 * Artifact families covered:
 *   - verify    : test/lint/health verification runs
 *   - diagnosis : confidence-scored root-cause analysis
 *   - sandbox   : pre-apply simulation runs
 *   - rollback  : recovery execution result
 *   - repro     : incident reproduction pack capture
 *
 * Integration contract:
 *   Call `evaluateArtifactSuccessCriteria(artifact)` anywhere in the rendering
 *   path (host or webview) to get a `ArtifactCriteriaEvaluation` ready for UI.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ArtifactCriteriaStatus = 'pass' | 'fail' | 'partial' | 'unknown';

export type ArtifactCriterionResult = {
  /** Human-readable label shown in the UI card row. */
  label: string;
  /** Short explanation of what this criterion checks. */
  description: string;
  /** Result of the criterion check. */
  status: ArtifactCriteriaStatus;
  /** Optional detail value shown next to the status (e.g. "87%" or "3 errors"). */
  detail?: string;
};

export type ArtifactCriteriaEvaluation = {
  /** Artifact family this evaluation belongs to. */
  artifactKind: ArtifactKind;
  /** Overall roll-up: pass only when ALL criteria pass. */
  overallStatus: ArtifactCriteriaStatus;
  /** Ordered list of individual criterion results shown as card rows. */
  criteria: ArtifactCriterionResult[];
  /**
   * One-sentence summary for the UI card heading.
   * Written in plain language appropriate for all modes.
   */
  summaryLabel: string;
};

export type ArtifactKind = 'verify' | 'diagnosis' | 'sandbox' | 'rollback' | 'repro';

// ---------------------------------------------------------------------------
// Artifact input shapes (minimal — only fields needed for criteria evaluation)
// ---------------------------------------------------------------------------

export type VerifyArtifactInput = {
  kind: 'verify';
  errors: number;
  warnings: number;
  passed: number;
  /** True when the verify run completed without crashing/timing out. */
  runCompleted: boolean;
};

export type DiagnosisArtifactInput = {
  kind: 'diagnosis';
  confidence: number; // 0..1
  confidenceBand: 'low' | 'medium' | 'high';
  relatedFilesCount: number;
  signalSourcesCount: number;
};

export type SandboxArtifactInput = {
  kind: 'sandbox';
  status: 'passed' | 'failed' | 'skipped';
  safeToApply: boolean;
  commandCount: number;
  failedCommandCount: number;
};

export type RollbackArtifactInput = {
  kind: 'rollback';
  status: 'succeeded' | 'failed' | 'partial' | 'skipped' | 'unavailable';
  restoredFilesCount: number;
  failedFilesCount: number;
};

export type ReproArtifactInput = {
  kind: 'repro';
  status: 'captured' | 'failed' | 'skipped';
  redactionApplied: boolean;
  secretsLeakCount: number;
};

export type ArtifactInput =
  | VerifyArtifactInput
  | DiagnosisArtifactInput
  | SandboxArtifactInput
  | RollbackArtifactInput
  | ReproArtifactInput;

// ---------------------------------------------------------------------------
// Evaluators per artifact kind
// ---------------------------------------------------------------------------

function rollUp(criteria: ArtifactCriterionResult[]): ArtifactCriteriaStatus {
  if (criteria.every((c) => c.status === 'pass')) {
    return 'pass';
  }
  if (criteria.some((c) => c.status === 'fail')) {
    return 'fail';
  }
  if (criteria.some((c) => c.status === 'partial')) {
    return 'partial';
  }
  return 'unknown';
}

function evaluateVerify(input: VerifyArtifactInput): ArtifactCriteriaEvaluation {
  const criteria: ArtifactCriterionResult[] = [
    {
      label: 'Run completed',
      description: 'The verify run finished without crash or timeout.',
      status: input.runCompleted ? 'pass' : 'fail',
      detail: input.runCompleted ? 'yes' : 'no',
    },
    {
      label: 'Zero errors',
      description: 'All checks passed with no error-level failures.',
      status: input.errors === 0 ? 'pass' : 'fail',
      detail: `${input.errors} error${input.errors !== 1 ? 's' : ''}`,
    },
    {
      label: 'Checks passed',
      description: 'At least one check ran and passed.',
      status: input.passed > 0 ? 'pass' : 'fail',
      detail: `${input.passed} passed`,
    },
    {
      label: 'Warnings',
      description: 'Warning count is within acceptable range (informational).',
      status: input.warnings === 0 ? 'pass' : 'partial',
      detail: `${input.warnings} warning${input.warnings !== 1 ? 's' : ''}`,
    },
  ];

  const overallStatus = rollUp(criteria);
  const summaryLabel =
    overallStatus === 'pass'
      ? 'Verification passed — safe to proceed'
      : overallStatus === 'partial'
        ? 'Verification passed with warnings'
        : 'Verification failed — do not apply';

  return { artifactKind: 'verify', overallStatus, criteria, summaryLabel };
}

function evaluateDiagnosis(input: DiagnosisArtifactInput): ArtifactCriteriaEvaluation {
  const confidencePct = Math.round(input.confidence * 100);

  const criteria: ArtifactCriterionResult[] = [
    {
      label: 'Confidence band',
      description: 'Root-cause confidence must be medium or high to support action.',
      status: input.confidenceBand === 'low' ? 'fail' : 'pass',
      detail: `${input.confidenceBand} (${confidencePct}%)`,
    },
    {
      label: 'Signal sources',
      description: 'At least one evidence source contributed to the diagnosis.',
      status: input.signalSourcesCount > 0 ? 'pass' : 'fail',
      detail: `${input.signalSourcesCount} source${input.signalSourcesCount !== 1 ? 's' : ''}`,
    },
    {
      label: 'Related files identified',
      description: 'At least one related file was identified for scoped impact.',
      status: input.relatedFilesCount > 0 ? 'pass' : 'partial',
      detail: `${input.relatedFilesCount} file${input.relatedFilesCount !== 1 ? 's' : ''}`,
    },
  ];

  const overallStatus = rollUp(criteria);
  const summaryLabel =
    overallStatus === 'pass'
      ? 'Diagnosis confidence sufficient — ready to plan'
      : overallStatus === 'partial'
        ? 'Diagnosis ready — scope partially known'
        : 'Diagnosis confidence too low — clarification required';

  return { artifactKind: 'diagnosis', overallStatus, criteria, summaryLabel };
}

function evaluateSandbox(input: SandboxArtifactInput): ArtifactCriteriaEvaluation {
  const criteria: ArtifactCriterionResult[] = [
    {
      label: 'Simulation completed',
      description: 'The sandbox simulation ran to completion (not skipped).',
      status: input.status !== 'skipped' ? 'pass' : 'partial',
      detail: input.status,
    },
    {
      label: 'All commands passed',
      description: 'No simulation commands failed.',
      status: input.failedCommandCount === 0 ? 'pass' : 'fail',
      detail: `${input.failedCommandCount} failed / ${input.commandCount} total`,
    },
    {
      label: 'Safe to apply',
      description: 'Simulation result indicates the change is safe to apply.',
      status: input.safeToApply ? 'pass' : 'fail',
      detail: input.safeToApply ? 'yes' : 'no',
    },
  ];

  const overallStatus = rollUp(criteria);
  const summaryLabel =
    overallStatus === 'pass'
      ? 'Simulation passed — change is safe to apply'
      : overallStatus === 'partial'
        ? 'Simulation skipped — manual review required'
        : 'Simulation failed — apply is blocked';

  return { artifactKind: 'sandbox', overallStatus, criteria, summaryLabel };
}

function evaluateRollback(input: RollbackArtifactInput): ArtifactCriteriaEvaluation {
  const criteria: ArtifactCriterionResult[] = [
    {
      label: 'Rollback status',
      description: 'Rollback completed successfully or was not needed.',
      status:
        input.status === 'succeeded'
          ? 'pass'
          : input.status === 'skipped' || input.status === 'unavailable'
            ? 'partial'
            : input.status === 'partial'
              ? 'partial'
              : 'fail',
      detail: input.status,
    },
    {
      label: 'Files restored',
      description: 'At least one file was restored, or no files needed restoring.',
      status: input.failedFilesCount === 0 ? 'pass' : 'fail',
      detail:
        input.failedFilesCount === 0
          ? `${input.restoredFilesCount} restored`
          : `${input.failedFilesCount} failed to restore`,
    },
  ];

  const overallStatus = rollUp(criteria);
  const summaryLabel =
    overallStatus === 'pass'
      ? 'Rollback succeeded — workspace restored'
      : overallStatus === 'partial'
        ? 'Rollback partial — manual check recommended'
        : 'Rollback failed — workspace may be inconsistent';

  return { artifactKind: 'rollback', overallStatus, criteria, summaryLabel };
}

function evaluateRepro(input: ReproArtifactInput): ArtifactCriteriaEvaluation {
  const criteria: ArtifactCriterionResult[] = [
    {
      label: 'Pack captured',
      description: 'Incident repro pack was successfully captured.',
      status:
        input.status === 'captured' ? 'pass' : input.status === 'skipped' ? 'partial' : 'fail',
      detail: input.status,
    },
    {
      label: 'Redaction applied',
      description: 'Secret and sensitive data redaction policy was applied.',
      status: input.redactionApplied ? 'pass' : 'fail',
      detail: input.redactionApplied ? 'yes' : 'no — secrets may be present',
    },
    {
      label: 'Zero secrets leaked',
      description: 'No secrets were found in the pack after redaction.',
      status: input.secretsLeakCount === 0 ? 'pass' : 'fail',
      detail:
        input.secretsLeakCount === 0
          ? 'clean'
          : `${input.secretsLeakCount} secret${input.secretsLeakCount !== 1 ? 's' : ''} leaked`,
    },
  ];

  const overallStatus = rollUp(criteria);
  const summaryLabel =
    overallStatus === 'pass'
      ? 'Repro pack captured and redacted — safe to share'
      : overallStatus === 'partial'
        ? 'Repro pack skipped — manual capture required'
        : 'Repro pack failed or contains secrets — do not share';

  return { artifactKind: 'repro', overallStatus, criteria, summaryLabel };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * CLC7: Evaluates artifact-level success criteria for UI rendering.
 *
 * Returns a `ArtifactCriteriaEvaluation` with per-criterion pass/fail rows
 * and a plain-language summary label suitable for a UI card heading.
 */
export function evaluateArtifactSuccessCriteria(
  artifact: ArtifactInput
): ArtifactCriteriaEvaluation {
  switch (artifact.kind) {
    case 'verify':
      return evaluateVerify(artifact);
    case 'diagnosis':
      return evaluateDiagnosis(artifact);
    case 'sandbox':
      return evaluateSandbox(artifact);
    case 'rollback':
      return evaluateRollback(artifact);
    case 'repro':
      return evaluateRepro(artifact);
  }
}
