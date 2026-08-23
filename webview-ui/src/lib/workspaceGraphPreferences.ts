export type WorkspaceGraphCameraPreference = {
  yaw: number;
  pitch: number;
  roll?: number;
  zoom: number;
};

export type WorkspaceGraphPreferenceState = {
  workspaiGraphView?: {
    cameraByWorkspace?: Record<string, WorkspaceGraphCameraPreference>;
    shapeByWorkspace?: Record<string, WorkspaceGraph3dShape>;
  };
};

export const DEFAULT_WORKSPACE_GRAPH_3D_SHAPE: WorkspaceGraph3dShape = 'architecture';

export const DEFAULT_WORKSPACE_GRAPH_CAMERA: WorkspaceGraphCameraPreference = {
  yaw: -0.45,
  pitch: -0.28,
  roll: 0,
  zoom: 0.78,
};

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeWorkspaceGraphCamera(value: unknown): WorkspaceGraphCameraPreference {
  const camera =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    yaw: finite(camera.yaw, DEFAULT_WORKSPACE_GRAPH_CAMERA.yaw),
    pitch: Math.max(
      -1.45,
      Math.min(1.45, finite(camera.pitch, DEFAULT_WORKSPACE_GRAPH_CAMERA.pitch))
    ),
    roll: finite(camera.roll, DEFAULT_WORKSPACE_GRAPH_CAMERA.roll ?? 0),
    zoom: Math.max(0.24, Math.min(2.6, finite(camera.zoom, DEFAULT_WORKSPACE_GRAPH_CAMERA.zoom))),
  };
}

export function readWorkspaceGraphCameraPreference(
  state: WorkspaceGraphPreferenceState | undefined,
  workspaceIdentity: string
): WorkspaceGraphCameraPreference {
  return normalizeWorkspaceGraphCamera(
    state?.workspaiGraphView?.cameraByWorkspace?.[workspaceIdentity]
  );
}

export function writeWorkspaceGraphCameraPreference(
  state: WorkspaceGraphPreferenceState | undefined,
  workspaceIdentity: string,
  camera: WorkspaceGraphCameraPreference
): WorkspaceGraphPreferenceState {
  return {
    ...(state ?? {}),
    workspaiGraphView: {
      ...(state?.workspaiGraphView ?? {}),
      cameraByWorkspace: {
        ...(state?.workspaiGraphView?.cameraByWorkspace ?? {}),
        [workspaceIdentity]: normalizeWorkspaceGraphCamera(camera),
      },
    },
  };
}

export function readWorkspaceGraphShapePreference(
  state: WorkspaceGraphPreferenceState | undefined,
  workspaceIdentity: string
): WorkspaceGraph3dShape {
  const value = state?.workspaiGraphView?.shapeByWorkspace?.[workspaceIdentity];
  return WORKSPACE_GRAPH_3D_SHAPES.includes(value as WorkspaceGraph3dShape)
    ? (value as WorkspaceGraph3dShape)
    : DEFAULT_WORKSPACE_GRAPH_3D_SHAPE;
}

export function writeWorkspaceGraphShapePreference(
  state: WorkspaceGraphPreferenceState | undefined,
  workspaceIdentity: string,
  shape: WorkspaceGraph3dShape
): WorkspaceGraphPreferenceState {
  const normalized = WORKSPACE_GRAPH_3D_SHAPES.includes(shape)
    ? shape
    : DEFAULT_WORKSPACE_GRAPH_3D_SHAPE;
  return {
    ...(state ?? {}),
    workspaiGraphView: {
      ...(state?.workspaiGraphView ?? {}),
      shapeByWorkspace: {
        ...(state?.workspaiGraphView?.shapeByWorkspace ?? {}),
        [workspaceIdentity]: normalized,
      },
    },
  };
}
import { WORKSPACE_GRAPH_3D_SHAPES, type WorkspaceGraph3dShape } from './workspaceGraphLayout';
