import type { Dash, Facing } from "./state.ts";
import { toTileSpace, type FrameContext } from "./render-frame.ts";

/** How long a dash's echoes last, from the dash (ms). */
export const DASH_ECHO_MS = 500;
/** The share of that time over which the echoes appear, one after another. */
const APPEAR_SHARE = 0.3;
/** How opaque an echo is when it appears. */
const ECHO_ALPHA = 0.55;

type PaintHero = (c: CanvasRenderingContext2D, facing: Facing) => void;

/** The dashes whose echoes still play on the board, oldest first: a dash
 * soon after another (the hand's next target, at speed) leaves the first
 * one's echoes to play out instead of cutting them off. */
export class DashEchoes {
  private playing: Dash[] = [];
  /** A new dash, at `now`: its echoes join those still playing. */
  add(dash: Dash, now: number) {
    this.playing = this.playing.filter((d) => now - d.at < DASH_ECHO_MS);
    this.playing.push(dash);
  }
  /** Another board: the echoes left on the last one are dropped. */
  clear() {
    this.playing = [];
  }
  /** Whether every echo has faded by `now`. */
  over(now: number) {
    return this.playing.every((d) => now - d.at >= DASH_ECHO_MS);
  }
  draw(f: FrameContext, paintHero: PaintHero) {
    for (const dash of this.playing) drawDashEchoes(f, dash, paintHero);
  }
}

/** Faint echoes of the hero on each tile it dashed off: they appear one
 * after another, from the first tile left, and fade away in the same order,
 * all gone DASH_ECHO_MS after the dash, each painted by `paintHero` (the
 * board's own hero: the sprite, or the Neon theme's lines), facing the step
 * it took off that tile. None with motion reduced. */
function drawDashEchoes(f: FrameContext, dash: Dash, paintHero: PaintHero) {
  if (f.look.reduceMotion) return;
  const age = f.now - dash.at, n = dash.tiles.length;
  if (age < 0 || age >= DASH_ECHO_MS) return;
  const gap = (DASH_ECHO_MS * APPEAR_SHARE) / n, life = DASH_ECHO_MS - gap * (n - 1);
  const c = f.c;
  dash.tiles.forEach(({ x, y, dx, dy }, i) => {
    const t = (age - i * gap) / life;
    if (t < 0 || t >= 1) return;
    c.save();
    c.globalAlpha = ECHO_ALPHA * (1 - t);
    toTileSpace(c, f, x, y);
    paintHero(c, { dx, dy });
    c.restore();
  });
}
