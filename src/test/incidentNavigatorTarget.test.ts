import { describe, expect, it } from 'vitest';

import {
  findIncidentNavigatorSelection,
  resolveIncidentNavigatorTargetPath,
} from '../ui/panels/incidentNavigatorTarget';

describe('incidentNavigatorTarget', () => {
  it('prefers project-relative targets inside the selected project', () => {
    const resolved = resolveIncidentNavigatorTargetPath({
      targetPath: 'src/orders/service.ts',
      workspacePath: '/tmp/workspace',
      projectPath: '/tmp/workspace/orders-api',
    });

    expect(resolved).toBe('/tmp/workspace/orders-api/src/orders/service.ts');
  });

  it('allows absolute targets that stay inside the workspace boundary', () => {
    const resolved = resolveIncidentNavigatorTargetPath({
      targetPath: '/tmp/workspace/orders-api/tests/orders.spec.ts',
      workspacePath: '/tmp/workspace',
      projectPath: '/tmp/workspace/orders-api',
    });

    expect(resolved).toBe('/tmp/workspace/orders-api/tests/orders.spec.ts');
  });

  it('rejects targets that escape the workspace boundary', () => {
    const resolved = resolveIncidentNavigatorTargetPath({
      targetPath: '../../etc/passwd',
      workspacePath: '/tmp/workspace',
      projectPath: '/tmp/workspace/orders-api',
    });

    expect(resolved).toBeUndefined();
  });

  it('finds a symbol selection on the requested line', () => {
    const selection = findIncidentNavigatorSelection(
      ['export class OrdersService {', '  run() {}', '}'].join('\n'),
      {
        symbolName: 'OrdersService',
        startLine: 1,
      }
    );

    expect(selection).toEqual({
      line: 0,
      startCharacter: 13,
      endCharacter: 26,
    });
  });

  it('falls back to the requested line when the symbol text is unavailable', () => {
    const selection = findIncidentNavigatorSelection(
      ['first line', '  second line', 'third line'].join('\n'),
      {
        startLine: 2,
      }
    );

    expect(selection).toEqual({
      line: 1,
      startCharacter: 2,
      endCharacter: 3,
    });
  });
});
