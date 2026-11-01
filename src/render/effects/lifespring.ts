import { tileCenter, type FrameContext } from "../render-frame.ts";

/** The field's rings, as a new activation tints them, and an Effect Wave's. */
const RING_GREEN = "#62f29a";
const RING_BLUE = "#6cc8ff";
const WAVE_GREEN = "#b5ffd2";
/** The rings are mostly see-through. */
const RING_ALPHA = 0.25;
/** How long the field takes to spread from the hero, and an Effect Wave to reach the board's edges, in ms. */
export const FIELD_GROW_MS = 450;
export const WAVE_MS = 650;
/** The three rings: each one's size, turns a second, where it starts (of a turn),
 * how far its center sits off the hero (of the radius), and its gaps (each its
 * middle and width, of a turn). Their differing speeds and gaps keep shifting
 * against one another. */
const RINGS = [
  { size: 0.97, spin: 0.09, start: 0, off: 0.03, gaps: [[0.04, 0.035], [0.37, 0.02], [0.71, 0.05]] },
  { size: 0.94, spin: -0.13, start: 0.33, off: 0.05, gaps: [[0.2, 0.05], [0.55, 0.025], [0.86, 0.03]] },
  { size: 0.91, spin: 0.17, start: 0.67, off: 0.04, gaps: [[0.12, 0.025], [0.48, 0.045], [0.78, 0.02], [0.93, 0.03]] },
] as const;
const TURN = Math.PI * 2;

/** The rings round (x, y): `radius` once `grown` (0 to 1) has spread them, `now`
 * (ms) spinning them, blue while `tinted`. */
export function paintLifespring(c: CanvasRenderingContext2D, x: number, y: number, radius: number, now: number, tinted: boolean, grown = 1) {
  const eased = 1 - (1 - grown) * (1 - grown);
  c.save();
  c.strokeStyle = tinted ? RING_BLUE : RING_GREEN;
  c.lineWidth = Math.max(1.5, radius * 0.028);
  c.globalAlpha = RING_ALPHA;
  for (const ring of RINGS) {
    const angle = (ring.start + (ring.spin * now) / 1000) * TURN, r = radius * ring.size * eased;
    const cx = x + Math.cos(angle) * radius * ring.off * eased, cy = y + Math.sin(angle) * radius * ring.off * eased;
    ring.gaps.forEach(([middle, width], i) => {
      const [next, nextWidth] = ring.gaps[(i + 1) % ring.gaps.length]!;
      const from = angle + (middle + width / 2) * TURN;
      const to = angle + (next - nextWidth / 2 + (next < middle ? 1 : 0)) * TURN;
      c.beginPath();
      c.arc(cx, cy, r, from, to);
      c.stroke();
    });
  }
  c.restore();
}

/** An Effect Wave `age` ms old: a ring rising from (x, y) to `reach`, fading as it goes. */
export function paintEffectWave(c: CanvasRenderingContext2D, x: number, y: number, reach: number, age: number) {
  const t = age / WAVE_MS;
  if (t < 0 || t >= 1) return;
  c.save();
  c.strokeStyle = WAVE_GREEN;
  c.lineWidth = Math.max(2, reach * 0.012);
  c.globalAlpha = 0.75 * (1 - t);
  c.beginPath();
  c.arc(x, y, reach * t, 0, TURN);
  c.stroke();
  c.restore();
}

/** What the board shows of Lifespring: the Effect Waves just fired, out past
 * the board's corners, and the rings round the hero as drawn while a pool holds,
 * spreading from it as they form, out to its `reach` in hundredths of a tile. Reduced motion stills them, and shows no wave. */
export function drawLifespring(f: FrameContext, field: { tinted: boolean; reach: number } | undefined, fx: { waves: readonly number[]; formedAt: number }) {
  const { x, y } = tileCenter(f, f.playerX, f.playerY), still = f.look.reduceMotion;
  if (!still) for (const at of fx.waves) paintEffectWave(f.c, x, y, f.width * 1.5, f.now - at);
  if (field) paintLifespring(f.c, x, y, (f.s * field.reach) / 100, still ? 0 : f.now, field.tinted, still ? 1 : Math.max(0, Math.min(1, (f.now - fx.formedAt) / FIELD_GROW_MS)));
}
