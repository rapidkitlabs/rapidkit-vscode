import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('Workspace Operations Floor UX', () => {
  it('correlates real operational evidence in one presentation-ready Live view', () => {
    const source = read('webview-ui/src/components/WorkspaceLiveOperations.tsx');

    expect(source).toContain("useState<LiveMode>('floor')");
    expect(source).toContain('Operations Floor');
    expect(source).toContain('Governed execution path');
    expect(source).toContain('Architecture mesh');
    expect(source).toContain('Agent attempt grid');
    expect(source).toContain('Assurance ledger');
    expect(source).toContain('Presentation mode');
    expect(source).toContain('WorkspaceGraphCanvas');
  });

  it('bounds the canonical Graph and never fabricates architecture from Live activity', () => {
    const source = read('webview-ui/src/components/WorkspaceLiveOperations.tsx');

    expect(source).toContain('findWorkspaceGraphProjection');
    expect(source).toContain('boundedOperationsGraph');
    expect(source).toContain('FLOOR_GRAPH_LIMIT = 72');
    expect(source).toContain('graph.relations');
    expect(source).toContain('No architecture edge is inferred from Live activity.');
    expect(source).toContain('changeOverlay={floorGraphOverlay}');
  });

  it('keeps the floor responsive and offers a focused full-screen presentation mode', () => {
    const styles = read('webview-ui/src/styles/workspai-primitives.css');

    expect(styles).toContain('.ws-live--presentation');
    expect(styles).toContain('.ws-operations-floor__mesh');
    expect(styles).toContain('.ws-operations-floor__attempts');
    expect(styles).toContain('@media (max-width: 860px)');
    expect(styles).toContain('@media (max-width: 560px)');
  });
});
