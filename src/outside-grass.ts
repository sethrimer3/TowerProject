import type { Board } from "./generation.ts";
import { outsideSpriteKind, type Weather } from "./outside.ts";
import { tileRandom } from "./themes.ts";

/** Wind-blown grass for the forest outside the Tower and Delve. Each grass
 * tile carries a handful of pixel blades that sway in the wind, bow under
 * gusts rolling across the clearing, and part around the hero, flicking
 * back after they pass. Drawn in world pixels (24 per tile) in two passes:
 * "back" before the hero, then "front" after it, for just the blades rooted
 * at its feet, so the hero wades through the grass. */

const PX = 24;
type Blade = { i: number; j: number; h: number; color: number; phase: number; flower: number; splay: number };
const COLORS = ["#27472c", "#335c35", "#437640", "#58904c", "#74ad5c", "#8fc56c"];
const FLOWERS = ["#f2eecb", "#f2d36b", "#c8b0f0"];
const PALETTE = [...COLORS, ...FLOWERS];
/** The palette as little-endian RGBA words for the pixel buffer. */
const PALETTE32 = Uint32Array.from(PALETTE, (hex) => {
  const v = parseInt(hex.slice(1), 16);
  return ((255 << 24) | ((v & 0xff) << 16) | (v & 0xff00) | (v >> 16)) >>> 0;
});
/** Blade bend by height: CURVE[h][k] = (k / h)^1.5. */
const CURVE = Array.from({ length: 12 }, (_, h) => Float32Array.from({ length: h + 1 }, (_, k) => (h ? Math.pow(k / h, 1.5) : 0)));
/** How hard the wind blows, in pixels of lean at a blade's tip. */
const WIND: Record<Weather, number> = { sunny: 1.2, cloudy: 1.8, rain: 2.6, storm: 4 };

export class OutsideGrass {
  private plans = new Map<string, Blade[]>();
  private planKey = "";
  /** Recent hero disturbance per tile (0..1), for the flick-back wobble. */
  private stir = new Map<string, number>();
  private last = { x: NaN, y: NaN };
  /** Blades are written straight into a pixel buffer at 24 pixels per
   * tile, then drawn once, scaled up: far cheaper than thousands of rects. */
  private buffer: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData; px: Uint32Array } | null = null;

  private blades(x: number, y: number, seed: number, center: number, world: Board): Blade[] {
    const key = `${x},${y}`;
    let b = this.plans.get(key);
    if (b) return b;
    b = [];
    const t = world.tile(x, y);
    if (t.kind === "floor" && outsideSpriteKind(t, x, y, seed, center).family === "grass") {
      const r = (k: number) => tileRandom(x * 41 + k * 7, y * 29 - k * 13, seed ^ 0x6a55);
      // Clumps of two to four blades fanning out from one root.
      const clumps = 6 + Math.floor(r(0) * 4);
      for (let k = 1; k <= clumps; k++) {
        const i = 2 + Math.floor(r(k) * 20), j = 4 + Math.floor(r(k + 40) * 20), h = 4 + Math.floor(r(k + 80) * 5);
        const color = Math.floor(r(k + 120) * 4), phase = r(k + 160) * Math.PI * 2;
        const n = 2 + Math.floor(r(k + 280) * 3);
        for (let q = 0; q < n; q++) {
          const side = q - (n - 1) / 2;
          b.push({
            i: i + Math.round(side), j, h: Math.max(2, h - Math.abs(Math.round(side * 2))), color: Math.max(0, color - (q % 2)),
            phase: phase + q * 0.35, splay: side * 1.4,
            flower: q === 0 && r(k + 200) < 0.1 ? 1 + Math.floor(r(k + 240) * FLOWERS.length) : 0,
          });
        }
      }
      b.sort((a, c) => a.j - c.j);
    }
    this.plans.set(key, b);
    return b;
  }

  private pixelBuffer(w: number, h: number) {
    if (typeof document === "undefined") return null;
    if (!this.buffer || this.buffer.canvas.width !== w || this.buffer.canvas.height !== h) {
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const img = ctx.createImageData(w, h);
      this.buffer = { canvas, ctx, img, px: new Uint32Array(img.data.buffer) };
    }
    return this.buffer;
  }

  /** `hx`/`hy` are the hero's interpolated tile position. The "back" pass
   * also advances the grass's state, so call it once per frame first. */
  draw(c: CanvasRenderingContext2D, view: { left: number; bottom: number; n: number; s: number }, world: Board,
    seed: number, center: number, weather: Weather, now: number, dt: number, hx: number, hy: number, reduceMotion: boolean,
    layer: "back" | "front" = "back") {
    const key = `${seed}:${center}`;
    if (key !== this.planKey) { this.plans.clear(); this.stir.clear(); this.planKey = key; }
    const t = now / 1000;
    const back = layer === "back";
    const moved = back && Number.isFinite(this.last.x) ? Math.hypot(hx - this.last.x, hy - this.last.y) : 0;
    if (back) this.last = { x: hx, y: hy };
    // Walking through grass stirs it; it settles over a second or two.
    if (back)
      for (const [k, e] of this.stir) {
        const next = e * Math.exp(-dt * 1.8);
        if (next < 0.01) this.stir.delete(k); else this.stir.set(k, next);
      }
    if (moved > 0.001 && !reduceMotion)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = Math.round(hx) + dx, y = Math.round(hy) + dy, near = 1.3 - Math.hypot(hx - x, hy - y);
          if (near <= 0) continue;
          const k = `${x},${y}`;
          this.stir.set(k, Math.min(1, (this.stir.get(k) ?? 0) + near * moved * 4));
        }
    const wind = WIND[weather];
    const feetX = hx * PX + 12, feetY = -hy * PX + 20;
    // Blades rooted at or below the hero's feet, under its sprite, stand in
    // front of it.
    const inFront = (gx: number, gy: number) => gy >= feetY - 1 && gy <= feetY + 12 && gx >= feetX - 10 && gx <= feetX + 10;
    // The buffer covers the visible tiles plus a one-tile margin all round.
    const x0 = Math.floor(view.left) - 1, yTop = Math.floor(view.bottom) + view.n + 1;
    const W = (view.n + 3) * PX, H = (view.n + 3) * PX, ox = x0 * PX, oy = -yTop * PX;
    const buf = back ? this.pixelBuffer(W, H) : null;
    const px = buf?.px ?? null;
    const rects: number[] = [];
    const put = (color: number, x: number, y: number, h: number) => {
      if (!px) { rects.push(color, x, y, h); return; }
      const bx = x - ox;
      if (bx < 0 || bx >= W) return;
      for (let yy = Math.max(0, y - oy), end = Math.min(H, y - oy + h); yy < end; yy++) px[yy * W + bx] = PALETTE32[color];
    };
    px?.fill(0);
    const rows = back ? [-1, view.n] : [Math.round(hy) - 1 - Math.floor(view.bottom), Math.round(hy) - Math.floor(view.bottom)];
    const cols = back ? [-1, view.n] : [Math.round(hx) - 1 - Math.floor(view.left), Math.round(hx) + 1 - Math.floor(view.left)];
    for (let row = rows[0]; row <= rows[1]; row++)
      for (let col = cols[0]; col <= cols[1]; col++) {
        const x = col + Math.floor(view.left), y = Math.floor(view.bottom) + row;
        if (y < 0) continue;
        const list = this.blades(x, y, seed, center, world);
        if (!list.length) continue;
        const stir = this.stir.get(`${x},${y}`) ?? 0;
        for (const b of list) {
          const gx = x * PX + b.i, gy = -y * PX + b.j;
          if (inFront(gx, gy) === back) continue;
          let lean: number;
          if (reduceMotion) lean = b.splay + wind * 0.35;
          else {
            // Steady lean, a slow sway, and gusts that sweep across in bands.
            const sway = Math.sin(t * 2.1 + b.phase + gx * 0.06) * 0.5 + Math.sin(t * 3.7 + b.phase * 2) * 0.2;
            const band = Math.sin(gx * 0.021 + gy * 0.009 - t * 1.6);
            const gust = Math.pow(Math.max(0, band), 3) * 1.6;
            lean = b.splay + wind * (0.35 + sway * 0.45 + gust);
            lean += stir * Math.sin(t * 12 + b.phase) * 2.4;
          }
          // Parted and pressed down around the hero.
          const dx = gx - feetX, dy = gy - feetY, dist = Math.hypot(dx, dy * 1.5);
          const near = Math.max(0, 1 - dist / 16);
          lean += near * 6 * (dx >= 0 ? 1 : -1);
          const height = Math.max(2, Math.round(b.h * (1 - near * 0.5)));
          // Runs of pixels that share a column, shaded dark at the root and
          // light at the tip.
          const curve = CURVE[b.h];
          let lastX = gx, start = 0;
          for (let k = 0; k <= height; k++) {
            const bx = k === height ? NaN : gx + Math.round(lean * curve[k]);
            if (bx === lastX && k !== height) continue;
            if (k > start) {
              const color = start === 0 ? b.color % 2 : k >= height - 1 ? b.color + 2 : b.color + 1;
              put(color, lastX, gy - k + 1, k - start);
            }
            start = k;
            lastX = bx;
          }
          if (b.flower) {
            const tip = gx + Math.round(lean * curve[height - 1]), f = COLORS.length + b.flower - 1;
            put(f, tip, gy - height, 1);
            put(f, tip - 1, gy - height + 1, 1);
          }
        }
      }
    c.save();
    c.translate(-view.left * view.s, (view.n - 1 + view.bottom) * view.s);
    c.scale(view.s / PX, view.s / PX);
    if (buf) {
      buf.ctx.putImageData(buf.img, 0, 0);
      c.imageSmoothingEnabled = false;
      c.drawImage(buf.canvas, ox, oy);
    } else {
      // The few blades in front of the hero (or no DOM canvas): plain rects.
      for (let k = 0; k < rects.length; k += 4) {
        c.fillStyle = PALETTE[rects[k]];
        c.beginPath();
        c.rect(rects[k + 1], rects[k + 2], 1, rects[k + 3]);
        c.fill();
      }
    }
    c.restore();
  }
}
