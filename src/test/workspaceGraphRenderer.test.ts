import { describe, expect, it } from 'vitest';

import { resolveWorkspaceGraphRenderer } from '../../webview-ui/src/lib/workspaceGraphRenderer.js';

describe('Workspace Graph renderer contract', () => {
  it('activates interactive 3D whenever WebGL2 is available', () => {
    expect(
      resolveWorkspaceGraphRenderer('webgl3d', {
        canvas2d: true,
        webgl2: true,
        prefersReducedMotion: false,
      })
    ).toBe('webgl3d');
  });

  it('falls back from GPU acceleration to software 3D without losing orbit', () => {
    expect(
      resolveWorkspaceGraphRenderer('webgl3d', {
        canvas2d: true,
        webgl2: true,
        prefersReducedMotion: true,
      })
    ).toBe('webgl3d');
    expect(
      resolveWorkspaceGraphRenderer('webgl3d', {
        canvas2d: true,
        webgl2: false,
        prefersReducedMotion: false,
      })
    ).toBe('canvas3d');
  });

  it('preserves a no-GPU list fallback', () => {
    expect(
      resolveWorkspaceGraphRenderer('canvas2d', {
        canvas2d: false,
        webgl2: false,
        prefersReducedMotion: false,
      })
    ).toBe('list');
  });

  it('keeps explicit software 3D on the three-axis renderer', () => {
    expect(
      resolveWorkspaceGraphRenderer('canvas3d', {
        canvas2d: true,
        webgl2: false,
        prefersReducedMotion: false,
      })
    ).toBe('canvas3d');
  });
});
