/** How Flying enemies (enemies/flying.ts) show on the board: each drawn over the
 * board after the hero, a little above its tile, at half opacity while the
 * hero stands under it so the hero still shows, with a wing at its top
 * right (`wingMark`). Every board draws them through `drawFlyers`, Classic
 * with its baked enemies (which wear the wing already) and each Game theme
 * with its own enemy art and this wing over it. */
import type { Tile } from "../entities.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";

/** How far above its tile a Flying enemy hovers, in tile units (of 24). */
const LIFT = 3;
/** A Flying enemy's opacity while the hero stands under it. */
const UNDER_ALPHA = 0.5;
const WING = "#e8f2ff";

/** A Flying enemy's mark at (x, y) of tile space: a small wing sweeping up
 * and right, 7x6, on a black backing. */
export function wingMark(c: CanvasRenderingContext2D, x: number, y: number) {
  const pixels = [[5, 0], [6, 0], [3, 1], [4, 1], [5, 1], [6, 1], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [0, 4], [1, 4], [3, 4], [0, 5]] as const;
  for (const [fill, grow] of [["#0b0a0e", 1], [WING, 0]] as const) {
    c.fillStyle = fill;
    for (const [dx, dy] of pixels) c.fillRect(x + dx - grow, y + dy - grow, 1 + 2 * grow, 1 + 2 * grow);
  }
}

/** Draws every Flying enemy in view: `paint` draws an enemy tile in tile
 * space (the board's own enemy art), and `wing` adds the wing over it. The
 * one over `hero` is half see-through, columns wrapping by `wrap` (the
 * Delve's width, else 0). */
export function drawFlyers(f: FrameContext, hero: { x: number; y: number }, wrap: number, paint: (c: CanvasRenderingContext2D, t: Tile, x: number, y: number) => void, wing: boolean) {
  const c = f.c;
  forEachViewTile(f, (x, y) => {
    const t = f.world.tile(x, y);
    if (!t.flyer) return;
    c.save();
    toTileSpace(c, f, x, y);
    if ((wrap ? ((x % wrap) + wrap) % wrap : x) === hero.x && y === hero.y) c.globalAlpha = UNDER_ALPHA;
    c.translate(0, -LIFT);
    paint(c, { kind: "enemy", enemy: t.flyer }, x, y);
    if (wing) wingMark(c, 16, 1);
    c.restore();
  });
}
