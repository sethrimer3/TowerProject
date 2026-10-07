import { count, isRecord, whole } from "../decode.ts";
import { isLeague, type League } from "./leagues.ts";

// The Tournament's saved state (`save.tournament`): Tickets, the league the
// server last reported, which of this tournament's Tickets were taken, and
// what the player knows of each tournament entered. The server keeps the
// real standings and prizes; this is what the client last heard.

/** A tournament the player entered: the best score sent or kept, the place
 * and entrant count the server last reported (0 while unknown), and a
 * score not yet sent (null when none waits). */
export type TournamentEntry = { best: number; place: number; entrants: number; pending: number | null };

export type TournamentSave = {
  tickets: number;
  league: League;
  /** The tournament whose free Ticket was granted. */
  granted: string;
  /** The tournament whose ad Ticket was taken. */
  adTicket: string;
  /** Gem Tickets bought in tournament `id`. */
  gemTickets: { id: string; bought: number };
  /** By tournament id. */
  entries: Record<string, TournamentEntry>;
  /** Tournaments whose prize was claimed, newest last. */
  claimed: string[];
};

/** How many claimed tournaments are kept: more than can still be claimed. */
export const CLAIMS_KEPT = 8;
/** How many tournaments' entries are kept, newest last. */
export const ENTRIES_KEPT = 8;

export const defaultTournament = (): TournamentSave => ({
  tickets: 0, league: "copper", granted: "", adTicket: "", gemTickets: { id: "", bought: 0 }, entries: {}, claimed: [],
});

/** A tournament id: a GMT date. */
const isId = (raw: unknown): raw is string => typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw);
const id = (raw: unknown) => (isId(raw) ? raw : "");

/** A saved TournamentSave, field by field; anything malformed is dropped. */
export function decodeTournament(raw: unknown): TournamentSave {
  const d = defaultTournament();
  if (!isRecord(raw)) return d;
  d.tickets = count(raw.tickets, 0);
  if (isLeague(raw.league)) d.league = raw.league;
  d.granted = id(raw.granted);
  d.adTicket = id(raw.adTicket);
  if (isRecord(raw.gemTickets) && isId(raw.gemTickets.id)) d.gemTickets = { id: raw.gemTickets.id, bought: count(raw.gemTickets.bought, 0) };
  if (isRecord(raw.entries))
    for (const [key, e] of Object.entries(raw.entries).filter(([key]) => isId(key)).sort().slice(-ENTRIES_KEPT))
      if (isRecord(e) && whole(e.best))
        d.entries[key] = {
          best: e.best, place: count(e.place, 0), entrants: count(e.entrants, 0),
          pending: whole(e.pending) ? e.pending : null,
        };
  if (Array.isArray(raw.claimed)) d.claimed = [...new Set(raw.claimed.filter(isId))].slice(-CLAIMS_KEPT);
  return d;
}
