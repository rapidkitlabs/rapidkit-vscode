import type { RepositoryAnalysisReport } from '../../../src/contracts/repositoryAnalysis';

export function analysisGateLabel(readiness: RepositoryAnalysisReport['readiness']): string {
  if (readiness.stagesFailed > 0) {
    return 'STATIC ANALYSIS · INCOMPLETE EVIDENCE';
  }
  if (readiness.status === 'blocked' || readiness.stagesBlocked > 0) {
    return 'STATIC ANALYSIS · INTELLIGENCE GATE BLOCKED';
  }
  if (readiness.status === 'passed') {
    return 'STATIC ANALYSIS · INTELLIGENCE GATE PASSED';
  }
  return 'STATIC ANALYSIS · GATE NOT VERIFIED';
}
