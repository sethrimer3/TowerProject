import type { Rush } from "./state.ts";
import { toTileSpace, type FrameContext } from "./render-frame.ts";
import { paintHero } from "./tile-painters.ts";

/** How long a rush's echoes last, from the rush (ms). */
export const RUSH_ECHO_MS = 500;
/** The share of that time over which the echoes appear, one after another. */
const APPEAR_SHARE = 0.3;
/** How opaque an echo is when it appears. */
const ECHO_ALPHA = 0.55;

/** Faint echoes of the hero on each tile it rushed off: they appear one
 * after another, from the first tile left, and fade away in the same order,
 * all gone RUSH_ECHO_MS after the rush. None with motion reduced. */
export function drawRushEchoes(f: FrameContext, rush: Rush | null) {
  if (!rush || f.look.reduceMotion) return;
  const age = f.now - rush.at, n = rush.tiles.length;
  if (age < 0 || age >= RUSH_ECHO_MS) return;
  const gap = (RUSH_ECHO_MS * APPEAR_SHARE) / n, life = RUSH_ECHO_MS - gap * (n - 1);
  const c = f.c;
  rush.tiles.forEach(({ x, y }, i) => {
    const t = (age - i * gap) / life;
    if (t < 0 || t >= 1) return;
    c.save();
    c.globalAlpha = ECHO_ALPHA * (1 - t);
    toTileSpace(c, f, x, y);
    paintHero(c, f.look.spritesOff);
    c.restore();
  });
}
