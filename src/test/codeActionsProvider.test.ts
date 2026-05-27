import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  CodeActionKind: {
    QuickFix: 'quickfix',
    Refactor: 'refactor',
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
  workspace: {
    asRelativePath: (value: string) => value.replace('/repo/', ''),
  },
  CodeAction: class {
    title: string;
    kind: string;
    command?: unknown;
    isPreferred?: boolean;
    edit?: unknown;

    constructor(title: string, kind: string) {
      this.title = title;
      this.kind = kind;
    }
  },
  WorkspaceEdit: class {
    replace(): void {}
    insert(): void {}
  },
  Range: class {
    constructor(
      readonly start: unknown,
      readonly startCharacter: unknown,
      readonly end?: unknown,
      readonly endCharacter?: unknown
    ) {}
  },
  Position: class {
    constructor(
      readonly line: number,
      readonly character: number
    ) {}
  },
}));

import { buildAIDiagnosticSeed } from '../providers/codeActionsProvider';

describe('Workspai code action AI context', () => {
  it('builds evidence-rich debug/fix/explain seed text for editor diagnostics', () => {
    const seed = buildAIDiagnosticSeed({
      intent: 'fix-preview',
      fileName: 'src/core/verifyPackContract.ts',
      languageId: 'typescript',
      diagnostics: [
        {
          severity: 'ERROR',
          line: 38,
          column: 29,
          fileLineLabel: 'src/core/verifyPackContract.ts:38:29',
          message: "Cannot find name 'VerifyPackOutputContrac'.",
        },
      ],
      snippet: 'export function buildVerifyPackOutputContract(): VerifyPackOutputContrac t {}',
    });

    expect(seed).toContain('Preview fix with Workspai AI');
    expect(seed).toContain('File: src/core/verifyPackContract.ts');
    expect(seed).toContain('Language: typescript');
    expect(seed).toContain('[ERROR] src/core/verifyPackContract.ts:38:29');
    expect(seed).toContain('Selected/current code evidence:');
    expect(seed).toContain('Exact verify command and execution directory.');
    expect(seed).toContain('Rollback or undo note');
  });
});
