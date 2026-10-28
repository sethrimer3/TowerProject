import { kitImage, onSpritesLoaded } from "./kit.ts";

export type OutlineKind = "gold" | "blue" | "black";
/** Upper-left light, body and lower-right shade, on one native-pixel rim. */
export const OUTLINE_PALETTES = {
  gold: [[255, 234, 159], [225, 177, 64], [136, 88, 30]],
  blue: [[168, 225, 255], [67, 152, 233], [33, 71, 137]],
  black: [[18, 19, 24], [3, 4, 6], [0, 0, 0]],
} as const;

/** Dilate only the exterior air by one pixel. Interior holes and every
 * original sprite texel stay untouched, including translucent pixels. */
export function pixelOutline(alpha: Uint8ClampedArray, width: number, height: number, kind: OutlineKind) {
  const w = width + 2, h = height + 2, air = new Uint8Array(w * h), queue = new Uint32Array(w * h);
  const opaque = (x: number, y: number) => x >= 1 && y >= 1 && x <= width && y <= height && alpha[(y - 1) * width + x - 1] > 0;
  let head = 0, tail = 1; air[0] = 1;
  while (head < tail) {
    const i = queue[head++], x = i % w, y = Math.floor(i / w);
    for (const next of [x ? i - 1 : -1, x + 1 < w ? i + 1 : -1, y ? i - w : -1, y + 1 < h ? i + w : -1]) {
      if (next < 0 || air[next] || opaque(next % w, Math.floor(next / w))) continue;
      air[next] = 1; queue[tail++] = next;
    }
  }
  const pixels = new Uint8ClampedArray(w * h * 4), palette = OUTLINE_PALETTES[kind];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!air[y * w + x]) continue;
    let near = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near ||= opaque(x + dx, y + dy);
    if (!near) continue;
    const lit = opaque(x + 1, y) || opaque(x, y + 1) || opaque(x + 1, y + 1);
    const shade = opaque(x - 1, y) || opaque(x, y - 1) || opaque(x - 1, y - 1);
    const color = palette[lit && !shade ? 0 : shade && !lit ? 2 : 1], i = (y * w + x) * 4;
    pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255;
  }
  return pixels;
}

const cache = new Map<string, HTMLCanvasElement>();
let scratch: HTMLCanvasElement | undefined;
onSpritesLoaded(() => cache.clear());

/** Only world painters call this: interface icons keep their native art.
 * A missing image emits no outline; image arrival invalidates warm masks. */
export function drawPixelOutline(c: CanvasRenderingContext2D, id: string, kind: OutlineKind) {
  if (typeof document === "undefined") return false;
  const source = kitImage(id);
  if (!source) return false;
  const key = `${id}:${kind}`;
  let outline = cache.get(key);
  if (!outline) {
    scratch ??= document.createElement("canvas");
    scratch.width = scratch.height = 24;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(source, 0, 0, 24, 24);
    const rgba = ctx.getImageData(0, 0, 24, 24)?.data;
    if (!rgba) return false;
    const alpha = new Uint8ClampedArray(24 * 24);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    outline = document.createElement("canvas"); outline.width = outline.height = 26;
    const out = outline.getContext("2d")!, image = out.createImageData(26, 26);
    image.data.set(pixelOutline(alpha, 24, 24, kind)); out.putImageData(image, 0, 0);
    cache.set(key, outline);
  }
  c.save(); c.imageSmoothingEnabled = false; c.drawImage(outline, -1, -1, 26, 26); c.restore();
  return true;
}
