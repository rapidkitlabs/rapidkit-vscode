import { describe, expect, it } from 'vitest';

import type { WorkspaceGraphProjection } from '../contracts/workspaceGraphProjection.js';
import { workspaceGraphProjectScopeIds } from '../../webview-ui/src/lib/workspaceGraphScope';

describe('workspace graph project visual scope', () => {
  it('retains directly connected shared entities but excludes another project', () => {
    const graph = {
      entities: [
        { id: 'project:api', kind: 'project', label: 'api', projectId: 'api' },
        { id: 'api:endpoint', kind: 'endpoint', label: 'GET /users', projectId: 'api' },
        { id: 'contract:users', kind: 'schema', label: 'Users' },
        { id: 'project:web', kind: 'project', label: 'web', projectId: 'web' },
      ].map((entity) => ({ ...entity, proofIds: [], attributes: {} })),
      relations: [
        { id: 'r1', from: 'api:endpoint', to: 'contract:users', kind: 'implements', proofIds: [] },
        { id: 'r2', from: 'contract:users', to: 'project:web', kind: 'consumed-by', proofIds: [] },
      ],
    } as unknown as WorkspaceGraphProjection;
    expect([...workspaceGraphProjectScopeIds(graph, 'api')].sort()).toEqual([
      'api:endpoint',
      'contract:users',
      'project:api',
    ]);
  });
});
