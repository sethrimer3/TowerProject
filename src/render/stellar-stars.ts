import { tileRandom } from "../random.ts";
import { forEachViewTile, type FrameContext } from "./render-frame.ts";

// A Stellar Floor's stars (docs/agents/environments.md): each tile may hold
// one star at a time, worked out from the tile and the clock alone, so they
// need no state, stay where they are as the camera moves, and draw the same
// for any clock a test gives them.

/** How often a tile's next star comes: about one tile in ten shows one at a time. */
const STAR_CYCLE_MS = 16_000;
export const MIN_LIFE_MS = 1000, MAX_LIFE_MS = 2000;
/** Every star's hue goes round the rainbow together in this time. */
const HUE_CYCLE_MS = 3000;
/** The slow turn, in radians a millisecond: about once in ten seconds. */
const TURN_PER_MS = 0.0006;
/** How far a star's points reach at its largest, in tiles. */
const MIN_REACH = 0.22, MAX_REACH = 0.42;
const POINTS = 5, INNER = 0.45;
const SALT = 0x57a125;

/** The hue (0 to 360) every star wears at `now`. */
export const starHue = (now: number) => ((now / HUE_CYCLE_MS) * 360) % 360;

/** The star on tile (x, y) at `now`, if it is showing one: where in the tile
 * it stands (0 to 1, up from the tile's bottom), how far its points reach in
 * tiles, and its turn in radians. It grows from a point and shrinks to one. */
export function starAt(x: number, y: number, now: number) {
  const k = (now + tileRandom(x, y, SALT) * STAR_CYCLE_MS) / STAR_CYCLE_MS, cycle = Math.floor(k), age = (k - cycle) * STAR_CYCLE_MS;
  const drawn = (salt: number) => tileRandom(x, y, SALT ^ Math.imul(cycle + 1, 0x9e3779b1) ^ salt);
  const life = MIN_LIFE_MS + drawn(0x1a2b3c) * (MAX_LIFE_MS - MIN_LIFE_MS);
  if (age >= life) return null;
  return {
    px: drawn(0x4d5e6f), py: drawn(0x708192),
    reach: (MIN_REACH + drawn(0xa3b4c5) * (MAX_REACH - MIN_REACH)) * Math.sin((Math.PI * age) / life),
    turn: drawn(0xd6e7f8) * Math.PI * 2 + now * TURN_PER_MS,
    life,
  };
}

/** Draws the stars of the tiles in view that `stellar` says stand on a Stellar
 * Floor. With motion reduced they hold still, their hue still turning. */
export function drawStellarStars(f: FrameContext, stellar: (x: number, y: number) => boolean) {
  const c = f.c, s = f.s, now = f.look.reduceMotion ? 0 : f.now, hue = starHue(f.now);
  c.save();
  c.fillStyle = `hsl(${hue}, 100%, 70%)`;
  c.strokeStyle = `hsl(${hue}, 100%, 22%)`;
  c.lineWidth = Math.max(1, s * 0.03);
  c.lineJoin = "round";
  forEachViewTile(f, (x, y) => {
    const star = starAt(x, y, now);
    if (!star || !star.reach || !stellar(x, y)) return;
    const cx = (x - f.left + star.px) * s, cy = (f.n - (y - f.bottom) - star.py) * s;
    c.beginPath();
    for (let i = 0; i < POINTS * 2; i++) {
      const angle = star.turn + (i * Math.PI) / POINTS, reach = star.reach * s * (i % 2 ? INNER : 1);
      c.lineTo(cx + Math.sin(angle) * reach, cy - Math.cos(angle) * reach);
    }
    c.closePath();
    c.fill();
    c.stroke();
  });
  c.restore();
}
