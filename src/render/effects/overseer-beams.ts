import { beamDirection, type Beams } from "../../arcana/overseer.ts";
import type { ShownClock } from "../../shown.ts";
import { TURN_TICKS } from "../../enemies/ranged.ts";
import { tileCenter, type FrameContext } from "../render-frame.ts";

/** How strongly a beam lightens what it falls on: soft light keeps each colour's
 * hue and leaves black and white alone, so this is only just to be seen. */
const BEAM_LIGHT = "rgba(255, 255, 255, 0.2)";

/** The tick of the turn `clock` is showing at `now`: the last once it is over,
 * or at once with reduced motion. */
export function shownTick(clock: ShownClock | null, now: number, reduceMotion: boolean) {
  if (!clock || reduceMotion) return TURN_TICKS;
  return Math.max(0, Math.min(TURN_TICKS, (TURN_TICKS * (now - clock.at)) / clock.ms));
}

/** Overseer's beams: a faint brightening in a spotlight's shape from the hero
 * as drawn, out past the board's edges and over its walls, turning through
 * the turn being shown as the volley's ticks read it. */
export function drawOverseerBeams(f: FrameContext, beams: Beams, clock: ShownClock | null) {
  const c = f.c, { x, y } = tileCenter(f, f.playerX, f.playerY), reach = f.width * 2;
  // `turns` has already counted the turn being shown; with none shown, the last tick is the next turn's start.
  const degrees = beams.turns ? beamDirection(beams.turns - 1, shownTick(clock, f.now, f.look.reduceMotion)) / 100 : 0;
  c.save();
  c.globalCompositeOperation = "soft-light";
  c.fillStyle = BEAM_LIGHT;
  c.beginPath();
  for (let i = 0; i < beams.count; i++) {
    // Clockwise from straight up, as a canvas's angles run clockwise from the right.
    const mid = ((degrees + (i * 360) / beams.count - 90) * Math.PI) / 180, half = (beams.width * Math.PI) / 360;
    c.moveTo(x, y);
    c.arc(x, y, reach, mid - half, mid + half);
    c.closePath();
  }
  c.fill();
  c.restore();
}
