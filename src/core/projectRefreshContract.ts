export const PROJECT_REFRESH_WATCH_PATTERNS = [
  '**/.workspai/project.json',
  '**/.workspai/context.json',
  '**/.workspai/registry.json',
  '**/.workspai/imported-projects.json',
  '**/.workspai/workspace-registry.v1.json',
  '**/.rapidkit/project.json',
  '**/.rapidkit/context.json',
  '**/.rapidkit/registry.json',
  '**/.rapidkit/imported-projects.json',
] as const;

/**
 * Scoped to the active workspace root via RelativePattern. Only governed
 * Workspai/Rapidkit ownership artifacts are watched — recursive language
 * manifests (package.json, go.mod, ...) exhaust inotify on large monorepos.
 */
export const PROJECT_REFRESH_WATCH_GLOB =
  '**/{.workspai/project.json,.workspai/context.json,.workspai/registry.json,.workspai/imported-projects.json,.workspai/workspace-registry.v1.json,.rapidkit/project.json,.rapidkit/context.json,.rapidkit/registry.json,.rapidkit/imported-projects.json}';
