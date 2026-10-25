import type { Game } from "../src/state.ts";
import type { League } from "../src/tournament/leagues.ts";
import { PRIZES } from "../src/tournament/prizes.ts";
import { latestTournament } from "../src/tournament/schedule.ts";
import { stubSeeds, type TournamentInfo } from "../src/tournament/server.ts";

// The Delve opens only while a tournament is open for entry, once the
// Tournament is unlocked: tests that play there set the clock to one.

const HOUR = 3_600_000;
/** Wednesday 2026-10-07, 01:00 GMT: a tournament is open for entry. */
export const OPEN = Date.UTC(2026, 9, 7) + HOUR;
/** Friday 2026-10-09, 12:00 GMT: no tournament is open. */
export const CLOSED = Date.UTC(2026, 9, 9) + 12 * HOUR;

/** Unlocks the Tournament for `g` (Tower I floor 60's Goal claimed) and sets
 * its clock to `now`, a tournament open by default; returns `g`. */
export function openTournament<G extends Game>(g: G, now = OPEN): G {
  const claimed = (g.save.goals.claimed[1] ??= []);
  if (!claimed.includes(60)) claimed.push(60);
  g.clock = () => now;
  return g;
}

/** Goes into the open tournament from `g`'s forest as its cave would once
 * the server registered the entry, a Ticket given to spend on it; returns
 * whether it began. */
export function enterTournament(g: Game, league: League = "copper") {
  openTournament(g);
  g.save.tournament.tickets++;
  const info: TournamentInfo = { ...latestTournament(OPEN), finalizedAt: null, league, seeds: stubSeeds(latestTournament(OPEN).id, league), prizes: PRIZES };
  return g.beginTournament(info, `${info.id}#1`);
}
