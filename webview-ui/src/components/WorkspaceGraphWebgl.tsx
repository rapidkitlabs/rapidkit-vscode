import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WorkspaceGraphEntityProjection,
  WorkspaceGraphRelationProjection,
} from '@workspai-contracts/workspaceGraphProjection';
import {
  layoutWorkspaceGraph,
  WORKSPAI_LOGO_DOT,
  WORKSPAI_LOGO_OUTLINE,
  WORKSPAI_LOGO_VIEWBOX,
  WORKSPACE_GRAPH_3D_SHAPES,
  workspaceGraphWorkspaiLogoScale,
  type GraphLayoutPoint,
  type GraphLayoutRequest,
  type GraphLayoutResult,
  type WorkspaceGraph3dShape,
} from '@/lib/workspaceGraphLayout';
import {
  createWorkspaceGraphWorker,
  type WorkspaceGraphWorkerHandle,
} from '@/lib/workspaceGraphWorker';
import {
  DEFAULT_WORKSPACE_GRAPH_CAMERA,
  readWorkspaceGraphCameraPreference,
  readWorkspaceGraphShapePreference,
  writeWorkspaceGraphCameraPreference,
  writeWorkspaceGraphShapePreference,
  type WorkspaceGraphCameraPreference,
  type WorkspaceGraphPreferenceState,
} from '@/lib/workspaceGraphPreferences';
import {
  fitWorkspaceGraphCameraToViewport,
  orbitWorkspaceGraphCamera,
  projectWorkspaceGraphPoint3d,
  WORKSPACE_GRAPH_AUTO_ORBIT_RADIANS_PER_MS,
  workspaceGraphGifCameraAt,
} from '@/lib/workspaceGraph3d';
import {
  bytesToDataUrl,
  encodeWorkspaceGraphGif,
  WORKSPACE_GRAPH_GIF_DEFAULTS,
  WORKSPACE_GRAPH_MP4_DEFAULTS,
  type WorkspaceGraphGifFrame,
} from '@/lib/workspaceGraphGif';
import {
  captureWorkspaceGraphImageData,
  WorkspaceGraphMp4Recorder,
} from '@/lib/workspaceGraphRecording';
import { vscode } from '@/vscode';
import {
  createWorkspaceGraphWordmarkSamples,
  WORKSPACE_GRAPH_WORDMARK_FONT_FAMILY,
} from '@/lib/workspaceGraphWordmark';
import { workspaceGraphDisplayLabel } from '@/lib/workspaceGraphDisplayLabel';
import type { WorkspaceGraphChangeOverlay } from './WorkspaceGraphExplorer';

type Camera = WorkspaceGraphCameraPreference;
type WebglRenderResources = {
  kind: 'webgl';
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  colorBuffer: WebGLBuffer;
  positionLocation: number;
  colorLocation: number;
  pointSizeLocation: WebGLUniformLocation;
  pointsLocation: WebGLUniformLocation;
};
type CanvasRenderResources = {
  kind: 'canvas2d';
  context: CanvasRenderingContext2D;
};
type RenderResources = WebglRenderResources | CanvasRenderResources;
type ProjectedGraphPoint = ReturnType<typeof projectWorkspaceGraphPoint3d>;
type ProjectedPoint = { id: string; x: number; y: number; depth: number };

function defaultCameraForShape(shape: WorkspaceGraph3dShape): Camera {
  if (shape === 'brain') return { yaw: -0.18, pitch: -0.12, roll: 0, zoom: 0.58 };
  if (shape === 'workspai' || shape === 'project-name') {
    return { yaw: 0, pitch: -0.06, roll: 0, zoom: 0.68 };
  }
  return DEFAULT_WORKSPACE_GRAPH_CAMERA;
}

const VERTEX_SHADER = `#version 300 es
in vec3 a_position;
in vec4 a_color;
uniform float u_pointSize;
out vec4 v_color;
void main() {
  gl_Position = vec4(a_position, 1.0);
  gl_PointSize = u_pointSize;
  v_color = a_color;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec4 v_color;
uniform bool u_points;
out vec4 outColor;
void main() {
  if (u_points) {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float distanceSquared = dot(point, point);
    if (distanceSquared > 1.0) discard;
    float glow = 1.0 - smoothstep(0.45, 1.0, distanceSquared);
    outColor = vec4(v_color.rgb, v_color.a * (0.55 + glow * 0.45));
    return;
  }
  outColor = v_color;
}`;

export function WorkspaceGraphWebgl({
  entities,
  relations,
  selectedId,
  onSelect,
  presentation,
  onFallback,
  preferenceKey,
  wordmarkLabel,
  changeOverlay,
  gifExportRequest,
  videoExportRequest,
  onGifExported,
  onVideoExported,
  onGifExportFailed,
  onVideoExportFailed,
  onGifExportProgress,
  preferWebgl = true,
  autoOrbitDefault = true,
}: {
  entities: WorkspaceGraphEntityProjection[];
  relations: WorkspaceGraphRelationProjection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  presentation: boolean;
  onFallback: () => void;
  preferenceKey: string;
  wordmarkLabel: string;
  changeOverlay?: WorkspaceGraphChangeOverlay | null;
  gifExportRequest?: { id: number; revision: string; delayCentiseconds: number } | null;
  videoExportRequest?: { id: number; revision: string; delayCentiseconds: number } | null;
  onGifExported?: (result: {
    requestId: number;
    revision: string;
    gifDataUrl: string;
    width: number;
    height: number;
    frameCount: number;
  }) => void;
  onVideoExported?: (result: {
    requestId: number;
    revision: string;
    mp4DataUrl: string;
    width: number;
    height: number;
    frameCount: number;
    durationMs: number;
  }) => void;
  onGifExportFailed?: (requestId: number, reason: string) => void;
  onVideoExportFailed?: (requestId: number, reason: string) => void;
  onGifExportProgress?: (completed: number, total: number) => void;
  preferWebgl?: boolean;
  autoOrbitDefault?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resourcesRef = useRef<RenderResources | null>(null);
  const pointsRef = useRef<Map<string, GraphLayoutPoint>>(new Map());
  const projectedRef = useRef<ProjectedPoint[]>([]);
  const requestRef = useRef(0);
  const processedExportRequestRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  // Callback identity must not tear down a live GPU context on a parent render.
  const fallbackRef = useRef(onFallback);
  fallbackRef.current = onFallback;
  const dragRef = useRef<{ x: number; y: number; camera: Camera; moved: boolean } | null>(null);
  const [size, setSize] = useState({ width: 800, height: 520 });
  const [layoutSize, setLayoutSize] = useState({ width: 1200, height: 800 });
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [wordmarkFontRevision, setWordmarkFontRevision] = useState(0);
  const [autoOrbit, setAutoOrbit] = useState(autoOrbitDefault);
  const [softwareFallback, setSoftwareFallback] = useState(!preferWebgl);
  const [camera, setCamera] = useState<Camera>(() =>
    readWorkspaceGraphCameraPreference(
      vscode.getState<WorkspaceGraphPreferenceState>(),
      preferenceKey
    )
  );
  const [shape, setShape] = useState<WorkspaceGraph3dShape>(() =>
    readWorkspaceGraphShapePreference(
      vscode.getState<WorkspaceGraphPreferenceState>(),
      preferenceKey
    )
  );
  const wordmarkSamples = useMemo(
    () =>
      shape === 'project-name'
        ? createWorkspaceGraphWordmarkSamples(wordmarkLabel, entities.length)
        : [],
    [entities.length, shape, wordmarkFontRevision, wordmarkLabel]
  );

  useEffect(() => {
    if (shape !== 'project-name' || !document.fonts) {
      return;
    }
    let disposed = false;
    void document.fonts
      .load(`700 120px ${WORKSPACE_GRAPH_WORDMARK_FONT_FAMILY}`, wordmarkLabel)
      .then(() => {
        if (!disposed) {
          setWordmarkFontRevision((revision) => revision + 1);
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [shape, wordmarkLabel]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetCamera = useCallback(() => {
    setCamera(defaultCameraForShape(shape));
  }, [shape]);
  const selectRelative = useCallback(
    (offset: number) => {
      if (!entities.length) return;
      const current = entities.findIndex((entity) => entity.id === selectedId);
      const start = current < 0 ? (offset > 0 ? -1 : 0) : current;
      const index = (start + offset + entities.length) % entities.length;
      onSelect(entities[index].id);
    },
    [entities, onSelect, selectedId]
  );

  useEffect(() => {
    vscode.setState(
      writeWorkspaceGraphCameraPreference(
        vscode.getState<WorkspaceGraphPreferenceState>(),
        preferenceKey,
        camera
      )
    );
  }, [camera, preferenceKey]);

  useEffect(() => {
    vscode.setState(
      writeWorkspaceGraphShapePreference(
        vscode.getState<WorkspaceGraphPreferenceState>(),
        preferenceKey,
        shape
      )
    );
  }, [preferenceKey, shape]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(380, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    if (softwareFallback || !preferWebgl) {
      const context = canvas.getContext('2d');
      if (!context) {
        fallbackRef.current();
        return;
      }
      resourcesRef.current = { kind: 'canvas2d', context };
      setLayoutRevision((value) => value + 1);
      return () => {
        resourcesRef.current = null;
      };
    }
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      setSoftwareFallback(true);
      return;
    }
    let resources: WebglRenderResources;
    try {
      resources = createRenderResources(gl);
    } catch {
      setSoftwareFallback(true);
      return;
    }
    resourcesRef.current = resources;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setSoftwareFallback(true);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    setLayoutRevision((value) => value + 1);
    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      resourcesRef.current = null;
      gl.deleteBuffer(resources.positionBuffer);
      gl.deleteBuffer(resources.colorBuffer);
      gl.deleteProgram(resources.program);
    };
  }, [preferWebgl, softwareFallback]);

  useEffect(() => {
    let disposed = false;
    let workerHandle: WorkspaceGraphWorkerHandle | null = null;
    const request: GraphLayoutRequest = {
      requestId: ++requestRef.current,
      nodes: entities.map(({ id, kind, projectId }) => ({ id, kind, projectId })),
      edges: relations.map(({ from, to }) => ({ from, to })),
      width: 1200,
      height: 800,
      mode: 'radial-3d',
      shape,
      shapeLabel: wordmarkLabel,
      shapeSamples: wordmarkSamples,
    };
    const accept = (result: GraphLayoutResult) => {
      if (disposed || result.requestId !== requestRef.current) {
        return;
      }
      pointsRef.current = new Map(result.points.map((point) => [point.id, point]));
      setLayoutSize({ width: result.width, height: result.height });
      setLayoutRevision((value) => value + 1);
    };
    const workerUri = window.WORKSPAI_GRAPH_WORKER_URI;
    if (!workerUri || typeof Worker === 'undefined') {
      accept(layoutWorkspaceGraph(request));
      return;
    }
    void createWorkspaceGraphWorker(workerUri)
      .then((handle) => {
        if (disposed) {
          handle.dispose();
          return;
        }
        workerHandle = handle;
        handle.worker.onmessage = (event: MessageEvent<GraphLayoutResult>) => accept(event.data);
        handle.worker.onerror = () => accept(layoutWorkspaceGraph(request));
        handle.worker.postMessage(request);
      })
      .catch(() => accept(layoutWorkspaceGraph(request)));
    return () => {
      disposed = true;
      workerHandle?.dispose();
    };
  }, [entities, relations, shape, wordmarkLabel, wordmarkSamples]);

  useEffect(() => {
    const resources = resourcesRef.current;
    const canvas = canvasRef.current;
    if (!resources || !canvas) {
      return;
    }
    let animationFrame = 0;
    const startedAt = performance.now();
    const draw = (now: number) => {
      renderWorkspaceGraph3d(resources, {
        canvas,
        labelsCanvas: labelsCanvasRef.current,
        size,
        layoutSize,
        points: pointsRef.current,
        entities,
        relations,
        selectedId,
        camera: {
          ...camera,
          yaw:
            camera.yaw +
            (presentation || autoOrbit
              ? (now - startedAt) * WORKSPACE_GRAPH_AUTO_ORBIT_RADIANS_PER_MS
              : 0),
        },
        projected: projectedRef.current,
        shape,
        changeOverlay,
      });
      if (presentation || autoOrbit) {
        animationFrame = requestAnimationFrame(draw);
      }
    };
    draw(performance.now());
    return () => cancelAnimationFrame(animationFrame);
  }, [
    autoOrbit,
    camera,
    changeOverlay,
    entities,
    layoutRevision,
    layoutSize,
    presentation,
    relations,
    selectedId,
    size,
  ]);

  useEffect(() => {
    const request = videoExportRequest ?? gifExportRequest;
    const video = Boolean(videoExportRequest);
    const resources = resourcesRef.current;
    const canvas = canvasRef.current;
    const root = containerRef.current;
    if (
      !request ||
      processedExportRequestRef.current === request.id ||
      !resources ||
      !canvas ||
      !root ||
      pointsRef.current.size === 0
    ) {
      return;
    }
    processedExportRequestRef.current = request.id;
    const exportEntities = entities.slice();
    const exportRelations = relations.slice();
    const exportPoints = new Map(pointsRef.current);
    const exportLayoutSize = { ...layoutSize };
    const exportCamera = { ...camera };
    const exportOrbit = async () => {
      // Export owns a separate canvas. The visible scene keeps its size and orbit.
      const exportCanvas = document.createElement('canvas');
      const exportLabels = document.createElement('canvas');
      const exportRoot = document.createElement('div');
      exportRoot.style.backgroundColor = '#071017';
      exportRoot.append(exportCanvas, exportLabels);
      const exportContext = exportCanvas.getContext('2d');
      if (!exportContext) {
        onGifExportFailed?.(request.id, 'Export canvas is unavailable.');
        return;
      }
      const exportResources: CanvasRenderResources = { kind: 'canvas2d', context: exportContext };
      try {
        const frames: WorkspaceGraphGifFrame[] = [];
        const exportDefaults = video ? WORKSPACE_GRAPH_MP4_DEFAULTS : WORKSPACE_GRAPH_GIF_DEFAULTS;
        const videoRecorder = video
          ? await WorkspaceGraphMp4Recorder.create(exportDefaults.width, exportDefaults.height)
          : null;
        if (video && !videoRecorder) {
          throw new Error('HQ MP4 export requires H.264 encoding support in this VS Code window.');
        }
        onGifExportProgress?.(0, exportDefaults.frameCount);
        for (let index = 0; index < exportDefaults.frameCount; index += 1) {
          const pathCamera = workspaceGraphGifCameraAt(
            exportCamera,
            index,
            exportDefaults.frameCount
          );
          const gifSize = {
            width: exportDefaults.width,
            height: exportDefaults.height,
          };
          const frameCamera = fitWorkspaceGraphCameraToViewport(
            exportPoints.values(),
            exportLayoutSize,
            gifSize,
            pathCamera,
            exportDefaults.capturePaddingRatio
          );
          if (!mountedRef.current) return;
          renderWorkspaceGraph3d(exportResources, {
            canvas: exportCanvas,
            labelsCanvas: exportLabels,
            size: gifSize,
            layoutSize: exportLayoutSize,
            points: exportPoints,
            entities: exportEntities,
            relations: exportRelations,
            selectedId,
            camera: frameCamera,
            projected: [],
            shape,
          });
          const image = captureWorkspaceGraphImageData(exportRoot, {
            width: exportDefaults.width,
            height: exportDefaults.height,
          });
          if (videoRecorder) {
            await videoRecorder.addFrame(image, request.delayCentiseconds * 10);
          } else {
            frames.push({ width: image.width, height: image.height, data: image.data });
          }
          if (videoRecorder || (index + 1) % 6 === 0) {
            onGifExportProgress?.(index + 1, exportDefaults.frameCount);
            await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
          }
        }
        if (videoRecorder) {
          const mp4DataUrl = await videoRecorder.stop();
          if (!mp4DataUrl) {
            throw new Error('The H.264 encoder did not produce an MP4 payload.');
          }
          if (mountedRef.current) {
            onVideoExported?.({
              requestId: request.id,
              revision: request.revision,
              mp4DataUrl,
              width: exportDefaults.width,
              height: exportDefaults.height,
              frameCount: exportDefaults.frameCount,
              durationMs: exportDefaults.frameCount * request.delayCentiseconds * 10,
            });
          }
        } else if (mountedRef.current) {
          const encoded = encodeWorkspaceGraphGif(frames, {
            delayCentiseconds: request.delayCentiseconds,
            repeat: 0,
          });
          onGifExported?.({
            requestId: request.id,
            revision: request.revision,
            gifDataUrl: bytesToDataUrl(encoded, 'image/gif'),
            width: WORKSPACE_GRAPH_GIF_DEFAULTS.width,
            height: WORKSPACE_GRAPH_GIF_DEFAULTS.height,
            frameCount: frames.length,
          });
        }
      } catch (error) {
        if (mountedRef.current) {
          const reason = error instanceof Error ? error.message : String(error);
          if (video) onVideoExportFailed?.(request.id, reason);
          else onGifExportFailed?.(request.id, reason);
        }
      } finally {
        if (mountedRef.current) {
          setLayoutRevision((value) => value + 1);
        }
      }
    };
    void exportOrbit();
  }, [
    camera,
    entities,
    gifExportRequest,
    videoExportRequest,
    layoutRevision,
    layoutSize,
    onGifExported,
    onGifExportFailed,
    onGifExportProgress,
    onVideoExported,
    onVideoExportFailed,
    relations,
    selectedId,
    size,
  ]);

  return (
    <div ref={containerRef} className="workspace-graph-webgl">
      <div className="workspace-graph-webgl__chrome">
        <strong>{softwareFallback ? 'Software 3D' : 'WebGL 3D'}</strong>
        <label>
          <select
            value={shape}
            onChange={(event) => {
              const nextShape = event.target.value as WorkspaceGraph3dShape;
              setShape(nextShape);
              setCamera(defaultCameraForShape(nextShape));
            }}
            disabled={Boolean(gifExportRequest || videoExportRequest)}
            aria-label="3D graph shape"
            title="Choose a 3D projection; GIF and MP4 exports use this selection"
          >
            {WORKSPACE_GRAPH_3D_SHAPES.map((value) => (
              <option key={value} value={value}>
                {value === 'architecture'
                  ? 'Architecture'
                  : value === 'globe'
                    ? 'Globe'
                    : value === 'brain'
                      ? 'Brain'
                      : value === 'constellation'
                        ? 'Constellation'
                        : value === 'workspai'
                          ? 'Workspai'
                          : `Project · ${wordmarkLabel}`}
              </option>
            ))}
          </select>
        </label>
        {shape === 'project-name' ? (
          <span title="Only the positions change; every visible node and relationship comes from the verified Graph projection">
            real graph · visual layout
          </span>
        ) : null}
        <span>
          {shape === 'project-name' ? 'evidence-preserving wordmark' : '3-axis semantic projection'}
        </span>
        <button
          type="button"
          aria-pressed={autoOrbit}
          onClick={() => setAutoOrbit((value) => !value)}
        >
          {autoOrbit ? 'Pause orbit' : 'Auto orbit'}
        </button>
        <button type="button" onClick={resetCamera}>
          Reset view
        </button>
        <button
          type="button"
          onClick={() =>
            setCamera((current) =>
              fitWorkspaceGraphCameraToViewport(
                pointsRef.current.values(),
                layoutSize,
                size,
                current
              )
            )
          }
        >
          Fit view
        </button>
      </div>
      <div className="workspace-graph-webgl__hint" aria-hidden="true">
        Drag to rotate · Shift-drag to roll · Wheel to zoom
      </div>
      <canvas
        key={softwareFallback ? 'software-3d' : 'webgl-3d'}
        ref={canvasRef}
        tabIndex={0}
        aria-label={`Interactive 3D workspace graph with ${entities.length} entities and ${relations.length} relationships`}
        onKeyDown={(event) => {
          const rotationStep = Math.PI / 18;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            setCamera((current) => ({
              ...current,
              yaw: current.yaw + (event.key === 'ArrowLeft' ? -rotationStep : rotationStep),
            }));
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            setCamera((current) => ({
              ...current,
              pitch: Math.max(
                -1.25,
                Math.min(1.25, current.pitch + (event.key === 'ArrowUp' ? -0.1 : 0.1))
              ),
            }));
          } else if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            setCamera((current) => ({ ...current, zoom: Math.min(2.6, current.zoom * 1.1) }));
          } else if (event.key === '-') {
            event.preventDefault();
            setCamera((current) => ({ ...current, zoom: Math.max(0.24, current.zoom * 0.9) }));
          } else if (event.key.toLowerCase() === 'q' || event.key.toLowerCase() === 'e') {
            event.preventDefault();
            setCamera((current) => ({
              ...current,
              roll: (current.roll ?? 0) + (event.key.toLowerCase() === 'q' ? -0.12 : 0.12),
            }));
          } else if (event.key === 'PageDown' || event.key === 'PageUp') {
            event.preventDefault();
            selectRelative(event.key === 'PageDown' ? 1 : -1);
          }
        }}
        onWheel={(event) => {
          event.preventDefault();
          setCamera((current) => ({
            ...current,
            zoom: Math.max(0.24, Math.min(2.6, current.zoom * (event.deltaY > 0 ? 0.9 : 1.1))),
          }));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          setAutoOrbit(false);
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            camera,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) {
            return;
          }
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) {
            drag.moved = true;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const startX = drag.x - rect.left - rect.width / 2;
          const startY = drag.y - rect.top - rect.height / 2;
          const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
          const tangentialRoll = (startX * dy - startY * dx) / (radius * radius);
          const nextCamera = orbitWorkspaceGraphCamera(
            drag.camera,
            event.shiftKey ? 0 : dx,
            event.shiftKey ? 0 : dy,
            event.shiftKey ? dx * 0.009 : tangentialRoll * 1.8
          );
          drag.x = event.clientX;
          drag.y = event.clientY;
          drag.camera = nextCamera;
          setCamera(nextCamera);
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (!drag || drag.moved) {
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const nearest = projectedRef.current
            .map((point) => ({ ...point, distance: Math.hypot(point.x - x, point.y - y) }))
            .filter((point) => point.distance <= 18)
            .sort((left, right) => left.distance - right.distance)[0];
          if (nearest) {
            onSelect(nearest.id);
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onLostPointerCapture={() => {
          dragRef.current = null;
        }}
      />
      <canvas ref={labelsCanvasRef} className="workspace-graph-webgl__labels" aria-hidden="true" />
    </div>
  );
}

function createRenderResources(gl: WebGL2RenderingContext): WebglRenderResources {
  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  const positionBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  const pointSizeLocation = gl.getUniformLocation(program, 'u_pointSize');
  const pointsLocation = gl.getUniformLocation(program, 'u_points');
  if (!positionBuffer || !colorBuffer || !pointSizeLocation || !pointsLocation) {
    if (positionBuffer) {
      gl.deleteBuffer(positionBuffer);
    }
    if (colorBuffer) {
      gl.deleteBuffer(colorBuffer);
    }
    gl.deleteProgram(program);
    throw new Error('Could not allocate Workspace Graph WebGL resources');
  }
  return {
    kind: 'webgl',
    gl,
    program,
    positionBuffer,
    colorBuffer,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    colorLocation: gl.getAttribLocation(program, 'a_color'),
    pointSizeLocation,
    pointsLocation,
  };
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Could not create Workspace Graph WebGL program');
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'unknown WebGL link error';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Could not create Workspace Graph WebGL shader');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'unknown WebGL compile error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

type GraphSceneRenderInput = {
  canvas: HTMLCanvasElement;
  labelsCanvas: HTMLCanvasElement | null;
  size: { width: number; height: number };
  layoutSize: { width: number; height: number };
  points: Map<string, GraphLayoutPoint>;
  entities: WorkspaceGraphEntityProjection[];
  relations: WorkspaceGraphRelationProjection[];
  selectedId: string | null;
  camera: Camera;
  projected: ProjectedPoint[];
  shape: WorkspaceGraph3dShape;
  changeOverlay?: WorkspaceGraphChangeOverlay | null;
};

function overlayEntityColor(
  entityId: string,
  overlay: WorkspaceGraphChangeOverlay | null | undefined
): [number, number, number, number] | null {
  if (overlay?.surpriseIds.includes(entityId)) return [0.98, 0.44, 0.52, 1];
  if (overlay?.actualIds.includes(entityId)) return [0.13, 0.83, 0.93, 1];
  if (overlay?.predictedIds.includes(entityId)) return [0.98, 0.75, 0.14, 1];
  return null;
}

function renderWorkspaceGraph3d(resources: RenderResources, input: GraphSceneRenderInput): void {
  if (resources.kind === 'canvas2d') {
    renderWorkspaceGraphSoftware3d(resources, input);
    return;
  }
  renderWorkspaceGraphWebgl3d(resources, input);
}

function renderWorkspaceGraphWebgl3d(
  resources: WebglRenderResources,
  input: GraphSceneRenderInput
): void {
  const { gl } = resources;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.floor(input.size.width * ratio);
  const height = Math.floor(input.size.height * ratio);
  if (input.canvas.width !== width) input.canvas.width = width;
  if (input.canvas.height !== height) input.canvas.height = height;
  input.canvas.style.width = `${input.size.width}px`;
  input.canvas.style.height = `${input.size.height}px`;
  gl.viewport(0, 0, input.canvas.width, input.canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.depthMask(true);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.useProgram(resources.program);

  const projected = new Map<string, ProjectedGraphPoint>();
  input.projected.length = 0;
  for (const entity of input.entities) {
    const point = input.points.get(entity.id);
    if (!point) {
      continue;
    }
    const value = projectWorkspaceGraphPoint3d(point, input.layoutSize, input.size, input.camera);
    projected.set(entity.id, value);
    input.projected.push({
      id: entity.id,
      x: value.screen[0],
      y: value.screen[1],
      depth: value.depth,
    });
  }

  const linePositions: number[] = [];
  const lineColors: number[] = [];
  for (const relation of input.relations) {
    const from = projected.get(relation.from);
    const to = projected.get(relation.to);
    if (!from || !to) {
      continue;
    }
    const color =
      overlayEntityColor(relation.from, input.changeOverlay) ??
      overlayEntityColor(relation.to, input.changeOverlay) ??
      relationColor3d(relation.kind);
    linePositions.push(...from.clip, ...to.clip);
    lineColors.push(...depthColor(color, from.scale), ...depthColor(color, to.scale));
  }
  // Transparent edges must not occlude their endpoint sprites as the camera turns.
  gl.depthMask(false);
  uploadAndDraw(resources, linePositions, lineColors, gl.LINES, 1, false);
  gl.depthMask(true);

  const nodeBuckets = [
    { positions: [] as number[], colors: [] as number[], size: 6.5 },
    { positions: [] as number[], colors: [] as number[], size: 9.5 },
    { positions: [] as number[], colors: [] as number[], size: 13 },
  ];
  const selectedPositions: number[] = [];
  const selectedColors: number[] = [];
  for (const entity of input.entities) {
    const point = projected.get(entity.id);
    if (!point) {
      continue;
    }
    const layoutPoint = input.points.get(entity.id);
    const color =
      overlayEntityColor(entity.id, input.changeOverlay) ??
      entityColorForShape(
        entity.kind,
        input.shape,
        layoutPoint?.x ?? input.layoutSize.width / 2,
        input.layoutSize.width,
        input.layoutSize.height
      );
    if (entity.id === input.selectedId) {
      selectedPositions.push(...point.clip);
      selectedColors.push(1, 1, 1, 1);
    } else {
      const bucket = nodeBuckets[point.scale < 0.72 ? 0 : point.scale > 1.05 ? 2 : 1];
      bucket.positions.push(...point.clip);
      bucket.colors.push(...depthColor(color, point.scale));
    }
  }
  for (const bucket of nodeBuckets) {
    uploadAndDraw(resources, bucket.positions, bucket.colors, gl.POINTS, bucket.size * ratio, true);
  }
  const corePositions: number[] = [];
  const coreColors: number[] = [];
  for (const entity of input.entities) {
    if (
      !['workspace', 'project', 'service'].includes(entity.kind) ||
      entity.id === input.selectedId
    ) {
      continue;
    }
    const point = projected.get(entity.id);
    if (point) {
      corePositions.push(...point.clip);
      const layoutPoint = input.points.get(entity.id);
      coreColors.push(
        ...entityColorForShape(
          entity.kind,
          input.shape,
          layoutPoint?.x ?? input.layoutSize.width / 2,
          input.layoutSize.width,
          input.layoutSize.height
        )
      );
    }
  }
  uploadAndDraw(resources, corePositions, coreColors, gl.POINTS, 13 * ratio, true);
  uploadAndDraw(resources, selectedPositions, selectedColors, gl.POINTS, 17 * ratio, true);
  if (input.labelsCanvas) {
    renderWorkspaceGraphLabels(
      input.labelsCanvas,
      input.size,
      input.entities,
      projected,
      input.selectedId,
      input.points,
      input.layoutSize,
      input.camera,
      input.shape
    );
  }
}

function renderWorkspaceGraphSoftware3d(
  resources: CanvasRenderResources,
  input: GraphSceneRenderInput
): void {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.floor(input.size.width * ratio);
  const height = Math.floor(input.size.height * ratio);
  if (input.canvas.width !== width) input.canvas.width = width;
  if (input.canvas.height !== height) input.canvas.height = height;
  input.canvas.style.width = `${input.size.width}px`;
  input.canvas.style.height = `${input.size.height}px`;
  const context = resources.context;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, input.size.width, input.size.height);

  const projected = new Map<string, ProjectedGraphPoint>();
  input.projected.length = 0;
  for (const entity of input.entities) {
    const point = input.points.get(entity.id);
    if (!point) continue;
    const value = projectWorkspaceGraphPoint3d(point, input.layoutSize, input.size, input.camera);
    projected.set(entity.id, value);
    input.projected.push({
      id: entity.id,
      x: value.screen[0],
      y: value.screen[1],
      depth: value.depth,
    });
  }

  const relations = input.relations
    .flatMap((relation) => {
      const from = projected.get(relation.from);
      const to = projected.get(relation.to);
      return from && to ? [{ relation, from, to }] : [];
    })
    .sort((left, right) => right.from.depth + right.to.depth - left.from.depth - left.to.depth);
  context.lineWidth = 0.75;
  for (const { relation, from, to } of relations) {
    const color = depthColor(
      overlayEntityColor(relation.from, input.changeOverlay) ??
        overlayEntityColor(relation.to, input.changeOverlay) ??
        relationColor3d(relation.kind),
      (from.scale + to.scale) / 2
    );
    context.beginPath();
    context.moveTo(from.screen[0], from.screen[1]);
    context.lineTo(to.screen[0], to.screen[1]);
    context.strokeStyle = rgbaColor(color);
    context.stroke();
  }

  const entities = input.entities
    .flatMap((entity) => {
      const point = projected.get(entity.id);
      return point ? [{ entity, point }] : [];
    })
    .sort((left, right) => right.point.depth - left.point.depth);
  for (const { entity, point } of entities) {
    const selected = entity.id === input.selectedId;
    const core = ['workspace', 'project', 'service'].includes(entity.kind);
    const radius = selected ? 8.5 : Math.max(3.2, Math.min(8.2, (core ? 6.8 : 4.6) * point.scale));
    const color = selected
      ? ([0.93, 0.99, 1, 1] as [number, number, number, number])
      : depthColor(
          overlayEntityColor(entity.id, input.changeOverlay) ??
            entityColorForShape(
              entity.kind,
              input.shape,
              input.points.get(entity.id)?.x ?? input.layoutSize.width / 2,
              input.layoutSize.width,
              input.layoutSize.height
            ),
          point.scale
        );
    context.save();
    context.shadowColor = selected ? 'rgba(34, 211, 238, 0.9)' : rgbaColor(color);
    context.shadowBlur = selected ? 16 : core ? 9 : 5;
    context.beginPath();
    context.arc(point.screen[0], point.screen[1], radius, 0, Math.PI * 2);
    context.fillStyle = rgbaColor(color);
    context.fill();
    if (selected) {
      context.lineWidth = 1.5;
      context.strokeStyle = 'rgba(34, 211, 238, 1)';
      context.stroke();
    }
    context.restore();
  }

  if (input.labelsCanvas) {
    renderWorkspaceGraphLabels(
      input.labelsCanvas,
      input.size,
      input.entities,
      projected,
      input.selectedId,
      input.points,
      input.layoutSize,
      input.camera,
      input.shape
    );
  }
}

function rgbaColor(color: [number, number, number, number]): string {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(
    color[2] * 255
  )}, ${color[3].toFixed(3)})`;
}

function depthColor(
  color: [number, number, number, number],
  scale: number
): [number, number, number, number] {
  const depthVisibility = Math.max(0.32, Math.min(1, 0.34 + scale * 0.72));
  const brightness = Math.max(0.5, Math.min(1.18, 0.48 + scale * 0.62));
  return [
    Math.min(1, color[0] * brightness),
    Math.min(1, color[1] * brightness),
    Math.min(1, color[2] * brightness),
    color[3] * depthVisibility,
  ];
}

function uploadAndDraw(
  resources: WebglRenderResources,
  positions: number[],
  colors: number[],
  mode: number,
  pointSize: number,
  points: boolean
): void {
  if (!positions.length) {
    return;
  }
  const { gl } = resources;
  gl.bindBuffer(gl.ARRAY_BUFFER, resources.positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(resources.positionLocation);
  gl.vertexAttribPointer(resources.positionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, resources.colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(resources.colorLocation);
  gl.vertexAttribPointer(resources.colorLocation, 4, gl.FLOAT, false, 0, 0);
  gl.uniform1f(resources.pointSizeLocation, pointSize);
  gl.uniform1i(resources.pointsLocation, points ? 1 : 0);
  gl.drawArrays(mode, 0, positions.length / 3);
}

function entityColor3d(kind: string): [number, number, number, number] {
  if (['workspace', 'project', 'service'].includes(kind)) return [0.13, 0.83, 0.93, 0.98];
  if (['language', 'runtime-unit', 'module', 'package'].includes(kind))
    return [0.48, 0.64, 0.97, 0.95];
  if (['api', 'endpoint'].includes(kind)) return [0.31, 0.79, 0.69, 0.95];
  if (['schema', 'protocol'].includes(kind)) return [1, 0.62, 0.39, 0.95];
  if (['database', 'queue'].includes(kind)) return [0.77, 0.53, 0.75, 0.95];
  if (['pipeline', 'deployment', 'container', 'lifecycle-stage'].includes(kind))
    return [0.86, 0.86, 0.67, 0.95];
  if (['test-suite', 'owner', 'decision', 'document'].includes(kind))
    return [0.73, 0.6, 0.97, 0.95];
  return [0.66, 0.71, 0.8, 0.82];
}

function entityColorForShape(
  kind: string,
  shape: WorkspaceGraph3dShape,
  x: number,
  width: number,
  height: number
): [number, number, number, number] {
  if (shape !== 'workspai') return entityColor3d(kind);
  const scale = workspaceGraphWorkspaiLogoScale(width, height);
  const logoLeft = width / 2 - (WORKSPAI_LOGO_VIEWBOX.width / 2) * scale;
  const progress = Math.max(
    0,
    Math.min(1, (x - logoLeft) / Math.max(1, WORKSPAI_LOGO_VIEWBOX.width * scale))
  );
  const left: [number, number, number] = [97 / 255, 92 / 255, 237 / 255];
  const middle: [number, number, number] = [51 / 255, 143 / 255, 214 / 255];
  const right: [number, number, number] = [8 / 255, 199 / 255, 184 / 255];
  const from = progress < 0.5 ? left : middle;
  const to = progress < 0.5 ? middle : right;
  const local = progress < 0.5 ? progress * 2 : (progress - 0.5) * 2;
  return [
    from[0] + (to[0] - from[0]) * local,
    from[1] + (to[1] - from[1]) * local,
    from[2] + (to[2] - from[2]) * local,
    0.98,
  ];
}

function relationColor3d(kind: string): [number, number, number, number] {
  if (/depend|call|import/i.test(kind)) return [0.13, 0.83, 0.93, 0.18];
  if (/implement|expose|route|protocol/i.test(kind)) return [0.31, 0.79, 0.69, 0.21];
  if (/read|write|publish|consume/i.test(kind)) return [0.77, 0.53, 0.75, 0.21];
  if (/deploy|run|host/i.test(kind)) return [0.96, 0.62, 0.04, 0.23];
  if (/document|evidence|proof/i.test(kind)) return [0.65, 0.55, 0.98, 0.2];
  return [0.58, 0.64, 0.73, 0.12];
}

function renderWorkspaceGraphLabels(
  canvas: HTMLCanvasElement,
  size: { width: number; height: number },
  entities: WorkspaceGraphEntityProjection[],
  projected: Map<string, ProjectedGraphPoint>,
  selectedId: string | null,
  layoutPoints: Map<string, GraphLayoutPoint>,
  layoutSize: { width: number; height: number },
  camera: Camera,
  shape: WorkspaceGraph3dShape
): void {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(size.width * ratio);
  canvas.height = Math.floor(size.height * ratio);
  canvas.style.width = `${size.width}px`;
  canvas.style.height = `${size.height}px`;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size.width, size.height);
  renderSemanticGuides(context, size, layoutPoints, layoutSize, camera, shape);
  renderCameraAxes(context, size, layoutSize, camera);
  context.font = '600 11px system-ui';
  const occupied: Array<{ x: number; y: number; width: number; height: number }> = [];
  const labelCandidates = entities
    .filter((entity) => {
      if (shape === 'project-name') {
        return entity.id === selectedId;
      }
      const important = ['workspace', 'project', 'service', 'language', 'runtime-unit'].includes(
        entity.kind
      );
      return important || entity.id === selectedId;
    })
    .sort((left, right) => {
      if (left.id === selectedId) return -1;
      if (right.id === selectedId) return 1;
      return (projected.get(right.id)?.scale ?? 0) - (projected.get(left.id)?.scale ?? 0);
    });
  for (const entity of labelCandidates) {
    const important = ['workspace', 'project', 'service', 'language', 'runtime-unit'].includes(
      entity.kind
    );
    if (!important && entity.id !== selectedId) {
      continue;
    }
    const point = projected.get(entity.id);
    if (!point) {
      continue;
    }
    if (entity.id !== selectedId && point.scale < 0.62) {
      continue;
    }
    const label = workspaceGraphDisplayLabel(entity);
    const width = context.measureText(label).width + 12;
    const x = Math.max(4, Math.min(size.width - width - 4, point.screen[0] + 9));
    const y = Math.max(15, Math.min(size.height - 8, point.screen[1] - 9));
    const bounds = { x, y: y - 12, width, height: 18 };
    const overlaps = occupied.some(
      (entry) =>
        bounds.x < entry.x + entry.width + 4 &&
        bounds.x + bounds.width + 4 > entry.x &&
        bounds.y < entry.y + entry.height + 4 &&
        bounds.y + bounds.height + 4 > entry.y
    );
    if (entity.id !== selectedId && overlaps) {
      continue;
    }
    occupied.push(bounds);
    context.fillStyle =
      entity.id === selectedId ? 'rgba(8, 47, 73, 0.94)' : 'rgba(15, 23, 42, 0.76)';
    context.strokeStyle =
      entity.id === selectedId ? 'rgba(34, 211, 238, 0.95)' : 'rgba(148, 163, 184, 0.28)';
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(x, y - 12, width, 18, 5);
    context.fill();
    context.stroke();
    context.fillStyle = entity.id === selectedId ? '#ecfeff' : '#cbd5e1';
    context.fillText(label, x + 6, y + 1);
  }
}

function renderSemanticGuides(
  context: CanvasRenderingContext2D,
  size: { width: number; height: number },
  points: Map<string, GraphLayoutPoint>,
  layoutSize: { width: number; height: number },
  camera: Camera,
  shape: WorkspaceGraph3dShape
): void {
  if (shape === 'architecture') {
    renderOrbitGuides(context, size, points, layoutSize, camera);
    return;
  }
  if (shape === 'globe') {
    renderGlobeGuides(context, size, layoutSize, camera);
    return;
  }
  if (shape === 'brain') {
    renderBrainGuides(context, size, layoutSize, camera);
    return;
  }
  if (shape === 'workspai') {
    renderWorkspaiGuides(context, size, layoutSize, camera);
  }
}

function renderWorkspaiGuides(
  context: CanvasRenderingContext2D,
  size: { width: number; height: number },
  layoutSize: { width: number; height: number },
  camera: Camera
): void {
  const scale = workspaceGraphWorkspaiLogoScale(layoutSize.width, layoutSize.height);
  const mapPoint = ([x, y]: readonly [number, number], index: number): GraphLayoutPoint => ({
    id: `workspai-guide:${index}`,
    x: layoutSize.width / 2 + (x - WORKSPAI_LOGO_VIEWBOX.width / 2) * scale,
    y: layoutSize.height / 2 + (y - WORKSPAI_LOGO_VIEWBOX.height / 2) * scale,
    z: -Math.min(layoutSize.width, layoutSize.height) * 0.035,
  });
  const outline = [...WORKSPAI_LOGO_OUTLINE, WORKSPAI_LOGO_OUTLINE[0]].map(mapPoint);
  const dotCorners: ReadonlyArray<readonly [number, number]> = [
    [WORKSPAI_LOGO_DOT.left, WORKSPAI_LOGO_DOT.top],
    [WORKSPAI_LOGO_DOT.right, WORKSPAI_LOGO_DOT.top],
    [WORKSPAI_LOGO_DOT.right, WORKSPAI_LOGO_DOT.bottom],
    [WORKSPAI_LOGO_DOT.left, WORKSPAI_LOGO_DOT.bottom],
    [WORKSPAI_LOGO_DOT.left, WORKSPAI_LOGO_DOT.top],
  ];
  strokeProjectedGuide(context, outline, size, layoutSize, camera, 'rgba(76, 124, 226, 0.34)');
  strokeProjectedGuide(
    context,
    dotCorners.map(mapPoint),
    size,
    layoutSize,
    camera,
    'rgba(8, 199, 184, 0.42)'
  );
}

function strokeProjectedGuide(
  context: CanvasRenderingContext2D,
  values: GraphLayoutPoint[],
  size: { width: number; height: number },
  layoutSize: { width: number; height: number },
  camera: Camera,
  color: string,
  dashed = false
): void {
  context.save();
  context.beginPath();
  values.forEach((point, index) => {
    const projected = projectWorkspaceGraphPoint3d(point, layoutSize, size, camera);
    if (index === 0) context.moveTo(projected.screen[0], projected.screen[1]);
    else context.lineTo(projected.screen[0], projected.screen[1]);
  });
  context.lineWidth = 1;
  context.setLineDash(dashed ? [3, 6] : []);
  context.strokeStyle = color;
  context.stroke();
  context.restore();
}

function renderGlobeGuides(
  context: CanvasRenderingContext2D,
  size: { width: number; height: number },
  layoutSize: { width: number; height: number },
  camera: Camera
): void {
  const radius = Math.min(layoutSize.width, layoutSize.height) * 0.35;
  const centerX = layoutSize.width / 2;
  const centerY = layoutSize.height / 2;
  for (let axis = 0; axis < 3; axis += 1) {
    const values = Array.from({ length: 73 }, (_, index) => {
      const angle = (index / 72) * Math.PI * 2;
      return {
        id: `globe-guide:${axis}:${index}`,
        x: centerX + (axis === 1 ? 0 : Math.cos(angle) * radius),
        y: centerY + (axis === 0 ? 0 : Math.sin(angle) * radius),
        z: axis === 2 ? 0 : Math.sin(angle) * radius,
      };
    });
    strokeProjectedGuide(
      context,
      values,
      size,
      layoutSize,
      camera,
      'rgba(34, 211, 238, 0.11)',
      true
    );
  }
}

function renderBrainGuides(
  context: CanvasRenderingContext2D,
  size: { width: number; height: number },
  layoutSize: { width: number; height: number },
  camera: Camera
): void {
  const centerX = layoutSize.width / 2 - layoutSize.width * 0.025;
  const centerY = layoutSize.height / 2 - layoutSize.height * 0.055;
  const radiusX = layoutSize.width * 0.285;
  const radiusY = layoutSize.height * 0.275;
  const depth = Math.min(layoutSize.width, layoutSize.height) * 0.245;
  const gap = Math.min(layoutSize.width, layoutSize.height) * 0.018;
  for (const side of [-1, 1]) {
    for (let band = -3; band <= 3; band += 1) {
      const values: GraphLayoutPoint[] = [];
      for (let index = 0; index <= 52; index += 1) {
        const progress = index / 52;
        const longitudinal = -0.92 + progress * 1.84;
        const vertical =
          band * 0.145 + Math.sin(progress * Math.PI * (3.2 + (band & 1) * 0.7) + band) * 0.055;
        const surface = Math.sqrt(
          Math.max(0.02, 1 - longitudinal * longitudinal - vertical * vertical)
        );
        values.push({
          id: `brain-gyrus:${side}:${band}:${index}`,
          x: centerX + longitudinal * radiusX,
          y: centerY + vertical * radiusY,
          z: side * (gap + surface * depth),
        });
      }
      strokeProjectedGuide(context, values, size, layoutSize, camera, 'rgba(244, 114, 182, 0.13)');
    }
  }
  for (let band = -2; band <= 2; band += 1) {
    const values = Array.from({ length: 37 }, (_, index) => {
      const angle = (index / 36) * Math.PI * 2;
      const corrugation = 1 + Math.sin(angle * 7 + band) * 0.06;
      return {
        id: `brain-cerebellum:${band}:${index}`,
        x:
          centerX +
          layoutSize.width * 0.225 +
          Math.cos(angle) * layoutSize.width * 0.105 * corrugation,
        y:
          centerY +
          layoutSize.height * (0.235 + band * 0.013) +
          Math.sin(angle) * layoutSize.height * 0.09 * corrugation,
        z: band * Math.min(layoutSize.width, layoutSize.height) * 0.025,
      };
    });
    strokeProjectedGuide(context, values, size, layoutSize, camera, 'rgba(251, 146, 60, 0.12)');
  }
}

function renderOrbitGuides(
  context: CanvasRenderingContext2D,
  size: { width: number; height: number },
  points: Map<string, GraphLayoutPoint>,
  layoutSize: { width: number; height: number },
  camera: Camera
): void {
  const rings = new Map<number, number>();
  for (const point of points.values()) {
    const y = Math.round(point.y);
    const radius = Math.hypot(point.x - layoutSize.width / 2, point.z);
    rings.set(y, Math.max(rings.get(y) ?? 0, radius));
  }
  context.save();
  context.lineWidth = 1;
  context.setLineDash([4, 7]);
  for (const [y, radius] of rings) {
    if (radius < 8) continue;
    context.beginPath();
    for (let index = 0; index <= 72; index += 1) {
      const angle = (index / 72) * Math.PI * 2;
      const projected = projectWorkspaceGraphPoint3d(
        {
          id: `guide:${y}:${index}`,
          x: layoutSize.width / 2 + Math.cos(angle) * radius,
          y,
          z: Math.sin(angle) * radius,
        },
        layoutSize,
        size,
        camera
      );
      if (index === 0) context.moveTo(projected.screen[0], projected.screen[1]);
      else context.lineTo(projected.screen[0], projected.screen[1]);
    }
    context.strokeStyle = 'rgba(34, 211, 238, 0.1)';
    context.stroke();
  }
  context.restore();
}

function renderCameraAxes(
  context: CanvasRenderingContext2D,
  size: { width: number; height: number },
  layoutSize: { width: number; height: number },
  camera: Camera
): void {
  const origin = { x: size.width - 54, y: size.height - 48 };
  const center: GraphLayoutPoint = {
    id: 'axis-origin',
    x: layoutSize.width / 2,
    y: layoutSize.height / 2,
    z: 0,
  };
  const axes = [
    { label: 'X', color: '#22d3ee', point: { ...center, x: center.x + 48 } },
    { label: 'Y', color: '#a78bfa', point: { ...center, y: center.y - 48 } },
    { label: 'Z', color: '#fb923c', point: { ...center, z: 48 } },
  ];
  const projectedCenter = projectWorkspaceGraphPoint3d(center, layoutSize, size, camera);
  context.save();
  context.font = '700 9px system-ui';
  for (const axis of axes) {
    const projected = projectWorkspaceGraphPoint3d(axis.point, layoutSize, size, camera);
    const dx = projected.screen[0] - projectedCenter.screen[0];
    const dy = projected.screen[1] - projectedCenter.screen[1];
    const length = Math.max(1, Math.hypot(dx, dy));
    const endX = origin.x + (dx / length) * 26;
    const endY = origin.y + (dy / length) * 26;
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.lineTo(endX, endY);
    context.strokeStyle = axis.color;
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = axis.color;
    context.fillText(axis.label, endX + 3, endY + 3);
  }
  context.beginPath();
  context.arc(origin.x, origin.y, 2.5, 0, Math.PI * 2);
  context.fillStyle = 'rgba(226, 232, 240, 0.9)';
  context.fill();
  context.restore();
}
