import { describe, expect, it } from 'vitest';

import type { DashboardEvidenceCard } from '../../webview-ui/src/lib/dashboardEvidence';
import {
  buildDashboardRepairCardCopy,
  simplifyRepairFinding,
} from '../../webview-ui/src/lib/dashboardRepairCardCopy';
import { selectRepairVisibleCards } from '../../webview-ui/src/components/DashboardRepairFlow';

function card(overrides: Partial<DashboardEvidenceCard>): DashboardEvidenceCard {
  return {
    id: 'doctor',
    label: 'Workspace Doctor',
    status: 'warn',
    summary: 'Workspace Doctor needs attention.',
    scope: 'workspace',
    ...overrides,
  };
}

describe('dashboard repair card copy', () => {
  it('turns common contract findings into concise user-facing issues', () => {
    expect(
      simplifyRepairFinding(
        'project.checkout.test: Workspace run evidence is missing or unreadable.'
      )
    ).toBe('Run evidence for checkout (test) is missing.');
    expect(
      simplifyRepairFinding('api: Dependencies not installed (node_modules empty or missing)')
    ).toBe('Dependencies are not installed for api.');
    expect(
      simplifyRepairFinding('Stale report: .workspai/reports/workspace-intelligence-history.json')
    ).toBe('workspace-intelligence-history.json is out of date.');
    expect(
      simplifyRepairFinding(
        'project.fullstack-app.init: Workspace run evidence for fullstack-app is stale: generated at 2026-08-22T21:04:30.224Z, before impact 2026-08-22T21:06:10.257Z.'
      )
    ).toBe('Run evidence for fullstack-app (init) is out of date.');
    expect(
      simplifyRepairFinding(
        'workspace.doctor: Doctor evidence is stale: generated at 2026-08-22T21:06:10.387Z, before impact 2026-08-22T21:13:08.092Z.'
      )
    ).toBe('Doctor evidence is out of date.');
    expect(simplifyRepairFinding('doctorRemediationPlan')).toBe(
      'Supporting doctor remediation plan evidence is missing.'
    );
  });

  it('keeps the primary issue short and moves extra findings behind technical details', () => {
    const copy = buildDashboardRepairCardCopy({
      card: card({ status: 'fail', blocking: true }),
      blockers: [
        'api: Dependencies not installed (node_modules empty or missing)',
        'api: Not a Workspai-managed project',
      ],
      actionLabel: 'Fix by Workspai',
      blocking: true,
    });

    expect(copy).toEqual({
      issue: 'Dependencies are not installed for api.',
      guidance: 'Resolve this item before verification.',
      remainingFindingCount: 1,
    });
  });

  it('explains missing and advisory evidence without calling it a blocker', () => {
    expect(
      buildDashboardRepairCardCopy({
        card: card({ id: 'workspaceTrace', label: 'Workspace Trace', status: 'missing' }),
        blockers: [],
        actionLabel: 'Generate trace',
        blocking: false,
      })
    ).toMatchObject({
      issue: 'Workspace Trace evidence has not been generated yet.',
      guidance: 'Run Generate trace to create the missing evidence.',
    });

    expect(
      buildDashboardRepairCardCopy({
        card: card({ status: 'warn', blocking: false }),
        blockers: ['Review the dependency trend'],
        blocking: false,
      }).guidance
    ).toBe('Review this item when convenient.');
  });

  it('keeps every blocked card visible in the compact priority view', () => {
    const blocked = ['doctor', 'pipeline', 'readiness', 'workspaceVerify'].map((id, index) =>
      card({
        id: id as DashboardEvidenceCard['id'],
        label: `Blocked ${index + 1}`,
        status: 'fail',
        blocking: true,
      })
    );
    const activeMissing = card({
      id: 'bootstrap',
      label: 'Bootstrap',
      status: 'missing',
      blocking: false,
    });
    const warnings = Array.from({ length: 5 }, (_, index) =>
      card({
        id: 'analyze',
        label: `Warning ${index + 1}`,
        status: 'warn',
        blocking: false,
      })
    );

    const visible = selectRepairVisibleCards(
      [...blocked, activeMissing, ...warnings],
      activeMissing,
      'guided',
      2
    );

    expect(visible.filter((entry) => entry.blocking)).toHaveLength(4);
    expect(visible).toContain(activeMissing);
  });

  it('keeps derived explanation cards out of the causal repair queue', () => {
    const verify = card({
      id: 'workspaceVerify',
      label: 'Workspace Verify',
      status: 'fail',
      blocking: true,
    });
    const explain = card({
      id: 'workspaceExplain',
      label: 'Workspace Explain',
      status: 'fail',
      blocking: true,
    });
    const why = card({
      id: 'workspaceWhy',
      label: 'Workspace Why',
      status: 'fail',
      blocking: true,
    });

    expect(selectRepairVisibleCards([verify, explain, why], verify, 'guided', 2)).toEqual([verify]);
  });
});
