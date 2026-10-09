import { stream } from "./random.ts";

const fx = stream("effects");

type Size = { w: number; h: number };
/** A square speck. `x` and `y` are fractions of the canvas; `blue` (0 gold
 * to 1 dark blue) and `heat` (0 to 1 red) ease toward their targets. */
type Speck = { x: number; y: number; side: number; alpha: number; phase: number; blue: number; heat: number; tier: number };

/** What one frame shows: the canvas-pixel height of each row in training
 * (its centre), and whether motion is reduced. */
export type TrainingScene = { lanes: number[]; speeds: number[]; reduced: boolean };

const GOLD = [243, 207, 130];
/** The look of each batch speedup (x1, x2, x3, x5, x10, the tiers): the
 * colour the specks fade to, the colour of the stream's heat, and how fast
 * the stream runs (a multiple of `STREAM`). x3 is the original look; the
 * slower tiers are cooler and calmer, the faster ones shift through violet
 * to magenta and run harder. */
const TIERS = [
  { speed: 1, blue: [34, 128, 140], red: [255, 190, 60], rate: 0.55 },
  { speed: 2, blue: [36, 104, 180], red: [255, 120, 50], rate: 0.8 },
  { speed: 3, blue: [38, 84, 205], red: [255, 52, 40], rate: 1 },
  { speed: 5, blue: [92, 60, 210], red: [255, 40, 140], rate: 1.4 },
  { speed: 10, blue: [140, 50, 220], red: [255, 70, 230], rate: 1.9 },
];
/** The tier (fractional, between two) a batch speedup falls at. */
const tierOf = (speed: number) => {
  const i = TIERS.findIndex((t) => t.speed >= speed);
  if (i < 0) return TIERS.length - 1;
  if (i === 0) return 0;
  const lo = TIERS[i - 1]!, hi = TIERS[i]!;
  return i - 1 + (speed - lo.speed) / (hi.speed - lo.speed);
};
/** A tier's value for `pick`, blended between the two it falls between. */
const tierValue = <T>(tier: number, pick: (t: (typeof TIERS)[number]) => T, blend: (a: T, b: T, k: number) => T) => {
  const i = Math.min(TIERS.length - 2, Math.floor(tier));
  return blend(pick(TIERS[i]!), pick(TIERS[i + 1]!), Math.max(0, Math.min(1, tier - i)));
};
const mixNumber = (a: number, b: number, k: number) => a + (b - a) * k;
const tierColor = (tier: number, which: "blue" | "red") => tierValue(tier, (t) => t[which], (a, b, k) => a.map((c, i) => c + (b[i]! - c) * k));
/** Pixels per second the stream carries a speck at the original tier, and
 * how far from a lane's centre (pixels) it reaches. */
const STREAM = 170, REACH = 38;

/** Sizes the canvas to its box at the screen's pixel density (at most 2)
 * and clears it, drawing in CSS pixels. */
function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, w: number, h: number) {
  const dpr = Math.min(devicePixelRatio || 1, 2), width = Math.round(w * dpr), height = Math.round(h * dpr);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
}

/** The Training tab's backdrop: golden square specks drifting softly. Once
 * a rank is in training they all fade to dark blue, and a steady stream of
 * the same kind of fluid the skill trees use carries them left to right
 * along each such row, the specks near the stream turning a brighter red the
 * closer they are to it. It lasts as long as a rank is in training. */
export class TrainingParticles {
  private readonly n = 40;
  private u = new Float32Array(1600);
  private v = new Float32Array(1600);
  private pressure = new Float32Array(1600);
  private specks: Speck[] = [];
  private last = 0;
  private elapsed = 0;
  private clock = 0;
  private canvasSize = "";

  draw(canvas: HTMLCanvasElement, time: number, scene: TrainingScene) {
    const ctx = canvas.getContext("2d"), w = canvas.clientWidth, h = canvas.clientHeight;
    if (!ctx || !w || !h) return;
    fitCanvas(canvas, ctx, w, h);
    if (scene.reduced) return;
    const size = { w, h }, key = `${w}x${h}`;
    if (!this.specks.length || key !== this.canvasSize) this.reset(size, key);
    const dt = this.tick(time);
    // The fluid steps at most 30 times a second; drawing stays smooth.
    this.elapsed += dt;
    if (this.elapsed >= 1 / 30) {
      this.step(Math.min(this.elapsed, 1 / 15), size, scene.lanes, scene.speeds);
      this.elapsed = 0;
    }
    for (const s of this.specks) {
      this.move(s, dt, size, scene.lanes, scene.speeds);
      paint(ctx, s, size);
    }
    ctx.globalAlpha = 1;
  }

  /** The seconds since the last frame, at most a thirtieth; none after a
   * pause (the page hidden, or the tab away). */
  private tick(time: number) {
    const gap = time - this.last, dt = this.last && gap < 150 ? Math.min(gap / 1000, 1 / 30) : 0;
    this.last = time;
    this.clock += dt;
    return dt;
  }

  /** A still fluid and fresh golden specks. */
  private reset({ w, h }: Size, key: string) {
    this.canvasSize = key;
    this.u.fill(0);
    this.v.fill(0);
    this.specks = Array.from({ length: Math.min(320, Math.max(120, Math.round((w * h) / 900))) }, () => ({
      x: fx(), y: fx(), side: fx() < 0.35 ? 3 : 2, alpha: 0.4 + fx() * 0.45, phase: fx() * Math.PI * 2, blue: 0, heat: 0, tier: 2,
    }));
  }

  /** Eases a speck's colour, carries it on a soft wander plus the fluid, and
   * wraps it round the canvas. */
  private move(s: Speck, dt: number, { w, h }: Size, lanes: number[], speeds: number[]) {
    const busy = lanes.length > 0, ease = Math.min(1, dt * (busy ? 1.6 : 1));
    if (busy) s.tier += (tierNear(s.y * h, lanes, speeds) - s.tier) * Math.min(1, dt * 2);
    s.blue += ((busy ? 1 : 0) - s.blue) * ease;
    s.heat += (heatAt(s.y * h, lanes) - s.heat) * Math.min(1, dt * 4);
    const t = this.clock * 0.35 + s.phase, drift = 7;
    const vx = this.sample(this.u, s.x * 39, s.y * 39) + (Math.cos(t) * drift) / w;
    const vy = this.sample(this.v, s.x * 39, s.y * 39) + (Math.sin(t * 1.3) * drift) / h;
    s.x = (s.x + vx * dt + 1) % 1;
    s.y = (s.y + vy * dt + 1) % 1;
  }

  private sample(field: Float32Array, x: number, y: number) {
    const n = this.n;
    x = Math.max(0, Math.min(n - 1.001, x));
    y = Math.max(0, Math.min(n - 1.001, y));
    const ix = Math.floor(x), iy = Math.floor(y), a = x - ix, b = y - iy;
    return (field[iy * n + ix] * (1 - a) + field[iy * n + ix + 1] * a) * (1 - b)
      + (field[(iy + 1) * n + ix] * (1 - a) + field[(iy + 1) * n + ix + 1] * a) * b;
  }

  /** Advects the velocity, relaxes it toward the stream along each lane and
   * projects out the divergence, as the skill trees' fluid does. */
  private step(dt: number, { w, h }: Size, lanes: number[], speeds: number[]) {
    const n = this.n, nextU = new Float32Array(n * n), nextV = new Float32Array(n * n);
    const blend = 1 - Math.exp(-dt * 3);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x, py = (y / (n - 1)) * h;
      let push = 0;
      lanes.forEach((lane, k) => { push += STREAM * rateOf(speeds[k] ?? 1) * Math.exp(-((py - lane) ** 2) / (2 * REACH * REACH)); });
      const bx = x - this.u[i] * dt * (n - 1), by = y - this.v[i] * dt * (n - 1);
      nextU[i] = this.sample(this.u, bx, by) * (1 - blend) + (push / w) * blend;
      nextV[i] = this.sample(this.v, bx, by) * (1 - blend);
    }
    this.project(nextU, nextV, w, h);
    this.u = nextU;
    this.v = nextV;
  }

  private project(u: Float32Array, v: Float32Array, w: number, h: number) {
    const n = this.n, hx = w / (n - 1), hy = h / (n - 1), p = this.pressure, div = new Float32Array(n * n);
    p.fill(0);
    const each = (fn: (i: number) => void) => { for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) fn(y * n + x); };
    each((i) => { div[i] = ((u[i + 1] - u[i - 1]) * w) / (2 * hx) + ((v[i + n] - v[i - n]) * h) / (2 * hy); });
    const a = 1 / (hx * hx), b = 1 / (hy * hy);
    for (let k = 0; k < 32; k++) each((i) => { p[i] = ((p[i - 1] + p[i + 1]) * a + (p[i - n] + p[i + n]) * b - div[i]) / (2 * (a + b)); });
    each((i) => {
      u[i] -= (p[i + 1] - p[i - 1]) / (2 * hx * w);
      v[i] -= (p[i + n] - p[i - n]) / (2 * hy * h);
    });
  }
}

/** How near a height (pixels) is to the nearest lane's stream, 0 to 1. */
function heatAt(y: number, lanes: number[]) {
  let heat = 0;
  for (const lane of lanes) heat = Math.max(heat, Math.exp(-((y - lane) ** 2) / (2 * REACH * REACH)));
  return heat;
}

/** The stream's speed at a batch speedup, as a multiple of `STREAM`. */
const rateOf = (speed: number) => tierValue(tierOf(speed), (t) => t.rate, mixNumber);

/** The tier a height is nearest, weighing each lane by how near it is, or
 * the middle one's far from every lane. */
function tierNear(y: number, lanes: number[], speeds: number[]) {
  let sum = 0, weight = 0;
  lanes.forEach((lane, k) => {
    const w = Math.exp(-((y - lane) ** 2) / (2 * 3 * REACH * 3 * REACH));
    sum += w * tierOf(speeds[k] ?? 1);
    weight += w;
  });
  return weight > 1e-6 ? sum / weight : 2;
}

const mix = (a: number[], b: number[], t: number) => a.map((c, i) => Math.round(c + (b[i]! - c) * t));

/** One square speck, gold when idle, dark blue in training, and red
 * (brighter and more opaque) the nearer the stream; fading out at the edges
 * it wraps across. */
function paint(ctx: CanvasRenderingContext2D, s: Speck, { w, h }: Size) {
  const edge = Math.min(1, s.x * 30, (1 - s.x) * 30, s.y * 30, (1 - s.y) * 30), heat = s.heat * s.blue;
  const [r, g, b] = mix(mix(GOLD, tierColor(s.tier, "blue"), s.blue), tierColor(s.tier, "red"), heat);
  ctx.globalAlpha = Math.min(1, (s.alpha + heat * 0.6) * edge);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  // Whole pixels, so every speck is a crisp square.
  ctx.fillRect(Math.round(s.x * w), Math.round(s.y * h), s.side, s.side);
}
