import * as path from 'path';

import { describe, expect, it } from 'vitest';

import {
  resolveStudioRepairGoalScope,
  resolveStudioRepairProjectTarget,
} from '../core/studioRepairProjectTarget.js';

describe('resolveStudioRepairProjectTarget', () => {
  it('prefers an explicit remediation-step project name', () => {
    expect(
      resolveStudioRepairProjectTarget({
        explicitProjectName: 'registry-api',
        affectedProjectNames: ['evidence-api'],
        projectPath: path.join('/workspace', 'folder-api'),
      })
    ).toBe('registry-api');
  });

  it('uses the single canonical project named by blocker evidence', () => {
    expect(
      resolveStudioRepairProjectTarget({
        affectedProjectNames: [' external-catalog '],
        projectPath: path.join('/outside', 'catalog-source'),
      })
    ).toBe('external-catalog');
  });

  it('deduplicates repeated evidence names before resolving the target', () => {
    expect(
      resolveStudioRepairProjectTarget({
        affectedProjectNames: ['catalog-api', ' catalog-api ', ''],
      })
    ).toBe('catalog-api');
  });

  it('falls back to the project directory only when evidence is ambiguous', () => {
    expect(
      resolveStudioRepairProjectTarget({
        affectedProjectNames: ['api', 'web'],
        projectPath: path.join('/workspace', 'selected-project'),
      })
    ).toBe('selected-project');
  });

  it('does not invent a workspace-wide project target', () => {
    expect(
      resolveStudioRepairProjectTarget({ affectedProjectNames: ['api', 'web'] })
    ).toBeUndefined();
  });

  it('binds a multi-project blocker to a project set instead of the selected UI project', () => {
    expect(
      resolveStudioRepairGoalScope({
        handoffScope: 'workspace',
        affectedProjectNames: ['nova-api', 'studio-api'],
        projectPath: path.join('/workspace', 'catalog-api'),
      })
    ).toEqual({
      kind: 'project-set',
      projects: ['nova-api', 'studio-api'],
      selectionSource: 'explicit',
      resolution: 'selected',
    });
  });

  it('keeps a workspace Goal workspace-scoped when evidence names no project', () => {
    expect(
      resolveStudioRepairGoalScope({
        handoffScope: 'workspace',
        projectPath: path.join('/workspace', 'catalog-api'),
      })
    ).toEqual({
      kind: 'workspace',
      projects: [],
      selectionSource: 'workspace',
      resolution: 'selected',
    });
  });
});
