export type WorkspaceGraphRendererMode = 'canvas2d' | 'canvas3d' | 'webgl3d' | 'list';

// Use the same depth-sorted, color-preserving renderer for the dashboard,
// repository analysis and exports. GPU availability alone does not establish
// point-sprite reliability in an embedded Electron webview.
export const WORKSPACE_GRAPH_DEFAULT_3D_RENDERER = 'canvas3d' as const;

export type WorkspaceGraphRendererCapabilities = {
  canvas2d: boolean;
  webgl2: boolean;
  prefersReducedMotion: boolean;
};

export function detectWorkspaceGraphRendererCapabilities(): WorkspaceGraphRendererCapabilities {
  const canvas = document.createElement('canvas');
  const gpuCanvas = document.createElement('canvas');
  const gl = gpuCanvas.getContext('webgl2');
  const webgl2 = Boolean(gl);
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return {
    canvas2d: Boolean(canvas.getContext('2d')),
    webgl2,
    prefersReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  };
}

export function resolveWorkspaceGraphRenderer(
  requested: WorkspaceGraphRendererMode,
  capabilities: WorkspaceGraphRendererCapabilities
): WorkspaceGraphRendererMode {
  if (requested === 'webgl3d' && capabilities.webgl2) {
    return 'webgl3d';
  }
  if (requested === 'webgl3d' && capabilities.canvas2d) {
    return 'canvas3d';
  }
  if (requested === 'canvas3d' && capabilities.canvas2d) {
    return 'canvas3d';
  }
  if (requested !== 'list' && capabilities.canvas2d) {
    return 'canvas2d';
  }
  return 'list';
}
