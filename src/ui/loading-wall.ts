/** The loading screen's wall, from Tower Defense's loading screen: dressed
 * vault stone behind a round pier on the left, baked once a size (colour and
 * a height map, at `ART` screen pixels a pixel) and lit per pixel through its
 * slopes by the torch hung off the pier (`paintSconce`, a small pixel sprite
 * whose flame flickers on the wall clock in a black outline).
 * Presentation only: it draws from no random stream. */
import { getTorchFlicker, getTorchSway } from "../render/lighting.ts";

type RGB = [number, number, number];
/** Screen (CSS) pixels to an art pixel. */
export const ART = 3;
/** How wide the pier is, in art pixels: narrower in a phone-wide screen. The
 * torch hangs off its inner side, placed by CSS from the `--pier` width the
 * wall sets on its parent (loading.css's `.loading-torch`). */
const pierWidth = (w: number) => (w * ART < 480 ? 6 : 12);
/** Fewest milliseconds between two lightings (the flicker is slow). */
const FRAME_MS = 70;

/** A fixed number in [0, 1) for a few integers. */
function h01(a: number, b: number, c = 0) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (v: number, m: number) => ((v % m) + m) % m;

/** The stone at pixel (x, y): its colour and height (0 in the joints, rising
 * to 1 across a block's face). `pier` lays a pier's bigger blocks. */
function ashlar(x: number, y: number, pier: boolean): { rgb: RGB; hgt: number } {
  const ch = pier ? 12 : 9, bw = pier ? 16 : 18;
  const course = Math.floor(y / ch), off = mod(course, 2) ? bw / 2 : 0;
  const bx = Math.floor((x + off) / bw), lx = mod(x + off, bw), ly = mod(y, ch);
  const edge = Math.min(lx, bw - 1 - lx, ly, ch - 1 - ly);
  const t = (pier ? 0.95 : 0.82) * (0.82 + h01(bx, course, 9) * 0.3) * (0.93 + h01(x, y, 1) * 0.12);
  if (edge === 0) return { rgb: [30, 27, 26], hgt: 0 };
  return { rgb: [92 * t, 86 * t, 80 * t], hgt: Math.min(1, edge / 2.2) * (0.85 + h01(x, y, 2) * 0.15) };
}

/** How much more (or less) light a bump-mapped pixel with slope (sx, sy)
 * takes from a light (dx, dy) away at distance d. */
const facing = (sx: number, sy: number, dx: number, dy: number, d: number) => (d > 0.5 ? Math.max(0.15, 1 + 2.6 * ((sx * dx + sy * dy) / d)) : 1);

const PILLAR_OUTLINE: RGB = [8, 7, 7];
/** A round pier's shade at column `col` of `width`, darkening toward both
 * sides; its first and last columns are its black outline (null). */
function pillarShade(col: number, width: number): number | null {
  if (col <= 0 || col >= width - 1) return null;
  const s = (2 * (col + 0.5)) / width - 1;
  return 0.45 + 0.55 * Math.sqrt(1 - s * s);
}

/** A torch on the wall, in CSS pixels from the wall's corner. */
export type TorchSpot = { x: number; y: number };

export class LoadingWall {
  private w = 0;
  private h = 0;
  private albedo = new Float32Array(0);
  private sx = new Float32Array(0);
  private sy = new Float32Array(0);
  private image: ImageData | null = null;
  private last = -Infinity;

  constructor(private canvas: HTMLCanvasElement) {}

  /** Bakes the wall when the canvas's size changed. */
  private fit() {
    const w = Math.max(8, Math.ceil(this.canvas.clientWidth / ART)), h = Math.max(8, Math.ceil(this.canvas.clientHeight / ART));
    if (w === this.w && h === this.h) return false;
    const pierW = pierWidth(w);
    this.canvas.parentElement?.style.setProperty("--pier", `${pierW * ART}px`);
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.image = new ImageData(w, h);
    const n = w * h, hgt = new Float32Array(n);
    this.albedo = new Float32Array(n * 3);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const pier = x < pierW, i = y * w + x, px = ashlar(x, y, pier);
        const k = pier ? pillarShade(x, pierW) : 1;
        hgt[i] = k === null ? 0 : px.hgt;
        if (k === null) this.albedo.set(PILLAR_OUTLINE, i * 3);
        else this.albedo.set([px.rgb[0] * 0.92 * k, px.rgb[1] * 0.88 * k, px.rgb[2] * 1.02 * k], i * 3);
      }
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        // A raised surface's normal points against its height gradient.
        this.sx[i] = (hgt[y * w + Math.max(0, x - 1)] - hgt[y * w + Math.min(w - 1, x + 1)]) / 2;
        this.sy[i] = (hgt[Math.max(0, y - 1) * w + x] - hgt[Math.min(h - 1, y + 1) * w + x]) / 2;
      }
    return true;
  }

  /** Lights the wall at most every `FRAME_MS` (every three seconds with
   * Reduce Motion), by wall-clock `now`. */
  draw(now: number, torches: TorchSpot[], reduced: boolean) {
    const resized = this.fit();
    if (!resized && now - this.last < (reduced ? 3000 : FRAME_MS)) return;
    this.last = now;
    const { w, h, albedo, sx, sy } = this, out = this.image!.data;
    const lights = torches.map((t, k) => {
      const seed = k ? 5 : 2;
      const f = getTorchFlicker({ x: seed, y: 9 }, now, reduced), sway = getTorchSway({ x: seed, y: 9 }, now, reduced);
      return { x: t.x / ART + sway.x * 35 * (k ? -1 : 1), y: t.y / ART, r: Math.min(w, h) * 0.5 + 40 * f, k: 1.25 * f };
    });
    const amb: RGB = [0.25, 0.21, 0.32], warm: RGB = [1, 0.62, 0.3];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4;
        let lr = amb[0], lg = amb[1], lb = amb[2];
        for (const l of lights) {
          const dx = l.x - x, dy = l.y - y, d = Math.hypot(dx, dy);
          if (d >= l.r) continue;
          const f = (1 - d / l.r) ** 2 * l.k * facing(sx[i], sy[i], dx, dy, d);
          lr += warm[0] * f;
          lg += warm[1] * f;
          lb += warm[2] * f;
        }
        out[o] = Math.min(255, albedo[i * 3] * lr * 1.5);
        out[o + 1] = Math.min(255, albedo[i * 3 + 1] * lg * 1.5);
        out[o + 2] = Math.min(255, albedo[i * 3 + 2] * lb * 1.5);
        out[o + 3] = 255;
      }
    this.canvas.getContext("2d")!.putImageData(this.image!, 0, 0);
  }
}

// ── The torch ────────────────────────────────────────────────────────────
/** A sconce's sprite size, in art pixels. */
export const SCONCE = { w: 11, h: 24 };
/** The flame's wick in the sconce sprite, in art pixels. */
export const WICK = { x: 6.5, y: 9 };
const OUT = "#0b0907";
const OUTLINE = "#140c0a";
/** Flame, coolest to hottest. */
const FLAME = ["#7a1c10", "#c8452a", "#f08a34", "#f6c75a", "#fff4c8"];

/** Paints a wall torch into `canvas` (`SCONCE` pixels): an iron bracket on a
 * backplate, an oak haft wrapped in pitch-soaked rags, and its flame, which
 * leans and licks with the wall clock (still under Reduce Motion). */
export function paintSconce(canvas: HTMLCanvasElement, now: number, reduced: boolean) {
  if (canvas.width !== SCONCE.w) {
    canvas.width = SCONCE.w;
    canvas.height = SCONCE.h;
  }
  const c = canvas.getContext("2d")!;
  c.clearRect(0, 0, SCONCE.w, SCONCE.h);
  const px = (x: number, y: number, colour: string, w = 1, hh = 1) => {
    c.fillStyle = colour;
    c.fillRect(x, y, w, hh);
  };
  // The backplate on the wall, riveted.
  px(0, 13, OUT, 3, 9);
  px(0, 14, "#3a3632", 2, 7);
  px(0, 15, "#6a645c", 1, 1);
  px(0, 19, "#6a645c", 1, 1);
  // The bracket arm and its cup.
  px(2, 17, OUT, 4, 3);
  px(2, 18, "#4a4440", 3, 1);
  px(4, 13, OUT, 6, 5);
  px(5, 14, "#55504a", 4, 3);
  px(5, 14, "#8a8278", 4, 1);
  // The haft, then its rag wrapping.
  px(5, 9, OUT, 4, 5);
  px(6, 10, "#5a3a22", 2, 4);
  px(6, 9, "#2a1c14", 2, 1);
  torchFlame(px, 6, 9, now, 2, reduced);
}

type Pen = (x: number, y: number, colour: string, w?: number, h?: number) => void;

/** A cut-cornered square of radius r (a single pixel at 0). */
function puff(pen: Pen, colour: string, x: number, y: number, r: number) {
  if (r <= 0) return pen(x, y, colour);
  pen(x - r + 1, y - r, colour, 2 * r - 1, 2 * r + 1);
  pen(x - r, y - r + 1, colour, 2 * r + 1, 2 * r - 1);
}

/** Puffs of fire rising from a stationary wick inside one black outline.
 * Pure wall-clock animation. */
function torchFlame(pen: Pen, x: number, y: number, now: number, seed: number, reduced: boolean) {
  const clock = reduced ? 0 : now;
  const sway = getTorchSway({ x: seed, y: 9 }, clock, reduced);
  const flicker = getTorchFlicker({ x: seed, y: 9 }, clock, reduced);
  const puffs: { x: number; y: number; r: number; tone: number }[] = [];
  for (let k = 0; k < 5; k++) {
    const age = ((clock / (640 + k * 27) + k * 0.21 + seed * 0.13) % 1 + 1) % 1;
    const rise = age * 7 * sway.stretch;
    const drift = Math.sin(age * 5 + seed + clock / 370) * age * 1.4 + sway.x * 35 * age;
    puffs.push({ x: x + Math.round(drift), y: y - Math.round(rise), r: Math.max(0, Math.round((2.3 - age * 2) * flicker)), tone: age < 0.2 ? 3 : age < 0.5 ? 2 : 1 });
  }
  for (const p of puffs) puff(pen, OUTLINE, p.x, p.y, p.r + 1);
  for (const p of puffs) {
    puff(pen, FLAME[p.tone], p.x, p.y, p.r);
    if (p.r > 0) pen(p.x, p.y - 1, FLAME[p.tone + 1]);
  }
  puff(pen, FLAME[4], x, y, 1);
  const ember = ((clock / 1100 + seed * 0.17) % 1 + 1) % 1;
  pen(x + Math.round(Math.sin(seed + ember * 5) * 2), y - 4 - Math.round(ember * 4), FLAME[ember < 0.5 ? 3 : 1]);
}
