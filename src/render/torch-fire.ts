import { drawKit } from "../sprites/kit.ts";
import { drawPixelOutline } from "../sprites/pixel-outline.ts";

/** A torch's fire, ported from TowerDefense's city torches (`fireTongues` in
 * its src/defend/pixel-fx.ts): a bed of embers in the torch's bowl and
 * tongues rising off it, shrinking and cooling as they climb.
 * It is drawn in art pixels twice as fine as the torch sprite's, each edge
 * snapped to a whole screen pixel, so it stays crisp at every zoom.
 * Presentation only. */

type Ctx = CanvasRenderingContext2D;

/** Art pixels a tile (the sprite has 24), and the fire's colours, hottest first. */
const ART = 48;
const FIRE = {
  warm: ["#fff4c8", "#f6c75a", "#f08a34", "#c8452a"],
  blue: ["#ccecff", "#88c5db", "#54879a", "#315363"],
} as const;
type FlameColor = keyof typeof FIRE;
/** The tongues, how wide they spread from the bed, and how high they climb. */
const TONGUES = 13, SPREAD = 7, TALL = 1.45;
/** The bed's middle, in art pixels: over the middle of the bowl's rim. */
const BED_X = 23, BED_Y = 19;
/** The sprite rows above this hold the baked flame; the hardware starts here. */
const TORCH_HARDWARE_ROW = 10;

/** A fixed number in [0, 1) for (a, b, c): each torch's tongues stay its own. */
function hash01(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Fills art pixels in tile space (24 units a tile), each edge rounded to a
 * whole screen pixel under the current transform. */
function artPen(c: Ctx) {
  const m = c.getTransform(), s = m.a, ox = m.e, oy = m.f, u = (24 / ART) * s;
  return (ax: number, ay: number, w = 1, h = 1) => {
    const x0 = Math.round(ax * u + ox), y0 = Math.round(ay * u + oy);
    const x1 = Math.max(x0 + 1, Math.round((ax + w) * u + ox)), y1 = Math.max(y0 + 1, Math.round((ay + h) * u + oy));
    c.fillRect((x0 - ox) / s, (y0 - oy) / s, (x1 - x0) / s, (y1 - y0) / s);
  };
}

/** A puff `r` art pixels from its middle: a square with its corners cut, or a single pixel. */
function puff(dot: ReturnType<typeof artPen>, x: number, y: number, r: number) {
  if (r <= 0) return dot(x, y);
  dot(x - r + 1, y - r, 2 * r - 1, 2 * r + 1);
  dot(x - r, y - r + 1, 2 * r + 1, 2 * r - 1);
}

/** The fire of the torch on tile (x, y), in tile space; `still` holds it as it is at time 0. */
export function paintTorchFire(c: Ctx, x: number, y: number, now: number, still: boolean, color: FlameColor = "warm") {
  const fire = FIRE[color];
  const dot = artPen(c), t = still ? 0 : now / 1000, seed = x * 7919 + y * 104729 + 17;
  c.save();
  c.fillStyle = fire[3];
  dot(BED_X - 3, BED_Y, 7, 2);
  for (let k = 0; k < TONGUES; k++) {
    const u = (s: number) => hash01(seed, k, s);
    const age = (t * (1.1 + u(1840) * 0.8) + u(1841)) % 1;
    const fx = BED_X + 0.5 + (u(1842) - 0.5) * SPREAD * (1 - age) + Math.sin(t * 5 + k) * 1.2 * age;
    const fy = BED_Y - age * (8 + u(1843) * 4) * TALL;
    const r = Math.round((1 - age) * 2.2 - 0.3);
    c.fillStyle = age < 0.18 ? fire[0] : age < 0.42 ? fire[1] : age < 0.7 ? fire[2] : fire[3];
    puff(dot, Math.round(fx), Math.round(fy), Math.max(0, r));
  }
  c.restore();
}


/** The original metal hardware with a live flame in its bowl, in tile space. */
export function paintLitTorch(c: Ctx, x: number, y: number, now: number, still: boolean, color: FlameColor = "warm") {
  c.save();
  c.beginPath();
  c.rect(-2, TORCH_HARDWARE_ROW, 28, 26 - TORCH_HARDWARE_ROW);
  c.clip();
  drawPixelOutline(c, "torch", "black");
  drawKit(c, "torch");
  c.restore();
  paintTorchFire(c, x, y, now, still, color);
}
