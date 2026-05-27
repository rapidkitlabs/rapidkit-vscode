import * as vscode from 'vscode';

import type {
  DeterministicImpactScoringResult,
  SystemGraphImpactQueryResult,
} from '../core/systemGraphIndexer';

function uniqueLines(values: number[], maxItems: number): number[] {
  const result: number[] = [];
  for (const value of values) {
    if (value < 0 || result.includes(value)) {
      continue;
    }
    result.push(value);
    if (result.length >= maxItems) {
      break;
    }
  }
  return result;
}

export type ArchitectureLensInlineRenderModel = {
  label: string;
  detail: string;
  anchorLines: number[];
};

export function buildArchitectureInlineRenderModel(input: {
  score: DeterministicImpactScoringResult;
  impactQuery: SystemGraphImpactQueryResult;
  diagnostics: readonly vscode.Diagnostic[];
  fallbackLine: number;
}): ArchitectureLensInlineRenderModel {
  const diagnosticAnchorLines = input.diagnostics
    .filter(
      (diagnostic) =>
        diagnostic.severity === vscode.DiagnosticSeverity.Error ||
        diagnostic.severity === vscode.DiagnosticSeverity.Warning
    )
    .map((diagnostic) => diagnostic.range.start.line);

  const anchorLines = uniqueLines(
    diagnosticAnchorLines.length > 0 ? diagnosticAnchorLines : [input.fallbackLine],
    3
  );

  const impactedModules = input.impactQuery.impactedModules.length;
  const candidateTests = input.impactQuery.candidateTests.length;
  const blockedSummary = input.score.blockedReasons[0];
  const detailParts = [
    `Risk ${input.score.riskLevel.toUpperCase()}`,
    `${input.score.confidence}% confidence`,
    `${impactedModules} module${impactedModules === 1 ? '' : 's'}`,
    `${candidateTests} test${candidateTests === 1 ? '' : 's'}`,
  ];

  return {
    label: `Workspai Lens: ${input.score.riskLevel.toUpperCase()} risk • ${impactedModules} module${impactedModules === 1 ? '' : 's'} • ${candidateTests} test${candidateTests === 1 ? '' : 's'}`,
    detail: blockedSummary
      ? `${detailParts.join(' • ')} • ${blockedSummary}`
      : detailParts.join(' • '),
    anchorLines,
  };
}
