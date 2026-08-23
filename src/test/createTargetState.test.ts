import { describe, expect, it } from 'vitest';

import { resolveCreateTargetAfterScopeChange } from '../../webview-ui/src/lib/createTargetState';

describe('Create target state', () => {
  it('uses workspace context only as the untouched initial default', () => {
    expect(
      resolveCreateTargetAfterScopeChange({
        currentTarget: 'workspace',
        contextualTarget: 'project',
        userSelectedTarget: false,
      })
    ).toBe('project');
  });

  it('preserves an explicit workspace choice while sidebar scope hydrates', () => {
    expect(
      resolveCreateTargetAfterScopeChange({
        currentTarget: 'workspace',
        contextualTarget: 'project',
        userSelectedTarget: true,
      })
    ).toBe('workspace');
  });

  it('restores the immutable target of an active Create session until the user changes it', () => {
    expect(
      resolveCreateTargetAfterScopeChange({
        currentTarget: 'project',
        contextualTarget: 'project',
        activeSessionTarget: 'workspace',
        userSelectedTarget: false,
      })
    ).toBe('workspace');
    expect(
      resolveCreateTargetAfterScopeChange({
        currentTarget: 'project',
        contextualTarget: 'project',
        activeSessionTarget: 'workspace',
        userSelectedTarget: true,
      })
    ).toBe('project');
  });
});
