import { describe, expect, it } from 'vitest';
import { analysisGateLabel } from '../../webview-ui/src/lib/repositoryAnalysisPresentation';

describe('Analysis evidence and gate presentation', () => {
  const base = {
    status: 'passed',
    stagesPassed: 11,
    stagesBlocked: 0,
    stagesFailed: 0,
    blockers: [],
  };
  it('does not present a release gate block as an agent entry failure', () => {
    expect(analysisGateLabel({ ...base, status: 'blocked', stagesBlocked: 2 })).toBe(
      'STATIC ANALYSIS · INTELLIGENCE GATE BLOCKED'
    );
  });
  it('prioritizes failed evidence over a passed summary', () => {
    expect(analysisGateLabel({ ...base, stagesFailed: 1 })).toBe(
      'STATIC ANALYSIS · INCOMPLETE EVIDENCE'
    );
  });
  it('does not claim verification when the status is unknown', () => {
    expect(analysisGateLabel({ ...base, status: 'unknown' })).toBe(
      'STATIC ANALYSIS · GATE NOT VERIFIED'
    );
  });
  it('labels successful static gates without claiming runtime safety', () => {
    expect(analysisGateLabel(base)).toBe('STATIC ANALYSIS · INTELLIGENCE GATE PASSED');
  });
});
