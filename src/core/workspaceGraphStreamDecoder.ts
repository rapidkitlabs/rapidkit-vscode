import type { WorkspaceGraphStreamEnvelope } from '../contracts/workspaceGraphStream.js';

const EVENT_TYPES = new Set([
  'graph.snapshot',
  'graph.delta',
  'graph.provider-progress',
  'graph.quality-changed',
  'graph.proof-invalidated',
  'graph.resync-required',
  'graph.paused',
  'graph.complete',
  'graph.heartbeat',
  'graph.error',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function parseWorkspaceGraphStreamEnvelope(
  value: unknown
): WorkspaceGraphStreamEnvelope | null {
  if (!isRecord(value) || value.schemaVersion !== 'workspace-graph-stream.v1') {
    return null;
  }
  if (typeof value.type !== 'string' || !EVENT_TYPES.has(value.type)) {
    return null;
  }
  const requiredStrings = [
    'type',
    'workspaceId',
    'sessionId',
    'modelHash',
    'graphHash',
    'generatedAt',
    'causationId',
    'correlationId',
  ];
  if (requiredStrings.some((key) => typeof value[key] !== 'string' || !value[key])) {
    return null;
  }
  if (
    !Number.isInteger(value.generation) ||
    !Number.isInteger(value.revision) ||
    !isRecord(value.payload)
  ) {
    return null;
  }
  if (
    value.type === 'graph.delta' &&
    (!Number.isInteger(value.baseRevision) ||
      typeof value.baseModelHash !== 'string' ||
      typeof value.baseGraphHash !== 'string')
  ) {
    return null;
  }
  return value as WorkspaceGraphStreamEnvelope;
}

export class WorkspaceGraphNdjsonDecoder {
  private buffer = '';
  private invalidLines = 0;

  public push(chunk: string): WorkspaceGraphStreamEnvelope[] {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    return lines.flatMap((line) => this.parseLine(line));
  }

  public flush(): WorkspaceGraphStreamEnvelope[] {
    const tail = this.buffer;
    this.buffer = '';
    return this.parseLine(tail);
  }

  public takeInvalidLines(): number {
    const count = this.invalidLines;
    this.invalidLines = 0;
    return count;
  }

  private parseLine(line: string): WorkspaceGraphStreamEnvelope[] {
    const normalized = line.trim();
    if (!normalized) {
      return [];
    }
    try {
      const event = parseWorkspaceGraphStreamEnvelope(JSON.parse(normalized));
      if (!event) {
        this.invalidLines += 1;
      }
      return event ? [event] : [];
    } catch {
      this.invalidLines += 1;
      return [];
    }
  }
}
