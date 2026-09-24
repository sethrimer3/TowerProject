import type { Torch } from "./entities.ts";
import { LIGHTING_CONFIG, computeVisibilityPolygon } from "./lighting.ts";
import { insidePolygon } from "./floor-relief.ts";

/** Baked, occlusion-aware torch glow.
 *
 * Walls never move, so each torch's light is computed once into a small
 * field (a few samples per tile), then drawn every frame as a smoothly
 * upscaled image. The field combines:
 *  - direct light: radial falloff inside the torch's visibility polygon;
 *  - bounce light: a dimmer falloff over *walking* distance, so light spills
 *    around corners and fades the further it has to bend;
 * and is box-blurred so occlusion edges become soft penumbras. */

export type LightField = {
  values: Float32Array;
  /** Field size in samples. */
  cols: number;
  rows: number;
  /** Samples per tile. */
  res: number;
  /** World x of the left edge and world y of the top edge (world y grows up). */
  left: number;
  top: number;
  /** Field size in tiles. */
  tiles: number;
};

type LightSource = Pick<Torch, "x" | "y" | "lightRadius" | "visibilityPolygon">;

export function lightFalloff(d: number, radius: number) {
  const t = 1 - d / radius;
  return t > 0 ? Math.pow(t, LIGHTING_CONFIG.glow.falloffPower) : 0;
}

/** Shortest 8-connected walking distance (no corner cutting) from the torch
 * tile to each tile in the field window. Tiny grid, so a simple O(n²)
 * Dijkstra is plenty. */
function pathDistances(torch: LightSource, reach: number, isWall: (x: number, y: number) => boolean) {
  const n = reach * 2 + 1, left = torch.x - reach, bottom = torch.y - reach;
  const dist = new Float32Array(n * n).fill(Infinity);
  const done = new Uint8Array(n * n);
  const wall = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) wall[j * n + i] = isWall(left + i, bottom + j) ? 1 : 0;
  dist[reach * n + reach] = 0;
  for (;;) {
    let best = -1;
    for (let k = 0; k < n * n; k++) if (!done[k] && dist[k] < Infinity && (best < 0 || dist[k] < dist[best])) best = k;
    if (best < 0) break;
    done[best] = 1;
    const bi = best % n, bj = (best - bi) / n;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = bi + di, j = bj + dj;
        if (i < 0 || j < 0 || i >= n || j >= n || wall[j * n + i]) continue;
        if (di && dj && (wall[bj * n + i] || wall[j * n + bi])) continue;
        const d = dist[best] + (di && dj ? Math.SQRT2 : 1);
        if (d < dist[j * n + i]) dist[j * n + i] = d;
      }
  }
  return { dist, wall, n };
}

/** Separable box blur, run twice (a cheap Gaussian approximation). */
function blur(values: Float32Array, cols: number, rows: number, radius: number) {
  if (radius < 1) return values;
  let src: Float32Array = values, dst: Float32Array = new Float32Array(values.length);
  const width = radius * 2 + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < rows; y++) {
      let acc = 0;
      for (let x = -radius; x <= radius; x++) acc += src[y * cols + Math.min(cols - 1, Math.max(0, x))];
      for (let x = 0; x < cols; x++) {
        dst[y * cols + x] = acc / width;
        acc += src[y * cols + Math.min(cols - 1, x + radius + 1)] - src[y * cols + Math.max(0, x - radius)];
      }
    }
    [src, dst] = [dst, src];
    for (let x = 0; x < cols; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += src[Math.min(rows - 1, Math.max(0, y)) * cols + x];
      for (let y = 0; y < rows; y++) {
        dst[y * cols + x] = acc / width;
        acc += src[Math.min(rows - 1, y + radius + 1) * cols + x] - src[Math.max(0, y - radius) * cols + x];
      }
    }
    [src, dst] = [dst, src];
  }
  return src;
}

/** Light intensity (0-1) around a torch, before color and flicker. */
export function torchLightField(
  torch: LightSource,
  isWall: (x: number, y: number) => boolean,
  res = LIGHTING_CONFIG.glow.resolution,
  /** Nudges the light's origin sideways (tiles); the field stays on the tile grid. */
  offsetX = 0,
): LightField {
  const cfg = LIGHTING_CONFIG.glow;
  const radius = torch.lightRadius;
  const reach = Math.ceil(radius) + 1;
  const tiles = reach * 2 + 1;
  const left = torch.x - reach, bottom = torch.y - reach, top = bottom + tiles;
  const cols = tiles * res, rows = cols;
  const ox = torch.x + 0.5 + offsetX, oy = torch.y + 0.5;
  const poly = torch.visibilityPolygon ?? [];
  const { dist, wall, n } = pathDistances(torch, reach, isWall);

  // Bounce light per tile center, sampled bilinearly below.
  const bounce = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++)
    if (!wall[k] && dist[k] < Infinity) bounce[k] = cfg.bounce * lightFalloff(dist[k] * cfg.bouncePathScale, radius);
  const bounceAt = (fx: number, fy: number) => {
    const i0 = Math.max(0, Math.min(n - 2, Math.floor(fx))), j0 = Math.max(0, Math.min(n - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - i0)), ty = Math.max(0, Math.min(1, fy - j0));
    const a = bounce[j0 * n + i0], b = bounce[j0 * n + i0 + 1];
    const c = bounce[(j0 + 1) * n + i0], d = bounce[(j0 + 1) * n + i0 + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };

  const values = new Float32Array(cols * rows);
  const floor = new Float32Array(cols * rows);
  for (let py = 0; py < rows; py++) {
    const wy = top - (py + 0.5) / res;
    for (let px = 0; px < cols; px++) {
      const wx = left + (px + 0.5) / res;
      const ti = Math.floor(wx) - left, tj = Math.floor(wy) - bottom;
      if (!wall[tj * n + ti]) floor[py * cols + px] = 1;
      const d = Math.hypot(wx - ox, wy - oy);
      if (d >= radius) continue;
      const direct = poly.length >= 3 && insidePolygon(wx, wy, poly) ? lightFalloff(d, radius) : 0;
      const indirect = bounceAt(wx - left - 0.5, wy - bottom - 0.5);
      values[py * cols + px] = Math.max(direct, indirect);
    }
  }
  // Wall-aware blur: floor samples average only with other floor samples,
  // so a torch tucked into a corner keeps its bright spot on its own tile
  // instead of being dragged into the room by the dark walls beside it.
  // Wall samples keep the plain blur, giving their faces a soft rim of light.
  const radiusPx = Math.round(res * cfg.softness);
  const lit = blur(values, cols, rows, radiusPx);
  const coverage = blur(floor.slice(), cols, rows, radiusPx);
  for (let i = 0; i < lit.length; i++)
    if (floor[i] && coverage[i] > 1e-3) lit[i] = Math.min(1, lit[i] / coverage[i]);
  return { values: lit, cols, rows, res, left, top, tiles };
}

const STOPS = LIGHTING_CONFIG.stops.map((s) => {
  const [r, g, b] = s.color.match(/\d+(\.\d+)?/g)!.map(Number);
  return { offset: s.offset, r, g, b };
});
/** Candle color for a light level (1 = core, 0 = edge). */
export function glowColor(v: number) {
  const o = 1 - Math.max(0, Math.min(1, v));
  let i = 0;
  while (i < STOPS.length - 2 && o > STOPS[i + 1].offset) i++;
  const a = STOPS[i], b = STOPS[i + 1];
  const t = (o - a.offset) / (b.offset - a.offset);
  return [a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t];
}

export type BakedLight = { canvas: HTMLCanvasElement; field: LightField };

/** Renders a light field to a small canvas: warm color, alpha = light level.
 * With an offset, walls are re-occluded from the nudged flame position, so
 * a pair of bakes can be cross-faded to sway the light without ever sliding
 * its edges over the walls. */
export function bakeTorchLight(
  torch: LightSource,
  isWall: (x: number, y: number) => boolean,
  offsetX = 0,
): BakedLight | null {
  if (typeof document === "undefined") return null;
  const source = offsetX
    ? { ...torch, visibilityPolygon: computeVisibilityPolygon({ x: torch.x + offsetX, y: torch.y, lightRadius: torch.lightRadius }, isWall) }
    : torch;
  const field = torchLightField(source, isWall, LIGHTING_CONFIG.glow.resolution, offsetX);
  const canvas = document.createElement("canvas");
  canvas.width = field.cols;
  canvas.height = field.rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(field.cols, field.rows);
  for (let i = 0; i < field.values.length; i++) {
    const v = field.values[i];
    if (v <= 0.002) continue;
    const [r, g, b] = glowColor(v);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.min(255, v * 255);
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, field };
}
