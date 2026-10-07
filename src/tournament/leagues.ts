// The Tournament's leagues (docs/TOURNAMENT.md). Each plays its own Delve
// cave, and the server moves players between them after each tournament
// by where they placed; the rule is here so the stub server and the tests
// follow the same one.

export type League = "copper" | "silver" | "gold" | "platinum" | "champion";
/** The leagues, lowest first. */
export const LEAGUES: readonly League[] = ["copper", "silver", "gold", "platinum", "champion"];

/** Each league's name, the Delve cave (tier) its runs play, and whether a
 * player in it can be demoted. No one is demoted back into Copper or
 * Silver once promoted out of it, so only Platinum and Champion demote. */
export const LEAGUE_INFO: Record<League, { name: string; cave: number; demotes: boolean }> = {
  copper: { name: "Copper", cave: 1, demotes: false },
  silver: { name: "Silver", cave: 3, demotes: false },
  gold: { name: "Gold", cave: 5, demotes: false },
  platinum: { name: "Platinum", cave: 7, demotes: true },
  champion: { name: "Champion", cave: 9, demotes: true },
};

/** The share of a league's entrants, from the top, promoted after a
 * tournament (prize levels 1 to 3), and from the bottom, demoted (prize
 * level 10), in percent. */
export const PROMOTE_PERCENT = 13;
export const DEMOTE_PERCENT = 20;

/** A tournament run's cave as the game shows it: *Delve 3+*, the + for its
 * stronger enemies. */
export const caveLabel = (league: League) => `Delve ${LEAGUE_INFO[league].cave}+`;

/** Whether `place` of `entrants` is within the top `percent`: fewer than
 * that share of the entrants placed ahead of it (so first place always
 * is, however few entrants there are). Exact: whole numbers only. */
export const withinTop = (place: number, entrants: number, percent: number) => (place - 1) * 100 < percent * entrants;

/** The league a player moves to after placing `place` of `entrants` in
 * `league` (ties already counted at their cohort's lowest place). */
export function nextLeague(league: League, place: number, entrants: number): League {
  const i = LEAGUES.indexOf(league);
  if (withinTop(place, entrants, PROMOTE_PERCENT)) return LEAGUES[Math.min(i + 1, LEAGUES.length - 1)]!;
  if (LEAGUE_INFO[league].demotes && !withinTop(place, entrants, 100 - DEMOTE_PERCENT)) return LEAGUES[i - 1]!;
  return league;
}

/** Whether `raw` names a league. */
export const isLeague = (raw: unknown): raw is League => LEAGUES.includes(raw as League);
