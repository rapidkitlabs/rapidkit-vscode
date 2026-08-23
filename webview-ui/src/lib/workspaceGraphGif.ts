export type WorkspaceGraphGifFrame = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export const WORKSPACE_GRAPH_GIF_DEFAULTS = Object.freeze({
  width: 960,
  height: 540,
  frameCount: 60,
  delayCentiseconds: 20,
  capturePaddingRatio: 0.06,
});

export const WORKSPACE_GRAPH_MP4_DEFAULTS = Object.freeze({
  width: 1920,
  height: 1080,
  frameCount: 60,
  capturePaddingRatio: 0.06,
});

export const WORKSPACE_GRAPH_GIF_PACES = Object.freeze([
  { id: 'fast', label: 'Fast', delayCentiseconds: 10, durationSeconds: 6 },
  { id: 'standard', label: 'Standard', delayCentiseconds: 14, durationSeconds: 8.4 },
  { id: 'calm', label: 'Calm', delayCentiseconds: 20, durationSeconds: 12 },
  { id: 'slow', label: 'Slow', delayCentiseconds: 30, durationSeconds: 18 },
] as const);

class ByteWriter {
  private readonly values: number[] = [];

  byte(value: number): void {
    this.values.push(value & 0xff);
  }

  word(value: number): void {
    this.byte(value);
    this.byte(value >>> 8);
  }

  ascii(value: string): void {
    for (let index = 0; index < value.length; index += 1) {
      this.byte(value.charCodeAt(index));
    }
  }

  bytes(values: ArrayLike<number>): void {
    for (let index = 0; index < values.length; index += 1) {
      this.byte(values[index]);
    }
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.values);
  }
}

type QuantizedColor = { r: number; g: number; b: number; count: number };
type ColorBox = { colors: QuantizedColor[]; count: number; score: number };

const GIF_HISTOGRAM_BITS = 5;
const GIF_HISTOGRAM_SIZE = 1 << (GIF_HISTOGRAM_BITS * 3);
const GIF_MAX_PALETTE_SAMPLES = 300_000;
const ORDERED_DITHER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

function histogramKey(red: number, green: number, blue: number): number {
  return ((red >>> 3) << 10) | ((green >>> 3) << 5) | (blue >>> 3);
}

function buildColorBox(colors: QuantizedColor[]): ColorBox {
  let minRed = 255;
  let maxRed = 0;
  let minGreen = 255;
  let maxGreen = 0;
  let minBlue = 255;
  let maxBlue = 0;
  let count = 0;
  for (const color of colors) {
    minRed = Math.min(minRed, color.r);
    maxRed = Math.max(maxRed, color.r);
    minGreen = Math.min(minGreen, color.g);
    maxGreen = Math.max(maxGreen, color.g);
    minBlue = Math.min(minBlue, color.b);
    maxBlue = Math.max(maxBlue, color.b);
    count += color.count;
  }
  const range = Math.max(maxRed - minRed, (maxGreen - minGreen) * 1.12, maxBlue - minBlue);
  return { colors, count, score: colors.length > 1 ? range * Math.sqrt(count) : 0 };
}

function splitColorBox(box: ColorBox): [ColorBox, ColorBox] | null {
  if (box.colors.length < 2) {
    return null;
  }
  const ranges = (['r', 'g', 'b'] as const).map((channel) => ({
    channel,
    range:
      Math.max(...box.colors.map((color) => color[channel])) -
      Math.min(...box.colors.map((color) => color[channel])),
  }));
  ranges.find((value) => value.channel === 'g')!.range *= 1.12;
  const channel = ranges.sort((left, right) => right.range - left.range)[0].channel;
  const sorted = [...box.colors].sort((left, right) => left[channel] - right[channel]);
  const midpoint = box.count / 2;
  let accumulated = 0;
  let splitIndex = 1;
  for (; splitIndex < sorted.length; splitIndex += 1) {
    accumulated += sorted[splitIndex - 1].count;
    if (accumulated >= midpoint) {
      break;
    }
  }
  splitIndex = Math.max(1, Math.min(sorted.length - 1, splitIndex));
  return [buildColorBox(sorted.slice(0, splitIndex)), buildColorBox(sorted.slice(splitIndex))];
}

function buildAdaptivePalette(frames: WorkspaceGraphGifFrame[]): Uint8Array {
  const counts = new Uint32Array(GIF_HISTOGRAM_SIZE);
  const redSums = new Float64Array(GIF_HISTOGRAM_SIZE);
  const greenSums = new Float64Array(GIF_HISTOGRAM_SIZE);
  const blueSums = new Float64Array(GIF_HISTOGRAM_SIZE);
  const totalPixels = frames.reduce((total, frame) => total + frame.width * frame.height, 0);
  const stride = Math.max(1, Math.ceil(totalPixels / GIF_MAX_PALETTE_SAMPLES));
  let globalPixel = 0;
  for (const frame of frames) {
    for (let offset = 0; offset < frame.data.length; offset += 4, globalPixel += 1) {
      if (globalPixel % stride !== 0) {
        continue;
      }
      const red = frame.data[offset];
      const green = frame.data[offset + 1];
      const blue = frame.data[offset + 2];
      const key = histogramKey(red, green, blue);
      counts[key] += 1;
      redSums[key] += red;
      greenSums[key] += green;
      blueSums[key] += blue;
    }
  }
  const colors: QuantizedColor[] = [];
  for (let key = 0; key < GIF_HISTOGRAM_SIZE; key += 1) {
    const count = counts[key];
    if (!count) {
      continue;
    }
    colors.push({
      r: redSums[key] / count,
      g: greenSums[key] / count,
      b: blueSums[key] / count,
      count,
    });
  }
  const boxes = [buildColorBox(colors.length ? colors : [{ r: 0, g: 0, b: 0, count: 1 }])];
  while (boxes.length < 256) {
    boxes.sort((left, right) => right.score - left.score);
    const candidate = boxes.shift();
    if (!candidate || candidate.score === 0) {
      if (candidate) {
        boxes.unshift(candidate);
      }
      break;
    }
    const split = splitColorBox(candidate);
    if (!split) {
      boxes.unshift(candidate);
      break;
    }
    boxes.push(...split);
  }
  const palette = new Uint8Array(256 * 3);
  boxes.forEach((box, index) => {
    let red = 0;
    let green = 0;
    let blue = 0;
    for (const color of box.colors) {
      red += color.r * color.count;
      green += color.g * color.count;
      blue += color.b * color.count;
    }
    palette[index * 3] = Math.round(red / box.count);
    palette[index * 3 + 1] = Math.round(green / box.count);
    palette[index * 3 + 2] = Math.round(blue / box.count);
  });
  for (let index = boxes.length; index < 256; index += 1) {
    const source = Math.max(0, boxes.length - 1) * 3;
    palette[index * 3] = palette[source];
    palette[index * 3 + 1] = palette[source + 1];
    palette[index * 3 + 2] = palette[source + 2];
  }
  return palette;
}

function buildPaletteLookup(palette: Uint8Array): Uint8Array {
  const lookup = new Uint8Array(GIF_HISTOGRAM_SIZE);
  for (let key = 0; key < GIF_HISTOGRAM_SIZE; key += 1) {
    const red = (((key >>> 10) & 31) << 3) + 4;
    const green = (((key >>> 5) & 31) << 3) + 4;
    const blue = ((key & 31) << 3) + 4;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < 256; index += 1) {
      const redDelta = red - palette[index * 3];
      const greenDelta = green - palette[index * 3 + 1];
      const blueDelta = blue - palette[index * 3 + 2];
      const distance =
        redDelta * redDelta * 0.26 + greenDelta * greenDelta * 0.55 + blueDelta * blueDelta * 0.19;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    lookup[key] = bestIndex;
  }
  return lookup;
}

function rgbaToAdaptiveIndexed(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  lookup: Uint8Array
): Uint8Array {
  const expectedPixels = width * height;
  if (data.length !== expectedPixels * 4) {
    throw new Error('GIF frame dimensions do not match its RGBA pixel buffer.');
  }
  const indexed = new Uint8Array(expectedPixels);
  for (let y = 0, pixel = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, pixel += 1) {
      const offset = pixel * 4;
      const sourceRed = data[offset];
      const sourceGreen = data[offset + 1];
      const sourceBlue = data[offset + 2];
      const maximum = Math.max(sourceRed, sourceGreen, sourceBlue);
      const minimum = Math.min(sourceRed, sourceGreen, sourceBlue);
      const adjustment =
        maximum > 48 && maximum - minimum > 16
          ? (ORDERED_DITHER[(y & 3) * 4 + (x & 3)] - 7.5) * 0.42
          : 0;
      const red = Math.max(0, Math.min(255, sourceRed + adjustment));
      const green = Math.max(0, Math.min(255, sourceGreen + adjustment));
      const blue = Math.max(0, Math.min(255, sourceBlue + adjustment));
      indexed[pixel] = lookup[histogramKey(red, green, blue)];
    }
  }
  return indexed;
}

function encodeLzw(indexed: Uint8Array): Uint8Array {
  const minimumCodeSize = 8;
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let nextCode = endCode + 1;
  let codeSize = minimumCodeSize + 1;
  let currentByte = 0;
  let bitCount = 0;
  const output: number[] = [];
  let dictionary = new Map<number, number>();

  const writeCode = (code: number) => {
    currentByte |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(currentByte & 0xff);
      currentByte >>>= 8;
      bitCount -= 8;
    }
  };
  const reset = () => {
    dictionary = new Map<number, number>();
    nextCode = endCode + 1;
    codeSize = minimumCodeSize + 1;
  };

  writeCode(clearCode);
  if (!indexed.length) {
    writeCode(endCode);
  } else {
    let prefix = indexed[0];
    for (let index = 1; index < indexed.length; index += 1) {
      const suffix = indexed[index];
      const key = prefix * 256 + suffix;
      const known = dictionary.get(key);
      if (known !== undefined) {
        prefix = known;
        continue;
      }
      writeCode(prefix);
      if (nextCode < 4096) {
        dictionary.set(key, nextCode);
        nextCode += 1;
        // The decoder grows its dictionary after consuming the following code,
        // so the encoder changes width one allocation later to remain bit-aligned.
        if (nextCode > 1 << codeSize && codeSize < 12) {
          codeSize += 1;
        }
      } else {
        writeCode(clearCode);
        reset();
      }
      prefix = suffix;
    }
    writeCode(prefix);
    writeCode(endCode);
  }
  if (bitCount > 0) {
    output.push(currentByte & 0xff);
  }
  return Uint8Array.from(output);
}

function writeSubBlocks(writer: ByteWriter, data: Uint8Array): void {
  for (let offset = 0; offset < data.length; offset += 255) {
    const length = Math.min(255, data.length - offset);
    writer.byte(length);
    writer.bytes(data.subarray(offset, offset + length));
  }
  writer.byte(0);
}

export function encodeWorkspaceGraphGif(
  frames: WorkspaceGraphGifFrame[],
  options: { delayCentiseconds?: number; repeat?: number } = {}
): Uint8Array {
  if (!frames.length) {
    throw new Error('At least one graph frame is required for GIF export.');
  }
  const { width, height } = frames[0];
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('GIF dimensions must be positive integers.');
  }
  if (frames.some((frame) => frame.width !== width || frame.height !== height)) {
    throw new Error('Every GIF frame must use identical dimensions.');
  }
  const delay = Math.max(2, Math.min(1000, Math.round(options.delayCentiseconds ?? 8)));
  const repeat = Math.max(0, Math.min(65535, Math.round(options.repeat ?? 0)));
  const palette = buildAdaptivePalette(frames);
  const paletteLookup = buildPaletteLookup(palette);
  const writer = new ByteWriter();
  writer.ascii('GIF89a');
  writer.word(width);
  writer.word(height);
  writer.byte(0xf7);
  writer.byte(0);
  writer.byte(0);
  writer.bytes(palette);
  writer.byte(0x21);
  writer.byte(0xff);
  writer.byte(0x0b);
  writer.ascii('NETSCAPE2.0');
  writer.byte(0x03);
  writer.byte(0x01);
  writer.word(repeat);
  writer.byte(0);

  for (const frame of frames) {
    writer.byte(0x21);
    writer.byte(0xf9);
    writer.byte(0x04);
    writer.byte(0x00);
    writer.word(delay);
    writer.byte(0);
    writer.byte(0);
    writer.byte(0x2c);
    writer.word(0);
    writer.word(0);
    writer.word(width);
    writer.word(height);
    writer.byte(0);
    writer.byte(8);
    writeSubBlocks(
      writer,
      encodeLzw(rgbaToAdaptiveIndexed(frame.data, width, height, paletteLookup))
    );
  }
  writer.byte(0x3b);
  return writer.finish();
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}
