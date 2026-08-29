import * as path from 'path';

import {
  incompatibleJsonArtifact,
  isJsonArtifactReadFailure,
  readJsonArtifact,
  type JsonArtifactReadResult,
} from './jsonArtifactReader.js';
import { WORKSPACE_SKILLS_INDEX_PATH } from './workspaceIntelligencePaths.js';

export const WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION = 'workspace-skills-index.v1' as const;

export type WorkspaceSkillsIndexEntry = {
  skillId: string;
  path: string;
  schemaVersion: string;
  title: string;
};

export type WorkspaceOperationalSkillDecision = {
  skillId: string;
  title: string;
  status: 'generated' | 'suppressed';
  confidence: 'high' | 'medium';
  reasons: string[];
  signals: string[];
  scopedProjects: string[];
};

export type WorkspaceSkillsIndex = {
  schemaVersion: typeof WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION;
  generatedAt: string;
  inputsHash: string;
  skills: WorkspaceSkillsIndexEntry[];
  selection?: {
    generatedCount: number;
    suppressedCount: number;
    decisions: WorkspaceOperationalSkillDecision[];
  };
};

export type WorkspaceSkillsIndexReadResult =
  | { kind: 'missing'; artifactPath: string }
  | { kind: 'valid'; artifactPath: string; index: WorkspaceSkillsIndex }
  | { kind: 'corrupt'; artifactPath: string; error: string }
  | { kind: 'incompatible'; artifactPath: string; error: string };

const OPERATIONAL_SKILL_PATH = /^\.workspai\/skills\/[a-z0-9][a-z0-9-]*\.md$/;

function isValidDateTime(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function isWorkspaceSkillsIndex(value: unknown): value is WorkspaceSkillsIndex {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION) {
    return false;
  }
  if (
    typeof record.generatedAt !== 'string' ||
    !isValidDateTime(record.generatedAt) ||
    typeof record.inputsHash !== 'string' ||
    record.inputsHash.length < 8 ||
    !Array.isArray(record.skills)
  ) {
    return false;
  }
  const skillIds = new Set<string>();
  const paths = new Set<string>();
  const skillsValid = record.skills.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    const skill = entry as Record<string, unknown>;
    const valid =
      typeof skill.skillId === 'string' &&
      skill.skillId.length > 0 &&
      typeof skill.path === 'string' &&
      OPERATIONAL_SKILL_PATH.test(skill.path) &&
      typeof skill.schemaVersion === 'string' &&
      skill.schemaVersion.length > 0 &&
      typeof skill.title === 'string' &&
      skill.title.length > 0 &&
      !skillIds.has(skill.skillId) &&
      !paths.has(skill.path);
    if (valid) {
      skillIds.add(skill.skillId as string);
      paths.add(skill.path as string);
    }
    return valid;
  });
  if (!skillsValid) {
    return false;
  }
  if (record.selection === undefined) {
    return true;
  }
  if (
    !record.selection ||
    typeof record.selection !== 'object' ||
    Array.isArray(record.selection)
  ) {
    return false;
  }
  const selection = record.selection as Record<string, unknown>;
  if (
    !Number.isInteger(selection.generatedCount) ||
    Number(selection.generatedCount) < 0 ||
    !Number.isInteger(selection.suppressedCount) ||
    Number(selection.suppressedCount) < 0 ||
    !Array.isArray(selection.decisions)
  ) {
    return false;
  }
  const decisions = selection.decisions as unknown[];
  const decisionIds = new Set<string>();
  let generatedCount = 0;
  let suppressedCount = 0;
  const decisionsValid = decisions.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    const decision = entry as Record<string, unknown>;
    const status = decision.status;
    const valid =
      typeof decision.skillId === 'string' &&
      Boolean(decision.skillId) &&
      !decisionIds.has(decision.skillId) &&
      typeof decision.title === 'string' &&
      (status === 'generated' || status === 'suppressed') &&
      (decision.confidence === 'high' || decision.confidence === 'medium') &&
      [decision.reasons, decision.signals, decision.scopedProjects].every(
        (items) => Array.isArray(items) && items.every((item) => typeof item === 'string')
      );
    if (valid) {
      decisionIds.add(decision.skillId as string);
      if (status === 'generated') {
        generatedCount += 1;
      } else {
        suppressedCount += 1;
      }
    }
    return valid;
  });
  return (
    decisionsValid &&
    generatedCount === selection.generatedCount &&
    suppressedCount === selection.suppressedCount &&
    generatedCount === record.skills.length &&
    record.skills.every((skill) =>
      decisions.some(
        (decision) =>
          (decision as Record<string, unknown>).skillId === skill.skillId &&
          (decision as Record<string, unknown>).status === 'generated'
      )
    )
  );
}

export async function readWorkspaceSkillsIndex(
  workspacePath: string
): Promise<WorkspaceSkillsIndex | null> {
  const result = await readWorkspaceSkillsIndexArtifact(workspacePath);
  return result.kind === 'valid' ? result.index : null;
}

export async function readWorkspaceSkillsIndexArtifact(
  workspacePath: string
): Promise<WorkspaceSkillsIndexReadResult> {
  const absolutePath = path.join(workspacePath, WORKSPACE_SKILLS_INDEX_PATH);
  const result: JsonArtifactReadResult = await readJsonArtifact(absolutePath);
  if (isJsonArtifactReadFailure(result)) {
    return result;
  }
  if (!isWorkspaceSkillsIndex(result.raw)) {
    return incompatibleJsonArtifact({
      artifactPath: result.artifactPath,
      expectedSchemaVersion: WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION,
      actualSchemaVersion: result.raw.schemaVersion,
      reason:
        'Workspace skills index must include a valid timestamp, inputs hash, and unique safe operational skills.',
    });
  }
  return { kind: 'valid', artifactPath: result.artifactPath, index: result.raw };
}

export function summarizeOperationalSkills(index: WorkspaceSkillsIndex | null): string {
  if (!index?.skills?.length) {
    return '';
  }
  const suppressed = index.selection?.suppressedCount ?? 0;
  return `${index.skills.length} operational skill(s)${suppressed > 0 ? ` · ${suppressed} evidence-suppressed` : ''}`;
}
