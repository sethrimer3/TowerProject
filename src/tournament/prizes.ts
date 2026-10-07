import { LEAGUES, withinTop, type League } from "./leagues.ts";

// What a tournament placement pays: ten prize levels a league, by the
// player's global percentile in it. The server will send the live table;
// this one is the fallback, and the design reference (docs/TOURNAMENT.md).

/** A prize: Ascension Shards and Gems. */
export type Prize = { shards: number; gems: number };

/** Each prize level's lower bound, as the top percent of entrants it
 * reaches down to: level 1 is the top 3%, level 2 the next 4% (to 7%) …
 * level 10 the bottom 20%. Levels 1 to 3 are the promotion zone (13%),
 * level 10 the demotion zone. */
export const PRIZE_LEVEL_TOP: readonly number[] = [3, 7, 13, 20, 28, 36, 44, 52, 80, 100];

/** Each league's prizes, level 1 first. Levels 2 to 9 are tuned to keep
 * the oscillation rule (see `oscillationFailures`). */
const table = (shards: number[], gems: number[]): Prize[] => shards.map((s, i) => ({ shards: s, gems: gems[i]! }));
export const PRIZES: Record<League, readonly Prize[]> = {
  copper: table([20, 17, 14, 12, 10, 9, 8, 7, 6, 5], [100, 80, 60, 40, 35, 30, 25, 20, 15, 10]),
  silver: table([40, 33, 26, 20, 18, 16, 15, 14, 13, 12], [200, 150, 100, 50, 48, 46, 45, 44, 42, 40]),
  gold: table([80, 70, 56, 38, 34, 32, 30, 27, 24, 20], [300, 240, 175, 110, 100, 90, 80, 70, 60, 50]),
  platinum: table([180, 150, 110, 65, 56, 50, 44, 38, 30, 20], [425, 360, 300, 220, 200, 180, 160, 140, 120, 100]),
  champion: table([300, 230, 170, 120, 100, 80, 65, 50, 35, 20], [550, 475, 400, 325, 300, 275, 250, 225, 200, 175]),
};

/** The prize level (1 to 10) of `place` among `entrants`: the first whose
 * share reaches it, so a tie at a boundary, counted at its cohort's lowest
 * place, falls to the lower level. */
export const prizeLevel = (place: number, entrants: number) =>
  PRIZE_LEVEL_TOP.findIndex((top) => withinTop(place, entrants, top)) + 1;

/** What `place` among `entrants` in `league` pays. */
export const prizeFor = (league: League, place: number, entrants: number): Prize =>
  PRIZES[league][prizeLevel(place, entrants) - 1]!;

/** The place of `score` among `scores` (every entrant's, its own included):
 * players who tie all take the lowest place of their cohort, so it is the
 * number of scores as high or higher. */
export const placeOf = (scores: readonly number[], score: number) => scores.filter((s) => s >= score).length;

/** The oscillation rule, for each currency and each league with one above:
 * moving up never pays less than holding back at level 4, the best level
 * outside the promotion zone. Where promotion is permanent (the upper
 * league doesn't demote), the upper league's level 10 pays at least the
 * lower's level 4 every tournament; where it isn't, a cycle of promoting
 * at level 3 and then being demoted from the upper league's level 10 pays
 * at least two tournaments at level 4. Returns each failure. */
export function oscillationFailures(prizes: Record<League, readonly Prize[]>, demotes: (league: League) => boolean): string[] {
  const failures: string[] = [];
  for (let i = 0; i + 1 < LEAGUES.length; i++) {
    const lower = LEAGUES[i]!, upper = LEAGUES[i + 1]!;
    for (const c of ["shards", "gems"] as const) {
      const l3 = prizes[lower][2]![c], l4 = prizes[lower][3]![c], up10 = prizes[upper][9]![c];
      const ok = demotes(upper) ? l3 + up10 >= 2 * l4 : up10 >= l4;
      if (!ok) failures.push(`${lower} → ${upper} ${c}`);
    }
  }
  return failures;
}
