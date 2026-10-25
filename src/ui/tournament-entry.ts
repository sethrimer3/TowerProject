import { adsOff } from "../shop/entitlements.ts";
import type { Game } from "../state.ts";
import type { BeginRefusal, TournamentClient } from "../tournament/client.ts";
import { GEM_TICKET_STEP } from "../tournament/tickets.ts";
import type { AppContext } from "./app.ts";
import { askForGems } from "./dialogs.ts";
import { adIcon, el, gemIcon, ticketIcon } from "./dom.ts";

/** What the player is told when a tournament run couldn't begin. */
export const REFUSALS: Record<BeginRefusal, string> = {
  busy: "End the run you're in to enter.",
  noTicket: "You need a Ticket to enter.",
  offline: "Can't reach the Tournament right now. Try again soon.",
  closed: "Entry has closed.",
};

/** The Delve's cave, the way into a tournament: the run its entrance asks
 * for (`Game.tournamentRequested`) begun once the server registers the
 * entry, which spends a Ticket; with none held, the dialog that gets one
 * (an ad's, then Gems'), entering as soon as it is had; and the notice that
 * entry has closed, as the Delve's forest gives way to the Tower's. */
export class TournamentEntry {
  /** An entry waiting on the server: the entrance waits too. */
  private busy = false;

  constructor(
    private ctx: AppContext,
    private game: Game,
    private client: TournamentClient,
  ) {}

  /** Acts on what the cave's entrance asked for, if anything. */
  check() {
    const asked = this.game.tournamentRequested;
    this.game.tournamentRequested = null;
    if (asked === "enter") void this.begin();
    else if (asked === "ticket") this.askForTicket();
  }

  /** Enters the open tournament and goes in, or says why it couldn't. */
  private async begin() {
    if (this.busy) return;
    this.busy = true;
    this.game.message = "Entering…";
    const refused = await this.client.begin();
    this.busy = false;
    if (refused === "noTicket") return this.askForTicket();
    if (refused) this.game.message = REFUSALS[refused];
    this.ctx.update();
  }

  /** Out of Tickets at the cave: the next one to be had, an ad's or
   * Gems', and once had, in. */
  private askForTicket() {
    const { modal } = this.ctx, game = this.game, desk = game.tournament, next = desk.nextTicket;
    const price = desk.gemTicketPrice, short = !game.free && game.save.gems < price;
    const action = next === "ad"
      ? `<button id="ticket-get">${adsOff(game.save) ? ticketIcon() : adIcon()}Get a Ticket</button>`
      : next === "gems"
        ? `<button id="ticket-get" class="${short ? "short" : ""}" aria-label="Buy a Ticket for ${price} Gems">Buy a Ticket · ${gemIcon()} <b>${price}</b></button>`
        : "";
    const hint = next === "ad"
      ? adsOff(game.save) ? "Free with Ad-Disable." : "Watch an ad for one more Ticket."
      : next === "gems" ? `Each Ticket bought this tournament costs ${gemIcon()}${GEM_TICKET_STEP} more.` : REFUSALS.offline;
    modal.innerHTML = `<small>TOURNAMENT</small><h2>Out of Tickets</h2><p>Entering the cave costs a Ticket ${ticketIcon()}.</p><p class="hint">${hint}</p>` +
      `<div class="dialog-actions">${action}<button id="ticket-cancel">Cancel</button></div>`;
    modal.showModal();
    el("ticket-cancel").onclick = () => modal.close();
    const get = document.getElementById("ticket-get");
    if (!get) return;
    get.onclick = () => {
      if (next === "gems" && short) return askForGems(this.ctx);
      const got = next === "ad" ? desk.takeAdTicket() : desk.buyGemTicket();
      modal.close();
      this.ctx.update();
      if (got) void this.begin();
    };
  }

  /** Tournament entry closed while the Delve's forest showed: says so
   * over the Tower's, until a click anywhere. */
  showClosed() {
    const { modal } = this.ctx;
    modal.innerHTML = `<small>TOURNAMENT</small><h2>Tournament entry has closed</h2><p class="hint">Tap anywhere to continue.</p>`;
    modal.showModal();
    const dismiss = () => modal.close();
    modal.addEventListener("click", dismiss, { once: true });
    modal.addEventListener("close", () => modal.removeEventListener("click", dismiss), { once: true });
  }
}
