import { random } from "../random.ts";
import { LEAGUES, nextLeague, type League } from "./leagues.ts";
import { placeOf, PRIZES, prizeFor, type Prize } from "./prizes.ts";
import type { TournamentSave } from "./progress.ts";
import { CLAIM_MS, latestTournament, phaseOf, type Tournament } from "./schedule.ts";

// The Tournament's server, as the game sees it. It is stubbed for now:
// the interface is everything the Tournament asks of the outside world, so
// connecting the real server later changes only this file.

/** The seeds every entrant of a tournament's league plays from, by what
 * they drive: the run seed (the labyrinth and everything derived from it),
 * the run's other chances (drops, treasure) and Equipment's drops. */
export type TournamentSeeds = { layout: number; game: number; equipment: number };

/** The live tournament as the server reports it: its timeline, when its
 * results were finalized (null until then), the player's league, that
 * league's seeds, and the prize table. */
export type TournamentInfo = Tournament & {
  finalizedAt: number | null;
  league: League;
  seeds: TournamentSeeds;
  prizes: Record<League, readonly Prize[]>;
};

/** The player's standing in a tournament: their best score, their place
 * (ties at their cohort's lowest) among the league's entrants, and whether
 * it is final. */
export type Standing = { id: string; best: number; place: number; entrants: number; final: boolean };

export interface TournamentServer {
  /** The server's time now (ms), or null when it can't be reached. */
  time(): Promise<number | null>;
  /** The lowest app version the server accepts.
   * TODO: gate the Tournament page on it. */
  minVersion(): Promise<string>;
  /** The latest tournament to have opened, or null when unreachable. */
  current(): Promise<TournamentInfo | null>;
  /** Registers an entry in tournament `id` (its Ticket already spent);
   * returns the entry's id, or null when entry is closed. */
  enter(id: string, league: League): Promise<string | null>;
  /** Sends a finished run's score; returns the standing after it.
   * TODO: report the depth as it rises during the run, too. */
  submit(entry: string, depth: number): Promise<Standing | null>;
  /** The player's standing in tournament `id`: live, or final once finalized. */
  standing(id: string): Promise<Standing | null>;
  /** Collects the prize the server granted for the final placement in
   * tournament `id`, once; null when there is none to collect.
   * TODO: the server pushes prizes to the player's profile. */
  claim(id: string): Promise<Prize | null>;
}

/** 32-bit FNV-1a hash of `text`, a seed. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The stand-in's seeds for a tournament's league. */
export const stubSeeds = (id: string, league: League): TournamentSeeds => ({
  layout: hash(`${id}:${league}:layout`), game: hash(`${id}:${league}:game`), equipment: hash(`${id}:${league}:equipment`),
});

/** How many other entrants the stand-in makes up for each league. */
export const STUB_ENTRANTS = 999;
/** How long the stand-in takes to finalize results after the grace. */
export const STUB_TABULATE_MS = 3_600_000;

/** The made-up scores of a tournament's league's other entrants: fixed by
 * the tournament and league, deeper in higher leagues' fields. */
export function stubField(id: string, league: League) {
  const rng = random(hash(`${id}:${league}:field`)), reach = 40 + 30 * LEAGUES.indexOf(league);
  return Array.from({ length: STUB_ENTRANTS }, () => Math.floor(rng() * rng() * reach * 2));
}

/** The stand-in until the server exists. It keeps the schedule on `now`
 * (the device clock) and makes up each league's other entrants, and since
 * it keeps nothing itself it reads the player's own record (`save()`):
 * their scores, and from them the league they would be in, starting in
 * Copper and moved by each finalized tournament they entered. */
export function stubTournament(save: () => TournamentSave, now: () => number = Date.now): TournamentServer {
  const finalizedAt = (t: Tournament) => (now() >= t.graceEndsAt + STUB_TABULATE_MS ? t.graceEndsAt + STUB_TABULATE_MS : null);
  /** The league the player plays tournament `id` in, and their standing in each finalized one before it. */
  const leagueFor = (id: string) => {
    let league: League = "copper";
    for (const [past, e] of Object.entries(save().entries).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (past >= id || finalizedAt(latestTournament(Date.parse(past))) === null) continue;
      const scores = [...stubField(past, league), e.best];
      league = nextLeague(league, placeOf(scores, e.best), scores.length);
    }
    return league;
  };
  const standing = (id: string, best: number): Standing => {
    const scores = [...stubField(id, leagueFor(id)), best];
    return { id, best, place: placeOf(scores, best), entrants: scores.length, final: finalizedAt(latestTournament(Date.parse(id))) !== null };
  };
  let entries = 0;
  return {
    time: async () => now(),
    minVersion: async () => "0.0.0",
    current: async () => {
      const t = latestTournament(now()), league = leagueFor(t.id);
      return { ...t, finalizedAt: finalizedAt(t), league, seeds: stubSeeds(t.id, league), prizes: PRIZES };
    },
    enter: async (id) => {
      const t = latestTournament(now());
      return t.id === id && phaseOf(t, now(), null) === "open" ? `${id}#${++entries}` : null;
    },
    submit: async (entry, depth) => {
      const id = entry.split("#")[0]!, t = latestTournament(Date.parse(id));
      if (now() >= t.graceEndsAt) return null;
      return standing(id, Math.max(depth, save().entries[id]?.best ?? 0));
    },
    standing: async (id) => {
      const e = save().entries[id];
      return e ? standing(id, e.best) : null;
    },
    claim: async (id) => {
      const t = latestTournament(Date.parse(id)), at = finalizedAt(t), s = save();
      if (at === null || now() >= at + CLAIM_MS || s.claimed.includes(id) || !s.entries[id]) return null;
      const st = standing(id, s.entries[id].best);
      return prizeFor(leagueFor(id), st.place, st.entrants);
    },
  };
}
