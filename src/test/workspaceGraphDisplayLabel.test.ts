import { describe, expect, it } from 'vitest';
import type { WorkspaceGraphEntityProjection } from '../contracts/workspaceGraphProjection.js';
import { workspaceGraphDisplayLabel } from '../../webview-ui/src/lib/workspaceGraphDisplayLabel.js';

function entity(kind: string, label: string, path?: string): WorkspaceGraphEntityProjection {
  return { id: `${kind}:fixture`, kind, label, path, proofIds: [], attributes: {} };
}

describe('Workspace Graph display labels', () => {
  it('removes redundant project and kind prose from language labels', () => {
    const canonical = entity('language', 'product programming language: typescript');

    expect(workspaceGraphDisplayLabel(canonical)).toBe('TypeScript');
    expect(canonical.label).toBe('product programming language: typescript');
    expect(workspaceGraphDisplayLabel(entity('language', 'grpc programming language: shell'))).toBe(
      'Shell'
    );
  });

  it('preserves conventional language casing', () => {
    expect(workspaceGraphDisplayLabel(entity('language', 'service language: javascript'))).toBe(
      'JavaScript'
    );
    expect(workspaceGraphDisplayLabel(entity('language', 'service language: csharp'))).toBe('C#');
    expect(workspaceGraphDisplayLabel(entity('language', 'service language: cpp'))).toBe('C++');
  });

  it('uses the final two path segments instead of an unreadable file prefix', () => {
    expect(
      workspaceGraphDisplayLabel(
        entity('file', 'python:external/grpc/src/python/generated/client.py', '/grpc/src/client.py')
      )
    ).toBe('src/client.py');
  });

  it('uses middle ellipsis so generic labels retain their distinguishing suffix', () => {
    const label = workspaceGraphDisplayLabel(
      entity('symbol', 'customer-account-repository-refresh-handler'),
      24
    );
    expect(label).toHaveLength(24);
    expect(label).toContain('…');
    expect(label.endsWith('handler')).toBe(true);
  });
});
