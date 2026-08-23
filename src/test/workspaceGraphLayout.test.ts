import { describe, expect, it } from 'vitest';
import {
  layoutWorkspaceGraph,
  WORKSPAI_LOGO_DOT,
  WORKSPAI_LOGO_VIEWBOX,
  WORKSPACE_GRAPH_3D_SHAPES,
  workspaceGraphWorkspaiLogoScale,
} from '../../webview-ui/src/lib/workspaceGraphLayout.js';

describe('workspace graph worker layout', () => {
  it('is deterministic, finite, and preserves request identity', () => {
    const request = {
      requestId: 7,
      nodes: [
        { id: 'workspace:demo', kind: 'workspace' },
        { id: 'project:api', kind: 'project', projectId: 'api' },
        { id: 'service:api', kind: 'service', projectId: 'api' },
      ],
      edges: [
        { from: 'workspace:demo', to: 'project:api' },
        { from: 'project:api', to: 'service:api' },
      ],
    };
    const first = layoutWorkspaceGraph(request);
    const second = layoutWorkspaceGraph(request);
    expect(first).toEqual(second);
    expect(first.requestId).toBe(7);
    expect(first.points).toHaveLength(3);
    expect(
      first.points.every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
      )
    ).toBe(true);
  });

  it('enforces the bounded 500-node rendering contract', () => {
    const result = layoutWorkspaceGraph({
      requestId: 1,
      nodes: Array.from({ length: 520 }, (_, index) => ({
        id: `file:${index}`,
        kind: 'file',
      })),
      edges: [],
    });
    expect(result.points).toHaveLength(500);
  });

  it('places every architecture level on one deterministic 3D radius', () => {
    const result = layoutWorkspaceGraph({
      requestId: 9,
      mode: 'radial-3d',
      nodes: [
        { id: 'workspace:demo', kind: 'workspace' },
        { id: 'project:a', kind: 'project', projectId: 'a' },
        { id: 'project:b', kind: 'project', projectId: 'b' },
        { id: 'service:a', kind: 'service', projectId: 'a' },
        { id: 'service:b', kind: 'service', projectId: 'b' },
      ],
      edges: [],
    });
    const radius = (id: string) => {
      const point = result.points.find((value) => value.id === id)!;
      return Math.hypot(point.x - result.width / 2, point.z);
    };
    expect(radius('project:a')).toBeCloseTo(radius('project:b'), 8);
    expect(radius('service:a')).toBeCloseTo(radius('service:b'), 8);
    expect(radius('service:a')).toBeGreaterThan(radius('project:a'));
  });

  it('provides deterministic finite semantic points for every selectable 3D shape', () => {
    const nodes = [
      { id: 'workspace:demo', kind: 'workspace' },
      { id: 'project:api', kind: 'project', projectId: 'api' },
      { id: 'service:api', kind: 'service', projectId: 'api' },
      { id: 'database:api', kind: 'database', projectId: 'api' },
      { id: 'project:web', kind: 'project', projectId: 'web' },
      { id: 'service:web', kind: 'service', projectId: 'web' },
      { id: 'endpoint:web', kind: 'endpoint', projectId: 'web' },
    ];
    const signatures = new Set<string>();
    for (const shape of WORKSPACE_GRAPH_3D_SHAPES) {
      const request = { requestId: 12, mode: 'radial-3d' as const, shape, nodes, edges: [] };
      const first = layoutWorkspaceGraph(request);
      const second = layoutWorkspaceGraph(request);
      expect(first).toEqual(second);
      expect(first.points).toHaveLength(nodes.length);
      expect(
        first.points.every((point) =>
          [point.x, point.y, point.z].every((coordinate) => Number.isFinite(coordinate))
        )
      ).toBe(true);
      signatures.add(
        first.points
          .map((point) => `${point.x.toFixed(2)}:${point.y.toFixed(2)}:${point.z.toFixed(2)}`)
          .join('|')
      );
    }
    expect(signatures.size).toBe(WORKSPACE_GRAPH_3D_SHAPES.length);
  });

  it('gives the Brain projection two hemispheres, a lower rear cerebellum, and a stem', () => {
    const width = 1200;
    const height = 800;
    const result = layoutWorkspaceGraph({
      requestId: 13,
      mode: 'radial-3d',
      shape: 'brain',
      width,
      height,
      nodes: [
        { id: 'workspace:brain', kind: 'workspace' },
        ...Array.from({ length: 220 }, (_, index) => ({
          id: `symbol:${index}`,
          kind: index % 9 === 0 ? 'pipeline' : index % 7 === 0 ? 'test-suite' : 'symbol',
          projectId: index % 2 === 0 ? 'left' : 'right',
        })),
      ],
      edges: [],
    });

    expect(result.points.some((point) => point.z > 80)).toBe(true);
    expect(result.points.some((point) => point.z < -80)).toBe(true);
    expect(result.points.some((point) => point.x > width * 0.65 && point.y > height * 0.54)).toBe(
      true
    );
    expect(result.points.some((point) => point.y > height * 0.78)).toBe(true);
  });

  it('builds separated deterministic asterisms instead of a planar constellation ring', () => {
    const projects = ['api', 'web', 'worker'];
    const result = layoutWorkspaceGraph({
      requestId: 14,
      mode: 'radial-3d',
      shape: 'constellation',
      nodes: [
        { id: 'workspace:demo', kind: 'workspace' },
        ...projects.flatMap((projectId) =>
          Array.from({ length: 24 }, (_, index) => ({
            id: `${projectId}:${index}`,
            kind: index === 0 ? 'project' : 'symbol',
            projectId,
          }))
        ),
      ],
      edges: [],
    });
    const centroid = (projectId: string) => {
      const values = result.points.filter((point) => point.id.startsWith(`${projectId}:`));
      return {
        x: values.reduce((sum, point) => sum + point.x, 0) / values.length,
        y: values.reduce((sum, point) => sum + point.y, 0) / values.length,
        z: values.reduce((sum, point) => sum + point.z, 0) / values.length,
      };
    };
    const centers = projects.map(centroid);
    for (let left = 0; left < centers.length; left += 1) {
      for (let right = left + 1; right < centers.length; right += 1) {
        expect(
          Math.hypot(
            centers[left].x - centers[right].x,
            centers[left].y - centers[right].y,
            centers[left].z - centers[right].z
          )
        ).toBeGreaterThan(120);
      }
    }
    expect(new Set(centers.map((center) => center.z.toFixed(2))).size).toBeGreaterThan(1);
  });

  it('projects dense graphs into the official Workspai mark and detached signal square', () => {
    const width = 1200;
    const height = 800;
    const result = layoutWorkspaceGraph({
      requestId: 15,
      mode: 'radial-3d',
      shape: 'workspai',
      width,
      height,
      nodes: Array.from({ length: 320 }, (_, index) => ({
        id: `entity:${index}`,
        kind: index === 0 ? 'workspace' : index % 40 === 0 ? 'project' : 'symbol',
        projectId: `project-${index % 4}`,
      })),
      edges: [],
    });
    const scale = workspaceGraphWorkspaiLogoScale(width, height);
    const dotLeft = width / 2 + (WORKSPAI_LOGO_DOT.left - WORKSPAI_LOGO_VIEWBOX.width / 2) * scale;
    const dotBottom =
      height / 2 + (WORKSPAI_LOGO_DOT.bottom - WORKSPAI_LOGO_VIEWBOX.height / 2) * scale;
    const dotPoints = result.points.filter(
      (point) => point.x >= dotLeft - 0.01 && point.y <= dotBottom + 0.01
    );

    expect(dotPoints.length).toBeGreaterThanOrEqual(20);
    expect(result.points.some((point) => point.y > height * 0.68)).toBe(true);
    expect(result.points.every((point) => Math.abs(point.z) < 50)).toBe(true);
  });
});
