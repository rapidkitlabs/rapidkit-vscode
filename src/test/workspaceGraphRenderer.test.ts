import { describe, expect, it, vi } from 'vitest';

import {
  resolveWorkspaceGraphRenderer,
  detectWorkspaceGraphRendererCapabilities,
  WORKSPACE_GRAPH_DEFAULT_3D_RENDERER,
} from '../../webview-ui/src/lib/workspaceGraphRenderer.js';

describe('Workspace Graph renderer contract', () => {
  it('shares the export-quality software renderer even when a GPU is available', () => {
    expect(
      resolveWorkspaceGraphRenderer(WORKSPACE_GRAPH_DEFAULT_3D_RENDERER, {
        canvas2d: true,
        webgl2: true,
        prefersReducedMotion: false,
      })
    ).toBe('canvas3d');
  });

  it('probes different context types on separate canvases and releases the GPU probe', () => {
    const loseContext = vi.fn();
    const canvases: unknown[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        let acquired: string | undefined;
        const canvas = {
          getContext: (kind: string) => {
            if (acquired && acquired !== kind) return null;
            acquired = kind;
            return kind === 'webgl2' ? { getExtension: () => ({ loseContext }) } : {};
          },
        };
        canvases.push(canvas);
        return canvas;
      },
    });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    try {
      expect(detectWorkspaceGraphRendererCapabilities()).toEqual({
        canvas2d: true,
        webgl2: true,
        prefersReducedMotion: false,
      });
      expect(canvases).toHaveLength(2);
      expect(loseContext).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
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
