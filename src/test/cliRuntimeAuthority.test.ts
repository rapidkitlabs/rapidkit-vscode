import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(__dirname, '..');

function sourceFiles(directory = sourceRoot): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : sourceFiles(target);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [target] : [];
  });
}

function relative(filePath: string): string {
  return path.relative(sourceRoot, filePath).split(path.sep).join('/');
}

describe('Workspai CLI runtime authority', () => {
  it('routes every direct npx subprocess through the canonical execution wrapper', () => {
    const offenders = sourceFiles()
      .filter((filePath) => fs.readFileSync(filePath, 'utf8').includes("run('npx'"))
      .filter((filePath) => {
        const source = fs.readFileSync(filePath, 'utf8');
        return (
          !source.includes('buildNpxRapidkitArgs') &&
          !source.includes('buildPortableNpxRapidkitArgs')
        );
      })
      .map(relative);

    expect(offenders).toEqual([]);
  });

  it('limits bare Workspai executable probes to the explicit development fallback', () => {
    const directExecutableCallers = sourceFiles()
      .filter((filePath) => fs.readFileSync(filePath, 'utf8').includes("run('workspai'"))
      .map(relative)
      .sort();

    expect(directExecutableCallers).toEqual(['commands/doctor.ts', 'core/cliVersionGate.ts']);
  });

  it('limits raw Workspai terminal execution to the shared gate and project lifecycle gate', () => {
    const rawTerminalCallers = sourceFiles()
      .filter((filePath) => {
        const source = fs.readFileSync(filePath, 'utf8');
        return /import\s*\{[^}]*\brunRapidkitCommandsInTerminal\b[^}]*\}\s*from\s*['"][^'"]*utils\/terminalExecutor['"]/.test(
          source
        );
      })
      .map(relative)
      .sort();

    expect(rawTerminalCallers).toEqual([
      'commands/projectLifecycle.ts',
      'core/gatedRapidkitTerminal.ts',
    ]);

    const lifecycleSource = fs.readFileSync(
      path.join(sourceRoot, 'commands', 'projectLifecycle.ts'),
      'utf8'
    );
    expect(lifecycleSource).toContain('gateProjectLifecycleCommand');
  });

  it('does not expose legacy linked-CLI recovery language in product source', () => {
    const legacyPhrases = [
      'linked Workspai CLI',
      'link or install the latest Workspai package',
      'update or link Workspai',
    ];
    const offenders = sourceFiles()
      .filter((filePath) => {
        const source = fs.readFileSync(filePath, 'utf8');
        return legacyPhrases.some((phrase) => source.includes(phrase));
      })
      .map(relative);

    expect(offenders).toEqual([]);
  });
});
