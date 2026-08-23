import type { WorkspaceGraphProjection } from '@workspai-contracts/workspaceGraphProjection';
import type {
  WorkspaceGraphRecordingChange,
  WorkspaceGraphRecordingFrameInput,
} from '@workspai-contracts/workspaceGraphRecording';
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeVideo,
} from 'mediabunny';

type CapturedGraphFrame = Omit<
  WorkspaceGraphRecordingFrameInput,
  'sessionId' | 'revision' | 'capturedAt' | 'change'
>;

function mapById<T extends { id: string }>(values: T[]): Map<string, T> {
  return new Map(values.map((value) => [value.id, value]));
}

function changedCount<T extends { id: string }>(previous: T[], current: T[]): number {
  const previousById = mapById(previous);
  let changed = 0;
  for (const value of current) {
    const oldValue = previousById.get(value.id);
    if (oldValue && JSON.stringify(oldValue) !== JSON.stringify(value)) {
      changed += 1;
    }
  }
  return changed;
}

export function describeWorkspaceGraphRecordingChange(
  previous: WorkspaceGraphProjection | null,
  current: WorkspaceGraphProjection
): WorkspaceGraphRecordingChange | null {
  if (previous?.revision === current.revision) {
    return null;
  }
  if (!previous) {
    return {
      kind: 'baseline',
      title: `Baseline · ${current.total.entities} entities`,
      revision: current.revision,
      entitiesAdded: current.entities.length,
      entitiesRemoved: 0,
      entitiesChanged: 0,
      relationsAdded: current.relations.length,
      relationsRemoved: 0,
      relationsChanged: 0,
      highlightedEntityIds: current.highlightedEntityIds?.slice(0, 50) ?? [],
    };
  }
  const previousEntities = mapById(previous.entities);
  const currentEntities = mapById(current.entities);
  const previousRelations = mapById(previous.relations);
  const currentRelations = mapById(current.relations);
  const entitiesAdded = current.entities.filter((value) => !previousEntities.has(value.id)).length;
  const entitiesRemoved = previous.entities.filter(
    (value) => !currentEntities.has(value.id)
  ).length;
  const entitiesChanged = changedCount(previous.entities, current.entities);
  const relationsAdded = current.relations.filter(
    (value) => !previousRelations.has(value.id)
  ).length;
  const relationsRemoved = previous.relations.filter(
    (value) => !currentRelations.has(value.id)
  ).length;
  const relationsChanged = changedCount(previous.relations, current.relations);
  const totalChanges =
    entitiesAdded +
    entitiesRemoved +
    entitiesChanged +
    relationsAdded +
    relationsRemoved +
    relationsChanged;
  if (totalChanges === 0 && previous.revision === current.revision) {
    return null;
  }
  const fragments = [
    entitiesAdded ? `${entitiesAdded} added` : '',
    entitiesChanged ? `${entitiesChanged} changed` : '',
    entitiesRemoved ? `${entitiesRemoved} removed` : '',
    relationsAdded + relationsChanged + relationsRemoved
      ? `${relationsAdded + relationsChanged + relationsRemoved} relationship updates`
      : '',
  ].filter(Boolean);
  return {
    kind: 'revision',
    title: fragments.join(' · ') || 'Graph revision updated',
    revision: current.revision,
    previousRevision: previous.revision,
    entitiesAdded,
    entitiesRemoved,
    entitiesChanged,
    relationsAdded,
    relationsRemoved,
    relationsChanged,
    highlightedEntityIds: current.highlightedEntityIds?.slice(0, 50) ?? [],
  };
}

export async function captureWorkspaceGraphSurface(
  root: HTMLElement,
  output = { width: 1280, height: 720 }
): Promise<CapturedGraphFrame> {
  const target = captureWorkspaceGraphCanvas(root, output);
  return {
    width: output.width,
    height: output.height,
    pngDataUrl: target.toDataURL('image/png'),
  };
}

export function captureWorkspaceGraphImageData(
  root: HTMLElement,
  output: { width: number; height: number }
): ImageData {
  const canvas = captureWorkspaceGraphCanvas(root, output);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas capture is unavailable in this Webview.');
  }
  return context.getImageData(0, 0, output.width, output.height);
}

function captureWorkspaceGraphCanvas(
  root: HTMLElement,
  output: { width: number; height: number }
): HTMLCanvasElement {
  const sourceCanvases = Array.from(root.querySelectorAll('canvas')).filter(
    (canvas): canvas is HTMLCanvasElement =>
      canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0
  );
  if (!sourceCanvases.length) {
    throw new Error('The graph renderer has not produced a capturable frame yet.');
  }
  const target = document.createElement('canvas');
  target.width = output.width;
  target.height = output.height;
  const context = target.getContext('2d');
  if (!context) {
    throw new Error('Canvas capture is unavailable in this Webview.');
  }
  renderGraphCaptureBackground(context, output.width, output.height, root);

  const primary = sourceCanvases[0];
  const sourceRatio = primary.width / primary.height;
  const targetRatio = output.width / output.height;
  const drawWidth = sourceRatio > targetRatio ? output.width : output.height * sourceRatio;
  const drawHeight = sourceRatio > targetRatio ? output.width / sourceRatio : output.height;
  const offsetX = (output.width - drawWidth) / 2;
  const offsetY = (output.height - drawHeight) / 2;
  for (const canvas of sourceCanvases) {
    context.drawImage(canvas, offsetX, offsetY, drawWidth, drawHeight);
  }
  return target;
}

function renderGraphCaptureBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  root: HTMLElement
): void {
  const graphSurface = root.querySelector<HTMLElement>('.workspace-graph-webgl');
  const candidates = [
    graphSurface ? getComputedStyle(graphSurface).backgroundColor : '',
    getComputedStyle(root).backgroundColor,
    getComputedStyle(document.body).backgroundColor,
  ];
  const computed = candidates.find(
    (value) => value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent'
  );
  // Keep a deterministic VS Code-dark fallback. Assigning an unsupported CSS
  // Color 4 value leaves the previous canvas fillStyle intact.
  context.fillStyle = '#11151b';
  if (computed) {
    context.fillStyle = computed;
  }
  context.fillRect(0, 0, width, height);

  const primaryGlow = context.createRadialGradient(
    width * 0.5,
    height * 0.45,
    0,
    width * 0.5,
    height * 0.45,
    Math.max(width, height) * 0.5
  );
  primaryGlow.addColorStop(0, 'rgba(34, 211, 238, 0.1)');
  primaryGlow.addColorStop(1, 'rgba(2, 6, 23, 0)');
  context.fillStyle = primaryGlow;
  context.fillRect(0, 0, width, height);

  const accentGlow = context.createRadialGradient(
    width * 0.28,
    height * 0.72,
    0,
    width * 0.28,
    height * 0.72,
    Math.max(width, height) * 0.38
  );
  accentGlow.addColorStop(0, 'rgba(168, 85, 247, 0.08)');
  accentGlow.addColorStop(1, 'rgba(2, 6, 23, 0)');
  context.fillStyle = accentGlow;
  context.fillRect(0, 0, width, height);

  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.22,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72
  );
  vignette.addColorStop(0, 'rgba(2, 6, 23, 0)');
  vignette.addColorStop(1, 'rgba(2, 6, 23, 0.22)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not encode recording.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

const WORKSPACE_GRAPH_MP4_BITRATE = 24_000_000;

export class WorkspaceGraphMp4Recorder {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly target: BufferTarget;
  private readonly output: Output<Mp4OutputFormat, BufferTarget>;
  private readonly source: CanvasSource;
  private timestampSeconds = 0;
  private frameCount = 0;
  private stopped = false;

  private constructor(input: {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    target: BufferTarget;
    output: Output<Mp4OutputFormat, BufferTarget>;
    source: CanvasSource;
  }) {
    this.canvas = input.canvas;
    this.context = input.context;
    this.target = input.target;
    this.output = input.output;
    this.source = input.source;
  }

  static async create(width = 1280, height = 720): Promise<WorkspaceGraphMp4Recorder | null> {
    if (typeof HTMLCanvasElement === 'undefined' || typeof VideoEncoder === 'undefined') {
      return null;
    }
    const quality = new Quality({ bitrate: WORKSPACE_GRAPH_MP4_BITRATE, bitrateMode: 'variable' });
    if (!(await canEncodeVideo('avc', { width, height, quality }))) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      return null;
    }
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target,
    });
    const source = new CanvasSource(canvas, { codec: 'avc', quality });
    output.addVideoTrack(source);
    output.setMetadataTags({ title: 'Workspai Workspace Graph' });
    try {
      await output.start();
      return new WorkspaceGraphMp4Recorder({ canvas, context, target, output, source });
    } catch {
      await output.cancel().catch(() => undefined);
      return null;
    }
  }

  async addFrame(frame: string | ImageData, durationMs = 500): Promise<void> {
    if (this.stopped) {
      return;
    }
    if (frame instanceof ImageData) {
      this.drawImageData(frame);
      await this.commitFrame(durationMs);
      return;
    }
    const image = new Image();
    image.src = frame;
    await image.decode();
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
    await this.commitFrame(durationMs);
  }

  async stop(): Promise<string | undefined> {
    if (this.stopped) {
      return undefined;
    }
    this.stopped = true;
    if (!this.frameCount) {
      await this.output.cancel();
      return undefined;
    }
    await this.output.finalize();
    if (!this.target.buffer) {
      return undefined;
    }
    return blobToDataUrl(new Blob([this.target.buffer], { type: 'video/mp4' }));
  }

  protected drawImageData(frame: ImageData): void {
    this.context.putImageData(frame, 0, 0);
  }

  protected async commitFrame(durationMs: number): Promise<void> {
    const durationSeconds = Math.max(0.02, durationMs / 1000);
    await this.source.add(this.timestampSeconds, durationSeconds, {
      keyFrame: this.frameCount % 30 === 0,
    });
    this.timestampSeconds += durationSeconds;
    this.frameCount += 1;
  }
}
