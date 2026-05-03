import * as path from 'path';

function isInsideRoot(candidatePath: string, rootPath?: string): boolean {
  if (!rootPath) {
    return false;
  }
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveIncidentNavigatorTargetPath(input: {
  targetPath: string;
  workspacePath?: string;
  projectPath?: string;
}): string | undefined {
  const rawTargetPath = input.targetPath.trim();
  if (!rawTargetPath) {
    return undefined;
  }

  const roots = [input.projectPath, input.workspacePath].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );

  if (path.isAbsolute(rawTargetPath)) {
    return roots.some((rootPath) => isInsideRoot(rawTargetPath, rootPath))
      ? rawTargetPath
      : undefined;
  }

  for (const rootPath of roots) {
    const candidatePath = path.resolve(rootPath, rawTargetPath);
    if (isInsideRoot(candidatePath, rootPath)) {
      return candidatePath;
    }
  }

  return undefined;
}

export function findIncidentNavigatorSelection(
  source: string,
  input: {
    symbolName?: string;
    startLine?: number;
  }
): { line: number; startCharacter: number; endCharacter: number } | undefined {
  const lines = source.split(/\r?\n/);
  const rawSymbolName = typeof input.symbolName === 'string' ? input.symbolName.trim() : '';
  const symbolName = rawSymbolName.length > 0 ? rawSymbolName : undefined;
  const requestedLine =
    typeof input.startLine === 'number' && Number.isFinite(input.startLine) && input.startLine > 0
      ? Math.floor(input.startLine) - 1
      : undefined;

  const findInLine = (lineIndex: number) => {
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return undefined;
    }

    const line = lines[lineIndex];
    if (symbolName) {
      const exactWordRegex = new RegExp(
        `\\b${symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`
      );
      const exactMatch = exactWordRegex.exec(line);
      if (exactMatch && typeof exactMatch.index === 'number') {
        return {
          line: lineIndex,
          startCharacter: exactMatch.index,
          endCharacter: exactMatch.index + exactMatch[0].length,
        };
      }

      const containsIndex = line.indexOf(symbolName);
      if (containsIndex >= 0) {
        return {
          line: lineIndex,
          startCharacter: containsIndex,
          endCharacter: containsIndex + symbolName.length,
        };
      }
    }

    if (requestedLine === lineIndex) {
      const firstContentCharacter = line.search(/\S/);
      const startCharacter = firstContentCharacter >= 0 ? firstContentCharacter : 0;
      const endCharacter = startCharacter + (symbolName?.length || 1);
      return {
        line: lineIndex,
        startCharacter,
        endCharacter,
      };
    }

    return undefined;
  };

  if (typeof requestedLine === 'number') {
    const nearbyLines = [
      requestedLine,
      requestedLine - 1,
      requestedLine + 1,
      requestedLine - 2,
      requestedLine + 2,
    ];
    for (const lineIndex of nearbyLines) {
      const found = findInLine(lineIndex);
      if (found) {
        return found;
      }
    }
  }

  if (symbolName) {
    for (let index = 0; index < lines.length; index += 1) {
      const found = findInLine(index);
      if (found) {
        return found;
      }
    }
  }

  return typeof requestedLine === 'number' ? findInLine(requestedLine) : undefined;
}
