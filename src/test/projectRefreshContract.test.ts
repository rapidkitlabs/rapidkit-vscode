import { describe, expect, it } from 'vitest';

import {
  PROJECT_REFRESH_WATCH_GLOB,
  PROJECT_REFRESH_WATCH_PATTERNS,
} from '../core/projectRefreshContract';

describe('primary sidebar project refresh contract', () => {
  it('watches canonical ownership artifacts before compatibility markers', () => {
    expect(PROJECT_REFRESH_WATCH_PATTERNS.slice(0, 5)).toEqual([
      '**/.workspai/project.json',
      '**/.workspai/context.json',
      '**/.workspai/registry.json',
      '**/.workspai/imported-projects.json',
      '**/.workspai/workspace-registry.v1.json',
    ]);
    expect(PROJECT_REFRESH_WATCH_PATTERNS).toContain('**/.rapidkit/project.json');
  });

  it('scopes live refresh to governed ownership artifacts only', () => {
    expect(PROJECT_REFRESH_WATCH_GLOB).toContain('.workspai/project.json');
    expect(PROJECT_REFRESH_WATCH_GLOB).toContain('.rapidkit/registry.json');
    expect(PROJECT_REFRESH_WATCH_GLOB).not.toContain('package.json');
    expect(PROJECT_REFRESH_WATCH_GLOB).not.toContain('go.mod');
    expect(PROJECT_REFRESH_WATCH_GLOB).not.toContain('pyproject.toml');
    expect(PROJECT_REFRESH_WATCH_PATTERNS).not.toContain('**/package.json');
  });
});
