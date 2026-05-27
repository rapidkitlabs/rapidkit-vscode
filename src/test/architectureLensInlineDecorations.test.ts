import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
}));

import * as vscode from 'vscode';

import { buildArchitectureInlineRenderModel } from '../providers/architectureLensInlineDecorations';

describe('architectureLensInlineDecorations', () => {
  it('anchors inline lens labels to diagnostic lines when diagnostics exist', () => {
    const model = buildArchitectureInlineRenderModel({
      score: {
        confidence: 77,
        riskLevel: 'high',
        scopeKnown: true,
        rationale: [],
        blockedReasons: ['Review impact before mutation.'],
      },
      impactQuery: {
        impactedNodes: [],
        impactedEdges: [],
        candidateTests: ['tests/orders.spec.ts'],
        impactedModules: ['orders', 'billing'],
        confidence: 82,
        unknownScope: false,
      },
      diagnostics: [
        {
          severity: vscode.DiagnosticSeverity.Error,
          range: { start: { line: 12 } },
        } as never,
        {
          severity: vscode.DiagnosticSeverity.Warning,
          range: { start: { line: 18 } },
        } as never,
      ],
      fallbackLine: 4,
    });

    expect(model.label).toBe('Workspai Lens: HIGH risk • 2 modules • 1 test');
    expect(model.detail).toContain('77% confidence');
    expect(model.detail).toContain('Review impact before mutation.');
    expect(model.anchorLines).toEqual([12, 18]);
  });

  it('falls back to the first meaningful line when no diagnostics exist', () => {
    const model = buildArchitectureInlineRenderModel({
      score: {
        confidence: 45,
        riskLevel: 'medium',
        scopeKnown: false,
        rationale: [],
        blockedReasons: [],
      },
      impactQuery: {
        impactedNodes: [],
        impactedEdges: [],
        candidateTests: [],
        impactedModules: [],
        confidence: 40,
        unknownScope: false,
      },
      diagnostics: [],
      fallbackLine: 3,
    });

    expect(model.label).toBe('Workspai Lens: MEDIUM risk • 0 modules • 0 tests');
    expect(model.anchorLines).toEqual([3]);
  });
});
