import type { RunCore } from "../runs.ts";

/** The Level-up Boost: each level the hero reaches inside a run multiplies
 * all Gold the run finds for a while on the wall clock, a new level
 * starting its time over. It lives on the run, so it ends with it. */

/** What the boost multiplies Gold by. */
export const LEVEL_BOOST_FACTOR = 3;
/** How long one level-up's boost lasts. */
export const LEVEL_BOOST_MS = 10 * 60 * 1000;

/** The boost time `run` has left at `now` (ms). */
export const levelBoostLeft = (run: Pick<RunCore, "levelBoostUntil">, now: number) => Math.max(0, (run.levelBoostUntil ?? 0) - now);

/** Starts the boost's full time over in `run` from `now`. */
export function startLevelBoost(run: Pick<RunCore, "levelBoostUntil">, now: number) {
  run.levelBoostUntil = now + LEVEL_BOOST_MS;
}

/** The time left as a countdown: 9:59, 0:05. */
export function levelBoostTime(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
