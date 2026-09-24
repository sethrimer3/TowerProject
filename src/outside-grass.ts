import type { Board } from "./generation.ts";
import { outsideSpriteKind, type Weather } from "./outside.ts";
import { tileRandom } from "./themes.ts";

/** Wind-blown grass for the forest outside the Tower and Delve. Each grass
 * tile carries a handful of pixel blades that sway in the wind, bow under
 * gusts rolling across the clearing, and part around the hero, flicking
 * back after they pass. Drawn in world pixels (24 per tile) after the hero,
 * so blades on the hero's tile cover its feet. */

const PX = 24;
type Blade = { i: number; j: number; h: number; color: number; phase: number; flower: number };
const COLORS = ["#27472c", "#335c35", "#437640", "#58904c", "#74ad5c", "#8fc56c"];
const FLOWERS = ["#f2eecb", "#f2d36b", "#c8b0f0"];
/** How hard the wind blows, in pixels of lean at a blade's tip. */
const WIND: Record<Weather, number> = { sunny: 1.2, cloudy: 1.8, rain: 2.6, storm: 4 };

export class OutsideGrass {
  private plans = new Map<string, Blade[]>();
  private planKey = "";
  /** Recent hero disturbance per tile (0..1), for the flick-back wobble. */
  private stir = new Map<string, number>();
  private last = { x: NaN, y: NaN };

  private blades(x: number, y: number, seed: number, center: number, world: Board): Blade[] {
    const key = `${x},${y}`;
    let b = this.plans.get(key);
    if (b) return b;
    b = [];
    const t = world.tile(x, y);
    if (t.kind === "floor" && outsideSpriteKind(t, x, y, seed, center).family === "grass") {
      const r = (k: number) => tileRandom(x * 41 + k * 7, y * 29 - k * 13, seed ^ 0x6a55);
      const count = 7 + Math.floor(r(0) * 5);
      for (let k = 1; k <= count; k++) {
        b.push({
          i: 1 + Math.floor(r(k) * 22), j: 3 + Math.floor(r(k + 40) * 21), h: 3 + Math.floor(r(k + 80) * 5),
          color: Math.floor(r(k + 120) * 4), phase: r(k + 160) * Math.PI * 2,
          flower: r(k + 200) < 0.06 ? 1 + Math.floor(r(k + 240) * FLOWERS.length) : 0,
        });
      }
      b.sort((a, c) => a.j - c.j);
    }
    this.plans.set(key, b);
    return b;
  }

  /** `hx`/`hy` are the hero's interpolated tile position. */
  draw(c: CanvasRenderingContext2D, view: { left: number; bottom: number; n: number; s: number }, world: Board,
    seed: number, center: number, weather: Weather, now: number, dt: number, hx: number, hy: number, reduceMotion: boolean) {
    const key = `${seed}:${center}`;
    if (key !== this.planKey) { this.plans.clear(); this.stir.clear(); this.planKey = key; }
    const t = now / 1000;
    const moved = Number.isFinite(this.last.x) ? Math.hypot(hx - this.last.x, hy - this.last.y) : 0;
    this.last = { x: hx, y: hy };
    // Walking through grass stirs it; it settles over a second or two.
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
    const groups = new Map<string, number[]>();
    const add = (color: string, x: number, y: number, w: number, h: number) => {
      let g = groups.get(color);
      if (!g) groups.set(color, (g = []));
      g.push(x, y, w, h);
    };
    for (let row = -1; row <= view.n; row++)
      for (let col = -1; col <= view.n; col++) {
        const x = col + Math.floor(view.left), y = Math.floor(view.bottom) + row;
        if (y < 0) continue;
        const list = this.blades(x, y, seed, center, world);
        if (!list.length) continue;
        const stir = this.stir.get(`${x},${y}`) ?? 0;
        for (const b of list) {
          const gx = x * PX + b.i, gy = -y * PX + b.j;
          let lean: number;
          if (reduceMotion) lean = wind * 0.35;
          else {
            // Steady lean, a slow sway, and gusts that sweep across in bands.
            const sway = Math.sin(t * 2.1 + b.phase + gx * 0.06) * 0.5 + Math.sin(t * 3.7 + b.phase * 2) * 0.2;
            const band = Math.sin(gx * 0.021 + gy * 0.009 - t * 1.6);
            const gust = Math.pow(Math.max(0, band), 3) * 1.6;
            lean = wind * (0.35 + sway * 0.45 + gust);
            lean += stir * Math.sin(t * 12 + b.phase) * 2.4;
          }
          // Parted and pressed down around the hero.
          const dx = gx - feetX, dy = gy - feetY, dist = Math.hypot(dx, dy * 1.5);
          const near = Math.max(0, 1 - dist / 16);
          lean += near * 6 * (dx >= 0 ? 1 : -1);
          const height = Math.max(2, Math.round(b.h * (1 - near * 0.5)));
          let lastX = gx, start = 0;
          for (let k = 0; k <= height; k++) {
            const bx = k === height ? NaN : gx + Math.round(lean * Math.pow(k / b.h, 1.5));
            if (bx === lastX && k !== height) continue;
            if (k > start) {
              const color = start === 0 ? COLORS[b.color % 2] : k >= height - 1 ? COLORS[b.color + 2] : COLORS[b.color + 1];
              add(color, lastX, gy - k + 1, 1, k - start);
            }
            start = k;
            lastX = bx;
          }
          if (b.flower) {
            const tip = gx + Math.round(lean * Math.pow((height - 1) / b.h, 1.5));
            add(FLOWERS[b.flower - 1], tip, gy - height, 1, 1);
            add(FLOWERS[b.flower - 1], tip - 1, gy - height + 1, 1, 1);
          }
        }
      }
    c.save();
    c.translate(-view.left * view.s, (view.n - 1 + view.bottom) * view.s);
    c.scale(view.s / PX, view.s / PX);
    for (const [color, r] of groups) {
      c.fillStyle = color;
      c.beginPath();
      for (let k = 0; k < r.length; k += 4) c.rect(r[k], r[k + 1], r[k + 2], r[k + 3]);
      c.fill();
    }
    c.restore();
  }
}
