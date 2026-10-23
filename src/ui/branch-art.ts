/** The upgrade tree's branches as pixel art: each branch a curve two art
 * pixels thick, lit from the upper left inside a crisp black outline, as
 * the rest of the game is drawn. Lines that trail off break up into an
 * ordered dither as they fade, so they scatter into pixels rather than
 * thin out; a withered one crumbles as it goes. Owned and buyable branches
 * glow faintly and carry a spark along them.
 *
 * Pure: it fills a pixel buffer (`BranchArt.pix`, RGBA bytes as one
 * little-endian 32-bit word a pixel, as `ImageData` holds them) that the
 * graph puts on its canvas. */

export type Pt = { x: number; y: number };
/** A branch's colours, as packed pixels (`rgb`). */
export type Tone = { light: number; base: number; shade: number };

/** One branch: a quadratic curve from `a` through `c` to `b`, in art pixels. */
export type Stroke = {
  a: Pt; c: Pt; b: Pt;
  tone: Tone;
  /** Broken into runs this many art pixels long, on and off. */
  dash?: number;
  /** From this far along (0 to 1) it fades out to nothing at its end. */
  fade?: number;
  /** How much of it is left (a withering branch's): 1 whole, 0 gone. */
  alpha?: number;
  /** How much of its fading part crumbles away besides, 0 to 1. */
  crumble?: number;
  /** Seeds where it crumbles. */
  seed?: number;
  /** A faint halo of its colour round the outline. */
  glow?: boolean;
  /** A spark this far along it (0 to 1), if any. */
  mote?: number;
};

/** A colour as a packed pixel. */
export const rgb = (hex: string, a = 255): number => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h.slice(0, 6), 16);
  return (((a & 255) << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
};

/** The 4 × 4 ordered dither: a pixel of a fading line stays while its
 * presence beats its threshold here. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const OUTLINE = rgb("#000000");
/** Below this presence a pixel goes without an outline, so a scattered tail
 * reads as specks of colour, not black blots. */
const OUTLINED = 0.55;

const hash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class BranchArt {
  w = 0;
  h = 0;
  pix = new Uint32Array(0);
  /** Which stroke drew each pixel's core (-1 none), and how present it is. */
  private own = new Int32Array(0);
  private live = new Float32Array(0);
  /** Which stroke each outline pixel rings (-1 none). */
  private ring = new Int32Array(0);

  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.pix = new Uint32Array(w * h);
    this.own = new Int32Array(w * h);
    this.live = new Float32Array(w * h);
    this.ring = new Int32Array(w * h);
  }

  /** Paints `strokes`, later ones over earlier, onto a clear buffer. */
  draw(strokes: readonly Stroke[]) {
    const { w, h, pix, own, live, ring } = this;
    pix.fill(0);
    own.fill(-1);
    ring.fill(-1);
    // The cores: each sample along a curve stamps 2 × 2 pixels.
    strokes.forEach((s, si) => {
      const len = Math.hypot(s.c.x - s.a.x, s.c.y - s.a.y) + Math.hypot(s.b.x - s.c.x, s.b.y - s.c.y);
      if (len > 4 * (w + h)) return;
      const steps = Math.max(2, Math.ceil(len / 0.4)), fade = s.fade ?? 1, alpha = s.alpha ?? 1;
      let px = s.a.x, py = s.a.y, run = 0;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, u = 1 - t;
        const x = u * u * s.a.x + 2 * u * t * s.c.x + t * t * s.b.x, y = u * u * s.a.y + 2 * u * t * s.c.y + t * t * s.b.y;
        run += Math.hypot(x - px, y - py);
        px = x;
        py = y;
        if (s.dash && Math.floor(run / s.dash) % 2) continue;
        const gone = t > fade ? (t - fade) / (1 - fade) : 0;
        const here = alpha * (1 - gone);
        if (here <= 0) continue;
        const x0 = Math.round(x) - 1, y0 = Math.round(y) - 1;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const X = x0 + dx, Y = y0 + dy;
            if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
            if (here < 1 && here * 16 <= BAYER[(Y & 3) * 4 + (X & 3)] + 0.5) continue;
            if (s.crumble && gone > 0 && hash(X, Y, s.seed ?? si) < s.crumble * gone) continue;
            const p = Y * w + X;
            own[p] = si;
            live[p] = here;
          }
      }
    });
    // The outline: every empty pixel beside a solid one.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (own[p] < 0 || live[p] < OUTLINED) continue;
        const near = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const q of near) if (q >= 0 && own[q] < 0 && (ring[q] < 0 || strokes[own[p]].glow)) ring[q] = own[p];
      }
    for (let p = 0; p < w * h; p++) if (ring[p] >= 0) pix[p] = OUTLINE;
    // The glow: a faint pixel of colour just past the outline.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x, r = ring[p];
        if (r < 0 || !strokes[r].glow) continue;
        const near = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        const halo = ((strokes[r].tone.base & 0xffffff) | (48 << 24)) >>> 0;
        for (const q of near) if (q >= 0 && own[q] < 0 && ring[q] < 0 && !pix[q]) pix[q] = halo;
      }
    // The cores, lit from the upper left: the edge facing the light is
    // bright, and a fading tail darkens as it scatters.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x, si = own[p];
        if (si < 0) continue;
        const tone = strokes[si].tone, here = live[p];
        const lit = (x === 0 || own[p - 1] < 0) || (y === 0 || own[p - w] < 0);
        pix[p] = here < 0.4 ? tone.shade : here < 0.75 ? tone.base : lit ? tone.light : tone.base;
      }
    // The sparks: a bright pixel pair with a glint on either side.
    for (const s of strokes) {
      if (s.mote === undefined || (s.alpha ?? 1) < 1) continue;
      const t = s.mote, u = 1 - t;
      const x = Math.round(u * u * s.a.x + 2 * u * t * s.c.x + t * t * s.b.x), y = Math.round(u * u * s.a.y + 2 * u * t * s.c.y + t * t * s.b.y);
      const white = rgb("#ffffff");
      for (const [dx, dy, c] of [[-1, -1, white], [0, -1, white], [-1, 0, white], [0, 0, s.tone.light], [-2, -1, s.tone.light], [1, -1, s.tone.light], [-1, -2, s.tone.light], [-1, 1, s.tone.light]] as const) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h && own[Y * w + X] >= 0) pix[Y * w + X] = c;
      }
    }
  }
}
