import {
  bytesToDataUrl,
  encodeWorkspaceGraphGif,
  type WorkspaceGraphGifFrame,
} from './workspaceGraphGif';

export const ANALYSIS_CAPTURE_LIMIT = 36;
const WIDTH = 960;
const HEIGHT = 600;

// Rasterize only the analysis DOM. No desktop capture, network, or repository content execution.
// Inline computed styles retain the actual VS Code theme; canvas layers become frozen images.
function cloneRenderedElement(source: Element): Element {
  let clone: Element;
  if (source instanceof HTMLCanvasElement) {
    const image = document.createElement('img');
    image.src = source.toDataURL('image/png');
    clone = image;
  } else {
    clone = source.cloneNode(false) as Element;
  }
  const computed = getComputedStyle(source);
  const style = (clone as HTMLElement | SVGElement).style;
  for (const property of Array.from(computed)) {
    const value = computed.getPropertyValue(property);
    // Analysis has no remote visual assets; omit references that would taint a canvas.
    if (!value.includes('url(')) {
      style.setProperty(property, value);
    }
  }
  style.setProperty('animation', 'none');
  style.setProperty('transition', 'none');
  for (const attribute of Array.from(clone.attributes)) {
    if (/^on/i.test(attribute.name)) {
      clone.removeAttribute(attribute.name);
    }
  }
  if (source instanceof HTMLInputElement) {
    clone.setAttribute('value', source.value);
  }
  if (!(source instanceof HTMLCanvasElement)) {
    for (const child of Array.from(source.childNodes)) {
      if (child instanceof Element) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'VIDEO'].includes(child.tagName)) {
          continue;
        }
        clone.appendChild(cloneRenderedElement(child));
      } else if (child.nodeType === Node.TEXT_NODE) {
        clone.appendChild(child.cloneNode());
      }
    }
  }
  return clone;
}

export async function captureAnalysisSection(source: HTMLElement, offsetY = 0): Promise<string> {
  const width = Math.max(1, source.getBoundingClientRect().width);
  const viewportHeight = (width * HEIGHT) / WIDTH;
  const clone = cloneRenderedElement(source) as HTMLElement;
  clone.style.margin = '0';
  clone.style.width = `${width}px`;
  clone.style.maxWidth = 'none';
  clone.style.transform = `translateY(-${offsetY}px)`;
  clone.style.position = 'relative';
  const xml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${width} ${viewportHeight}"><foreignObject width="${width}" height="${Math.max(source.scrollHeight, viewportHeight) + offsetY}">${xml}</foreignObject></svg>`;
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas recording is unavailable.');
  }
  context.fillStyle = getComputedStyle(document.body).backgroundColor || '#10161c';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.drawImage(image, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function encodeAnalysisRecording(snapshots: string[]) {
  if (!snapshots.length) {
    throw new Error('Start an analysis with recording enabled first.');
  }
  const frames: WorkspaceGraphGifFrame[] = [];
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas encoding is unavailable.');
  }
  for (const snapshot of snapshots.slice(0, ANALYSIS_CAPTURE_LIMIT)) {
    const image = new Image();
    image.src = snapshot;
    await image.decode();
    context.drawImage(image, 0, 0);
    frames.push({
      width: WIDTH,
      height: HEIGHT,
      data: context.getImageData(0, 0, WIDTH, HEIGHT).data,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const gif = encodeWorkspaceGraphGif(frames, { delayCentiseconds: 120, repeat: 0 });
  return {
    gifDataUrl: bytesToDataUrl(gif, 'image/gif'),
    width: WIDTH,
    height: HEIGHT,
    frameCount: frames.length,
  };
}
