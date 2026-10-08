import type { MailClient } from "../mail/client.ts";
import { waiting, type MailItem, type MailMessage } from "../mail/message.ts";
import { CURRENCIES } from "../shop/currency.ts";
import type { AppContext } from "./app.ts";
import { escapeHtml, gemIcon, giftIcon, goldIcon, shardIcon, ticketIcon } from "./dom.ts";
import { mailShown, revealReward } from "./reward-reveal.ts";

// The Mail popup, in the shared dialog, opened by the forest's Mail button
// (docs/MAIL.md): the list of recent messages, newest first, and a message
// opened from it, with its items and Claim. Its text comes from the server,
// so every word of it is escaped.

const CURRENCY_ICONS = { gems: () => gemIcon(), shards: () => shardIcon(), gold: goldIcon } as const;

/** How long ago `sentAt` was, as the list shows it: `now`, `5m`, `2h`, `3d`. */
function age(now: number, sentAt: number) {
  const minutes = Math.max(0, Math.floor((now - sentAt) / 60_000));
  return minutes < 1 ? "now" : minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`;
}

/** When a message was sent, on the server's (GMT) clock: *8 October 2026, 12:00 GMT*. */
const sentDate = (sentAt: number) =>
  `${new Date(sentAt).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} GMT`;

/** A body's paragraphs (blank lines between), each line kept. */
const bodyHtml = (body: string) =>
  body.trim() ? body.trim().split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("") : "";

/** One item: its icon over its amount and name; a kind this game doesn't
 * know asks for an update. */
function itemHtml(i: MailItem, claimed: boolean) {
  const mark = claimed ? `<span class="mail-item-check" aria-label="claimed">✓</span>` : "";
  if (i.kind === "currency")
    return `<span class="mail-item">${CURRENCY_ICONS[i.currency]()}<b>${i.amount.toLocaleString("en-US")}</b><small>${CURRENCIES[i.currency].name}</small>${mark}</span>`;
  if (i.kind === "tickets") return `<span class="mail-item">${ticketIcon()}<b>${i.amount}</b><small>${i.amount === 1 ? "Ticket" : "Tickets"}</small>${mark}</span>`;
  return `<span class="mail-item unknown"><span class="mail-item-unknown" aria-hidden="true">?</span><small>Update the game to claim this reward</small></span>`;
}

export class MailDialog {
  /** The message open, or null while the list shows. */
  private openId: string | null = null;
  /** A line under the message: a claim under way, or why it failed. */
  private note = "";
  private busy = false;

  constructor(
    private ctx: AppContext,
    private client: MailClient,
    /** Asks the server for the inbox again. */
    private refresh: () => Promise<unknown>,
  ) {
    // A phone's Back (the dialog's cancel) goes from a message to the list, then closes.
    ctx.modal.addEventListener("cancel", (e) => {
      if (!this.showing || !this.openId) return;
      e.preventDefault();
      this.back();
    });
  }

  /** Whether the shared dialog shows Mail now. */
  get showing() {
    return this.ctx.modal.open && !!this.ctx.modal.querySelector(".mail-dialog");
  }

  /** Opens the list, and asks the server for anything new. */
  show() {
    this.openId = null;
    this.note = "";
    this.render();
    if (!this.ctx.modal.open) this.ctx.modal.showModal();
    void this.refresh().then(() => this.showing && this.render());
  }

  /** Draws it again, as the inbox changes (main calls it after a refresh). */
  rerender() {
    if (this.showing) this.render();
  }

  private get recent() {
    return this.ctx.game.mail.recent;
  }

  private render() {
    const modal = this.ctx.modal, open = this.recent.find((m) => m.id === this.openId);
    if (!open) this.openId = null;
    if (!this.recent.length) {
      if (this.showing) modal.close();
      return;
    }
    modal.innerHTML = open ? this.messageHtml(open) : this.listHtml();
    this.bind();
  }

  private listHtml() {
    const now = this.ctx.game.mail.now;
    const rows = this.recent.map((m) => {
      const gift = waiting(m) ? giftIcon("gift-icon mail-gift") : "";
      const label = `${m.subject || "(no subject)"}${m.read ? "" : ", unread"}${waiting(m) ? ", reward to claim" : ""}`;
      const remove = waiting(m) ? "" : `<button class="mail-remove" data-mail-hide="${escapeHtml(m.id)}" aria-label="Remove ${escapeHtml(m.subject)}" title="Remove">✕</button>`;
      return `<li class="mail-row${m.read ? "" : " unread"}"><button class="mail-open" data-mail-open="${escapeHtml(m.id)}" aria-label="${escapeHtml(label)}"><i class="mail-dot" aria-hidden="true"></i><span class="mail-subject">${escapeHtml(m.subject)}</span>${gift}<small class="mail-age">${age(now, m.sentAt)}</small></button>${remove}</li>`;
    });
    return `<div class="mail-dialog"><small>INBOX</small><h2>Mail</h2><ul class="mail-list">${rows.join("")}</ul><div class="dialog-actions"><button id="mail-close">Close</button></div></div>`;
  }

  private messageHtml(m: MailMessage) {
    const claimable = this.ctx.game.mail.canClaim(m.id);
    const items = m.items.length ? `<div class="mail-items">${m.items.map((i) => itemHtml(i, m.claimed)).join("")}</div>` : "";
    const claim = claimable ? `<button id="mail-claim"${this.busy ? " disabled" : ""}>Claim</button>` : "";
    const state = m.items.length && m.claimed ? `<p class="mail-claimed">Claimed</p>` : "";
    const note = this.note ? `<p class="hint mail-note">${this.note}</p>` : "";
    return `<div class="mail-dialog mail-message"><small>MAIL · ${sentDate(m.sentAt)}</small><h2>${escapeHtml(m.subject)}</h2><div class="mail-body">${bodyHtml(m.body)}</div>${items}${state}${note}<div class="dialog-actions"><button id="mail-back">Back</button>${claim}</div></div>`;
  }

  private bind() {
    const modal = this.ctx.modal;
    document.getElementById("mail-close")?.addEventListener("click", () => modal.close());
    document.getElementById("mail-back")?.addEventListener("click", () => this.back());
    document.getElementById("mail-claim")?.addEventListener("click", () => void this.claim());
    modal.querySelectorAll<HTMLButtonElement>("[data-mail-open]").forEach((b) => (b.onclick = () => this.open(b.dataset.mailOpen!)));
    modal.querySelectorAll<HTMLButtonElement>("[data-mail-hide]").forEach((b) => (b.onclick = () => this.hide(b.dataset.mailHide!)));
  }

  private open(id: string) {
    this.client.open(id);
    this.openId = id;
    this.note = "";
    this.render();
    this.ctx.update();
  }

  private back() {
    this.openId = null;
    this.note = "";
    this.render();
  }

  private hide(id: string) {
    if (!this.client.hide(id)) return;
    this.render();
    this.ctx.update();
  }

  /** Claims the open message through the server, and celebrates what it
   * granted (the dialog steps aside for the reveal, and comes back to the
   * message after); or says it couldn't. */
  private async claim() {
    const id = this.openId;
    if (!id || this.busy) return;
    this.busy = true;
    this.note = "Claiming…";
    this.render();
    const items = await this.client.claim(id);
    this.busy = false;
    this.note = items ? "" : "Couldn't reach the server. Try again later.";
    this.ctx.update();
    const shown = items && mailShown(items);
    if (!shown || !this.showing) return this.rerender();
    this.ctx.modal.close();
    revealReward(shown, this.ctx.game.save.settings.reduceMotion, () => {
      this.render();
      if (this.recent.length && !this.ctx.modal.open) this.ctx.modal.showModal();
    });
  }
}
