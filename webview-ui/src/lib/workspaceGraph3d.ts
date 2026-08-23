import type { GraphLayoutPoint } from './workspaceGraphLayout';
import type { WorkspaceGraphCameraPreference } from './workspaceGraphPreferences';

export const WORKSPACE_GRAPH_AUTO_ORBIT_RADIANS_PER_MS = 0.000065;

export function orbitWorkspaceGraphCamera(
  camera: WorkspaceGraphCameraPreference,
  deltaX: number,
  deltaY: number,
  rollDelta = 0
): WorkspaceGraphCameraPreference {
  return {
    ...camera,
    yaw: camera.yaw + deltaX * 0.009,
    pitch: Math.max(-1.45, Math.min(1.45, camera.pitch + deltaY * 0.008)),
    roll: (camera.roll ?? 0) + rollDelta,
  };
}

export function workspaceGraphGifCameraAt(
  base: WorkspaceGraphCameraPreference,
  frameIndex: number,
  frameCount: number
): WorkspaceGraphCameraPreference {
  const safeFrameCount = Math.max(1, Math.floor(frameCount));
  const progress = Math.max(0, Math.min(safeFrameCount - 1, frameIndex)) / safeFrameCount;
  return {
    ...base,
    // Two azimuth revolutions expose every cardinal side at complementary elevations.
    yaw: base.yaw + progress * Math.PI * 4,
    // One smooth latitude cycle captures both the upper and lower architecture planes.
    pitch: Math.sin(progress * Math.PI * 2) * 0.82,
    // Two restrained roll cycles expose edge crossings without making the story disorienting.
    roll: (base.roll ?? 0) + Math.sin(progress * Math.PI * 4) * 0.38,
  };
}

export function fitWorkspaceGraphCameraToViewport(
  points: Iterable<GraphLayoutPoint>,
  layout: { width: number; height: number },
  viewport: { width: number; height: number },
  camera: WorkspaceGraphCameraPreference,
  paddingRatio = 0.12
): WorkspaceGraphCameraPreference {
  const probeCamera = { ...camera, zoom: 1 };
  let maxX = 1;
  let maxY = 1;
  for (const point of points) {
    const projected = projectWorkspaceGraphPoint3d(point, layout, viewport, probeCamera);
    maxX = Math.max(maxX, Math.abs(projected.screen[0] - viewport.width / 2));
    maxY = Math.max(maxY, Math.abs(projected.screen[1] - viewport.height / 2));
  }
  const safePadding = Math.max(0.06, Math.min(0.22, paddingRatio));
  const availableX = viewport.width * (0.5 - safePadding);
  const availableY = viewport.height * (0.5 - safePadding);
  return {
    ...camera,
    zoom: Math.max(0.24, Math.min(1.1, Math.min(availableX / maxX, availableY / maxY))),
  };
}

export function projectWorkspaceGraphPoint3d(
  point: GraphLayoutPoint,
  layout: { width: number; height: number },
  size: { width: number; height: number },
  camera: WorkspaceGraphCameraPreference
): {
  clip: [number, number, number];
  screen: [number, number];
  depth: number;
  scale: number;
} {
  const sourceX = point.x - layout.width / 2;
  const sourceY = point.y - layout.height / 2;
  const cosineYaw = Math.cos(camera.yaw);
  const sineYaw = Math.sin(camera.yaw);
  const rotatedX = sourceX * cosineYaw - point.z * sineYaw;
  const yawDepth = sourceX * sineYaw + point.z * cosineYaw;
  const cosinePitch = Math.cos(camera.pitch);
  const sinePitch = Math.sin(camera.pitch);
  const rotatedY = sourceY * cosinePitch - yawDepth * sinePitch;
  const depth = sourceY * sinePitch + yawDepth * cosinePitch;
  const cosineRoll = Math.cos(camera.roll ?? 0);
  const sineRoll = Math.sin(camera.roll ?? 0);
  const rolledX = rotatedX * cosineRoll - rotatedY * sineRoll;
  const rolledY = rotatedX * sineRoll + rotatedY * cosineRoll;
  const perspective = 900 / Math.max(280, 900 + depth);
  const screenX = size.width / 2 + rolledX * perspective * camera.zoom;
  const screenY = size.height / 2 + rolledY * perspective * camera.zoom;
  return {
    clip: [
      (screenX / size.width) * 2 - 1,
      1 - (screenY / size.height) * 2,
      Math.max(-0.95, Math.min(0.95, depth / 1_200)),
    ],
    screen: [screenX, screenY],
    depth,
    scale: perspective * camera.zoom,
  };
}
