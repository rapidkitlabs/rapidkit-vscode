import { describe, expect, it } from 'vitest';

import { bindStudioGovernedCommandScope } from '../core/dashboardCommandExecutionPlan.js';

describe('Studio governed command scope', () => {
  it.each([
    ['workspaceRunInit', 'init'],
    ['workspaceRunTest', 'test'],
    ['workspaceRunBuild', 'build'],
    ['workspaceRunStart', 'start'],
  ])('binds %s to one canonical project', (commandId, stage) => {
    expect(
      bindStudioGovernedCommandScope({
        commandId,
        cliArgs: ['workspace', 'run', stage],
        projectName: 'my-next-app',
      })
    ).toEqual(['workspace', 'run', stage, '--scope', 'project:my-next-app', '--json']);
  });

  it('does not alter non-lifecycle producers', () => {
    expect(
      bindStudioGovernedCommandScope({
        commandId: 'workspaceVerify',
        cliArgs: ['workspace', 'verify', '--json'],
        projectName: 'my-next-app',
      })
    ).toEqual(['workspace', 'verify', '--json']);
  });

  it('fails closed when a repair handoff has no canonical project target', () => {
    expect(() =>
      bindStudioGovernedCommandScope({
        commandId: 'workspaceRunInit',
        cliArgs: ['workspace', 'run', 'init'],
        requireProjectScope: true,
      })
    ).toThrow('requires one canonical project target');
  });
});
