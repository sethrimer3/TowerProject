import { TILE_PX, waterAt, type Blade, type Crate, type DecorSource, type Drip } from "./decor.ts";

/** Painting shared by decor's live passes (ground, foreground, and the
 * mirrored copy in the water): crates, tall grass, ripple rings and drips,
 * all in world pixels (tile (x, y) starts at (24x, -24y)). */

/** Crate woods by tone: light, mid, dark, outline. */
export const WOOD = [
  ["#a67a4c", "#81593a", "#583b24", "#2a1a0e"],
  ["#9a7a55", "#765a3e", "#4f3a27", "#271a10"],
  ["#8e6440", "#6c4a2f", "#4a311e", "#24160c"],
];
export const GRASS = ["#335e35", "#427442", "#548c4a", "#6aa556", "#8cc46a"];
/** Seconds a ceiling drip takes to fall. */
export const DRIP_FALL = 0.55;

/** Rects grouped by color, filled with one path each. */
export class PixelBatch {
  private groups = new Map<string, number[]>();
  add(color: string, x: number, y: number, w = 1, h = 1) {
    let g = this.groups.get(color);
    if (!g) this.groups.set(color, (g = []));
    g.push(x, y, w, h);
  }
  flush(c: CanvasRenderingContext2D) {
    for (const [color, r] of this.groups) {
      c.fillStyle = color;
      c.beginPath();
      for (let k = 0; k < r.length; k += 4) c.rect(r[k], r[k + 1], r[k + 2], r[k + 3]);
      c.fill();
    }
    this.groups.clear();
  }
}

/** Multiplies a color's alpha (hex or rgba) by `a`. */
export function withAlpha(color: string, a: number) {
  if (color.startsWith("#")) {
    const h = color.slice(1);
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a.toFixed(2)})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return color;
  const parts = m[1].split(",").map((s) => s.trim());
  const base = parts.length > 3 ? Number(parts[3]) : 1;
  return `rgba(${parts[0]},${parts[1]},${parts[2]},${(base * a).toFixed(2)})`;
}

// ---------------------------------------------------------------- crates

/** Where a box is drawn: its left edge and top (after any lift), in world pixels. */
type BoxAt = { bx: number; top: number };

/** The crates on tile (x, y), lower and nearer ones first. Once broken,
 * only a few splintered boards remain where each stood. */
export function drawCrates(c: CanvasRenderingContext2D, x: number, y: number, crates: Crate[], broken: boolean) {
  const ox = x * TILE_PX, oy = -y * TILE_PX;
  const sorted = [...crates].sort((a, b) => a.lift - b.lift || a.y - b.y);
  for (const k of sorted) {
    const wood = WOOD[k.tone % WOOD.length];
    const at = { bx: ox + k.x, top: oy + k.y - k.lift };
    if (broken) {
      if (!k.lift) drawWreck(c, k, at, wood);
      continue;
    }
    if (!k.lift) {
      c.fillStyle = "rgba(0,0,0,0.32)";
      c.fillRect(at.bx + 1, at.top + k.h - 1, k.w, 2);
    }
    if (k.kind === "barrel") drawBarrel(c, k, at, wood);
    else drawCrate(c, k, at, wood);
  }
}

function drawWreck(c: CanvasRenderingContext2D, k: Crate, { bx, top: by }: BoxAt, wood: string[]) {
  c.fillStyle = "rgba(0,0,0,0.25)";
  c.fillRect(bx, by + k.h - 3, k.w, 2);
  c.fillStyle = wood[2];
  c.fillRect(bx, by + k.h - 3, k.w - 2, 1);
  c.fillStyle = wood[1];
  c.fillRect(bx + 1, by + k.h - 2, 3, 1);
  c.fillRect(bx + k.w - 3, by + k.h - 4, 1, 2);
}

/** Round-ish lid over a banded body. */
function drawBarrel(c: CanvasRenderingContext2D, k: Crate, { bx, top }: BoxAt, wood: string[]) {
  c.fillStyle = wood[3];
  c.fillRect(bx + 1, top, k.w - 2, k.h);
  c.fillRect(bx, top + 1, k.w, k.h - 2);
  c.fillStyle = wood[1];
  c.fillRect(bx + 1, top + 1, k.w - 2, k.h - 2);
  c.fillStyle = wood[0];
  c.fillRect(bx + 2, top + 1, k.w - 4, k.h - 6);
  c.fillStyle = wood[2];
  c.fillRect(bx + 1, top + k.h - 5, k.w - 2, 3);
  c.fillStyle = "#6f7378";
  c.fillRect(bx + 1, top + k.h - 5, k.w - 2, 1);
  c.fillRect(bx + 2, top + 3, k.w - 4, 1);
}

/** Lid (with planks) and a darker front face, braced across the lid. */
function drawCrate(c: CanvasRenderingContext2D, k: Crate, { bx, top }: BoxAt, wood: string[]) {
  c.fillStyle = wood[3];
  c.fillRect(bx, top, k.w, k.h);
  c.fillStyle = wood[1];
  c.fillRect(bx + 1, top + 1, k.w - 2, k.h - 5);
  c.fillStyle = wood[0];
  for (let r = top + 1; r < top + k.h - 4; r += 3) c.fillRect(bx + 1, r, k.w - 2, 1);
  c.fillStyle = wood[2];
  c.fillRect(bx + 1, top + k.h - 4, k.w - 2, 3);
  c.fillStyle = wood[2];
  for (let s = 0; s < k.w - 3; s++) {
    const yy = top + 1 + Math.round((s * (k.h - 6)) / Math.max(1, k.w - 4));
    c.fillRect(bx + 1 + s, yy, 1, 1);
  }
  c.fillStyle = "rgba(255,240,210,0.25)";
  c.fillRect(bx + 1, top + 1, k.w - 2, 1);
}

// ---------------------------------------------------------------- tall grass

/** How one tile's tall grass moves this frame. */
export type Sway = {
  /** The tile's origin in world pixels. */
  ox: number; oy: number;
  /** Seconds, for the breeze and the wobble. */
  t: number;
  /** Recent disturbance (0..1), for the wobble. */
  stir: number;
  /** The hero's feet in world pixels: blades part around them. */
  heroGx: number; heroGy: number;
  breeze: boolean;
};
/** A world-pixel box: blades rooted in it (or reaching into it) are drawn. */
export type BladeArea = { gx0: number; gx1: number; gy0: number; gy1: number };

/** Tall grass blades, parting around the hero. `only` limits drawing to
 * blades over the hero's sprite (the foreground pass). */
export function drawBlades(px: PixelBatch, blades: Blade[], sway: Sway, only: BladeArea | null) {
  for (const b of blades) {
    const gx = sway.ox + b.i, gy = sway.oy + b.j;
    if (only && !reaches(only, gx, gy - b.h, gy)) continue;
    paintBlade(px, b, gx, gy, bend(b, gx, gy, sway));
  }
}

const reaches = (a: BladeArea, gx: number, tipGy: number, rootGy: number) =>
  gx >= a.gx0 && gx <= a.gx1 && rootGy >= a.gy0 && tipGy <= a.gy1;

/** A blade's lean and height: pushed aside and pressed down where the hero
 * stands, swayed by the breeze, wobbling after being walked through. */
function bend(b: Blade, gx: number, gy: number, sway: Sway) {
  const dx = gx - sway.heroGx, dy = gy - sway.heroGy, dist = Math.hypot(dx, dy * 1.4);
  const near = Math.max(0, 1 - dist / 15);
  const push = near * 5 * (dx >= 0 ? 1 : -1);
  const height = Math.max(2, Math.round(b.h * (1 - near * 0.45)));
  const breeze = sway.breeze ? Math.sin(sway.t * 1.3 + b.phase + gx * 0.05) * 0.55 : 0;
  const wobble = sway.stir * Math.sin(sway.t * 13 + b.phase) * 2.2;
  return { lean: b.lean + push + breeze + wobble, height };
}

/** One blade as vertical runs of pixels: base shaded, tip bright. */
function paintBlade(px: PixelBatch, b: Blade, gx: number, gy: number, { lean, height }: { lean: number; height: number }) {
  let lastX = gx, runStart = 0;
  for (let k = 0; k <= height; k++) {
    const bx = k === height ? NaN : gx + Math.round(lean * Math.pow(k / b.h, 1.6));
    if (bx === lastX && k !== height) continue;
    if (k > runStart) px.add(bladeColor(b, runStart, k, height), lastX, gy - k + 1, 1, k - runStart);
    runStart = k;
    lastX = bx;
  }
}

function bladeColor(b: Blade, runStart: number, k: number, height: number) {
  if (runStart === 0) return GRASS[b.color % 2];
  return k >= height - 1 ? GRASS[Math.min(4, b.color + 1)] : GRASS[b.color];
}

// ---------------------------------------------------------------- water

/** A ring on the water: center and radius in world pixels. */
export type Ring = { gx: number; gy: number; r: number };

/** A ring of pixels (flattened for the top-down view), only on water. */
export function ring(px: PixelBatch, src: DecorSource, { gx, gy, r }: Ring, color: string) {
  if (r < 0.5) {
    if (waterAt(src, gx, gy)) px.add(color, gx, gy);
    return;
  }
  const steps = Math.max(8, Math.ceil(r * 5));
  let lx = NaN, ly = NaN;
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2;
    const x = Math.round(gx + Math.cos(a) * r), y = Math.round(gy + Math.sin(a) * r * 0.62);
    if (x === lx && y === ly) continue;
    lx = x; ly = y;
    if (waterAt(src, x, y)) px.add(color, x, y);
  }
}

/** Where a tile's drip lands, in world pixels, and how far (seconds) it is
 * into its cycle: falling until DRIP_FALL, then spreading rings. */
export type DripNow = { gx: number; gy: number; local: number };
export function dripNow(x: number, y: number, drip: Drip, t: number): DripNow {
  return { gx: x * TILE_PX + drip.i, gy: -y * TILE_PX + drip.j, local: (t + drip.phase) % drip.period };
}

/** A drip's rings where it lands; the falling drop is drawn in front. */
export function dripRings(px: PixelBatch, src: DecorSource, { gx, gy, local }: DripNow) {
  if (local < DRIP_FALL) {
    // The drop's shadow sharpens as it nears the water.
    const k = local / DRIP_FALL;
    if (k > 0.4) px.add(`rgba(0,0,0,${(0.35 * k).toFixed(2)})`, gx, gy);
    return;
  }
  const age = local - DRIP_FALL;
  if (age > 1.8) return;
  const fade = 1 - age / 1.8;
  ring(px, src, { gx, gy, r: age * 11 }, `rgba(186,222,236,${(fade * 0.85).toFixed(2)})`);
  if (age > 0.3) ring(px, src, { gx, gy, r: (age - 0.3) * 11 }, `rgba(130,176,196,${(fade * 0.6).toFixed(2)})`);
  if (age < 0.18) splashDroplets(px, gx, gy, Math.round(age * 20));
}

function splashDroplets(px: PixelBatch, gx: number, gy: number, up: number) {
  for (const [dx, dy] of [[-1, -1], [1, -1], [-2, 0], [2, 0]]) px.add("rgba(200,232,244,0.9)", gx + dx * (1 + up), gy + dy - up);
}
