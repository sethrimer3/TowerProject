import type { Dash } from "./state.ts";
import { toTileSpace, type FrameContext } from "./render-frame.ts";

/** How long a dash's echoes last, from the dash (ms). */
export const DASH_ECHO_MS = 500;
/** The share of that time over which the echoes appear, one after another. */
const APPEAR_SHARE = 0.3;
/** How opaque an echo is when it appears. */
const ECHO_ALPHA = 0.55;

/** Faint echoes of the hero on each tile it dashed off: they appear one
 * after another, from the first tile left, and fade away in the same order,
 * all gone DASH_ECHO_MS after the dash, each painted by `paintHero` (the
 * board's own hero: the sprite, or the Neon theme's lines). None with motion
 * reduced. */
export function drawDashEchoes(f: FrameContext, dash: Dash | null, paintHero: (c: CanvasRenderingContext2D) => void) {
  if (!dash || f.look.reduceMotion) return;
  const age = f.now - dash.at, n = dash.tiles.length;
  if (age < 0 || age >= DASH_ECHO_MS) return;
  const gap = (DASH_ECHO_MS * APPEAR_SHARE) / n, life = DASH_ECHO_MS - gap * (n - 1);
  const c = f.c;
  dash.tiles.forEach(({ x, y }, i) => {
    const t = (age - i * gap) / life;
    if (t < 0 || t >= 1) return;
    c.save();
    c.globalAlpha = ECHO_ALPHA * (1 - t);
    toTileSpace(c, f, x, y);
    paintHero(c);
    c.restore();
  });
}
