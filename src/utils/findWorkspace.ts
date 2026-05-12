/**
 * Find Workspace Root
 * Utility to find the workspace root directory for a given project
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { MARKERS } from './constants';
import { getRegistryFilePath } from './registryPath';

function normalizeFsPath(inputPath: string): string {
  return path.resolve(inputPath);
}

function isPathWithinWorkspace(checkPath: string, workspacePath: string): boolean {
  const normalizedCheckPath = normalizeFsPath(checkPath);
  const normalizedWorkspacePath = normalizeFsPath(workspacePath);

  const relativePath = path.relative(normalizedWorkspacePath, normalizedCheckPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

/**
 * Validate workspace marker file signature
 */
function isValidMarker(marker: any): boolean {
  return (
    marker.signature === MARKERS.WORKSPACE_SIGNATURE ||
    marker.signature === MARKERS.WORKSPACE_SIGNATURE_LEGACY ||
    marker.signature === 'rapidkit-vscode' || // Very old legacy
    (marker.createdBy &&
      (marker.createdBy === MARKERS.CREATED_BY_NPM ||
        marker.createdBy === MARKERS.CREATED_BY_VSCODE))
  );
}

/**
 * Find workspace root by looking for .rapidkit-workspace marker
 * Searches up from the given directory and checks registered workspaces
 */
export async function findWorkspaceRoot(startPath: string): Promise<string | null> {
  const normalizedStartPath = normalizeFsPath(startPath);
  let currentPath = normalizedStartPath;
  const root = path.parse(normalizedStartPath).root;

  // Walk up the directory tree
  while (currentPath !== root) {
    const markerPath = path.join(currentPath, '.rapidkit-workspace');

    if (await fs.pathExists(markerPath)) {
      // Validate marker signature
      try {
        const marker = await fs.readJSON(markerPath);
        if (isValidMarker(marker)) {
          return currentPath;
        }
      } catch {
        // Invalid marker file, continue search
      }
    }

    // Check for .rapidkit/config.json (workspace created by npm package)
    const configJson = path.join(currentPath, '.rapidkit', 'config.json');
    if (await fs.pathExists(configJson)) {
      try {
        const config = await fs.readJSON(configJson);
        // npm package creates type: 'workspace' in config
        if (config.type === 'workspace') {
          return currentPath;
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Check for .rapidkit/context.json (legacy workspaces)
    const contextJson = path.join(currentPath, '.rapidkit', 'context.json');
    if (await fs.pathExists(contextJson)) {
      try {
        const context = await fs.readJSON(contextJson);
        // If engine is pip, this might be a workspace
        if (context.engine === 'pip') {
          return currentPath;
        }
      } catch {
        // Ignore parse errors
      }
    }

    const parentPath = path.dirname(currentPath);

    // Reached root
    if (parentPath === currentPath) {
      break;
    }

    currentPath = parentPath;
  }

  // Last resort: Check registered workspaces in ~/.rapidkit/workspaces.json
  const registeredWorkspace = await findInRegisteredWorkspaces(normalizedStartPath);
  return registeredWorkspace;
}

/**
 * Check if the path is inside any registered workspace
 */
async function findInRegisteredWorkspaces(checkPath: string): Promise<string | null> {
  try {
    const normalizedCheckPath = normalizeFsPath(checkPath);
    const workspacesFile = getRegistryFilePath();
    if (await fs.pathExists(workspacesFile)) {
      const data = await fs.readJSON(workspacesFile);
      const workspaces = data.workspaces || [];

      // Check if checkPath is inside any registered workspace
      for (const workspace of workspaces) {
        if (
          workspace &&
          typeof workspace.path === 'string' &&
          workspace.path.trim().length > 0 &&
          isPathWithinWorkspace(normalizedCheckPath, workspace.path)
        ) {
          return normalizeFsPath(workspace.path);
        }
      }
    }
  } catch (error) {
    // Silently fail - registry not available
    console.error('Error reading workspace registry:', error);
  }

  return null;
}

/**
 * Check if a project is inside a workspace
 */
export async function isProjectInWorkspace(projectPath: string): Promise<boolean> {
  const workspaceRoot = await findWorkspaceRoot(projectPath);
  return workspaceRoot !== null && workspaceRoot !== projectPath;
}
