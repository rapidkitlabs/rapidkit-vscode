import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceGraphProjection } from '../contracts/workspaceGraphProjection.js';
import { layoutWorkspaceGraph } from '../../webview-ui/src/lib/workspaceGraphLayout.js';
import {
  createWorkspaceGraphWordmarkSamples,
  normalizeWorkspaceGraphWordmarkLabel,
  resolveWorkspaceGraphWordmarkLabel,
  type WorkspaceGraphWordmarkSurface,
} from '../../webview-ui/src/lib/workspaceGraphWordmark.js';

function graph(
  entities: WorkspaceGraphProjection['entities'],
  workspaceName = 'central-workspace'
): WorkspaceGraphProjection {
  return {
    schemaVersion: 'workspace-graph-projection.v1',
    sourceSchemaVersion: 'workspace-knowledge-graph.v1',
    revision: 'revision-1',
    truncated: false,
    total: { entities: entities.length, relations: 0, proofs: 0 },
    entities,
    relations: [],
    proofs: [],
    workspace: { name: workspaceName },
    source: { scopes: [] },
    providers: [],
    quality: {},
    diagnostics: [],
  };
}

describe('Workspace Graph project wordmark', () => {
  it('uses canonical project labels and only falls back to the workspace for aggregate views', () => {
    const projection = graph([
      {
        id: 'workspace:central',
        kind: 'workspace',
        label: 'Central',
        proofIds: [],
        attributes: {},
      },
      {
        id: 'project:grpc',
        kind: 'project',
        label: 'gRPC',
        projectId: 'grpc',
        proofIds: [],
        attributes: {},
      },
      {
        id: 'project:vscode',
        kind: 'project',
        label: 'Visual Studio Code',
        projectId: 'vscode',
        proofIds: [],
        attributes: {},
      },
    ]);

    expect(resolveWorkspaceGraphWordmarkLabel(projection, 'grpc')).toBe('gRPC');
    expect(resolveWorkspaceGraphWordmarkLabel(projection, 'vscode')).toBe('Visual Studio Code');
    expect(resolveWorkspaceGraphWordmarkLabel(projection, 'all')).toBe('central-workspace');
  });

  it('automatically uses the real project name in a single-project graph', () => {
    const projection = graph([
      {
        id: 'project:private-id',
        kind: 'project',
        label: 'Customer Portal',
        projectId: 'private-id',
        proofIds: [],
        attributes: {},
      },
    ]);
    expect(resolveWorkspaceGraphWordmarkLabel(projection, 'all')).toBe('Customer Portal');
  });

  it('normalizes arbitrary Unicode names and bounds presentation text', () => {
    const unicodeProjectName = '\u067e\u0631\u0648\u0698\u0647';
    const unicodeMy = '\u0645\u0646';
    expect(normalizeWorkspaceGraphWordmarkLabel(`  ${unicodeProjectName}   ${unicodeMy}  `)).toBe(
      `${unicodeProjectName} ${unicodeMy}`
    );
    expect(normalizeWorkspaceGraphWordmarkLabel('x'.repeat(80))).toHaveLength(32);
    expect(normalizeWorkspaceGraphWordmarkLabel('x'.repeat(80)).endsWith('…')).toBe(true);
  });

  it('samples an actual text mask without adding synthetic graph records', () => {
    const width = 320;
    const height = 240;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 60; y < 180; y += 1) {
      for (let x = 40; x < 280; x += 1) {
        pixels[(y * width + x) * 4 + 3] = 255;
      }
    }
    const context = {
      clearRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 160 })),
      getImageData: vi.fn(() => ({ data: pixels })),
      font: '',
      fillStyle: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
    } as unknown as CanvasRenderingContext2D;
    const surface = {
      width,
      height,
      getContext: vi.fn(() => context),
    } as unknown as WorkspaceGraphWordmarkSurface;

    const samples = createWorkspaceGraphWordmarkSamples('grpc', 120, {
      width,
      height,
      surfaceFactory: () => surface,
    });

    expect(samples).toHaveLength(120);
    expect(samples.every(({ x, y }) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true);
    expect(context.fillText).toHaveBeenCalledWith('grpc', width / 2, height / 2, width * 0.88);
  });

  it('maps only real entities onto supplied glyph samples deterministically', () => {
    const nodes = [
      { id: 'service:z', kind: 'service', projectId: 'grpc' },
      { id: 'project:grpc', kind: 'project', projectId: 'grpc' },
      { id: 'endpoint:a', kind: 'endpoint', projectId: 'grpc' },
    ];
    const request = {
      requestId: 91,
      mode: 'radial-3d' as const,
      shape: 'project-name' as const,
      shapeLabel: 'gRPC',
      shapeSamples: [
        { x: 0.2, y: 0.3 },
        { x: 0.5, y: 0.4 },
        { x: 0.8, y: 0.6 },
      ],
      nodes,
      edges: [
        { from: 'project:grpc', to: 'service:z' },
        { from: 'service:z', to: 'endpoint:a' },
      ],
      width: 1000,
      height: 600,
    };

    const first = layoutWorkspaceGraph(request);
    expect(layoutWorkspaceGraph(request)).toEqual(first);
    expect(first.points).toHaveLength(nodes.length);
    expect(new Set(first.points.map((point) => point.id))).toEqual(
      new Set(nodes.map((node) => node.id))
    );
    expect(first.points.map(({ x, y }) => [x, y])).toEqual([
      [200, 180],
      [500, 240],
      [800, 360],
    ]);
    expect(request.nodes).toEqual(nodes);
    expect(request.edges).toHaveLength(2);
  });
});
