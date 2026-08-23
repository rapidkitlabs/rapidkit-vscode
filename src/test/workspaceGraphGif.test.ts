import { describe, expect, it } from 'vitest';

import {
  bytesToDataUrl,
  encodeWorkspaceGraphGif,
  WORKSPACE_GRAPH_GIF_DEFAULTS,
  WORKSPACE_GRAPH_GIF_PACES,
} from '../../webview-ui/src/lib/workspaceGraphGif.js';

function solidFrame(width: number, height: number, rgba: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data.set(rgba, offset);
  }
  return { width, height, data };
}

function countGifFrames(bytes: Uint8Array): number {
  let offset = 13 + 256 * 3;
  let frames = 0;
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      offset += 1;
      while (offset < bytes.length) {
        const length = bytes[offset++];
        if (length === 0) break;
        offset += length;
      }
      continue;
    }
    if (marker !== 0x2c) throw new Error(`Unexpected GIF marker ${marker}`);
    frames += 1;
    offset += 9;
    offset += 1;
    while (offset < bytes.length) {
      const length = bytes[offset++];
      if (length === 0) break;
      offset += length;
    }
  }
  return frames;
}

describe('Workspace Graph 360 GIF encoder', () => {
  it('uses a presentation-ready HD frame and a deliberately paced orbit', () => {
    expect(WORKSPACE_GRAPH_GIF_DEFAULTS).toEqual({
      width: 960,
      height: 540,
      frameCount: 60,
      delayCentiseconds: 20,
      capturePaddingRatio: 0.06,
    });
  });

  it('offers bounded pace choices without changing the 60-angle camera path', () => {
    expect(WORKSPACE_GRAPH_GIF_PACES).toEqual([
      { id: 'fast', label: 'Fast', delayCentiseconds: 10, durationSeconds: 6 },
      { id: 'standard', label: 'Standard', delayCentiseconds: 14, durationSeconds: 8.4 },
      { id: 'calm', label: 'Calm', delayCentiseconds: 20, durationSeconds: 12 },
      { id: 'slow', label: 'Slow', delayCentiseconds: 30, durationSeconds: 18 },
    ]);
  });

  it('produces a looping multi-frame GIF89a stream', () => {
    const bytes = encodeWorkspaceGraphGif(
      [solidFrame(3, 2, [0, 180, 220, 255]), solidFrame(3, 2, [160, 90, 240, 255])],
      { delayCentiseconds: 8, repeat: 0 }
    );

    expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe('GIF89a');
    expect(bytes[6] | (bytes[7] << 8)).toBe(3);
    expect(bytes[8] | (bytes[9] << 8)).toBe(2);
    expect(new TextDecoder().decode(bytes).includes('NETSCAPE2.0')).toBe(true);
    expect(countGifFrames(bytes)).toBe(2);
    expect(bytes.at(-1)).toBe(0x3b);
    expect(bytesToDataUrl(bytes, 'image/gif')).toMatch(/^data:image\/gif;base64,/);
  });

  it('builds an adaptive palette that preserves dark surfaces and graph accents', () => {
    const colors: Array<[number, number, number, number]> = [
      [17, 21, 27, 255],
      [34, 211, 238, 255],
      [147, 197, 253, 255],
      [168, 85, 247, 255],
    ];
    const bytes = encodeWorkspaceGraphGif(colors.map((color) => solidFrame(4, 4, color)));
    const palette = bytes.subarray(13, 13 + 256 * 3);
    const nearestDistance = ([red, green, blue]: [number, number, number, number]) => {
      let nearest = Number.POSITIVE_INFINITY;
      for (let index = 0; index < palette.length; index += 3) {
        nearest = Math.min(
          nearest,
          Math.hypot(red - palette[index], green - palette[index + 1], blue - palette[index + 2])
        );
      }
      return nearest;
    };

    expect(colors.every((color) => nearestDistance(color) < 3)).toBe(true);
  });

  it('rejects empty and dimensionally inconsistent frame sets', () => {
    expect(() => encodeWorkspaceGraphGif([])).toThrow(/at least one/i);
    expect(() =>
      encodeWorkspaceGraphGif([solidFrame(2, 2, [0, 0, 0, 255]), solidFrame(3, 2, [0, 0, 0, 255])])
    ).toThrow(/identical dimensions/i);
  });
});
