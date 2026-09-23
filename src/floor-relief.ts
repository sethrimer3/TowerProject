import type { Torch } from "./entities.ts";
import { LIGHTING_CONFIG, getTorchFlicker } from "./lighting.ts";

/** Torch-driven bump lighting for pixel-art floor sprites.
 *
 * Each floor sprite's luminance is treated as a height map: dark grout and
 * cracks are low, block faces are high. From that we bake, once per sprite,
 * crisp 1px relief layers for the four cardinal light directions:
 *  - highlight: a block edge whose torch-side neighbour is a groove (the
 *    groove wall faces the flame, so it catches light);
 *  - shadow: the groove pixel tucked under the torch-side lip, plus a softer
 *    darkening of block edges that face away from the flame;
 *  - shadowFar: the second groove pixel, only shown at grazing angles so
 *    grooves read deeper toward the edge of the light pool.
 * At draw time each lit floor tile blends the layers facing its torches,
 * weighted by direction, falloff, and grazing angle. */

export const RELIEF_SIZE = 24;
/** Direction toward the torch, in tile pixel space (y grows downward). */
export const RELIEF_DIRS = [
  { key: "e", dx: 1, dy: 0 },
  { key: "w", dx: -1, dy: 0 },
  { key: "n", dx: 0, dy: -1 },
  { key: "s", dx: 0, dy: 1 },
] as const;
export type ReliefDir = (typeof RELIEF_DIRS)[number]["key"];

export type ReliefMasks = { highlight: Float32Array; shadow: Float32Array; shadowFar: Float32Array };

/** 1 for raised pixels, 0 for grooves. Threshold sits between the area-one
 * grout (~lum 28) and block face (~lum 49) colours; fully transparent
 * pixels count as grooves. */
export function heightMap(rgba: Uint8ClampedArray, size = RELIEF_SIZE, threshold = LIGHTING_CONFIG.relief.heightThreshold) {
  const h = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const k = i * 4;
    const lum = rgba[k] * 0.3 + rgba[k + 1] * 0.59 + rgba[k + 2] * 0.11;
    h[i] = rgba[k + 3] > 0 && lum > threshold ? 1 : 0;
  }
  return h;
}

/** Bakes the per-direction relief masks. Pixels beyond the tile edge count as
 * grooves, matching the grout ring every floor sprite is framed by. */
export function bakeReliefMasks(h: Uint8Array, dx: number, dy: number, size = RELIEF_SIZE): ReliefMasks {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? 0 : h[y * size + x]);
  const highlight = new Float32Array(size * size);
  const shadow = new Float32Array(size * size);
  const shadowFar = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const here = at(x, y), toward = at(x + dx, y + dy), away = at(x - dx, y - dy);
      if (here) {
        if (!toward) highlight[i] = 1;
        else if (!away) shadow[i] = 0.5;
      } else if (toward) shadow[i] = 1;
      else if (at(x + dx * 2, y + dy * 2)) shadowFar[i] = 1;
    }
  return { highlight, shadow, shadowFar };
}

/** How strongly each cardinal relief layer applies for one torch/tile pair.
 * Returns null when the tile gets no relief from this torch. */
export function reliefWeights(
  tileX: number,
  tileY: number,
  torch: Pick<Torch, "x" | "y" | "lightRadius" | "baseIntensity">,
  flicker = 1,
) {
  const cfg = LIGHTING_CONFIG.relief;
  // World y grows upward; tile pixel space grows downward.
  const wx = torch.x - tileX, wy = torch.y - tileY;
  const d = Math.hypot(wx, wy);
  const radius = torch.lightRadius * cfg.radiusScale;
  if (d === 0 || d >= radius) return null;
  const falloff = Math.pow(1 - d / radius, cfg.falloffPower);
  // Light from a flame at height h skims the floor more steeply with
  // distance: directly beneath it the floor reads flat, farther out the
  // relief rises. Distances are tile-center to tile-center.
  const grazing = d / Math.hypot(d, cfg.torchHeight);
  const strength = cfg.strength * falloff * grazing * flicker * (torch.baseIntensity / LIGHTING_CONFIG.torch.defaultIntensity);
  const ux = wx / d, uy = -wy / d;
  return {
    e: Math.max(0, ux) * strength,
    w: Math.max(0, -ux) * strength,
    n: Math.max(0, -uy) * strength,
    s: Math.max(0, uy) * strength,
    /** Second shadow pixel fades in only at grazing angles. */
    far: Math.min(1, Math.max(0, (grazing - cfg.longShadowStart) / (1 - cfg.longShadowStart))),
  };
}

/** Even-odd point-in-polygon test against a torch's cached visibility polygon. */
export function insidePolygon(px: number, py: number, poly: { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

type BakedLayers = Record<ReliefDir, { highlight: HTMLCanvasElement; shadow: HTMLCanvasElement; shadowFar: HTMLCanvasElement }>;
const baked = new Map<HTMLImageElement, BakedLayers | null>();

function maskCanvas(mask: Float32Array, [r, g, b]: readonly number[]) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = RELIEF_SIZE;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(RELIEF_SIZE, RELIEF_SIZE);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    img.data.set([r, g, b, Math.round(mask[i] * 255)], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Relief layers for a loaded sprite, baked on first use and cached. */
function layersFor(sprite: HTMLImageElement): BakedLayers | null {
  if (baked.has(sprite)) return baked.get(sprite)!;
  let result: BakedLayers | null = null;
  try {
    const cv = document.createElement("canvas");
    cv.width = cv.height = RELIEF_SIZE;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(sprite, 0, 0, RELIEF_SIZE, RELIEF_SIZE);
    const h = heightMap(ctx.getImageData(0, 0, RELIEF_SIZE, RELIEF_SIZE).data);
    const { highlightColor, shadowColor } = LIGHTING_CONFIG.relief;
    result = {} as BakedLayers;
    for (const dir of RELIEF_DIRS) {
      const m = bakeReliefMasks(h, dir.dx, dir.dy);
      result[dir.key] = {
        highlight: maskCanvas(m.highlight, highlightColor),
        shadow: maskCanvas(m.shadow, shadowColor),
        shadowFar: maskCanvas(m.shadowFar, shadowColor),
      };
    }
  } catch {
    // A tainted or unreadable sprite simply gets no relief.
  }
  baked.set(sprite, result);
  return result;
}

const litCache = new WeakMap<Torch, Map<string, boolean>>();
/** Whether a tile center is inside the torch's (static) visibility polygon. */
function torchReaches(t: Torch, x: number, y: number) {
  if (!t.visibilityPolygon || t.visibilityPolygon.length < 3) return false;
  let tiles = litCache.get(t);
  if (!tiles) litCache.set(t, (tiles = new Map()));
  const key = `${x},${y}`;
  let lit = tiles.get(key);
  if (lit === undefined) tiles.set(key, (lit = insidePolygon(x + 0.5, y + 0.5, t.visibilityPolygon)));
  return lit;
}

/** Draws torch relief for one floor tile into a context already transformed
 * to the tile's 24x24 space. */
export function drawFloorRelief(
  c: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  x: number,
  y: number,
  torches: Torch[],
  now: number,
  reduceMotion: boolean,
) {
  if (!torches.length) return;
  const cfg = LIGHTING_CONFIG.relief;
  const sums: Record<ReliefDir, { light: number; far: number }> = {
    e: { light: 0, far: 0 }, w: { light: 0, far: 0 }, n: { light: 0, far: 0 }, s: { light: 0, far: 0 },
  };
  let any = false;
  for (const t of torches) {
    const w = reliefWeights(x, y, t, getTorchFlicker(t, now, reduceMotion));
    if (!w || !torchReaches(t, x, y)) continue;
    for (const dir of RELIEF_DIRS) {
      sums[dir.key].light += w[dir.key];
      sums[dir.key].far += w[dir.key] * w.far;
    }
    any = true;
  }
  if (!any) return;
  const layers = layersFor(sprite);
  if (!layers) return;
  c.save();
  c.imageSmoothingEnabled = false;
  for (const dir of RELIEF_DIRS) {
    const { light, far } = sums[dir.key];
    if (light < 0.01) continue;
    const l = layers[dir.key];
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = Math.min(1, light * cfg.shadowStrength);
    c.drawImage(l.shadow, 0, 0, RELIEF_SIZE, RELIEF_SIZE);
    if (far > 0.01) {
      c.globalAlpha = Math.min(1, far * cfg.shadowStrength * cfg.longShadowStrength);
      c.drawImage(l.shadowFar, 0, 0, RELIEF_SIZE, RELIEF_SIZE);
    }
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = Math.min(1, light * cfg.highlightStrength);
    c.drawImage(l.highlight, 0, 0, RELIEF_SIZE, RELIEF_SIZE);
  }
  c.restore();
}
