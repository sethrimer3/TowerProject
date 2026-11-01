import { ghostDirection, ghostOffset, type GhostStrike } from "../../arcana/phantasm.ts";
import { shortWay } from "../../volley.ts";
import type { ShownClock } from "../../shown.ts";
import { tileTransform, type FrameContext } from "../render-frame.ts";
import { shownTick } from "./overseer-beams.ts";

/** How long a ghost's strike takes to fade away, in ms. */
export const GHOST_BURST_MS = 260;
/** A ghost, half a tile wide, in a tile's 24-unit space. */
const GHOST = [
  "....####....",
  "..########..",
  ".##########.",
  ".##oo##oo##.",
  "###oo##oo###",
  "############",
  "############",
  "############",
  "############",
  "############",
  "###.####.###",
  "#.....##...#",
];
const BODY = "#e8f4ff";
const EYES = "#10151c";
/** Each row's runs of the characters in `inside`. */
const runsOf = (inside: string) => GHOST.flatMap((row, y) => [...row.matchAll(new RegExp(`[${inside}]+`, "g"))].map((m) => ({ x: m.index, y, w: m[0].length })));
const BODY_RUNS = runsOf("#o"), EYE_RUNS = runsOf("o");

/** How far a ghost bobs at `now`, each in its own time, in a tile's 24ths. */
export const ghostBob = (now: number, slot: number) => Math.sin(now / 320 + slot * 1.7);

/** A ghost in a tile's 24-unit space, one path a colour so it blends evenly at any
 * alpha. `bob` lifts it, in a tile's 24ths. */
export function paintGhost(c: CanvasRenderingContext2D, bob: number) {
  const x0 = 12 - GHOST[0]!.length / 2, y0 = 12 - GHOST.length / 2 - bob;
  for (const [runs, color] of [[BODY_RUNS, BODY], [EYE_RUNS, EYES]] as const) {
    c.fillStyle = color;
    c.beginPath();
    for (const r of runs) c.rect(x0 + r.x, y0 + r.y, r.w, 1);
    c.fill();
  }
}

/** A ghost's strike, `k` of the way through (0 to 1), in a tile's 24-unit space: a ring spreading and fading. */
export function paintGhostBurst(c: CanvasRenderingContext2D, k: number, alpha: number) {
  c.save();
  c.globalAlpha = alpha * (1 - k);
  c.strokeStyle = BODY;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(12, 12, 5 + 11 * k, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

/** What the board shows of Phantasm at `alpha`: the ghosts round the hero as drawn,
 * turning through the turn `clock` shows; a ghost that struck this turn until the
 * moment it did, then its burst where it was. */
export function drawPhantasms(f: FrameContext, ring: { ghosts: readonly number[]; ring: number; turns: number; spin: number } | undefined, struck: readonly (GhostStrike & { at: number })[], clock: ShownClock | null, alpha: number, wrap: number) {
  if (alpha <= 0 || (!ring && !struck.length)) return;
  const { c, now, playerX, playerY } = f, still = f.look.reduceMotion;
  // Each from the board's own transform, which `tileTransform` builds on.
  const onTile = (x: number, y: number, paint: () => void) => {
    c.save();
    c.setTransform(tileTransform(f, x, y));
    c.globalAlpha = alpha;
    paint();
    c.restore();
  };
  const ghost = (direction: number, slot: number) => {
    const off = ghostOffset(direction);
    onTile(playerX + off.x, playerY + off.y, () => paintGhost(c, still ? 0 : ghostBob(now, slot)));
  };
  // `turns` has already counted the turn being shown.
  if (ring) for (const slot of ring.ghosts) ghost(ghostDirection(ring.turns - 1, slot, ring.ring, ring.spin, shownTick(clock, now, still)), slot);
  for (const g of struck) {
    if (still) continue;
    if (now < g.at) ghost(g.direction, g.tick);
    else if (now < g.at + GHOST_BURST_MS) onTile(playerX + shortWay(g.x - playerX, wrap), g.y, () => paintGhostBurst(c, (now - g.at) / GHOST_BURST_MS, alpha));
  }
}
