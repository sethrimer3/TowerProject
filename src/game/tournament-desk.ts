import { goalUnlocked } from "../goals.ts";
import { confirmServerTime, estimatedServerTime } from "../shop/clock.ts";
import { CURRENCIES } from "../shop/currency.ts";
import type { Prize } from "../tournament/prizes.ts";
import { CLAIMS_KEPT, ENTRIES_KEPT, type TournamentSave } from "../tournament/progress.ts";
import { CLAIM_MS, latestTournament, phaseOf, type Phase } from "../tournament/schedule.ts";
import type { Standing, TournamentInfo } from "../tournament/server.ts";
import { addGemTicket, gemTicketPrice, grantFreeTicket, nextTicket, spendTicket, takeAdTicket } from "../tournament/tickets.ts";
import { affordsGems, type DeskHost } from "./desk.ts";

/** The Tournament's commands (the game's `tournament`): taking in what the
 * server reports, Tickets, standings and claiming prizes. The server's
 * answers come in through these commands, which the pages fetch, so the
 * desk itself never waits on the network. */
export class TournamentDesk {
  /** The latest tournament as the server last reported it this session
   * (never saved: it is asked for again on each start). */
  info: TournamentInfo | null = null;

  constructor(private host: DeskHost) {}

  private get t(): TournamentSave {
    return this.host.save.tournament;
  }

  /** Whether the Tournament is open to the player: Tower I floor 70's
   * Goal claimed, or Dev mode. */
  get unlocked() {
    return goalUnlocked(this.host.save, "tournament") || this.host.save.settings.devMode;
  }

  /** The server time now, estimated from the last confirmed (display only). */
  get now() {
    return estimatedServerTime(this.host.save.shop.clock, this.host.clock());
  }

  /** Takes in the server's report of the live tournament at the confirmed
   * time `serverNow`: records the time and the player's league, and grants
   * the tournament's free Ticket the first time it is seen open. Returns
   * whether that Ticket was granted now (the page celebrates it). */
  observe(info: TournamentInfo, serverNow: number) {
    confirmServerTime(this.host.save.shop.clock, serverNow, this.host.clock());
    this.info = info;
    this.t.league = info.league;
    return this.unlocked && phaseOf(info, serverNow, info.finalizedAt) === "open" && grantFreeTicket(this.t, info.id);
  }

  /** The tournament the player last heard of, or the one the schedule says
   * opened last while the server hasn't answered. */
  get tournament() {
    return this.info ?? latestTournament(this.now);
  }

  /** Where the tournament stands now (estimated). */
  get phase(): Phase {
    return phaseOf(this.tournament, this.now, this.info?.finalizedAt ?? null);
  }

  /** The tournament open for entry now, by id, or null. Tickets can only be
   * taken while one is open, and only once the server has reported it. */
  private get openId() {
    return this.unlocked && this.info && this.phase === "open" ? this.info.id : null;
  }

  /** How the next Ticket is had while out of them: an ad, or Gems. */
  get nextTicket() {
    const id = this.openId;
    return id ? nextTicket(this.t, id) : null;
  }

  /** The next Gem Ticket's price. */
  get gemTicketPrice() {
    return gemTicketPrice(this.t, this.openId ?? "");
  }

  /** Takes the open tournament's ad Ticket. No ad plays yet: this is where
   * watching one will be hooked up, and with Ad-Disable owned (`adsOff`)
   * none ever will: the press just grants it, as the ad Gem button does. */
  takeAdTicket() {
    const id = this.openId;
    if (!id || !takeAdTicket(this.t, id)) return false;
    this.host.message = "+1 Ticket";
    return true;
  }

  /** Buys a Ticket for Gems, once the ad Ticket is taken: 10, 20, 30 … */
  buyGemTicket() {
    const id = this.openId;
    if (!id || nextTicket(this.t, id) !== "gems") return false;
    const price = gemTicketPrice(this.t, id);
    if (!affordsGems(this.host, price)) {
      this.host.message = `A Ticket costs ${price} Gems`;
      return false;
    }
    if (!this.host.free) CURRENCIES.gems.spend(this.host.save, price);
    addGemTicket(this.t, id);
    this.host.message = "+1 Ticket";
    return true;
  }

  /** Spends a Ticket on an entry into tournament `id`, which the server
   * registered as `entry`; false when no Ticket is held. */
  enter(id: string, entry: string) {
    if (!spendTicket(this.t)) return false;
    const e = this.t.entries[id];
    this.t.entries[id] = e ? { ...e, entry } : { best: 0, place: 0, entrants: 0, pending: null, entry };
    this.trim();
    return true;
  }

  /** Keeps a tournament run's `score` in tournament `id` as the entry's
   * best, waiting to be sent (`pending`) until the server takes it. */
  recordScore(id: string, score: number) {
    const e = this.t.entries[id];
    // A score no better than one the server has already taken waits for nothing.
    if (!e || (e.pending === null && score <= e.best)) return;
    this.t.entries[id] = { ...e, best: Math.max(e.best, score), pending: Math.max(e.pending ?? 0, score) };
  }

  /** The server took `score` in tournament `id` (or can no longer): it
   * waits no more, unless a higher one has come since. */
  sent(id: string, score: number) {
    const e = this.t.entries[id];
    if (e && e.pending !== null && e.pending <= score) this.t.entries[id] = { ...e, pending: null };
  }

  /** Records the standing the server reported in a tournament. */
  recordStanding(s: Standing) {
    const entries = this.t.entries, e = entries[s.id];
    entries[s.id] = { best: Math.max(s.best, e?.best ?? 0), place: s.place, entrants: s.entrants, pending: e?.pending ?? null, entry: e?.entry ?? "" };
    this.trim();
  }

  /** Keeps only the latest tournaments' entries. */
  private trim() {
    const entries = this.t.entries;
    for (const old of Object.keys(entries).sort().slice(0, -ENTRIES_KEPT)) delete entries[old];
  }

  /** Whether the tournament the server last reported has a final prize
   * waiting: finalized under a day ago, entered, and not yet claimed. */
  get claimable() {
    const info = this.info, at = info?.finalizedAt ?? null;
    return !!info && at !== null && this.now < at + CLAIM_MS && !!this.t.entries[info.id] && !this.t.claimed.includes(info.id);
  }

  /** Pays the prize the server granted for tournament `id`, once. */
  claim(id: string, prize: Prize) {
    if (this.t.claimed.includes(id)) return false;
    CURRENCIES.shards.credit(this.host.save, prize.shards);
    CURRENCIES.gems.credit(this.host.save, prize.gems);
    this.t.claimed = [...this.t.claimed, id].slice(-CLAIMS_KEPT);
    this.host.message = `+${prize.gems} Gems, +${prize.shards} Ascension Shards`;
    return true;
  }
}
