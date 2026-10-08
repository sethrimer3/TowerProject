import { adsOff } from "../shop/entitlements.ts";
import type { BeginRefusal, TournamentClient } from "../tournament/client.ts";
import { caveLabel, LEAGUE_INFO, LEAGUES, type League } from "../tournament/leagues.ts";
import { PRIZE_LEVEL_TOP, PRIZES, placeText, prizeLevel, type Prize } from "../tournament/prizes.ts";
import { CLAIM_MS, shortCountdown } from "../tournament/schedule.ts";
import { GEM_TICKET_STEP } from "../tournament/tickets.ts";
import type { AppContext } from "./app.ts";
import { askForGems } from "./dialogs.ts";
import { adIcon, el, gemIcon, shardIcon, ticketIcon, trophyIcon } from "./dom.ts";
import { revealReward } from "./reward-reveal.ts";

/** Each league's cup: its metal's outline over a darker fill. */
export const LEAGUE_CUPS: Record<League, { stroke: string; fill: string }> = {
  copper: { stroke: "#e08a52", fill: "#4a2412" },
  silver: { stroke: "#d6dde6", fill: "#3a4048" },
  gold: { stroke: "#ffd34d", fill: "#5a4210" },
  platinum: { stroke: "#a8f0ec", fill: "#1e4a4a" },
  champion: { stroke: "#e4a6ff", fill: "#4a1a5e" },
};
/** League `league`'s trophy. */
export const leagueTrophy = (league: League, className = "league-trophy") =>
  trophyIcon(className, LEAGUE_CUPS[league].stroke, LEAGUE_CUPS[league].fill);

/** What the player is told when a tournament run couldn't begin. */
const REFUSALS: Record<BeginRefusal, string> = {
  busy: "End the run you're in to enter.",
  noTicket: "You need a Ticket to enter.",
  offline: "Can't reach the Tournament right now. Try again soon.",
  closed: "Entry has closed.",
};

/** A countdown on the page: *2d 5h*, *7h 12m*, *12m*. */
const countdown = (ms: number) => shortCountdown(ms).replace(/([dh])(?=\d)/g, "$1 ");
/** A prize: its Ascension Shards and Gems. */
const prizeHtml = (p: Prize) => `<span class="tournament-prize">${shardIcon()}<b>${p.shards.toLocaleString("en-US")}</b>${gemIcon()}<b>${p.gems.toLocaleString("en-US")}</b></span>`;
/** A prize level's share of entrants: *Top 3%*, *3–7%* … *Bottom 20%*. */
const levelShare = (i: number) =>
  i === 0 ? `Top ${PRIZE_LEVEL_TOP[0]}%` : i === PRIZE_LEVEL_TOP.length - 1 ? `Bottom ${100 - PRIZE_LEVEL_TOP[i - 1]!}%` : `${PRIZE_LEVEL_TOP[i - 1]}–${PRIZE_LEVEL_TOP[i]}%`;

/** The Tournament page (docs/TOURNAMENT.md): the player's league and its
 * cave, where the tournament stands and when it changes, the Tickets held,
 * *Begin Tournament* while it is open (or the ad or Gem Ticket when out of
 * them), the player's best score and place, their prize, *Claim rewards*
 * once the results are final, and *All prizes*. Opened from the forest's
 * Hall, the HUD's Tournament button or the Goals unlock; its Back returns
 * to whichever page opened it. What waits on the server goes through the
 * `TournamentClient`. */
export class TournamentPage {
  /** The page the Tournament page was opened from, which Back returns to. */
  private from = "";
  private message = "";
  /** A request waiting on the server: the buttons wait too. */
  private busy = false;

  constructor(
    private ctx: AppContext,
    private client: TournamentClient,
    /** Asks the server for the live tournament (celebrating a free Ticket). */
    private refresh: () => Promise<unknown>,
  ) {}

  /** Opens the page afresh, from page `from`, and asks the server for the
   * latest. */
  open(from: string) {
    this.from = from;
    this.message = "";
    this.render();
    void this.refresh().then(() => this.rerender());
  }

  /** What the page last drew, but for the countdown. */
  private shown = "";
  /** What the page shows but for the countdown: the phase, and what the
   * player holds and knows of the tournament. */
  private state() {
    const desk = this.ctx.game.tournament, t = this.ctx.game.save.tournament;
    return JSON.stringify([desk.phase, desk.tournament.id, desk.claimable, desk.nextTicket, t.tickets, t.league, t.entries[desk.tournament.id] ?? null, t.claimed]);
  }
  /** Every second while the page shows, and once the server answers: the
   * countdown, or the whole page once anything else it shows has changed
   * (only then, so a button is never redrawn under a press). */
  rerender() {
    if (!el("tournament").classList.contains("active")) return;
    const phase = document.getElementById("tournament-phase");
    if (phase && this.shown === this.state()) phase.innerHTML = this.phaseText();
    else this.render();
  }

  render() {
    const game = this.ctx.game, league = game.save.tournament.league;
    this.shown = this.state();
    el("tournament").innerHTML =
      `<button class="back" id="tournament-back">← Back</button><div class="page-title"><small>WEDNESDAYS AND SATURDAYS · GMT</small><h2>Tournament</h2></div>` +
      `<div class="tournament-league">${leagueTrophy(league)}<div><b>${LEAGUE_INFO[league].name} League</b><small>${caveLabel(league)} · enemies ×1.1</small></div></div>` +
      `<p class="tournament-phase" id="tournament-phase">${this.phaseText()}</p>` +
      `<div class="tournament-tickets" title="Tickets: each enters the tournament once">${ticketIcon()}<b>${game.save.tournament.tickets}</b><small>${game.save.tournament.tickets === 1 ? "TICKET" : "TICKETS"}</small></div>` +
      this.action() +
      `<p class="tournament-message" id="tournament-message" aria-live="polite">${this.message}</p>` +
      this.standing() +
      `<button class="tournament-all" id="tournament-all">All prizes</button>`;
    this.bind();
  }

  /** Where the tournament stands, and how long until that changes. */
  private phaseText() {
    const desk = this.ctx.game.tournament, t = desk.tournament, now = desk.now;
    switch (desk.phase) {
      case "upcoming": return `Opens in <b>${countdown(desk.nextOpensAt - now)}</b>`;
      case "open": return `<b class="live">Open</b> · entry closes in <b>${countdown(t.closesAt - now)}</b>`;
      case "ending": return now < t.graceEndsAt ? `Ending · runs inside still count for <b>${countdown(t.graceEndsAt - now)}</b>` : "Ending · the final results are being tallied";
      case "results": return `Final results · claim within <b>${countdown(desk.live!.finalizedAt! + CLAIM_MS - now)}</b>`;
    }
  }

  /** While the tournament is open: Begin, or how to get a Ticket. */
  private action() {
    const game = this.ctx.game, desk = game.tournament, wait = this.busy ? " disabled" : "";
    if (desk.phase !== "open") return "";
    if (!game.canBeginTournament) return `<p class="hint tournament-hint">${game.run.outside ? REFUSALS.busy : "Finish this run to enter again."}</p>`;
    if (game.save.tournament.tickets > 0)
      return `<button class="tournament-begin" id="tournament-begin"${wait}>${ticketIcon()}Begin Tournament</button><p class="hint tournament-hint">Spends a Ticket. Your best score counts.</p>`;
    const next = desk.nextTicket;
    if (next === "ad")
      return `<button class="tournament-begin" id="tournament-ad"${wait}>${adsOff(game.save) ? ticketIcon() : adIcon()}Get a Ticket</button><p class="hint tournament-hint">${adsOff(game.save) ? "Free with Ad-Disable." : "Watch an ad for one more Ticket."}</p>`;
    if (next === "gems") {
      const price = desk.gemTicketPrice, short = !game.free && game.save.gems < price;
      return `<button class="tournament-begin${short ? " short" : ""}" id="tournament-gems"${wait}>${ticketIcon()}Buy a Ticket<span class="tournament-price">${gemIcon()}${price}</span></button><p class="hint tournament-hint">Each Ticket bought this tournament costs ${gemIcon()}${GEM_TICKET_STEP} more.</p>`;
    }
    return `<p class="hint tournament-hint">${REFUSALS.offline}</p>`;
  }

  /** The player's best score and place, with the prize it pays; the
   * league's top prize while they haven't entered. Once the results are
   * final, the final place, prize and league, and *Claim rewards*. Once the
   * Results are over, or for a tournament not entered or its prize
   * claimed, nothing of it: only the next one's top prize. A prize left
   * unclaimed comes as Mail instead (docs/MAIL.md). */
  private standing() {
    const game = this.ctx.game, desk = game.tournament, t = desk.tournament, league = game.save.tournament.league;
    const table = desk.live?.prizes ?? PRIZES, prizes = table[league], e = game.save.tournament.entries[t.id], phase = desk.phase;
    const final = desk.final, next = phase === "upcoming" && final ? final.league : league;
    const top = `<div class="tournament-standing"><p>Top prize</p>${prizeHtml(table[next][0]!)}</div>`;
    if (!e || phase === "upcoming" || game.save.tournament.claimed.includes(t.id)) return top;
    const over = phase === "results", rows: string[] = [];
    rows.push(`<p>Best score: <b>${e.best}</b>${e.pending !== null && !over ? ` <small>(waiting to be sent)</small>` : ""}</p>`);
    if (final) {
      rows.push(
        `<p>Final place: <b>${placeText(final.place, final.entrants)}</b></p>`,
        `<p>Prize (level ${final.level})</p>${prizeHtml(prizes[final.level - 1]!)}`,
        desk.claimable ? `<button class="tournament-begin" id="tournament-claim"${this.busy ? " disabled" : ""}>Claim rewards</button>` : "",
        this.leagueMove(league, final.league),
      );
    } else if (over) rows.push(`<p class="hint">The final results show once the server answers.</p>`);
    else if (e.entrants) {
      const level = prizeLevel(e.place, e.entrants);
      rows.push(`<p>Place: <b>${placeText(e.place, e.entrants)}</b></p>`, `<p>Prize if it ends now (level ${level})</p>${prizeHtml(prizes[level - 1]!)}`);
    } else rows.push(`<p class="hint">Your place shows once the server has your score.</p>`);
    return `<div class="tournament-standing">${rows.join("")}</div>`;
  }

  /** Where the final results move the player: up, down, or staying. */
  private leagueMove(from: League, to: League) {
    const name = `${leagueTrophy(to, "league-trophy small")}<b>${LEAGUE_INFO[to].name} League</b>`;
    const move = LEAGUES.indexOf(to) - LEAGUES.indexOf(from);
    return `<p class="tournament-move${move > 0 ? " up" : move < 0 ? " down" : ""}">${move > 0 ? `Promoted to ${name}` : move < 0 ? `Moved down to ${name}` : `Staying in the ${name}`}</p>`;
  }

  private bind() {
    const { ctx } = this, desk = ctx.game.tournament;
    el("tournament-back").onclick = () => ctx.navigate(this.from || ctx.game.mode);
    el("tournament-all").onclick = () => this.showPrizes();
    const press = (id: string, act: () => void) => {
      const b = document.getElementById(id);
      if (b) b.onclick = act;
    };
    press("tournament-begin", () => void this.begin());
    press("tournament-ad", () => this.done(desk.takeAdTicket()));
    press("tournament-gems", () => {
      if (!ctx.game.free && ctx.game.save.gems < desk.gemTicketPrice) return askForGems(ctx);
      this.done(desk.buyGemTicket());
    });
    press("tournament-claim", () => void this.claim());
  }

  /** After a Ticket is had: the page and HUD again, and saved. */
  private done(changed: boolean) {
    this.message = changed ? "+1 Ticket" : "";
    this.render();
    this.ctx.update();
  }

  /** Enters the tournament and goes in, or says why it couldn't. */
  private async begin() {
    if (this.busy) return;
    this.busy = true;
    this.message = "Entering…";
    this.render();
    const refused = await this.client.begin();
    this.busy = false;
    if (refused === null) {
      this.ctx.navigate("board");
      return;
    }
    this.message = REFUSALS[refused];
    this.render();
    this.ctx.update();
  }

  /** Collects the final prize, celebrated. */
  private async claim() {
    if (this.busy) return;
    this.busy = true;
    this.render();
    const prize = await this.client.claim();
    this.busy = false;
    this.message = prize ? "" : REFUSALS.offline;
    if (prize)
      revealReward(
        { icon: gemIcon(), amount: `+${prize.gems.toLocaleString("en-US")}`, kicker: "TOURNAMENT PRIZE", name: "Gems", text: `+${prize.shards.toLocaleString("en-US")} Ascension Shards`, permanent: false },
        this.ctx.game.save.settings.reduceMotion,
      );
    this.render();
    this.ctx.update();
  }

  /** Every league's ten prize levels, the player's league first, the
   * promotion and demotion zones marked. */
  private showPrizes() {
    const { modal, game } = this.ctx, mine = game.save.tournament.league, table = game.tournament.info?.prizes ?? PRIZES;
    const order = [mine, ...LEAGUES.filter((l) => l !== mine)];
    const league = (l: League) =>
      `<section class="prize-league${l === mine ? " mine" : ""}"><h3>${leagueTrophy(l, "league-trophy small")}${LEAGUE_INFO[l].name}<small>${caveLabel(l)}</small></h3><table class="prize-table"><tbody>${table[l]
        .map((p, i) => {
          const zone = i < 3 && l !== "champion" ? "promote" : i === 9 && LEAGUE_INFO[l].demotes ? "demote" : "";
          return `<tr class="${zone}"><td>${i + 1}</td><td>${levelShare(i)}</td><td>${prizeHtml(p)}</td></tr>`;
        })
        .join("")}</tbody></table></section>`;
    modal.innerHTML = `<small>TOURNAMENT</small><h2>All prizes</h2><p class="hint"><span class="zone promote">Green</span>: promoted a league. <span class="zone demote">Red</span>: demoted (Platinum and Champion only).</p><div class="prize-leagues">${order.map(league).join("")}</div><div class="dialog-actions"><button id="prizes-ok">Close</button></div>`;
    modal.showModal();
    el("prizes-ok").onclick = () => modal.close();
  }
}
