import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WORKSPACE_GRAPH_CAMERA,
  normalizeWorkspaceGraphCamera,
  readWorkspaceGraphCameraPreference,
  readWorkspaceGraphShapePreference,
  writeWorkspaceGraphCameraPreference,
  writeWorkspaceGraphShapePreference,
} from '../../webview-ui/src/lib/workspaceGraphPreferences.js';

describe('Workspace Graph view preferences', () => {
  it('keeps camera state scoped by workspace identity', () => {
    const state = writeWorkspaceGraphCameraPreference(undefined, 'workspace:a', {
      yaw: 1,
      pitch: 0.4,
      zoom: 1.5,
    });
    const next = writeWorkspaceGraphCameraPreference(state, 'workspace:b', {
      yaw: -1,
      pitch: -0.2,
      zoom: 0.6,
    });
    expect(readWorkspaceGraphCameraPreference(next, 'workspace:a')).toEqual({
      yaw: 1,
      pitch: 0.4,
      roll: 0,
      zoom: 1.5,
    });
    expect(readWorkspaceGraphCameraPreference(next, 'workspace:b')).toEqual({
      yaw: -1,
      pitch: -0.2,
      roll: 0,
      zoom: 0.6,
    });
  });

  it('normalizes invalid or unsafe camera ranges', () => {
    expect(normalizeWorkspaceGraphCamera({ yaw: Number.NaN, pitch: 99, zoom: 0 })).toEqual({
      yaw: DEFAULT_WORKSPACE_GRAPH_CAMERA.yaw,
      pitch: 1.45,
      roll: 0,
      zoom: 0.24,
    });
  });

  it('keeps the selected semantic shape scoped by workspace identity', () => {
    const state = writeWorkspaceGraphShapePreference(undefined, 'workspace:a', 'brain');
    const next = writeWorkspaceGraphShapePreference(state, 'workspace:b', 'globe');
    const branded = writeWorkspaceGraphShapePreference(next, 'workspace:c', 'workspai');

    expect(readWorkspaceGraphShapePreference(branded, 'workspace:a')).toBe('brain');
    expect(readWorkspaceGraphShapePreference(branded, 'workspace:b')).toBe('globe');
    expect(readWorkspaceGraphShapePreference(branded, 'workspace:c')).toBe('workspai');
    expect(readWorkspaceGraphShapePreference(branded, 'workspace:unknown')).toBe('architecture');
  });
});
