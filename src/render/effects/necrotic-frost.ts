import type { FrostArea } from "../../arcana/necrotic-frost.ts";
import { tileRandom } from "../../random.ts";
import { tileCenter, type FrameContext } from "../render-frame.ts";

/** Necrotic Frost's field: a faint purple disc, to show its range without hiding the
 * floor, a pale purple ring just inside a pale green one at its edge, and small
 * bubbles rising and popping across it. */
const SHADE = "#b48cff";
const SHADE_ALPHA = 0.2;
const INNER_RING = "#d9c2ff";
const OUTER_RING = "#c4f5c0";
const BUBBLE = "#c4f5c0";
/** The bubbles a field keeps going at once, and how long each lasts, in ms. */
const BUBBLES = 12;
const BUBBLE_MS = 1500;
/** How far through its life a bubble pops. */
const POPS_AT = 0.75;
/** Salts the bubbles' rolls apart from anything else on those numbers. */
const BUBBLE_SALT = 0xb0bb1e;

/** One bubble's place in its cycle: presentation only, so the same bubble comes back
 * from `now` alone, with nothing kept and no random stream drawn on. */
function paintBubbles(c: CanvasRenderingContext2D, x: number, y: number, radius: number, tile: number, now: number, id: number) {
  c.fillStyle = c.strokeStyle = BUBBLE;
  c.lineWidth = Math.max(1, tile / 32);
  for (let k = 0; k < BUBBLES; k++) {
    const clock = now / BUBBLE_MS + tileRandom(k, id, BUBBLE_SALT), cycle = Math.floor(clock), life = clock - cycle;
    const turn = tileRandom(k, cycle, BUBBLE_SALT + id) * Math.PI * 2, out = Math.sqrt(tileRandom(cycle, k, BUBBLE_SALT + id)) * radius * 0.92;
    const at = { x: x + Math.cos(turn) * out, y: y + Math.sin(turn) * out }, size = (0.05 + 0.05 * tileRandom(cycle, id, BUBBLE_SALT + k)) * tile;
    c.beginPath();
    if (life < POPS_AT) {
      const grown = life / POPS_AT;
      c.globalAlpha = 0.25 + 0.35 * grown;
      c.arc(at.x, at.y, size * (0.5 + 0.5 * grown), 0, Math.PI * 2);
      c.fill();
    } else {
      const popped = (life - POPS_AT) / (1 - POPS_AT);
      c.globalAlpha = 0.7 * (1 - popped);
      c.arc(at.x, at.y, size * (1 + popped), 0, Math.PI * 2);
      c.stroke();
    }
  }
}

/** The field `id` round (x, y), `radius` wide, its rings `rim` thick, a tile being
 * `tile` wide: `still`, no bubbles. */
export function paintFrostField(c: CanvasRenderingContext2D, x: number, y: number, radius: number, rim: number, tile: number, now: number, id: number, still: boolean) {
  c.save();
  c.beginPath();
  c.arc(x, y, radius, 0, Math.PI * 2);
  c.fillStyle = SHADE;
  c.globalAlpha = SHADE_ALPHA;
  c.fill();
  c.globalAlpha = 1;
  c.lineWidth = rim;
  c.strokeStyle = OUTER_RING;
  c.stroke();
  c.beginPath();
  c.arc(x, y, Math.max(0, radius - rim * 1.5), 0, Math.PI * 2);
  c.strokeStyle = INNER_RING;
  c.stroke();
  if (!still) paintBubbles(c, x, y, radius, tile, now, id);
  c.restore();
}

/** What the board shows of Necrotic Frost: each field off the hero as drawn, while any stands. */
export function drawFrostFields(f: FrameContext, area: FrostArea | undefined) {
  if (!area) return;
  for (const field of area.fields) {
    const { x, y } = tileCenter(f, f.playerX + field.x, f.playerY + field.y);
    paintFrostField(f.c, x, y, (f.s * area.radius) / 100, Math.max(1, f.s / 24), f.s, f.now, field.id, f.look.reduceMotion);
  }
}
