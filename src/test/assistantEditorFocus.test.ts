import { describe, expect, it } from 'vitest';

import { buildAssistantEditorFocus } from '../core/assistantEditorFocus.js';

describe('Assistant editor focus', () => {
  it('provides bounded project-relative selection and diagnostics as navigation context', () => {
    const focus = buildAssistantEditorFocus({
      workspacePath: '/workspace',
      projectPath: '/workspace/api',
      filePath: '/workspace/api/src/server.ts',
      languageId: 'typescript',
      selection: { text: 'return startServer();', startLine: 10, endLine: 10 },
      diagnostics: [
        { severity: 'error', message: 'Cannot find name startServer', line: 10, column: 8 },
      ],
    });

    expect(focus).toContain('File: src/server.ts (typescript)');
    expect(focus).toContain('return startServer();');
    expect(focus).toContain('Cannot find name startServer');
    expect(focus).toContain('never mutation authority');
    expect(focus).not.toContain('/workspace/api');
  });

  it('rejects editor focus outside scope and generated evidence paths', () => {
    expect(
      buildAssistantEditorFocus({
        workspacePath: '/workspace',
        projectPath: '/workspace/api',
        filePath: '/workspace/web/src/app.ts',
      })
    ).toBe('');
    expect(
      buildAssistantEditorFocus({
        workspacePath: '/workspace',
        filePath: '/workspace/.workspai/reports/doctor.json',
      })
    ).toBe('');
  });
});
