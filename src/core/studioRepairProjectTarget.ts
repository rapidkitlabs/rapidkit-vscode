import * as path from 'path';

export type StudioRepairProjectTargetInput = {
  explicitProjectName?: string;
  affectedProjectNames?: readonly string[];
  projectPath?: string;
};

export type StudioRepairGoalScope =
  | { kind: 'workspace'; projects: string[]; selectionSource: 'workspace'; resolution: 'selected' }
  | {
      kind: 'project';
      projects: [string];
      selectionSource: 'explicit';
      resolution: 'selected';
    }
  | {
      kind: 'project-set';
      projects: string[];
      selectionSource: 'explicit';
      resolution: 'selected';
    };

function normalizeProjectName(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function canonicalAffectedProjects(values: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((entry) => normalizeProjectName(entry))
        .filter((entry): entry is string => Boolean(entry))
    ),
  ];
}

/**
 * Resolve the canonical project reference sent to the CLI Repair Engine.
 *
 * Evidence-owned names win over filesystem guesses because linked/external
 * projects may be registered under a stable name that differs from the final
 * directory segment. A path basename is only a compatibility fallback when
 * the repair contract did not identify exactly one affected project.
 */
export function resolveStudioRepairProjectTarget(
  input: StudioRepairProjectTargetInput
): string | undefined {
  const explicit = normalizeProjectName(input.explicitProjectName);
  if (explicit) {
    return explicit;
  }

  const affected = canonicalAffectedProjects(input.affectedProjectNames);
  if (affected.length === 1) {
    return affected[0];
  }

  const projectPath = normalizeProjectName(input.projectPath);
  return projectPath ? path.basename(path.resolve(projectPath)) : undefined;
}

/**
 * Bind a governed Goal to the projects named by blocker evidence. Dashboard
 * selection is presentation state and must never narrow a workspace incident
 * that demonstrably affects a different project or a project set.
 */
export function resolveStudioRepairGoalScope(input: {
  handoffScope?: 'workspace' | 'project';
  affectedProjectNames?: readonly string[];
  explicitProjectName?: string;
  projectPath?: string;
}): StudioRepairGoalScope {
  const affected = canonicalAffectedProjects(input.affectedProjectNames);
  if (affected.length > 1) {
    return {
      kind: 'project-set',
      projects: affected,
      selectionSource: 'explicit',
      resolution: 'selected',
    };
  }

  const projectName =
    affected[0] ??
    (input.handoffScope === 'project'
      ? resolveStudioRepairProjectTarget({
          explicitProjectName: input.explicitProjectName,
          projectPath: input.projectPath,
        })
      : undefined);
  if (projectName) {
    return {
      kind: 'project',
      projects: [projectName],
      selectionSource: 'explicit',
      resolution: 'selected',
    };
  }

  return {
    kind: 'workspace',
    projects: [],
    selectionSource: 'workspace',
    resolution: 'selected',
  };
}
