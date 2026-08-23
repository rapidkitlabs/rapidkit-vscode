export type CreateTargetState = 'workspace' | 'project';

/**
 * Keep an explicit user choice stable while asynchronous workspace scope is
 * hydrating. A persisted active Create session remains authoritative when the
 * user returns to it; otherwise context may choose the initial default only
 * until the user touches the target selector.
 */
export function resolveCreateTargetAfterScopeChange(input: {
  currentTarget: CreateTargetState;
  contextualTarget: CreateTargetState;
  activeSessionTarget?: CreateTargetState;
  userSelectedTarget: boolean;
}): CreateTargetState {
  if (input.userSelectedTarget) {
    return input.currentTarget;
  }
  if (input.activeSessionTarget) {
    return input.activeSessionTarget;
  }
  return input.contextualTarget;
}
