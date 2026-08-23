import { describe, expect, it } from 'vitest';

import {
  fitWorkspaceGraphCameraToViewport,
  orbitWorkspaceGraphCamera,
  projectWorkspaceGraphPoint3d,
  WORKSPACE_GRAPH_AUTO_ORBIT_RADIANS_PER_MS,
  workspaceGraphGifCameraAt,
} from '../../webview-ui/src/lib/workspaceGraph3d.js';

describe('Workspace Graph WebGL projection', () => {
  it('uses a visible but restrained dashboard auto-orbit speed', () => {
    expect(WORKSPACE_GRAPH_AUTO_ORBIT_RADIANS_PER_MS).toBeGreaterThan(0.000045);
    expect(WORKSPACE_GRAPH_AUTO_ORBIT_RADIANS_PER_MS).toBeLessThan(0.0001);
  });

  it('builds a continuous multi-axis GIF path across upper and lower viewpoints', () => {
    const base = { yaw: 0.2, pitch: 0.4, roll: 0.1, zoom: 0.9 };
    const cameras = Array.from({ length: 60 }, (_, index) =>
      workspaceGraphGifCameraAt(base, index, 60)
    );

    expect(Math.max(...cameras.map((camera) => camera.pitch))).toBeGreaterThan(0.8);
    expect(Math.min(...cameras.map((camera) => camera.pitch))).toBeLessThan(-0.8);
    expect(Math.max(...cameras.map((camera) => camera.roll ?? 0))).toBeGreaterThan(0.47);
    expect(Math.min(...cameras.map((camera) => camera.roll ?? 0))).toBeLessThan(-0.27);
    expect(cameras.at(-1)!.yaw - cameras[0].yaw).toBeGreaterThan(Math.PI * 3.8);
    expect(new Set(cameras.map((camera) => camera.zoom))).toEqual(new Set([0.9]));
  });

  it('maps primary-pointer drag to a true yaw and pitch orbit', () => {
    const camera = orbitWorkspaceGraphCamera({ yaw: 0, pitch: 0, zoom: 1 }, 100, -50);

    expect(camera.yaw).toBeCloseTo(0.9);
    expect(camera.pitch).toBeCloseTo(-0.4);
    expect(camera.roll).toBe(0);
    expect(camera.zoom).toBe(1);
    expect(orbitWorkspaceGraphCamera({ yaw: 0, pitch: 1.4, zoom: 1 }, 0, 100).pitch).toBe(1.45);
  });

  it('rotates the graph plane around the viewing axis', () => {
    const point = { id: 'service:api', x: 760, y: 400, z: 0 };
    const base = projectWorkspaceGraphPoint3d(
      point,
      { width: 1200, height: 800 },
      { width: 900, height: 600 },
      { yaw: 0, pitch: 0, roll: 0, zoom: 1 }
    );
    const rolled = projectWorkspaceGraphPoint3d(
      point,
      { width: 1200, height: 800 },
      { width: 900, height: 600 },
      { yaw: 0, pitch: 0, roll: Math.PI / 2, zoom: 1 }
    );

    expect(base.screen[0]).toBeGreaterThan(450);
    expect(rolled.screen[0]).toBeCloseTo(450);
    expect(rolled.screen[1]).toBeGreaterThan(300);
  });

  it('projects deterministic finite screen and clip coordinates', () => {
    const input = {
      id: 'service:api',
      x: 760,
      y: 320,
      z: 140,
    };
    const first = projectWorkspaceGraphPoint3d(
      input,
      { width: 1200, height: 800 },
      { width: 900, height: 600 },
      { yaw: -0.45, pitch: -0.28, zoom: 0.78 }
    );
    const second = projectWorkspaceGraphPoint3d(
      input,
      { width: 1200, height: 800 },
      { width: 900, height: 600 },
      { yaw: -0.45, pitch: -0.28, zoom: 0.78 }
    );

    expect(first).toEqual(second);
    expect([...first.clip, ...first.screen].every(Number.isFinite)).toBe(true);
    expect(first.clip[2]).toBeGreaterThanOrEqual(-0.95);
    expect(first.clip[2]).toBeLessThanOrEqual(0.95);
    expect(first.scale).toBeGreaterThan(0);
    expect(Number.isFinite(first.depth)).toBe(true);
  });

  it('moves the projected point when the camera orbits', () => {
    const point = { id: 'service:api', x: 760, y: 320, z: 140 };
    const base = projectWorkspaceGraphPoint3d(
      point,
      { width: 1200, height: 800 },
      { width: 900, height: 600 },
      { yaw: 0, pitch: 0, zoom: 1 }
    );
    const orbited = projectWorkspaceGraphPoint3d(
      point,
      { width: 1200, height: 800 },
      { width: 900, height: 600 },
      { yaw: 0.8, pitch: 0.35, zoom: 1 }
    );
    expect(orbited.screen).not.toEqual(base.screen);
    expect(orbited.depth).not.toBe(base.depth);
    expect(orbited.scale).not.toBe(base.scale);
  });

  it('produces visibly different near and far perspective scales', () => {
    const layout = { width: 1200, height: 800 };
    const viewport = { width: 900, height: 600 };
    const camera = { yaw: 0, pitch: 0, zoom: 1 };
    const near = projectWorkspaceGraphPoint3d(
      { id: 'near', x: 600, y: 400, z: -260 },
      layout,
      viewport,
      camera
    );
    const far = projectWorkspaceGraphPoint3d(
      { id: 'far', x: 600, y: 400, z: 260 },
      layout,
      viewport,
      camera
    );

    expect(near.scale).toBeGreaterThan(far.scale);
  });

  it('fits every projected point inside a padded export viewport', () => {
    const layout = { width: 1200, height: 800 };
    const viewport = { width: 960, height: 540 };
    const points = [
      { id: 'north', x: 600, y: 20, z: 0 },
      { id: 'east', x: 1180, y: 400, z: 380 },
      { id: 'south', x: 600, y: 780, z: -260 },
      { id: 'west', x: 20, y: 400, z: -380 },
    ];
    const camera = fitWorkspaceGraphCameraToViewport(
      points,
      layout,
      viewport,
      { yaw: 0.72, pitch: 0.76, roll: 0.31, zoom: 2 },
      0.12
    );

    expect(camera.zoom).toBeLessThanOrEqual(1.1);
    for (const point of points) {
      const projected = projectWorkspaceGraphPoint3d(point, layout, viewport, camera);
      expect(projected.screen[0]).toBeGreaterThanOrEqual(viewport.width * 0.1);
      expect(projected.screen[0]).toBeLessThanOrEqual(viewport.width * 0.9);
      expect(projected.screen[1]).toBeGreaterThanOrEqual(viewport.height * 0.1);
      expect(projected.screen[1]).toBeLessThanOrEqual(viewport.height * 0.9);
    }
  });
});
