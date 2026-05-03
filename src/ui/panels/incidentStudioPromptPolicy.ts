export type IncidentActionRiskClass =
  | 'informational'
  | 'non-mutating-executable'
  | 'guarded-mutating'
  | 'high-risk-mutating';

export type IncidentActionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type IncidentActionRiskPolicy = {
  actionType: string;
  riskClass: IncidentActionRiskClass;
  riskLevel: IncidentActionRiskLevel;
  requiresImpactReview: boolean;
  requiresVerifyPath: boolean;
  allowCompletionClaimWithoutVerify: boolean;
};

const INCIDENT_ACTION_ALLOWLIST = new Set<string>([
  'change-impact-lite',
  'terminal-bridge',
  'fix-preview-lite',
  'workspace-memory-wizard',
  'doctor-fix',
  'recipe-pack',
  'inline-command',
  // KF5: capture a reproducible incident pack + replay payload
  'incident-repro-pack',
  // A02: multi-file module generation + apply workflow
  'apply-module-gen',
  // A03: debug patch generation + policy-gated apply workflow
  'apply-debug-patch',
]);

export function isIncidentActionAllowlisted(actionType: string): boolean {
  const normalized = String(actionType || '')
    .trim()
    .toLowerCase();
  return INCIDENT_ACTION_ALLOWLIST.has(normalized);
}

export function classifyIncidentActionPolicy(actionType: string): IncidentActionRiskPolicy {
  const normalized = String(actionType || '')
    .trim()
    .toLowerCase();

  switch (normalized) {
    case 'change-impact-lite':
      return {
        actionType: normalized,
        riskClass: 'informational',
        riskLevel: 'medium',
        requiresImpactReview: false,
        requiresVerifyPath: false,
        allowCompletionClaimWithoutVerify: true,
      };
    case 'terminal-bridge':
    case 'fix-preview-lite':
    case 'workspace-memory-wizard':
    case 'doctor-fix':
    case 'recipe-pack':
    case 'incident-repro-pack':
      return {
        actionType: normalized,
        riskClass: 'non-mutating-executable',
        riskLevel:
          normalized === 'doctor-fix' || normalized === 'incident-repro-pack' ? 'medium' : 'low',
        requiresImpactReview: false,
        requiresVerifyPath: normalized === 'doctor-fix',
        allowCompletionClaimWithoutVerify: normalized !== 'doctor-fix',
      };
    case 'inline-command':
      return {
        actionType: normalized,
        riskClass: 'guarded-mutating',
        riskLevel: 'high',
        requiresImpactReview: true,
        requiresVerifyPath: true,
        allowCompletionClaimWithoutVerify: false,
      };
    case 'apply-module-gen':
      return {
        actionType: normalized,
        riskClass: 'guarded-mutating',
        riskLevel: 'medium',
        requiresImpactReview: true,
        requiresVerifyPath: true,
        allowCompletionClaimWithoutVerify: false,
      };
    case 'apply-debug-patch':
      return {
        actionType: normalized,
        riskClass: 'guarded-mutating',
        riskLevel: 'high',
        requiresImpactReview: true,
        requiresVerifyPath: true,
        allowCompletionClaimWithoutVerify: false,
      };
    default:
      return {
        actionType: normalized || 'unknown',
        riskClass: 'high-risk-mutating',
        riskLevel: 'critical',
        requiresImpactReview: true,
        requiresVerifyPath: true,
        allowCompletionClaimWithoutVerify: false,
      };
  }
}

export function buildIncidentFirstResponseRules(input: {
  projectScoped: boolean;
  hasDoctorEvidence: boolean;
  framework?: string;
}): string[] {
  if (!input.projectScoped) {
    return [];
  }

  const rules: string[] = [
    'FIRST RESPONSE POLICY: Assume the user may be non-technical and needs a launch roadmap, not abstract architecture commentary.',
    'In `What happened`, begin with plain-language stage text: `Stage: <blocked|setup|ready-to-run>` and one sentence explaining current state.',
    'In `Why`, avoid jargon. If a technical term is necessary, explain it in simple words in the same line.',
    'In `Next command`, output one practical command that advances the user exactly one step toward a running service.',
    'Use this sequence explicitly when relevant: install dependencies -> init -> dev -> verify.',
    'If the project is blocked, name the blocker first, then the exact command or setup action to remove it.',
  ];

  if (!input.hasDoctorEvidence) {
    rules.push(
      'No doctor evidence exists yet. Do not default to generic workspace advice; infer launch readiness from selected project files and framework blockers.'
    );
  }

  if (input.framework === 'springboot') {
    rules.push(
      'For Spring Boot, prioritize wrapper/build-tool readiness and never recommend `rapidkit dev` before Maven/Gradle prerequisites are satisfied.'
    );
  }

  return rules;
}
