import { describe, expect, it } from 'vitest';

import { buildWorkspaceGraphSearchCommand } from '../core/workspaceGraphSearchCommand';

describe('workspace graph search command', () => {
  it('forwards the v0.66 entity kind and project scope filters', () => {
    expect(
      buildWorkspaceGraphSearchCommand({
        query: 'authentication endpoint',
        kind: 'endpoint',
        scope: 'project:billing',
      })
    ).toEqual([
      'workspace',
      'graph',
      'search',
      'authentication endpoint',
      '--limit',
      '12',
      '--kind',
      'endpoint',
      '--scope',
      'project:billing',
      '--json',
    ]);
  });

  it('keeps the legacy unfiltered command shape', () => {
    expect(buildWorkspaceGraphSearchCommand({ query: 'api' })).toEqual([
      'workspace',
      'graph',
      'search',
      'api',
      '--limit',
      '12',
      '--json',
    ]);
  });
});
