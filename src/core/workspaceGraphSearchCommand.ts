export function buildWorkspaceGraphSearchCommand(input: {
  query: string;
  scope?: string;
  kind?: string;
  limit?: number;
}): string[] {
  const command = [
    'workspace',
    'graph',
    'search',
    input.query.trim(),
    '--limit',
    String(input.limit ?? 12),
  ];
  if (input.kind?.trim()) {
    command.push('--kind', input.kind.trim());
  }
  if (input.scope?.trim()) {
    command.push('--scope', input.scope.trim());
  }
  command.push('--json');
  return command;
}
