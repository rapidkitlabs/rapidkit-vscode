import * as fs from 'fs-extra';
import * as path from 'path';

export type ImportedProjectStack =
  | 'fastapi'
  | 'django'
  | 'flask'
  | 'nestjs'
  | 'express'
  | 'koa'
  | 'go'
  | 'springboot'
  | 'rails'
  | 'dotnet'
  | 'unknown';

export interface ImportedProjectRegistryEntry {
  name: string;
  path: string;
  stack: ImportedProjectStack;
  confidence: 'high' | 'medium' | 'low';
  source?: 'local-folder' | 'git-url' | 'drag-drop';
  importedAt: string;
}

interface ImportedProjectsRegistryFile {
  version: 1;
  updatedAt: string;
  projects: ImportedProjectRegistryEntry[];
}

function registryFilePath(workspacePath: string): string {
  return path.join(workspacePath, '.rapidkit', 'imported-projects.json');
}

export async function readImportedProjectsRegistry(
  workspacePath: string
): Promise<ImportedProjectRegistryEntry[]> {
  const filePath = registryFilePath(workspacePath);
  if (!(await fs.pathExists(filePath))) {
    return [];
  }

  try {
    const raw: unknown = await fs.readJSON(filePath);
    const projects: unknown[] = Array.isArray((raw as { projects?: unknown[] })?.projects)
      ? ((raw as { projects?: unknown[] }).projects as unknown[])
      : [];

    return projects.filter((item: unknown): item is ImportedProjectRegistryEntry => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const candidate = item as ImportedProjectRegistryEntry;
      return (
        typeof candidate.name === 'string' &&
        typeof candidate.path === 'string' &&
        typeof candidate.stack === 'string' &&
        typeof candidate.confidence === 'string' &&
        typeof candidate.importedAt === 'string'
      );
    });
  } catch {
    return [];
  }
}

export async function upsertImportedProjectsRegistry(
  workspacePath: string,
  entries: ImportedProjectRegistryEntry[]
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const existing = await readImportedProjectsRegistry(workspacePath);
  const byPath = new Map<string, ImportedProjectRegistryEntry>();

  for (const item of existing) {
    byPath.set(item.path, item);
  }

  for (const item of entries) {
    byPath.set(item.path, item);
  }

  const projects = Array.from(byPath.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({ ...item }));

  const payload: ImportedProjectsRegistryFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    projects,
  };

  const filePath = registryFilePath(workspacePath);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJSON(filePath, payload, { spaces: 2 });
}
