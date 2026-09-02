import type { GraphLayoutSample } from './workspaceGraphLayout';
import type { WorkspaceGraphProjection } from '@workspai-contracts/workspaceGraphProjection';

export const WORKSPACE_GRAPH_WORDMARK_MAX_CODEPOINTS = 32;
export const WORKSPACE_GRAPH_WORDMARK_FONT_FAMILY =
  '"MuseoModerno", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

export type WorkspaceGraphWordmarkSurface = {
  width: number;
  height: number;
  getContext(
    contextId: '2d',
    options?: { willReadFrequently?: boolean }
  ): CanvasRenderingContext2D | null;
};

export type WorkspaceGraphWordmarkSurfaceFactory = (
  width: number,
  height: number
) => WorkspaceGraphWordmarkSurface | null;

export function normalizeWorkspaceGraphWordmarkLabel(value: string): string {
  const normalized = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  const codepoints = Array.from(normalized);
  if (codepoints.length <= WORKSPACE_GRAPH_WORDMARK_MAX_CODEPOINTS) {
    return normalized;
  }
  return `${codepoints.slice(0, WORKSPACE_GRAPH_WORDMARK_MAX_CODEPOINTS - 1).join('')}…`;
}

export function resolveWorkspaceGraphWordmarkLabel(
  graph: WorkspaceGraphProjection,
  selectedProjectId: string
): string {
  const projectIds = [
    ...new Set(graph.entities.map((entity) => entity.projectId).filter(Boolean)),
  ] as string[];
  const scopedProjectId =
    selectedProjectId !== 'all'
      ? selectedProjectId
      : projectIds.length === 1
        ? projectIds[0]
        : undefined;
  if (scopedProjectId) {
    const projectEntity = graph.entities.find(
      (entity) =>
        entity.kind === 'project' &&
        (entity.projectId === scopedProjectId ||
          entity.id === scopedProjectId ||
          entity.id.endsWith(`:${scopedProjectId}`))
    );
    return normalizeWorkspaceGraphWordmarkLabel(projectEntity?.label || scopedProjectId);
  }
  const workspaceEntity = graph.entities.find((entity) => entity.kind === 'workspace');
  return normalizeWorkspaceGraphWordmarkLabel(
    graph.workspace?.name || workspaceEntity?.label || 'Workspace'
  );
}

function radicalInverse(value: number, base: number): number {
  let inverse = 1 / base;
  let result = 0;
  while (value > 0) {
    result += (value % base) * inverse;
    value = Math.floor(value / base);
    inverse /= base;
  }
  return result;
}

function defaultSurfaceFactory(
  width: number,
  height: number
): WorkspaceGraphWordmarkSurface | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function fittedFontSize(
  context: CanvasRenderingContext2D,
  label: string,
  width: number,
  height: number
): number {
  const maximum = Math.floor(height * 0.54);
  const minimum = Math.min(48, maximum);
  let low = minimum;
  let high = maximum;
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    context.font = `700 ${candidate}px ${WORKSPACE_GRAPH_WORDMARK_FONT_FAMILY}`;
    if (context.measureText(label).width <= width * 0.88) {
      low = candidate;
    } else {
      high = candidate - 1;
    }
  }
  return low;
}

/**
 * Rasterize only a project label into normalized placement samples. The samples
 * are presentation input; they never become graph entities or relationships.
 */
export function createWorkspaceGraphWordmarkSamples(
  value: string,
  count: number,
  options: {
    width?: number;
    height?: number;
    surfaceFactory?: WorkspaceGraphWordmarkSurfaceFactory;
  } = {}
): GraphLayoutSample[] {
  const label = normalizeWorkspaceGraphWordmarkLabel(value);
  const boundedCount = Math.max(0, Math.min(500, Math.floor(count)));
  if (!label || boundedCount === 0) {
    return [];
  }
  const width = Math.max(320, Math.floor(options.width ?? 1200));
  const height = Math.max(240, Math.floor(options.height ?? 800));
  const surface = (options.surfaceFactory ?? defaultSurfaceFactory)(width, height);
  const context = surface?.getContext('2d', { willReadFrequently: true });
  if (!surface || !context) {
    return [];
  }

  context.clearRect(0, 0, width, height);
  const fontSize = fittedFontSize(context, label, width, height);
  context.font = `700 ${fontSize}px ${WORKSPACE_GRAPH_WORDMARK_FONT_FAMILY}`;
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, width / 2, height / 2, width * 0.88);

  const pixels = context.getImageData(0, 0, width, height).data;
  const samples: GraphLayoutSample[] = [];
  const occupied = new Set<number>();
  const accepts = (x: number, y: number) => pixels[(y * width + x) * 4 + 3] >= 96;
  for (let attempt = 1; samples.length < boundedCount && attempt <= 80_000; attempt += 1) {
    const x = Math.min(width - 1, Math.floor(radicalInverse(attempt, 2) * width));
    const y = Math.min(height - 1, Math.floor(radicalInverse(attempt, 3) * height));
    const identity = y * width + x;
    if (!occupied.has(identity) && accepts(x, y)) {
      occupied.add(identity);
      samples.push({ x: (x + 0.5) / width, y: (y + 0.5) / height });
    }
  }

  // Very narrow glyphs can defeat low-discrepancy rejection at tiny sizes.
  // A deterministic scan completes the mask without inventing graph data.
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / (boundedCount * 18))));
  for (let y = 0; y < height && samples.length < boundedCount; y += stride) {
    for (let x = 0; x < width && samples.length < boundedCount; x += stride) {
      const identity = y * width + x;
      if (!occupied.has(identity) && accepts(x, y)) {
        occupied.add(identity);
        samples.push({ x: (x + 0.5) / width, y: (y + 0.5) / height });
      }
    }
  }
  return samples;
}
