import { DAY_MS, gmtDay } from "../shop/clock.ts";

// When tournaments run, on the server's clock in GMT (docs/TOURNAMENT.md):
// entry is open all of each Wednesday and Saturday; runs already inside
// then have four more hours; then the server tabulates the final results,
// which can be claimed for a day. Everything here is a pure function of a
// time, so it is tested without a server.

const HOUR_MS = 3_600_000;
/** The GMT weekdays a tournament opens on (0 Sunday): Wednesday, Saturday. */
export const TOURNAMENT_WEEKDAYS: readonly number[] = [3, 6];
/** How long entry stays open: the whole GMT day. */
export const ENTRY_MS = DAY_MS;
/** How long runs already inside still count once entry closes. */
export const GRACE_MS = 4 * HOUR_MS;
/** How long a final prize can be claimed once the results are final. */
export const CLAIM_MS = DAY_MS;

/** One tournament's timeline: its id (the GMT date it opens,
 * `2026-10-07`), and when entry opens and closes and the grace ends. */
export type Tournament = { id: string; opensAt: number; closesAt: number; graceEndsAt: number };

/** Where a tournament stands: before it, open for entry, ending (the
 * grace, then until the results are final), or its results claimable. */
export type Phase = "upcoming" | "open" | "ending" | "results";

/** The GMT weekday of a day number (1970-01-01 was a Thursday). */
const weekday = (day: number) => (day + 4) % 7;

/** The tournament that opens on GMT day `day`. */
export function tournamentOn(day: number): Tournament {
  const opensAt = day * DAY_MS;
  return { id: new Date(opensAt).toISOString().slice(0, 10), opensAt, closesAt: opensAt + ENTRY_MS, graceEndsAt: opensAt + ENTRY_MS + GRACE_MS };
}

/** The latest tournament to have opened by `now`. */
export function latestTournament(now: number): Tournament {
  let day = gmtDay(now);
  while (!TOURNAMENT_WEEKDAYS.includes(weekday(day))) day--;
  return tournamentOn(day);
}

/** Tournament `id`'s timeline. */
export const tournamentById = (id: string) => latestTournament(Date.parse(id));

/** The next tournament to open after `now`. */
export function nextTournament(now: number): Tournament {
  let day = gmtDay(now) + 1;
  while (!TOURNAMENT_WEEKDAYS.includes(weekday(day))) day++;
  return tournamentOn(day);
}

/** Where `t` stands at `now`, given when the server finalized its results
 * (null while it hasn't, or isn't known). Results last `CLAIM_MS` from
 * finalization; until finalized, a closed tournament is still ending. */
export function phaseOf(t: Tournament, now: number, finalizedAt: number | null): Phase {
  if (now < t.opensAt) return "upcoming";
  if (now < t.closesAt) return "open";
  if (now < t.graceEndsAt || finalizedAt === null || now < finalizedAt) return "ending";
  return now < finalizedAt + CLAIM_MS ? "results" : "upcoming";
}

/** Whether a run's depth reached at `now` still counts in `t`. */
export const scoreCounts = (t: Tournament, now: number) => now >= t.opensAt && now < t.graceEndsAt;

/** A countdown as the Tournament button shows it: `2d5h`, then `5h12m`
 * under a day, `12m` under an hour (rounded up, so it never reads 0m
 * before the moment). */
export function shortCountdown(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
  return d > 0 ? `${d}d${h}h` : h > 0 ? `${h}h${m}m` : `${m}m`;
}
