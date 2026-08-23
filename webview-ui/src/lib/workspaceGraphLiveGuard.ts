export type WorkspaceGraphLiveCursor = {
  workspacePath: string;
  sessionId: string;
  generation: number;
  revision: number;
};

function normalizePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

export function shouldAcceptWorkspaceGraphLiveUpdate(input: {
  activeWorkspacePath: string;
  incoming: WorkspaceGraphLiveCursor;
  current: WorkspaceGraphLiveCursor | null;
}): boolean {
  if (
    !input.incoming.workspacePath ||
    !input.incoming.sessionId ||
    !Number.isInteger(input.incoming.generation) ||
    !Number.isInteger(input.incoming.revision) ||
    normalizePath(input.incoming.workspacePath) !== normalizePath(input.activeWorkspacePath)
  ) {
    return false;
  }
  const current = input.current;
  return (
    !current ||
    normalizePath(current.workspacePath) !== normalizePath(input.incoming.workspacePath) ||
    current.sessionId !== input.incoming.sessionId ||
    input.incoming.generation > current.generation ||
    (input.incoming.generation === current.generation &&
      input.incoming.revision >= current.revision)
  );
}
