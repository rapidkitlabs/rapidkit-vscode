import { describe, expect, it } from 'vitest';

import { buildIncidentResumeSnapshot } from '../ui/panels/incidentStudioResume';

describe('incidentStudioResume', () => {
  it('returns null when workspace path or turns are missing', () => {
    expect(
      buildIncidentResumeSnapshot({
        workspacePath: '',
        lastActivityAt: 10,
        phase: 'diagnose',
        history: [{ role: 'user', content: 'hello' }],
        queryCount: 1,
        actionCount: 0,
      })
    ).toBeNull();

    expect(
      buildIncidentResumeSnapshot({
        workspacePath: '/tmp/demo',
        lastActivityAt: 10,
        phase: 'diagnose',
        history: [],
        queryCount: 0,
        actionCount: 0,
      })
    ).toBeNull();
  });

  it('builds recap from latest assistant turn and maps verify phase to deterministic verification action', () => {
    const snapshot = buildIncidentResumeSnapshot({
      workspacePath: '/tmp/demo',
      lastActivityAt: 100,
      phase: 'verify',
      history: [
        { role: 'user', content: 'service is failing' },
        {
          role: 'assistant',
          content:
            'Root cause is a stale migration checksum. Run the verify command after applying the fix. Extra details here.',
        },
      ],
      queryCount: 2,
      actionCount: 1,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.recap).toContain('Root cause is a stale migration checksum.');
    expect(snapshot?.nextActionLabel).toBe('Run deterministic verification');
    expect(snapshot?.resolved).toBe(false);
  });

  it('uses learn/memory next action after verify passed', () => {
    const snapshot = buildIncidentResumeSnapshot({
      workspacePath: '/tmp/demo',
      lastActivityAt: 100,
      phase: 'learn',
      history: [
        { role: 'user', content: 'done' },
        { role: 'assistant', content: 'Verification passed. Capture this as a reusable pattern.' },
      ],
      queryCount: 3,
      actionCount: 2,
      verifyPassedAt: 99,
    });

    expect(snapshot?.resolved).toBe(true);
    expect(snapshot?.nextActionLabel).toBe('Capture reusable outcome artifact');
    expect(snapshot?.nextActionQuery).toContain('capture it as reusable workspace memory');
    expect(snapshot?.nextActionQuery).toContain('replay/share or release-readiness evidence');
  });

  it('sanitizes corrupted counters/timestamps and ignores blank turns', () => {
    const snapshot = buildIncidentResumeSnapshot({
      workspacePath: '/tmp/demo',
      lastActivityAt: Number.NaN,
      phase: 'plan',
      history: [
        { role: 'user', content: '   ' },
        { role: 'assistant', content: '   Apply migration fix.   ' },
      ],
      queryCount: Number.NaN,
      actionCount: -5,
      verifyPassedAt: Number.NaN,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.turnCount).toBe(1);
    expect(snapshot?.queryCount).toBe(0);
    expect(snapshot?.actionCount).toBe(0);
    expect(snapshot?.lastActivityAt).toBe(0);
    expect(snapshot?.resolved).toBe(false);
    expect(snapshot?.recap).toContain('Apply migration fix.');
  });
});
