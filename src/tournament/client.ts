import type { Game } from "../state.ts";
import { tournamentById } from "./schedule.ts";
import { tournamentScore } from "./run.ts";
import type { Prize } from "./prizes.ts";
import type { Standing, TournamentServer } from "./server.ts";

// Between the game and the Tournament's server: the game's commands never
// wait on the network, so what needs the server's answer first (entering a
// tournament, sending a score) waits here and then hands the answer to
// them. Pages and dialogs call it.

/** What the client needs of the game. */
type TournamentGame = Pick<Game, "tournament" | "beginTournament" | "canBeginTournament" | "mode" | "run" | "save">;

/** Why a tournament run couldn't begin. */
export type BeginRefusal = "offline" | "closed" | "noTicket" | "busy";

export class TournamentClient {
  constructor(
    private game: TournamentGame,
    private server: TournamentServer,
  ) {}

  /** Asks the server for the live tournament and the player's standing in
   * it, and hands both to the game. Returns whether the tournament's free
   * Ticket was granted now, or null when the server can't be reached. */
  async refresh(): Promise<boolean | null> {
    const [time, info] = await Promise.all([this.server.time(), this.server.current()]).catch(() => [null, null] as const);
    if (time === null || !info) return null;
    const granted = this.game.tournament.observe(info, time);
    if (this.game.tournament.unlocked) await this.sendPending();
    if (this.game.save.tournament.entries[info.id]) {
      const standing = await this.server.standing(info.id).catch(() => null);
      if (standing) this.game.tournament.recordStanding(standing);
    }
    return granted;
  }

  /** Enters the live tournament and begins its run: registers the entry
   * with the server, then spends a Ticket and goes in. Returns why it
   * couldn't, or null once the run is inside. */
  async begin(): Promise<BeginRefusal | null> {
    const game = this.game, desk = game.tournament;
    if (!game.canBeginTournament) return "busy";
    if (game.save.tournament.tickets < 1) return "noTicket";
    if ((await this.refresh()) === null || !desk.info) return "offline";
    if (desk.phase !== "open") return "closed";
    const info = desk.info, entry = await this.server.enter(info.id, info.league).catch(() => null);
    if (!entry) return "closed";
    return game.beginTournament(info, entry) ? null : "busy";
  }

  /** Collects the final prize of the tournament the server last reported,
   * once its results are final; returns it, or null when there is none to
   * collect or the server can't be reached. */
  async claim(): Promise<Prize | null> {
    const desk = this.game.tournament, info = desk.info;
    if (!info || !desk.claimable) return null;
    const prize = await this.server.claim(info.id).catch(() => null);
    return prize && desk.claim(info.id, prize) ? prize : null;
  }

  /** Sends the score of the tournament run inside now (as the run's end
   * dialog opens), kept until sent; returns the standing after it, or null
   * while the server can't be reached. */
  async sendRun(): Promise<Standing | null> {
    const t = this.recordRun();
    if (!t) return null;
    await this.sendPending();
    const e = this.game.save.tournament.entries[t.id];
    return e && e.pending === null && e.entrants ? { id: t.id, best: e.best, place: e.place, entrants: e.entrants, final: false } : null;
  }

  /** Keeps the score of the tournament run inside now, while its depth
   * still counts (`recordScore`), so depth reached before the grace ends is
   * sent even if the run goes on past it; returns the run's tournament. */
  private recordRun() {
    const run = this.game.mode === "delve" && !this.game.run.outside ? this.game.run : null;
    const t = run && "milestone" in run ? run.tournament : undefined;
    if (run && t) this.game.tournament.recordScore(t.id, tournamentScore(run));
    return t;
  }

  /** How long a score that couldn't be sent waits before it is tried again. */
  static readonly RETRY_MS = 30_000;
  /** The send under way, which the next waits for. */
  private sending: Promise<void> | null = null;
  private triedAt = -Infinity;

  /** Once a second: sends any score still waiting, unless a send is under
   * way or the last try was under `RETRY_MS` ago. */
  tick(now = Date.now()) {
    this.recordRun();
    const waiting = Object.values(this.game.save.tournament.entries).some((e) => e.pending !== null);
    if (!waiting || this.sending || now - this.triedAt < TournamentClient.RETRY_MS) return;
    this.triedAt = now;
    void this.sendPending();
  }

  /** Sends every score still waiting, after any send under way. One the
   * server refuses once its tournament's grace is over is dropped: it can
   * never count. */
  async sendPending() {
    while (this.sending) await this.sending;
    this.sending = this.sendEach().finally(() => (this.sending = null));
    return this.sending;
  }

  private async sendEach() {
    const desk = this.game.tournament, now = desk.now;
    for (const [id, e] of Object.entries(this.game.save.tournament.entries)) {
      if (e.pending === null) continue;
      const score = e.pending, standing = e.entry ? await this.server.submit(e.entry, score).catch(() => null) : null;
      if (standing) {
        desk.sent(id, score);
        desk.recordStanding(standing);
      } else if (now >= tournamentById(id).graceEndsAt) desk.sent(id, score);
    }
  }
}
