import * as path from 'path';

import type {
  DeterministicImpactScoringResult,
  ProjectSystemGraphSnapshot,
  SystemGraphImpactQueryResult,
} from '../core/systemGraphIndexer';

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function unique(values: string[], maxItems: number): string[] {
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || result.includes(trimmed)) {
      continue;
    }
    result.push(trimmed);
    if (result.length >= maxItems) {
      break;
    }
  }
  return result;
}

export type ArchitectureLensCodeLensSummary = {
  title: string;
  auxiliaryTitle: string;
  seedText: string;
};

export function buildArchitectureCodeLensSummary(input: {
  filePath: string;
  graphSnapshot: ProjectSystemGraphSnapshot;
  impactQuery: SystemGraphImpactQueryResult;
  score: DeterministicImpactScoringResult;
}): ArchitectureLensCodeLensSummary {
  const relativeFilePath = toPosixPath(path.relative(input.graphSnapshot.scanRoot, input.filePath));
  const impactedModules = unique(input.impactQuery.impactedModules, 3);
  const candidateTests = unique(
    input.impactQuery.candidateTests.map((item) => toPosixPath(item)),
    3
  );
  const focusFiles = unique(
    input.impactQuery.impactedNodes.map((node) => toPosixPath(node.filePath)),
    4
  );

  const title = [
    `Workspai: Impact ${input.score.riskLevel.toUpperCase()}`,
    `${impactedModules.length || 0} module${impactedModules.length === 1 ? '' : 's'}`,
    `${candidateTests.length || 0} test${candidateTests.length === 1 ? '' : 's'}`,
  ].join(' • ');

  const scopeLabel =
    impactedModules.length > 0
      ? impactedModules.join(', ')
      : input.score.scopeKnown
        ? 'scope mapped'
        : 'scope needs review';
  const auxiliaryTitle = `Workspai: Scope ${scopeLabel} • ${input.score.confidence}% confidence`;

  const seedLines = [
    'Architecture Lens: analyze the impact before editing this file.',
    `Seed file: ${relativeFilePath}`,
    `Topology: ${input.graphSnapshot.supportedTopology}`,
    `Predicted risk: ${input.score.riskLevel} (${input.score.confidence}% confidence)`,
    `Affected modules: ${impactedModules.length > 0 ? impactedModules.join(', ') : 'unknown'}`,
    `Candidate tests: ${candidateTests.length > 0 ? candidateTests.join(', ') : 'none found yet'}`,
    `Focus files: ${focusFiles.length > 0 ? focusFiles.join(', ') : relativeFilePath}`,
    `Why Workspai thinks so: ${input.score.rationale.length > 0 ? input.score.rationale.join(' | ') : 'system graph evidence only'}`,
  ];

  if (input.score.likelyFailureMode) {
    seedLines.push(`Likely failure mode: ${input.score.likelyFailureMode}`);
  }
  if (input.score.blockedReasons.length > 0) {
    seedLines.push(`Blocked reasons: ${input.score.blockedReasons.join(' | ')}`);
  }

  seedLines.push(
    '',
    'Decision Clarity Contract (required):',
    '1) Situation: what this file appears to control.',
    '2) Why: graph evidence and assumptions separated.',
    '3) Impact scope: affected files/modules/tests.',
    '4) Risk: confidence, likely failure mode, and blocked reasons.',
    '5) Next safe step: smallest non-mutating check first.',
    '6) Verify plan: exact command(s) and execution directory.',
    '7) Rollback plan: how to undo or back out the proposed change.'
  );

  return {
    title,
    auxiliaryTitle,
    seedText: seedLines.join('\n'),
  };
}
