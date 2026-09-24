import type { Board } from "./generation.ts";
import type { Tile } from "./entities.ts";
import { tileRandom } from "./themes.ts";
import {
  decorSourceFor, FLOWER_COLORS, TILE_PX, tileDecor, waterAt,
  type Crate, type DecorSource, type Plant, type TileDecor,
} from "./decor.ts";

/** Draws the dungeon dressing planned in decor.ts, and runs its live parts:
 * crates that splinter underfoot, ripples and ceiling drips in pools, tall
 * grass that parts around the hero, glowing blooms, drifting motes.
 *
 * Static pixels (moss, water, vines, plants) are baked once per tile into a
 * 24x24 image. Everything live is drawn in world pixels: one decor pixel is
 * one of the 24 sprite units across a tile, like the hero sprite. */

export type DecorView = { left: number; bottom: number; n: number; s: number };
export type DecorGlow = { x: number; y: number; rgb: readonly number[]; radius: number; strength: number };

type Rgba = readonly [number, number, number, number];
/** Moss by [tone][level]: yellow-green and blue-green mats. */
const MOSS: Rgba[][] = [
  [[0, 0, 0, 0], [66, 106, 56, 0.5], [74, 122, 60, 0.78], [88, 142, 68, 0.9]],
  [[0, 0, 0, 0], [52, 100, 84, 0.5], [60, 116, 94, 0.78], [74, 136, 104, 0.9]],
];
const MOSS_LIGHT: Rgba[] = [[122, 176, 84, 0.95], [106, 170, 132, 0.95]];
const MOSS_DARK: Rgba[] = [[44, 76, 42, 0.85], [36, 72, 64, 0.85]];
/** Vine stem (dark, mid) and leaf (mid, light). */
const VINE: Rgba[] = [[40, 64, 34, 1], [56, 98, 46, 1], [86, 150, 62, 1], [128, 190, 86, 1]];
const WATER_DEEP: Rgba = [22, 46, 66, 0.82];
const WATER_MID: Rgba = [30, 62, 84, 0.8];
const WATER_EDGE: Rgba = [78, 124, 142, 0.72];
const WET_STONE: Rgba = [0, 0, 0, 0.2];
/** Crate woods by tone: light, mid, dark, outline. */
const WOOD = [
  ["#a67a4c", "#81593a", "#583b24", "#2a1a0e"],
  ["#9a7a55", "#765a3e", "#4f3a27", "#271a10"],
  ["#8e6440", "#6c4a2f", "#4a311e", "#24160c"],
];
const GRASS = ["#2c5230", "#3a683a", "#4a7f44", "#5e9750", "#7cb462"];
const GLOWCAP: readonly number[] = [140, 240, 170];

type Particle = {
  gx: number; gy: number; z: number; vx: number; vy: number; vz: number;
  w: number; h: number; color: string; life: number; age: number;
  kind: "splinter" | "dust" | "drop" | "leaf" | "spore";
  glow?: boolean;
};
type Ripple = { gx: number; gy: number; t0: number; life: number; speed: number };

const tkey = (x: number, y: number) => `${x},${y}`;

/** Rects grouped by color, filled with one path each. */
class PixelBatch {
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

/** Source-over blend of one pixel into an RGBA buffer. */
function blend(px: Uint8ClampedArray, i: number, j: number, c: Rgba, alpha = 1) {
  if (i < 0 || j < 0 || i >= TILE_PX || j >= TILE_PX) return;
  const a = c[3] * alpha;
  if (a <= 0) return;
  const k = (j * TILE_PX + i) * 4, da = px[k + 3] / 255, oa = a + da * (1 - a);
  for (let ch = 0; ch < 3; ch++) px[k + ch] = (c[ch] * a + px[k + ch] * da * (1 - a)) / oa;
  px[k + 3] = oa * 255;
}

export class DecorLayer {
  src: DecorSource | null = null;
  private world: Board | null = null;
  private bakes = new Map<string, HTMLCanvasElement | null>();
  /** Crates broken this session, by source + tile. */
  broken = new Set<string>();
  particles: Particle[] = [];
  ripples: Ripple[] = [];
  /** Recent disturbance of each tall-grass tile (0..1), for its wobble. */
  private stir = new Map<string, number>();
  private heroTile = "";
  private lastRipple = 0;
  private inWater = false;
  private lastHero = { x: 0, y: 0 };
  /** Tiles planned per frame at most, so entering a room never stalls. */
  planBudget = 60;
  private planned = 0;

  /** Points the layer at the current board; clears live effects on change. */
  sync(world: Board, seed: number) {
    if (world === this.world) return;
    this.world = world;
    const src = decorSourceFor(world, seed);
    if (src?.key !== this.src?.key) {
      this.bakes.clear();
      this.particles = [];
      this.ripples = [];
      this.stir.clear();
    }
    this.src = src;
  }

  /** The plan for a tile if ready; plans a limited number per frame. */
  private plan(x: number, y: number): TileDecor | null {
    const src = this.src;
    if (!src) return null;
    if (!this.bakes.has(`p:${x},${y}`)) {
      if (this.planned >= this.planBudget) return null;
      this.planned++;
      this.bakes.set(`p:${x},${y}`, null);
    }
    return tileDecor(src, x, y);
  }

  private eachTile(v: DecorView, fn: (x: number, y: number, d: TileDecor) => void) {
    for (let row = -1; row <= v.n; row++)
      for (let col = -1; col <= v.n; col++) {
        const x = col + Math.floor(v.left), y = Math.floor(v.bottom) + row;
        if (y < 0) continue;
        const d = this.plan(x, y);
        if (d && !d.empty) fn(x, y, d);
      }
  }

  /** Applies the world-pixel transform: tile (x, y) starts at (24x, -24y). */
  private worldSpace(c: CanvasRenderingContext2D, v: DecorView) {
    c.translate(-v.left * v.s, (v.n - 1 + v.bottom) * v.s);
    c.scale(v.s / TILE_PX, v.s / TILE_PX);
  }

  // ---------------------------------------------------------------- baking

  private bake(x: number, y: number, d: TileDecor) {
    const key = tkey(x, y);
    if (this.bakes.has(key)) return this.bakes.get(key)!;
    if (typeof document === "undefined") return null;
    const cv = document.createElement("canvas");
    cv.width = cv.height = TILE_PX;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(TILE_PX, TILE_PX), px = img.data;
    const seed = this.src!.seed;
    const h = (i: number, j: number, salt: number) => tileRandom(x * TILE_PX + i, y * TILE_PX - j, seed ^ salt);
    let drew = false;
    if (d.water) {
      const w = d.water;
      const at = (i: number, j: number) => (i < 0 || j < 0 || i >= TILE_PX || j >= TILE_PX ? 1 : w[j * TILE_PX + i]);
      for (let j = 0; j < TILE_PX; j++)
        for (let i = 0; i < TILE_PX; i++) {
          const v = w[j * TILE_PX + i];
          if (v === 2) blend(px, i, j, WET_STONE);
          else if (v === 1) {
            const edge = at(i - 1, j) !== 1 || at(i + 1, j) !== 1 || at(i, j - 1) !== 1 || at(i, j + 1) !== 1;
            const near = at(i - 2, j) !== 1 || at(i + 2, j) !== 1 || at(i, j - 2) !== 1 || at(i, j + 2) !== 1;
            blend(px, i, j, edge ? WATER_EDGE : near ? WATER_MID : WATER_DEEP);
          }
          if (v) drew = true;
        }
    }
    if (d.moss) {
      for (let j = 0; j < TILE_PX; j++)
        for (let i = 0; i < TILE_PX; i++) {
          const m = d.moss[j * TILE_PX + i], lv = m & 3, tone = m >> 2 ? 1 : 0;
          if (!lv) continue;
          const r = h(i, j, 0x3a1);
          const col = lv === 3 && r < 0.16 ? MOSS_LIGHT[tone] : lv >= 2 && r > 0.9 ? MOSS_DARK[tone] : MOSS[tone][lv];
          blend(px, i, j, col);
          drew = true;
        }
    }
    for (const p of d.vines) { blend(px, p.i, p.j, VINE[p.c]); drew = true; }
    for (const f of d.flowers) {
      const [r, g, b] = FLOWER_COLORS[f.color];
      const petal: Rgba = [r * 0.8, g * 0.8, b * 0.8, 1];
      blend(px, f.i - 1, f.j, petal); blend(px, f.i + 1, f.j, petal);
      blend(px, f.i, f.j - 1, petal); blend(px, f.i, f.j + 1, petal);
      blend(px, f.i, f.j, [255, 250, 225, 1]);
      drew = true;
    }
    for (const p of d.plants) { this.bakePlant(px, p); drew = true; }
    if (!drew) {
      this.bakes.set(key, null);
      return null;
    }
    ctx.putImageData(img, 0, 0);
    this.bakes.set(key, cv);
    if (this.bakes.size > 3000) this.bakes.clear();
    return cv;
  }

  private bakePlant(px: Uint8ClampedArray, p: Plant) {
    const { i, j, variant: v } = p;
    const put = (a: number, b: number, c: Rgba, al = 1) => blend(px, i + a, j + b, c, al);
    switch (p.kind) {
      case "tuft": {
        const dark: Rgba = [50, 88, 48, 1], mid: Rgba = [78, 128, 64, 1], hi: Rgba = [118, 172, 86, 1];
        const blades = [[-2, 3], [-1, 4 + v], [0, 5], [1, 4], [2, 2 + v]];
        for (const [dx, hgt] of blades)
          for (let k = 0; k < hgt; k++) put(dx + (k > 2 ? Math.sign(dx) : 0), -k, k === hgt - 1 ? hi : k < 2 ? dark : mid);
        break;
      }
      case "fern": {
        const stem: Rgba = [52, 96, 50, 1], leaf: Rgba = [84, 146, 72, 1], tip: Rgba = [120, 180, 96, 1];
        for (const side of [-1, 1]) {
          for (let k = 0; k < 5 + v; k++) {
            const fx = side * (1 + Math.floor(k * 0.8)), fy = -Math.floor(k * 0.7);
            put(fx, fy, k > 3 ? tip : stem);
            if (k % 2 === 1) put(fx, fy - 1, leaf);
          }
        }
        put(0, 0, stem); put(0, -1, stem); put(0, -2, leaf);
        break;
      }
      case "sprout": {
        const stem: Rgba = [70, 120, 60, 1];
        const bloom: Rgba = ([[230, 220, 150, 1], [200, 180, 230, 1], [236, 236, 228, 1]] as Rgba[])[v];
        put(0, 0, stem); put(0, -1, stem); put(-1, -1, [88, 140, 70, 1]);
        put(0, -2, bloom); put(1, -2, bloom, 0.8);
        break;
      }
      case "mushrooms": {
        const caps: Rgba[] = p.glow ? [[120, 214, 160, 1], [170, 246, 196, 1]] : ([[168, 92, 70, 1], [196, 160, 110, 1], [150, 120, 150, 1]] as Rgba[]).slice(v, v + 1).concat([[222, 200, 170, 1]]);
        const stem: Rgba = [214, 204, 186, 1];
        const spots = v === 0 ? [[0, 0, 3], [3, 1, 2]] : v === 1 ? [[0, 0, 2], [2, 1, 3], [-2, 1, 2]] : [[0, 0, 3]];
        for (const [dx, dy, size] of spots) {
          const x0 = dx - (size >> 1);
          put(dx, dy + 1, [0, 0, 0, 0.3]);
          put(dx, dy, stem);
          for (let a = 0; a < size; a++) put(x0 + a, dy - 1, caps[0]);
          if (size > 2) for (let a = 1; a < size - 1; a++) put(x0 + a, dy - 2, caps[0]);
          else put(dx, dy - 2, caps[0]);
          put(size > 2 ? x0 + 1 : dx, dy - 2, caps[1], 0.8);
        }
        break;
      }
      case "pebbles": {
        const a: Rgba = [120, 120, 126, 0.9], b: Rgba = [84, 84, 92, 0.9];
        put(0, 0, a); put(1, 0, b); put(3, 1, a); put(-2, 2, b); if (v) put(2, -2, a);
        break;
      }
      case "web": {
        // Radial threads and sagging rings from a corner of the tile.
        const c = p.corner ?? 0, sx = c === 1 || c === 2 ? -1 : 1, sy = c >= 2 ? -1 : 1;
        const ox = sx > 0 ? 0 : TILE_PX - 1, oy = sy > 0 ? 0 : TILE_PX - 1;
        const thread: Rgba = [214, 220, 228, 0.42];
        const len = 9 + v * 2;
        for (const ang of [0.05, 0.42, 0.78, 1.15, 1.52]) {
          for (let k = 1; k < len; k++) blend(px, ox + sx * Math.round(Math.cos(ang) * k), oy + sy * Math.round(Math.sin(ang) * k), thread);
        }
        for (const r of [3.5, 6.5, 9.5]) {
          if (r > len) break;
          for (let a = 0.05; a < 1.52; a += 0.12)
            blend(px, ox + sx * Math.round(Math.cos(a) * r), oy + sy * Math.round(Math.sin(a) * r), thread, 0.8);
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- update

  /** Advances live effects and reacts to the hero: breaking crates, stirring
   * grass, rippling water. `hx`/`hy` are the interpolated tile position. */
  update(dt: number, now: number, hx: number, hy: number, tileAt: (x: number, y: number) => Tile, reduceMotion: boolean) {
    this.planned = 0;
    const src = this.src;
    if (!src) return;
    const tx = Math.round(hx), ty = Math.round(hy);
    const speed = Math.hypot(hx - this.lastHero.x, hy - this.lastHero.y) / Math.max(dt, 1e-3);
    const dirX = hx - this.lastHero.x, dirY = hy - this.lastHero.y;
    this.lastHero = { x: hx, y: hy };
    const close = Math.hypot(hx - tx, hy - ty) < 0.45;
    const here = tkey(tx, ty);
    const d = this.plan(tx, ty);
    const current = tileAt(tx, ty);
    if (d && close && current.kind === "floor") {
      // Crates splinter the moment the hero steps onto them.
      if (d.crates.length && !this.broken.has(`${src.key}:${here}`)) {
        this.broken.add(`${src.key}:${here}`);
        if (!reduceMotion) this.shatter(tx, ty, d.crates, dirX, dirY, now);
      }
      if (here !== this.heroTile) {
        if (d.thicket && !reduceMotion) this.rustle(tx, ty);
        if (d.plants.some((p) => p.kind === "mushrooms") && !reduceMotion) this.puff(tx, ty, d);
      }
    }
    if (close) this.heroTile = here;
    // Tall grass nearby remembers being pushed through, then settles.
    for (const [k, e] of this.stir) {
      const next = e * Math.exp(-dt * 2.2);
      if (next < 0.01) this.stir.delete(k); else this.stir.set(k, next);
    }
    if (speed > 0.4)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = tx + dx, y = ty + dy, near = 1 - Math.hypot(hx - x, hy - y);
          if (near <= 0) continue;
          const pd = this.plan(x, y);
          if (!pd?.thicket) continue;
          const k = tkey(x, y);
          this.stir.set(k, Math.min(1, (this.stir.get(k) ?? 0) + near * dt * 5));
        }
    // Water around the hero's feet.
    const fgx = Math.round(hx * TILE_PX + 12), fgy = Math.round(-hy * TILE_PX + 20);
    const wet = waterAt(src, fgx, fgy);
    if (wet && !reduceMotion) {
      if (!this.inWater) this.splash(fgx, fgy, now);
      const every = speed > 0.4 ? 120 : 1500;
      if (now - this.lastRipple > every) {
        this.lastRipple = now;
        this.ripples.push({ gx: fgx, gy: fgy, t0: now, life: speed > 0.4 ? 900 : 1600, speed: speed > 0.4 ? 13 : 8 });
      }
    }
    this.inWater = wet;
    this.ripples = this.ripples.filter((r) => now - r.t0 < r.life);
    this.stepParticles(dt, tileAt);
  }

  private shatter(x: number, y: number, crates: Crate[], dirX: number, dirY: number, now: number) {
    const rng = mulberry(Math.floor(now) ^ (x * 73856093) ^ (y * 19349663));
    const push = Math.hypot(dirX, dirY) || 1;
    // Pieces fly on, away from the hero's step (screen y is down).
    const px = dirX / push, py = -dirY / push;
    for (const c of crates) {
      const wood = WOOD[c.tone % WOOD.length];
      const cx = x * TILE_PX + c.x + c.w / 2, cy = -y * TILE_PX + c.y + c.h / 2;
      const count = c.kind === "barrel" ? 7 : 9;
      for (let k = 0; k < count; k++) {
        const a = rng() * Math.PI * 2, sp = 30 + rng() * 70;
        const plank = rng() < 0.6, upright = plank && rng() < 0.4;
        this.particles.push({
          gx: cx + (rng() - 0.5) * c.w * 0.6, gy: cy + (rng() - 0.5) * c.h * 0.6, z: c.lift + 3 + rng() * 4,
          vx: Math.cos(a) * sp + px * 45, vy: Math.sin(a) * sp * 0.8 + py * 45, vz: 50 + rng() * 70,
          w: upright ? 1 : plank ? 3 + Math.floor(rng() * 2) : 1, h: upright ? 2 : 1, color: wood[Math.floor(rng() * 3)],
          life: 14 + rng() * 6, age: 0, kind: "splinter",
        });
      }
      for (let k = 0; k < 5; k++) {
        const a = rng() * Math.PI * 2;
        this.particles.push({
          gx: cx, gy: cy, z: 2, vx: Math.cos(a) * 18, vy: Math.sin(a) * 12, vz: 6 + rng() * 8,
          w: 2, h: 2, color: "rgba(170,150,120,0.5)", life: 0.7 + rng() * 0.4, age: 0, kind: "dust",
        });
      }
    }
    this.trimParticles();
  }

  private rustle(x: number, y: number) {
    const rng = mulberry(x * 92821 + y * 68917 + this.particles.length);
    for (let k = 0; k < 4; k++)
      this.particles.push({
        gx: x * TILE_PX + 4 + rng() * 16, gy: -y * TILE_PX + 8 + rng() * 12, z: 5 + rng() * 4,
        vx: (rng() - 0.5) * 30, vy: (rng() - 0.5) * 16, vz: 10 + rng() * 20,
        w: 1, h: 2, color: GRASS[2 + Math.floor(rng() * 3)], life: 1.6 + rng(), age: 0, kind: "leaf",
      });
    this.trimParticles();
  }

  private puff(x: number, y: number, d: TileDecor) {
    const glow = d.plants.some((p) => p.kind === "mushrooms" && p.glow);
    const rng = mulberry(x * 1231 + y * 7717 + this.particles.length);
    for (const p of d.plants) {
      if (p.kind !== "mushrooms") continue;
      for (let k = 0; k < 7; k++)
        this.particles.push({
          gx: x * TILE_PX + p.i + (rng() - 0.5) * 4, gy: -y * TILE_PX + p.j - 1, z: 2,
          vx: (rng() - 0.5) * 16, vy: (rng() - 0.5) * 8, vz: 8 + rng() * 10,
          w: 1, h: 1, color: glow ? "rgba(170,255,200,0.9)" : "rgba(220,210,180,0.75)",
          life: 1.4 + rng() * 1.2, age: 0, kind: "spore", glow,
        });
    }
    this.trimParticles();
  }

  private splash(gx: number, gy: number, now: number) {
    const rng = mulberry(gx * 31 + gy * 17 + Math.floor(now));
    for (let k = 0; k < 6; k++) {
      const a = rng() * Math.PI * 2;
      this.particles.push({
        gx, gy, z: 1, vx: Math.cos(a) * 26, vy: Math.sin(a) * 16, vz: 40 + rng() * 30,
        w: 1, h: 1, color: "rgba(190,225,240,0.85)", life: 0.6, age: 0, kind: "drop",
      });
    }
    this.ripples.push({ gx, gy, t0: now, life: 1100, speed: 16 });
  }

  private trimParticles() {
    if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260);
  }

  /** Simple top-down physics: height with gravity and bounce, ground
   * friction, and wall collisions that bounce pieces back into the room. */
  private stepParticles(dt: number, tileAt: (x: number, y: number) => Tile) {
    const solid = (gx: number, gy: number) => {
      const k = tileAt(Math.floor(gx / TILE_PX), -Math.floor(gy / TILE_PX)).kind;
      return k === "wall" || k === "door";
    };
    for (const p of this.particles) {
      p.age += dt;
      if (p.kind === "dust") {
        p.gx += p.vx * dt; p.gy += p.vy * dt; p.z += p.vz * dt;
        p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3;
        continue;
      }
      if (p.kind === "spore") {
        p.gx += (p.vx + Math.sin(p.age * 3 + p.gy) * 4) * dt; p.gy += p.vy * dt; p.z += p.vz * dt;
        p.vz *= 1 - dt * 0.8; p.vx *= 1 - dt * 1.5;
        continue;
      }
      const gravity = p.kind === "leaf" ? 40 : 320;
      if (p.kind === "leaf") { p.vx += Math.sin(p.age * 5 + p.gx) * 30 * dt; }
      const nx = p.gx + p.vx * dt;
      if (solid(nx, p.gy)) p.vx = -p.vx * 0.45; else p.gx = nx;
      const ny = p.gy + p.vy * dt;
      if (solid(p.gx, ny)) p.vy = -p.vy * 0.45; else p.gy = ny;
      p.vz -= gravity * dt;
      p.z += p.vz * dt;
      if (p.z <= 0) {
        p.z = 0;
        if (Math.abs(p.vz) > 18 && p.kind === "splinter") {
          p.vz = -p.vz * 0.32;
          p.vx *= 0.62; p.vy *= 0.62;
        } else {
          p.vz = 0;
          const f = Math.exp(-dt * (p.kind === "splinter" ? 9 : 4));
          p.vx *= f; p.vy *= f;
        }
      }
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  // ---------------------------------------------------------------- drawing

  /** Baked ground decor, crates, and the live water, on the ground layer. */
  drawGround(c: CanvasRenderingContext2D, v: DecorView, now: number, tileAt: (x: number, y: number) => Tile, reduceMotion: boolean) {
    if (!this.src) return;
    const src = this.src;
    c.save();
    this.worldSpace(c, v);
    c.imageSmoothingEnabled = false;
    const px = new PixelBatch();
    const t = now / 1000;
    const crates: [number, number, TileDecor][] = [];
    const thickets: [number, number, TileDecor][] = [];
    this.eachTile(v, (x, y, d) => {
      const img = this.bake(x, y, d);
      if (img) c.drawImage(img, x * TILE_PX, -y * TILE_PX, TILE_PX, TILE_PX);
      const floor = tileAt(x, y).kind === "floor";
      if (d.crates.length && floor) crates.push([x, y, d]);
      if (d.thicket && floor) thickets.push([x, y, d]);
      if (d.glints.length && !reduceMotion) {
        for (const [i, j] of d.glints) {
          const s = Math.sin(t * 1.4 + i * 0.9 + j * 1.7 + x * 3.1 + y * 1.3);
          if (s > 0.55) px.add(`rgba(196,228,238,${((s - 0.55) * 1.6).toFixed(2)})`, x * TILE_PX + i, -y * TILE_PX + j, 2, 1);
        }
      }
      if (d.drip && !reduceMotion) this.dripRings(px, src, x, y, d, t);
    });
    for (const r of this.ripples) {
      const age = (now - r.t0) / 1000, fade = 1 - (now - r.t0) / r.life;
      this.ring(px, src, r.gx, r.gy, age * r.speed, `rgba(176,214,228,${(fade * 0.8).toFixed(2)})`);
      if (age * r.speed > 4) this.ring(px, src, r.gx, r.gy, age * r.speed - 4, `rgba(120,168,188,${(fade * 0.5).toFixed(2)})`);
    }
    px.flush(c);
    for (const [x, y, d] of crates) this.drawCrates(c, x, y, d);
    for (const [x, y, d] of thickets) this.drawBlades(px, x, y, d, t, reduceMotion, null);
    px.flush(c);
    c.restore();
  }

  /** A ring of pixels (flattened for the top-down view), only on water. */
  private ring(px: PixelBatch, src: DecorSource, gx: number, gy: number, r: number, color: string) {
    if (r < 0.5) { if (waterAt(src, gx, gy)) px.add(color, gx, gy); return; }
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

  /** A drip's rings where it lands; the falling drop is drawn in front. */
  private dripRings(px: PixelBatch, src: DecorSource, x: number, y: number, d: TileDecor, t: number) {
    const drip = d.drip!, local = (t + drip.phase) % drip.period;
    const gx = x * TILE_PX + drip.i, gy = -y * TILE_PX + drip.j;
    if (local < DRIP_FALL) {
      // The drop's shadow sharpens as it nears the water.
      const k = local / DRIP_FALL;
      if (k > 0.4) px.add(`rgba(0,0,0,${(0.35 * k).toFixed(2)})`, gx, gy);
      return;
    }
    const age = local - DRIP_FALL;
    if (age > 1.8) return;
    const fade = 1 - age / 1.8;
    this.ring(px, src, gx, gy, age * 11, `rgba(186,222,236,${(fade * 0.85).toFixed(2)})`);
    if (age > 0.3) this.ring(px, src, gx, gy, (age - 0.3) * 11, `rgba(130,176,196,${(fade * 0.6).toFixed(2)})`);
    if (age < 0.18) {
      const up = Math.round(age * 20);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-2, 0], [2, 0]]) px.add("rgba(200,232,244,0.9)", gx + dx * (1 + up), gy + dy - up);
    }
  }

  private drawCrates(c: CanvasRenderingContext2D, x: number, y: number, d: TileDecor) {
    const ox = x * TILE_PX, oy = -y * TILE_PX;
    const broken = this.broken.has(`${this.src!.key}:${tkey(x, y)}`);
    const sorted = [...d.crates].sort((a, b) => a.lift - b.lift || a.y - b.y);
    for (const k of sorted) {
      const wood = WOOD[k.tone % WOOD.length];
      const bx = ox + k.x, by = oy + k.y;
      if (broken) {
        // A few splintered boards left where it stood.
        if (k.lift) continue;
        c.fillStyle = "rgba(0,0,0,0.25)";
        c.fillRect(bx, by + k.h - 3, k.w, 2);
        c.fillStyle = wood[2];
        c.fillRect(bx, by + k.h - 3, k.w - 2, 1);
        c.fillStyle = wood[1];
        c.fillRect(bx + 1, by + k.h - 2, 3, 1);
        c.fillRect(bx + k.w - 3, by + k.h - 4, 1, 2);
        continue;
      }
      const top = by - k.lift;
      if (!k.lift) {
        c.fillStyle = "rgba(0,0,0,0.32)";
        c.fillRect(bx + 1, by + k.h - 1, k.w, 2);
      }
      if (k.kind === "barrel") {
        // Round-ish lid over a banded body.
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
        continue;
      }
      // Crate: lid (with planks) and a darker front face.
      c.fillStyle = wood[3];
      c.fillRect(bx, top, k.w, k.h);
      c.fillStyle = wood[1];
      c.fillRect(bx + 1, top + 1, k.w - 2, k.h - 5);
      c.fillStyle = wood[0];
      for (let r = top + 1; r < top + k.h - 4; r += 3) c.fillRect(bx + 1, r, k.w - 2, 1);
      c.fillStyle = wood[2];
      c.fillRect(bx + 1, top + k.h - 4, k.w - 2, 3);
      // Corner brace across the lid.
      c.fillStyle = wood[2];
      for (let s = 0; s < k.w - 3; s++) {
        const yy = top + 1 + Math.round((s * (k.h - 6)) / Math.max(1, k.w - 4));
        c.fillRect(bx + 1 + s, yy, 1, 1);
      }
      c.fillStyle = "rgba(255,240,210,0.25)";
      c.fillRect(bx + 1, top + 1, k.w - 2, 1);
    }
  }

  /** Tall grass blades, parting around the hero. `only` limits drawing to
   * blades over the hero's sprite (the foreground pass). */
  private drawBlades(px: PixelBatch, x: number, y: number, d: TileDecor, t: number, reduceMotion: boolean,
    only: { gx0: number; gx1: number; gy0: number; gy1: number } | null) {
    const ox = x * TILE_PX, oy = -y * TILE_PX;
    const stir = reduceMotion ? 0 : this.stir.get(tkey(x, y)) ?? 0;
    const hx = this.lastHero.x * TILE_PX + 12, hy = -this.lastHero.y * TILE_PX + 19;
    for (const b of d.blades) {
      const gx = ox + b.i, gy = oy + b.j;
      if (only && (gx < only.gx0 || gx > only.gx1 || gy < only.gy0 || gy - b.h > only.gy1)) continue;
      const dx = gx - hx, dy = gy - hy, dist = Math.hypot(dx, dy * 1.4);
      const near = Math.max(0, 1 - dist / 15);
      // Pushed aside and pressed down where the hero stands.
      const push = near * 5 * (dx >= 0 ? 1 : -1);
      const height = Math.max(2, Math.round(b.h * (1 - near * 0.45)));
      const breeze = reduceMotion ? 0 : Math.sin(t * 1.3 + b.phase + gx * 0.05) * 0.55;
      const wobble = stir * Math.sin(t * 13 + b.phase) * 2.2;
      const lean = b.lean + push + breeze + wobble;
      let lastX = gx, runStart = 0;
      for (let k = 0; k <= height; k++) {
        const bx = k === height ? NaN : gx + Math.round(lean * Math.pow(k / b.h, 1.6));
        if (bx !== lastX || k === height) {
          if (k > runStart) {
            // Base shaded, tip bright.
            const col = runStart === 0 ? GRASS[b.color % 2] : k >= height - 1 ? GRASS[Math.min(4, b.color + 1)] : GRASS[b.color];
            px.add(col, lastX, gy - k + 1, 1, k - runStart);
          }
          runStart = k;
          lastX = bx;
        }
      }
    }
  }

  /** Glowing flowers and caps as light sources for the darkness pass. */
  glows(v: DecorView): DecorGlow[] {
    const out: DecorGlow[] = [];
    this.eachTile(v, (x, y, d) => {
      for (const f of d.flowers)
        out.push({
          x: x + (f.i + 0.5) / TILE_PX - 0.5, y: y + 0.5 - (f.j + 0.5) / TILE_PX,
          rgb: FLOWER_COLORS[f.color], radius: 0.62, strength: 0.5,
        });
      for (const p of d.plants)
        if (p.kind === "mushrooms" && p.glow)
          out.push({ x: x + (p.i + 0.5) / TILE_PX - 0.5, y: y + 0.5 - (p.j - 1) / TILE_PX, rgb: GLOWCAP, radius: 0.5, strength: 0.42 });
    });
    return out;
  }

  /** Emitted light drawn over the darkness: bright bloom pixels on the
   * glowing flowers and caps, plus fireflies over lush spots. Stronger the
   * darker the dungeon (`k` = 0 at default brightness, 1 at darkest). */
  drawGlow(c: CanvasRenderingContext2D, v: DecorView, now: number, k: number, reduceMotion: boolean) {
    if (!this.src || k <= 0) return;
    const t = now / 1000, px = new PixelBatch();
    c.save();
    this.worldSpace(c, v);
    c.globalCompositeOperation = "lighter";
    this.eachTile(v, (x, y, d) => {
      const ox = x * TILE_PX, oy = -y * TILE_PX;
      for (const f of d.flowers) {
        const pulse = reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 1.6 + f.i + x * 2.1 + y);
        const [r, g, b] = FLOWER_COLORS[f.color];
        const a = Math.min(1, k * pulse);
        px.add(`rgba(${r},${g},${b},${(a * 0.9).toFixed(2)})`, ox + f.i - 1, oy + f.j, 3, 1);
        px.add(`rgba(${r},${g},${b},${(a * 0.9).toFixed(2)})`, ox + f.i, oy + f.j - 1, 1, 3);
        px.add(`rgba(255,255,240,${a.toFixed(2)})`, ox + f.i, oy + f.j);
        px.add(`rgba(${r},${g},${b},${(a * 0.28).toFixed(2)})`, ox + f.i - 2, oy + f.j - 1, 5, 3);
        px.add(`rgba(${r},${g},${b},${(a * 0.28).toFixed(2)})`, ox + f.i - 1, oy + f.j - 2, 3, 1);
        px.add(`rgba(${r},${g},${b},${(a * 0.28).toFixed(2)})`, ox + f.i - 1, oy + f.j + 2, 3, 1);
      }
      for (const p of d.plants) {
        if (p.kind !== "mushrooms" || !p.glow) continue;
        const a = Math.min(1, k * (reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(t * 0.9 + p.i * 1.7 + y)));
        px.add(`rgba(140,240,170,${(a * 0.7).toFixed(2)})`, ox + p.i - 1, oy + p.j - 2, 3, 2);
        px.add(`rgba(210,255,225,${(a * 0.8).toFixed(2)})`, ox + p.i, oy + p.j - 2);
      }
      // Fireflies drift over some overgrown and flowering spots.
      if (!reduceMotion && (d.thicket || d.flowers.length) && tileRandom(x, y, this.src!.seed ^ 0xf1f) < 0.4) {
        const ph = tileRandom(y, x, 0x51) * 20;
        const fx = ox + 12 + Math.sin(t * 0.7 + ph) * 11 + Math.sin(t * 1.9 + ph * 2) * 3;
        const fy = oy + 10 + Math.cos(t * 0.53 + ph) * 8 - 4;
        const blink = Math.max(0, Math.sin(t * 1.3 + ph * 3));
        const a = k * blink * blink;
        if (a > 0.02) {
          px.add(`rgba(230,255,150,${a.toFixed(2)})`, Math.round(fx), Math.round(fy));
          px.add(`rgba(200,255,120,${(a * 0.3).toFixed(2)})`, Math.round(fx) - 1, Math.round(fy) - 1, 3, 3);
        }
      }
    });
    for (const p of this.particles) {
      if (p.kind !== "spore" || !p.glow) continue;
      const a = k * (1 - p.age / p.life);
      px.add(`rgba(150,255,190,${a.toFixed(2)})`, Math.round(p.gx), Math.round(p.gy - p.z));
    }
    px.flush(c);
    c.restore();
  }

  /** Things in front of the hero: grass over its feet, the water line,
   * flying splinters and falling drips. */
  drawForeground(c: CanvasRenderingContext2D, v: DecorView, now: number, tileAt: (x: number, y: number) => Tile, reduceMotion: boolean) {
    const src = this.src;
    if (!src) return;
    const t = now / 1000, px = new PixelBatch();
    c.save();
    this.worldSpace(c, v);
    c.imageSmoothingEnabled = false;
    const hx = this.lastHero.x, hy = this.lastHero.y;
    const hgx = Math.round(hx * TILE_PX), hgy = Math.round(-hy * TILE_PX);
    const area = { gx0: hgx + 2, gx1: hgx + 22, gy0: hgy + 4, gy1: hgy + 24 };
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = Math.round(hx) + dx, y = Math.round(hy) + dy;
        const d = this.plan(x, y);
        if (d?.thicket && tileAt(x, y).kind === "floor") this.drawBlades(px, x, y, d, t, reduceMotion, area);
      }
    // The hero's feet sink below the surface of a pool.
    for (let j = 20; j < 24; j++)
      for (let i = 5; i < 20; i++)
        if (waterAt(src, hgx + i, hgy + j)) px.add(j === 20 ? "rgba(150,196,214,0.55)" : "rgba(34,70,92,0.6)", hgx + i, hgy + j);
    this.eachTile(v, (x, y, d) => {
      if (!d.drip || reduceMotion) return;
      const drip = d.drip, local = (t + drip.phase) % drip.period;
      if (local >= DRIP_FALL) return;
      const k = local / DRIP_FALL, gx = x * TILE_PX + drip.i, gy = -y * TILE_PX + drip.j - Math.round((1 - k * k) * 46);
      px.add("rgba(170,214,232,0.9)", gx, gy - 1, 1, 2);
      px.add("rgba(235,250,255,0.9)", gx, gy + 1);
    });
    for (const p of this.particles) {
      if (p.kind === "spore" && p.glow) continue;
      const fade = Math.min(1, (p.life - p.age) / 0.8);
      const alpha = p.kind === "dust" ? 1 - p.age / p.life : fade;
      if (alpha <= 0) continue;
      const gx = Math.round(p.gx), gy = Math.round(p.gy - p.z);
      if (p.kind === "splinter" && p.z > 1.5) px.add(`rgba(0,0,0,${(0.3 * alpha).toFixed(2)})`, Math.round(p.gx), Math.round(p.gy) + 1, p.w, 1);
      const size = p.kind === "dust" ? Math.round(p.w + p.age * 4) : 0;
      const col = alpha >= 0.99 ? p.color : withAlpha(p.color, alpha);
      if (size) px.add(col, gx - (size >> 1), gy - (size >> 1), size, size);
      else px.add(col, gx, gy, p.w, p.h);
    }
    px.flush(c);
    c.restore();
  }
}

/** Seconds a ceiling drip takes to fall. */
const DRIP_FALL = 0.55;

function mulberry(seed: number) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Multiplies a color's alpha (hex or rgba) by `a`. */
function withAlpha(color: string, a: number) {
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
