import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildIncidentFirstResponseRules,
  classifyIncidentActionPolicy,
  isIncidentActionAllowlisted,
} from '../ui/panels/incidentStudioPromptPolicy';

function readWelcomePanelSource(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const welcomePanelPath = path.resolve(currentDir, '../ui/panels/welcomePanel.ts');
  return readFileSync(welcomePanelPath, 'utf8');
}

describe('incidentStudioPromptPolicy', () => {
  it('returns no extra rules for workspace-scoped mode', () => {
    expect(
      buildIncidentFirstResponseRules({
        projectScoped: false,
        hasDoctorEvidence: true,
      })
    ).toEqual([]);
  });

  it('injects non-technical launch-roadmap guidance for project-scoped first response', () => {
    const rules = buildIncidentFirstResponseRules({
      projectScoped: true,
      hasDoctorEvidence: false,
      framework: 'fastapi',
    });

    expect(rules.some((line) => line.includes('non-technical'))).toBe(true);
    expect(rules.some((line) => line.includes('Stage: <blocked|setup|ready-to-run>'))).toBe(true);
    expect(
      rules.some((line) => line.includes('install dependencies -> init -> dev -> verify'))
    ).toBe(true);
    expect(rules.some((line) => line.includes('No doctor evidence exists yet'))).toBe(true);
  });

  it('adds spring-specific blocker rule in project-scoped mode', () => {
    const rules = buildIncidentFirstResponseRules({
      projectScoped: true,
      hasDoctorEvidence: true,
      framework: 'springboot',
    });

    expect(rules.some((line) => line.includes('Spring Boot'))).toBe(true);
    expect(rules.some((line) => line.includes('never recommend `rapidkit dev`'))).toBe(true);
  });

  it('classifies known low-risk and informational actions', () => {
    const terminal = classifyIncidentActionPolicy('terminal-bridge');
    const impact = classifyIncidentActionPolicy('change-impact-lite');

    expect(terminal.riskClass).toBe('non-mutating-executable');
    expect(terminal.riskLevel).toBe('low');
    expect(terminal.requiresVerifyPath).toBe(false);

    expect(impact.riskClass).toBe('informational');
    expect(impact.riskLevel).toBe('medium');
    expect(impact.allowCompletionClaimWithoutVerify).toBe(true);
  });

  it('classifies risky and unknown actions as verify-first required', () => {
    const inlineCommand = classifyIncidentActionPolicy('inline-command');
    const unknown = classifyIncidentActionPolicy('custom-mutate-action');

    expect(inlineCommand.riskClass).toBe('guarded-mutating');
    expect(inlineCommand.requiresImpactReview).toBe(true);
    expect(inlineCommand.requiresVerifyPath).toBe(true);
    expect(inlineCommand.allowCompletionClaimWithoutVerify).toBe(false);

    expect(unknown.riskClass).toBe('high-risk-mutating');
    expect(unknown.riskLevel).toBe('critical');
    expect(unknown.requiresVerifyPath).toBe(true);
  });

  it('enforces action allowlist for incident execution paths', () => {
    expect(isIncidentActionAllowlisted('doctor-fix')).toBe(true);
    expect(isIncidentActionAllowlisted('inline-command')).toBe(true);
    expect(isIncidentActionAllowlisted('  recipe-pack  ')).toBe(true);
    expect(isIncidentActionAllowlisted('verify-pack-autopilot')).toBe(true);
    expect(isIncidentActionAllowlisted('incident-repro-pack')).toBe(true);
    expect(isIncidentActionAllowlisted('release-readiness-commander')).toBe(true);

    expect(isIncidentActionAllowlisted('shell-exec-root')).toBe(false);
    expect(isIncidentActionAllowlisted('custom-mutate-action')).toBe(false);
    expect(isIncidentActionAllowlisted('')).toBe(false);
  });

  it('keeps verify-first requirements aligned across all supported action classes', () => {
    const actionTypes = [
      'change-impact-lite',
      'terminal-bridge',
      'fix-preview-lite',
      'workspace-memory-wizard',
      'doctor-fix',
      'recipe-pack',
      'verify-pack-autopilot',
      'incident-repro-pack',
      'release-readiness-commander',
      'inline-command',
      'custom-mutate-action',
    ];

    for (const actionType of actionTypes) {
      const policy = classifyIncidentActionPolicy(actionType);

      expect(policy.allowCompletionClaimWithoutVerify).toBe(!policy.requiresVerifyPath);

      if (policy.riskClass === 'guarded-mutating' || policy.riskClass === 'high-risk-mutating') {
        expect(policy.requiresVerifyPath).toBe(true);
        expect(policy.requiresImpactReview).toBe(true);
      }
    }
  });

  it('keeps inline-command prompt contract sections stable', () => {
    const source = readWelcomePanelSource();

    expect(source).toContain("if (actionType === 'inline-command')");
    expect(source).toContain('Decision Clarity Contract');
    expect(source).toContain("'1) Situation'");
    expect(source).toContain("'2) Why'");
    expect(source).toContain("'3) Impact scope (exact files/modules)'");
    expect(source).toContain("'4) Risk (confidence + mutating/non-mutating)'");
    expect(source).toContain("'5) Next safe step'");
    expect(source).toContain("'6) Verify plan (required commands)'");
    expect(source).toContain("'7) Rollback plan'");
  });

  it('keeps apply patch/module prompt contract sections stable', () => {
    const source = readWelcomePanelSource();

    expect(source).toContain("if (actionType === 'apply-module-gen')");
    expect(source).toContain("if (actionType === 'apply-debug-patch')");

    const decisionContractOccurrences = source.match(/Decision Clarity Contract \(required\):/g);
    expect(decisionContractOccurrences?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
