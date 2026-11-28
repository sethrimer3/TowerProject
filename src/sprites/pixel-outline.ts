import { kitImage, onSpritesLoaded } from "./kit.ts";

export type OutlineKind = "gold" | "blue" | "black" | "solid" | "green";
/** Upper-left light, body and lower-right shade, on one native-pixel rim. */
export const OUTLINE_PALETTES = {
  gold: [[255, 234, 159], [225, 177, 64], [136, 88, 30]],
  blue: [[168, 225, 255], [67, 152, 233], [33, 71, 137]],
  black: [[18, 19, 24], [3, 4, 6], [0, 0, 0]],
  /** Pure black all round, for the half-pixel props (half-props.ts). */
  solid: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
  /** One light green all round, for the Catacomb's Drop marks over the undead. */
  green: [[170, 255, 160], [170, 255, 160], [170, 255, 160]],
} as const;

/** Dilate only the exterior air by one pixel, orthogonally: an air pixel
 * joins the rim only when a sprite pixel sits beside it (not diagonally),
 * so the silhouette's outer corners stay crisp, like the enemy outline.
 * Interior holes and every original sprite texel stay untouched,
 * including translucent pixels. */
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
    const lit = opaque(x + 1, y) || opaque(x, y + 1);
    const shade = opaque(x - 1, y) || opaque(x, y - 1);
    if (!lit && !shade) continue;
    const color = palette[lit && !shade ? 0 : shade && !lit ? 2 : 1], i = (y * w + x) * 4;
    pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255;
  }
  return pixels;
}

const cache = new Map<string, HTMLCanvasElement>();
let scratch: HTMLCanvasElement | undefined;
onSpritesLoaded(() => cache.clear());

/** Where an outlined sprite lands, in world pixels (24 a tile), and which
 * 24-pixel-wide frame of a horizontal sheet it shows. */
export type OutlineSpot = { x?: number; y?: number; w?: number; h?: number; frame?: number };

/** Only world painters call this: interface icons keep their native art.
 * The sprite is rasterized at the size it is drawn, so the rim is one world
 * pixel wide whatever the art's own size.
 * A missing image emits no outline; image arrival invalidates warm masks. */
export function drawPixelOutline(c: CanvasRenderingContext2D, id: string, kind: OutlineKind, { x = 0, y = 0, w = 24, h = 24, frame }: OutlineSpot = {}) {
  if (typeof document === "undefined") return false;
  const source = kitImage(id);
  if (!source) return false;
  const width = Math.max(1, Math.round(w)), height = Math.max(1, Math.round(h));
  const key = `${id}:${kind}:${width}x${height}:${frame ?? ""}`;
  let outline = cache.get(key);
  if (!outline) {
    scratch ??= document.createElement("canvas");
    scratch.width = width; scratch.height = height;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    if (frame === undefined) ctx.drawImage(source, 0, 0, width, height);
    else ctx.drawImage(source, frame * 24, 0, 24, 24, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height)?.data;
    if (!rgba) return false;
    const alpha = new Uint8ClampedArray(width * height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    outline = document.createElement("canvas"); outline.width = width + 2; outline.height = height + 2;
    const out = outline.getContext("2d")!, image = out.createImageData(width + 2, height + 2);
    image.data.set(pixelOutline(alpha, width, height, kind)); out.putImageData(image, 0, 0);
    if (cache.size >= 256) cache.clear();
    cache.set(key, outline);
  }
  c.save(); c.imageSmoothingEnabled = false; c.drawImage(outline, x - 1, y - 1, w + 2, h + 2); c.restore();
  return true;
}
