export type GraphLayoutNode = { id: string; kind: string; projectId?: string };
export type GraphLayoutEdge = { from: string; to: string };
export type GraphLayoutPoint = { id: string; x: number; y: number; z: number };
export type GraphLayoutSample = { x: number; y: number };
export const WORKSPACE_GRAPH_3D_SHAPES = [
  'architecture',
  'globe',
  'brain',
  'constellation',
  'workspai',
  'project-name',
] as const;
export type WorkspaceGraph3dShape = (typeof WORKSPACE_GRAPH_3D_SHAPES)[number];
export type GraphLayoutRequest = {
  requestId: number;
  nodes: GraphLayoutNode[];
  edges: GraphLayoutEdge[];
  width?: number;
  height?: number;
  mode?: 'force' | 'radial-3d';
  shape?: WorkspaceGraph3dShape;
  /** Presentation-only glyph samples. Never interpreted as graph entities. */
  shapeSamples?: GraphLayoutSample[];
  shapeLabel?: string;
};
export type GraphLayoutResult = {
  requestId: number;
  points: GraphLayoutPoint[];
  width: number;
  height: number;
};

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function layoutWorkspaceGraph(request: GraphLayoutRequest): GraphLayoutResult {
  const width = request.width ?? 1200;
  const height = request.height ?? 800;
  const nodes = request.nodes.slice(0, 500);
  if (request.mode === 'radial-3d') {
    return layoutWorkspaceGraphRadial3d(
      request.requestId,
      nodes,
      width,
      height,
      request.shape ?? 'architecture',
      request.shapeSamples,
      request.shapeLabel
    );
  }
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const x = new Float64Array(nodes.length);
  const y = new Float64Array(nodes.length);
  const groups = new Map<string, number>();
  for (const node of nodes) {
    const group = node.projectId ?? node.kind;
    if (!groups.has(group)) {
      groups.set(group, groups.size);
    }
  }
  const groupCount = Math.max(1, groups.size);
  nodes.forEach((node, index) => {
    const groupIndex = groups.get(node.projectId ?? node.kind) ?? 0;
    const groupAngle = (groupIndex / groupCount) * Math.PI * 2;
    const seed = hash(node.id);
    const radius = 90 + (seed % 170);
    const jitter = ((seed % 1000) / 1000) * Math.PI * 2;
    const centerRadius = Math.min(width, height) * 0.28;
    x[index] = width / 2 + Math.cos(groupAngle) * centerRadius + Math.cos(jitter) * radius;
    y[index] = height / 2 + Math.sin(groupAngle) * centerRadius + Math.sin(jitter) * radius;
  });

  const edges = request.edges.flatMap((edge) => {
    const from = indexById.get(edge.from);
    const to = indexById.get(edge.to);
    return from === undefined || to === undefined ? [] : [[from, to] as const];
  });
  const iterations = nodes.length > 300 ? 45 : 70;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const dx = new Float64Array(nodes.length);
    const dy = new Float64Array(nodes.length);
    for (const [from, to] of edges) {
      const vx = x[to] - x[from];
      const vy = y[to] - y[from];
      const distance = Math.max(1, Math.hypot(vx, vy));
      const force = (distance - 92) * 0.018;
      dx[from] += (vx / distance) * force;
      dy[from] += (vy / distance) * force;
      dx[to] -= (vx / distance) * force;
      dy[to] -= (vy / distance) * force;
    }
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const vx = x[right] - x[left];
        const vy = y[right] - y[left];
        const distanceSquared = vx * vx + vy * vy + 0.01;
        if (distanceSquared > 32_400) {
          continue;
        }
        const distance = Math.sqrt(distanceSquared);
        const force = Math.min(5, 850 / distanceSquared);
        dx[left] -= (vx / distance) * force;
        dy[left] -= (vy / distance) * force;
        dx[right] += (vx / distance) * force;
        dy[right] += (vy / distance) * force;
      }
    }
    const cooling = 1 - iteration / iterations;
    for (let index = 0; index < nodes.length; index += 1) {
      dx[index] += (width / 2 - x[index]) * 0.002;
      dy[index] += (height / 2 - y[index]) * 0.002;
      x[index] = Math.max(28, Math.min(width - 28, x[index] + dx[index] * cooling));
      y[index] = Math.max(28, Math.min(height - 28, y[index] + dy[index] * cooling));
    }
  }

  return {
    requestId: request.requestId,
    width,
    height,
    points: nodes.map((node, index) => {
      const seed = hash(`${node.id}:depth`);
      const groupIndex = groups.get(node.projectId ?? node.kind) ?? 0;
      return {
        id: node.id,
        x: x[index],
        y: y[index],
        z: ((seed % 401) - 200) * 0.72 + (groupIndex - groupCount / 2) * 18,
      };
    }),
  };
}

function architectureLevel(kind: string): number {
  if (kind === 'workspace') {
    return 0;
  }
  if (kind === 'project') {
    return 1;
  }
  if (['service', 'runtime-unit', 'language', 'package', 'module'].includes(kind)) {
    return 2;
  }
  if (['api', 'endpoint', 'schema', 'protocol', 'database', 'queue'].includes(kind)) {
    return 3;
  }
  if (
    [
      'container',
      'deployment',
      'pipeline',
      'environment',
      'lifecycle-stage',
      'test-suite',
    ].includes(kind)
  ) {
    return 4;
  }
  return 5;
}

function layoutWorkspaceGraphRadial3d(
  requestId: number,
  nodes: GraphLayoutNode[],
  width: number,
  height: number,
  shape: WorkspaceGraph3dShape,
  shapeSamples?: GraphLayoutSample[],
  shapeLabel?: string
): GraphLayoutResult {
  if (shape === 'globe') {
    return layoutWorkspaceGraphGlobe(requestId, nodes, width, height);
  }
  if (shape === 'brain') {
    return layoutWorkspaceGraphBrain(requestId, nodes, width, height);
  }
  if (shape === 'constellation') {
    return layoutWorkspaceGraphConstellation(requestId, nodes, width, height);
  }
  if (shape === 'workspai') {
    return layoutWorkspaceGraphWorkspai(requestId, nodes, width, height);
  }
  if (shape === 'project-name') {
    return layoutWorkspaceGraphProjectName(
      requestId,
      nodes,
      width,
      height,
      shapeSamples,
      shapeLabel
    );
  }
  const levels = new Map<number, GraphLayoutNode[]>();
  for (const node of nodes) {
    const level = architectureLevel(node.kind);
    const values = levels.get(level) ?? [];
    values.push(node);
    levels.set(level, values);
  }
  const populatedLevels = [...levels.keys()].sort((left, right) => left - right);
  const verticalMiddle = (populatedLevels.length - 1) / 2;
  const points: GraphLayoutPoint[] = [];
  populatedLevels.forEach((level, levelIndex) => {
    const values = (levels.get(level) ?? []).sort((left, right) => {
      const leftKey = `${left.projectId ?? '@workspace'}:${left.kind}:${left.id}`;
      const rightKey = `${right.projectId ?? '@workspace'}:${right.kind}:${right.id}`;
      return leftKey.localeCompare(rightKey);
    });
    const radius = level === 0 ? 0 : Math.min(width, height) * (0.13 + level * 0.055);
    const offset = values.length > 1 ? ((hash(`level:${level}`) % 360) / 180) * Math.PI : 0;
    values.forEach((node, index) => {
      const angle = offset + (index / Math.max(1, values.length)) * Math.PI * 2;
      points.push({
        id: node.id,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + (levelIndex - verticalMiddle) * 105,
        z: Math.sin(angle) * radius,
      });
    });
  });
  return { requestId, width, height, points };
}

function layoutWorkspaceGraphProjectName(
  requestId: number,
  nodes: GraphLayoutNode[],
  width: number,
  height: number,
  samples: GraphLayoutSample[] | undefined,
  label = 'project'
): GraphLayoutResult {
  const ordered = stableNodes(nodes);
  const validSamples = (samples ?? []).filter(
    (sample) =>
      Number.isFinite(sample.x) &&
      Number.isFinite(sample.y) &&
      sample.x >= 0 &&
      sample.x <= 1 &&
      sample.y >= 0 &&
      sample.y <= 1
  );
  if (validSamples.length < ordered.length) {
    // The UI normally supplies one text-mask sample per real entity. Keep a
    // deterministic, honest fallback for non-DOM consumers and old hosts.
    return {
      requestId,
      width,
      height,
      points: ordered.map((node, index) => ({
        id: node.id,
        x: width * (0.12 + (index + 0.5) * (0.76 / Math.max(1, ordered.length))),
        y: height / 2,
        z:
          ((hash(`${label}:${node.id}:project-name-depth`) % 101) - 50) *
          Math.min(width, height) *
          0.001,
      })),
    };
  }
  return {
    requestId,
    width,
    height,
    points: ordered.map((node, index) => ({
      id: node.id,
      x: validSamples[index].x * width,
      y: validSamples[index].y * height,
      z:
        ((hash(`${label}:${node.id}:project-name-depth`) % 101) - 50) *
        Math.min(width, height) *
        0.001,
    })),
  };
}

function stableNodes(nodes: GraphLayoutNode[]): GraphLayoutNode[] {
  return [...nodes].sort((left, right) => {
    const leftKey = `${left.projectId ?? '@workspace'}:${left.kind}:${left.id}`;
    const rightKey = `${right.projectId ?? '@workspace'}:${right.kind}:${right.id}`;
    return leftKey.localeCompare(rightKey);
  });
}

function layoutWorkspaceGraphGlobe(
  requestId: number,
  nodes: GraphLayoutNode[],
  width: number,
  height: number
): GraphLayoutResult {
  const ordered = stableNodes(nodes);
  const surface = ordered.filter((node) => node.kind !== 'workspace');
  const radius = Math.min(width, height) * 0.35;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const points = ordered.flatMap((node) => {
    if (node.kind === 'workspace') {
      return [{ id: node.id, x: width / 2, y: height / 2, z: 0 }];
    }
    const index = surface.indexOf(node);
    const count = Math.max(1, surface.length);
    const vertical = 1 - ((index + 0.5) / count) * 2;
    const horizontalRadius = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const angle = index * goldenAngle;
    const semanticScale = node.kind === 'project' ? 0.74 : 1;
    return [
      {
        id: node.id,
        x: width / 2 + Math.cos(angle) * horizontalRadius * radius * semanticScale,
        y: height / 2 + vertical * radius * semanticScale,
        z: Math.sin(angle) * horizontalRadius * radius * semanticScale,
      },
    ];
  });
  return { requestId, width, height, points };
}

function layoutWorkspaceGraphBrain(
  requestId: number,
  nodes: GraphLayoutNode[],
  width: number,
  height: number
): GraphLayoutResult {
  const ordered = stableNodes(nodes);
  const centerX = width / 2 - width * 0.025;
  const centerY = height / 2 - height * 0.055;
  const operationalKinds = new Set([
    'container',
    'deployment',
    'pipeline',
    'environment',
    'test-suite',
    'owner',
  ]);
  const controlKinds = new Set(['lifecycle-stage', 'queue', 'decision']);
  const cortex: GraphLayoutNode[] = [];
  const cerebellum: GraphLayoutNode[] = [];
  const stem: GraphLayoutNode[] = [];
  const points: GraphLayoutPoint[] = [];
  for (const node of ordered) {
    if (node.kind === 'workspace') {
      points.push({ id: node.id, x: centerX + width * 0.035, y: centerY + height * 0.08, z: 0 });
      continue;
    }
    const seed = hash(`${node.id}:brain-region`);
    if (controlKinds.has(node.kind) || seed % 100 < 5) {
      stem.push(node);
    } else if (operationalKinds.has(node.kind) || seed % 100 < 19) {
      cerebellum.push(node);
    } else {
      cortex.push(node);
    }
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  cortex.forEach((node, index) => {
    const vertical = 1 - ((index + 0.5) / Math.max(1, cortex.length)) * 2;
    const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const angle = index * goldenAngle + ((hash(node.projectId ?? node.kind) % 360) / 180) * Math.PI;
    const longitudinal = Math.cos(angle) * radial;
    const lateral = Math.sin(angle) * radial;
    const lowerTaper = vertical < -0.42 ? 1 - Math.min(0.2, (-vertical - 0.42) * 0.28) : 1;
    const fold =
      1 +
      Math.sin(angle * 5.2 + vertical * 8.5) * 0.052 +
      Math.sin(angle * 11.3 - vertical * 6.2) * 0.026;
    const hemisphereGap = Math.min(width, height) * 0.018;
    points.push({
      id: node.id,
      x: centerX + longitudinal * width * 0.285 * fold * lowerTaper,
      y:
        centerY -
        vertical * height * 0.275 * fold +
        Math.sin(angle * 3 + vertical * 5) * height * 0.009,
      z:
        Math.sign(lateral || (index % 2 === 0 ? 1 : -1)) *
        (hemisphereGap + Math.abs(lateral) * Math.min(width, height) * 0.245 * fold),
    });
  });

  cerebellum.forEach((node, index) => {
    const vertical = 1 - ((index + 0.5) / Math.max(1, cerebellum.length)) * 2;
    const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const angle = index * goldenAngle;
    const corrugation = 1 + Math.sin(angle * 8 + vertical * 11) * 0.075;
    points.push({
      id: node.id,
      x: centerX + width * 0.225 + Math.cos(angle) * radial * width * 0.115 * corrugation,
      y: centerY + height * 0.235 - vertical * height * 0.105 * corrugation,
      z: Math.sin(angle) * radial * Math.min(width, height) * 0.13 * corrugation,
    });
  });

  stem.forEach((node, index) => {
    const progress = (index + 0.5) / Math.max(1, stem.length);
    const spiral = index * goldenAngle;
    const radius = Math.min(width, height) * (0.032 - progress * 0.012);
    points.push({
      id: node.id,
      x: centerX + width * (0.075 + progress * 0.025) + Math.cos(spiral) * radius,
      y: centerY + height * (0.205 + progress * 0.28),
      z: Math.sin(spiral) * radius,
    });
  });
  return { requestId, width, height, points };
}

function layoutWorkspaceGraphConstellation(
  requestId: number,
  nodes: GraphLayoutNode[],
  width: number,
  height: number
): GraphLayoutResult {
  const ordered = stableNodes(nodes);
  const groups = new Map<string, GraphLayoutNode[]>();
  for (const node of ordered) {
    const group = node.projectId ?? (node.kind === 'workspace' ? '@workspace' : node.kind);
    const values = groups.get(group) ?? [];
    values.push(node);
    groups.set(group, values);
  }
  const groupEntries = [...groups.entries()]
    .filter(([group]) => group !== '@workspace')
    .sort(([left], [right]) => left.localeCompare(right));
  const points: GraphLayoutPoint[] = ordered
    .filter((node) => node.kind === 'workspace')
    .map((node) => ({ id: node.id, x: width / 2, y: height / 2, z: 0 }));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const anchorRadius = Math.min(width, height) * 0.29;
  groupEntries.forEach(([group, values], groupIndex) => {
    const count = Math.max(1, groupEntries.length);
    const vertical = count === 1 ? 0 : 1 - ((groupIndex + 0.5) / count) * 2;
    const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const groupAngle = groupIndex * goldenAngle + ((hash(group) % 90) / 180) * Math.PI;
    const centerX = width / 2 + Math.cos(groupAngle) * radial * anchorRadius * 1.22;
    const centerY = height / 2 + vertical * anchorRadius * 0.88;
    const centerZ = Math.sin(groupAngle) * radial * anchorRadius;
    const groupRotation = ((hash(`${group}:asterism`) % 3600) / 3600) * Math.PI * 2;
    values.forEach((node, index) => {
      if (node.kind === 'workspace') {
        return;
      }
      const seed = hash(`${group}:${node.id}`);
      const arm = index % 6;
      const ring = Math.floor(index / 6);
      const ray = groupRotation + (arm / 6) * Math.PI * 2 + ring * 0.17;
      const distance = index === 0 ? 0 : 24 + ring * 15 + (arm % 2) * 7 + ((seed >>> 9) % 8);
      const branchDepth = index === 0 ? 0 : Math.sin(ray * 1.5 + ring * 0.8) * (18 + ring * 5);
      points.push({
        id: node.id,
        x: centerX + Math.cos(ray) * distance,
        y: centerY + Math.sin(ray) * distance * 0.72,
        z: centerZ + branchDepth + (((seed >>> 18) % 13) - 6),
      });
    });
  });
  return { requestId, width, height, points };
}

export const WORKSPAI_LOGO_VIEWBOX = Object.freeze({ width: 768, height: 634 });
export const WORKSPAI_LOGO_DOT = Object.freeze({ left: 622, top: 0, right: 757, bottom: 135 });
export const WORKSPAI_LOGO_OUTLINE: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [16, 199.855],
  [140.868, 199.855],
  [156.868, 215.855],
  [156.868, 459.472],
  [166.868, 469.472],
  [194.256, 469.472],
  [204.256, 459.472],
  [204.256, 272],
  [220.256, 256],
  [278, 256],
  [288, 246],
  [288, 206.051],
  [304, 190.051],
  [464, 190.051],
  [480, 206.051],
  [480, 246],
  [490, 256],
  [547.745, 256],
  [563.745, 272],
  [563.745, 459.472],
  [573.745, 469.472],
  [601.133, 469.472],
  [611.133, 459.472],
  [611.133, 215.855],
  [627.133, 199.855],
  [752.001, 199.855],
  [768.001, 215.855],
  [768.001, 574],
  [752.001, 590],
  [730, 590],
  [720, 600],
  [720, 617.693],
  [704, 633.693],
  [471, 633.693],
  [455, 617.693],
  [455, 600],
  [445, 590],
  [422.877, 590],
  [406.877, 574],
  [406.877, 324.238],
  [396.877, 314.238],
  [371.124, 314.238],
  [361.124, 324.238],
  [361.124, 574],
  [345.124, 590],
  [323, 590],
  [313, 600],
  [313, 617.693],
  [297, 633.693],
  [64, 633.693],
  [48, 617.693],
  [48, 600],
  [38, 590],
  [16, 590],
  [0, 574],
  [0, 215.855],
]);

export function workspaceGraphWorkspaiLogoScale(width: number, height: number): number {
  return Math.min(
    (width * 0.78) / WORKSPAI_LOGO_VIEWBOX.width,
    (height * 0.8) / WORKSPAI_LOGO_VIEWBOX.height
  );
}

function pointInPolygon(x: number, y: number, polygon: ReadonlyArray<readonly [number, number]>) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [currentX, currentY] = polygon[index];
    const [previousX, previousY] = polygon[previous];
    const crosses =
      currentY > y !== previousY > y &&
      x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
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

function sampleWorkspaiRegion(
  count: number,
  start: number,
  accepts: (x: number, y: number) => boolean
): Array<readonly [number, number]> {
  const samples: Array<readonly [number, number]> = [];
  for (let attempt = start; samples.length < count && attempt < start + 20_000; attempt += 1) {
    const x = radicalInverse(attempt, 2) * WORKSPAI_LOGO_VIEWBOX.width;
    const y = radicalInverse(attempt, 3) * WORKSPAI_LOGO_VIEWBOX.height;
    if (accepts(x, y)) {
      samples.push([x, y]);
    }
  }
  return samples;
}

function layoutWorkspaceGraphWorkspai(
  requestId: number,
  nodes: GraphLayoutNode[],
  width: number,
  height: number
): GraphLayoutResult {
  const ordered = stableNodes(nodes);
  const dotCount = ordered.length >= 2 ? Math.max(1, Math.round(ordered.length * 0.075)) : 0;
  const mainCount = ordered.length - dotCount;
  const mainSamples = sampleWorkspaiRegion(mainCount, 1, (x, y) =>
    pointInPolygon(x, y, WORKSPAI_LOGO_OUTLINE)
  );
  const dotSamples = sampleWorkspaiRegion(dotCount, 17, (x, y) =>
    Boolean(
      x >= WORKSPAI_LOGO_DOT.left &&
      x <= WORKSPAI_LOGO_DOT.right &&
      y >= WORKSPAI_LOGO_DOT.top &&
      y <= WORKSPAI_LOGO_DOT.bottom
    )
  );
  const samples = [...mainSamples, ...dotSamples];
  const scale = workspaceGraphWorkspaiLogoScale(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  return {
    requestId,
    width,
    height,
    points: ordered.map((node, index) => {
      const [logoX, logoY] = samples[index] ?? [WORKSPAI_LOGO_VIEWBOX.width / 2, 400];
      const seed = hash(`${node.id}:workspai-depth`);
      return {
        id: node.id,
        x: centerX + (logoX - WORKSPAI_LOGO_VIEWBOX.width / 2) * scale,
        y: centerY + (logoY - WORKSPAI_LOGO_VIEWBOX.height / 2) * scale,
        z: ((seed % 101) - 50) * Math.min(width, height) * 0.0012,
      };
    }),
  };
}
