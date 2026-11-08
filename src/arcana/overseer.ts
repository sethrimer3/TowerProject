import { bearing } from "../exact.ts";
import { TURN_TICKS } from "../enemies/ranged.ts";

// Overseer's beams (docs/agents/arcana.md): spotlights centered on the hero,
// evenly spaced round it, that turn clockwise a little each turn and take no
// notice of walls. An enemy in one takes the hero's ATK multiplied by the
// bonus. Whether it is in one decides play, so it is exact arithmetic in every
// engine: the beams' direction in whole hundredths of a degree, the enemy's
// from `bearing`. Drawing reads the same direction.

/** How far the beams turn clockwise each turn, in hundredths of a degree. */
export const BEAM_TURN = 400;

/** Overseer's beams in a run: how many, each one's width in degrees, the ATK
 * multiplier, and the turns the run has finished (`run.beamTurns`). */
export type Beams = { count: number; width: number; bonus: number; turns: number; aim?: number };
/** Where the first beam points: held on `aim` (Challenger's Defiance), else turning. */
export const beamsDirection = (beams: Pick<Beams, "turns" | "aim">, tick = 0) => beams.aim ?? beamDirection(beams.turns, tick);

/** Where the first beam points `tick` ticks into the turn after `turns` finished
 * turns, in hundredths of a degree clockwise from straight up the board. */
export const beamDirection = (turns: number, tick = 0) => (turns * BEAM_TURN + (tick * BEAM_TURN) / TURN_TICKS) % 36_000;

/** Whether what lies `dx`, `dy` tiles from the hero (rows rising up the board)
 * is in a beam `tick` ticks into the turn: the angle off the nearest beam's
 * center at most half a beam's width. What stands at the hero's own spot is in
 * them all, since they all start there. */
export function inBeams(beams: Beams, tick: number, dx: number, dy: number) {
  if (!dx && !dy) return true;
  const spacing = 360 / beams.count, off = ((bearing(dx, dy) - beamsDirection(beams, tick) / 100) % spacing + spacing) % spacing;
  return Math.min(off, spacing - off) <= beams.width / 2;
}

/** What the beams multiply the hero's ATK by against what lies `dx`, `dy` away. */
export const beamFactor = (beams: Beams | undefined, tick: number, dx: number, dy: number) => (beams && inBeams(beams, tick, dx, dy) ? beams.bonus : 1);
