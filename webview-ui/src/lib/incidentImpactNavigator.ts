import type { IncidentArchitectureLensModel } from './incidentArchitectureLens';

export type IncidentArchitectureNavigatorItem =
  | {
      id: string;
      label: string;
      detail: string;
      kind: 'module';
      action: 'query';
      query: string;
    }
  | {
      id: string;
      label: string;
      detail: string;
      kind: 'file' | 'test' | 'node';
      action: 'open';
      targetPath: string;
      symbolName?: string;
      startLine?: number;
    };

export type IncidentArchitectureNavigatorSection = {
  id: 'modules' | 'files' | 'tests' | 'nodes';
  title: string;
  items: IncidentArchitectureNavigatorItem[];
};

function uniqueByKey<T>(values: T[], getKey: (value: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    const key = getKey(value).trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }

  return result;
}

function buildModuleQuery(moduleName: string): string {
  return [
    `Inspect the architecture impact around module "${moduleName}".`,
    'List the downstream files, tests, rollout risks, and the safest verification order before mutation.',
  ].join(' ');
}

export function buildIncidentArchitectureNavigator(
  lens: IncidentArchitectureLensModel | null
): IncidentArchitectureNavigatorSection[] {
  if (!lens) {
    return [];
  }

  const sections: IncidentArchitectureNavigatorSection[] = [];

  const moduleItems = uniqueByKey(
    lens.affectedModules.map(
      (moduleName): IncidentArchitectureNavigatorItem => ({
        id: `module:${moduleName}`,
        label: moduleName,
        detail: 'Re-check this module scope in the current incident thread.',
        kind: 'module',
        action: 'query',
        query: buildModuleQuery(moduleName),
      })
    ),
    (item) => item.id
  );

  if (moduleItems.length > 0) {
    sections.push({
      id: 'modules',
      title: 'Modules',
      items: moduleItems,
    });
  }

  const fileItems = uniqueByKey(
    lens.affectedFiles
      .filter((filePath) => filePath.trim().length > 0)
      .map(
        (filePath): IncidentArchitectureNavigatorItem => ({
          id: `file:${filePath}`,
          label: filePath,
          detail: 'Open affected file',
          kind: 'file',
          action: 'open',
          targetPath: filePath,
        })
      ),
    (item) => item.id
  );

  if (fileItems.length > 0) {
    sections.push({
      id: 'files',
      title: 'Files',
      items: fileItems,
    });
  }

  const testItems = uniqueByKey(
    lens.affectedTests
      .filter((filePath) => filePath.trim().length > 0)
      .map(
        (filePath): IncidentArchitectureNavigatorItem => ({
          id: `test:${filePath}`,
          label: filePath,
          detail: 'Open suggested verification test',
          kind: 'test',
          action: 'open',
          targetPath: filePath,
        })
      ),
    (item) => item.id
  );

  if (testItems.length > 0) {
    sections.push({
      id: 'tests',
      title: 'Tests',
      items: testItems,
    });
  }

  const focusNodeItems = uniqueByKey(
    lens.focusNodes
      .filter((node) => typeof node.filePath === 'string' && node.filePath.trim().length > 0)
      .map(
        (node): IncidentArchitectureNavigatorItem => ({
          id: `node:${node.id}`,
          label: node.label,
          detail: `${node.type} · ${node.confidence}% confidence${typeof node.startLine === 'number' ? ` · line ${node.startLine}` : ''}`,
          kind: 'node',
          action: 'open',
          targetPath: node.filePath as string,
          ...(node.symbolName ? { symbolName: node.symbolName } : {}),
          ...(typeof node.startLine === 'number' ? { startLine: node.startLine } : {}),
        })
      ),
    (item) => item.id
  );

  if (focusNodeItems.length > 0) {
    sections.push({
      id: 'nodes',
      title: 'Graph focus',
      items: focusNodeItems,
    });
  }

  return sections;
}
