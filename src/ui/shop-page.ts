import { whole } from "../whole.ts";
import { CURRENCIES, type CurrencyId } from "../shop/currency.ts";
import { estimatedServerTime, untilNextDay } from "../shop/clock.ts";
import { CATEGORIES, OFFERS, offer, requirementText, unmet, type CategoryId, type ShopOffer } from "../shop/offers.ts";
import { RARITIES } from "../shop/rarity.ts";
import { stubServer, type ShopServer } from "../shop/server.ts";
import { priceText, refusal, soldOut, timesBought, type Refusal } from "../shop/transactions.ts";
import type { AppContext } from "./app.ts";
import { el, gemIcon, goldIcon } from "./dom.ts";

/** Gem prices from this up ask the player to confirm first. */
export const CONFIRM_GEMS = 200;
const CURRENCY_ICONS: Record<CurrencyId, () => string> = { gems: () => gemIcon(), gold: goldIcon };

/** What the player is told when an offer can't be bought. */
const REFUSALS: Record<Refusal, string> = {
  locked: "Not unlocked yet.",
  notStarted: "Not on sale yet.",
  expired: "This offer has expired.",
  storeLink: "Available in the store.",
  limit: "Already purchased.",
  owned: "Already yours.",
  unpaid: "The store didn't confirm the purchase.",
  short: "Not enough to buy it.",
};

/** `ms` as a countdown, "03:42:18". */
export function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000)), two = (n: number) => String(n).padStart(2, "0");
  return `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
}

/** The Shop page: limited offers, then one-time offers not yet owned, then
 * the Gem offers in two columns, then the one-time offers owned. Each card
 * opens its details; its button buys it. Free claims and purchases count
 * on the server's time, asked for at that moment. */
export class ShopPage {
  /** Real-money prices from the server, by sku, once it answers. */
  private prices: Record<string, string> = {};
  private message = "";
  /** A purchase waiting on the server or store: other buttons wait too. */
  private busy = false;

  constructor(
    private ctx: AppContext,
    private server: ShopServer = stubServer,
  ) {
    void server.prices().then((p) => {
      this.prices = p;
      if (el("shop").classList.contains("active")) this.render();
    }).catch(() => {});
  }

  /** The server's time as estimated now, for countdowns and what shows. */
  private get now() {
    const game = this.ctx.game;
    return estimatedServerTime(game.save.shop.clock, game.clock());
  }

  /** Opens the page afresh, without the last visit's message. */
  open() {
    this.message = "";
    this.render();
  }

  render() {
    const save = this.ctx.game.save;
    const owned = (o: ShopOffer) => o.category === "special" && soldOut(save, o, this.now);
    const section = (id: CategoryId, offers: ShopOffer[], extra = "") => {
      const c = CATEGORIES[id], locked = unmet(save, c.requires);
      if (locked) return `<section class="shop-section locked"><h3>🔒 ${c.name}</h3><p class="hint">${requirementText(locked)}</p></section>`;
      return offers.length ? `<section class="shop-section shop-${id} ${extra}"><h3>${c.name}</h3><div class="shop-grid">${offers.map((o) => this.card(o)).join("")}</div></section>` : "";
    };
    const of = (id: CategoryId) => OFFERS.filter((o) => o.category === id);
    const ownedOffers = OFFERS.filter(owned);
    el("shop").innerHTML =
      `<button class="back" id="shop-back">← Back</button><div class="page-title"><small>SUPPLIES FOR THE ASCENT</small><h2>Shop</h2></div>` +
      this.purse() +
      `<p class="shop-message" id="shop-message" aria-live="polite">${this.message}</p>` +
      section("limited", of("limited")) +
      section("special", of("special").filter((o) => !owned(o))) +
      section("gems", of("gems"), "shop-columns") +
      (ownedOffers.length ? `<section class="shop-section shop-owned"><h3>Owned</h3><div class="shop-grid">${ownedOffers.map((o) => this.card(o)).join("")}</div></section>` : "") +
      this.history();
    this.bind();
  }

  /** Every currency the Shop prices in, held now; each opens its information. */
  private purse() {
    const save = this.ctx.game.save;
    return `<div class="shop-purse" aria-label="Currencies">${(Object.keys(CURRENCIES) as CurrencyId[])
      .map((id) => `<button class="shop-currency" data-currency="${id}" aria-label="${CURRENCIES[id].name}: ${whole(CURRENCIES[id].balance(save)).toLocaleString("en-US")}">${CURRENCY_ICONS[id]()}<b>${whole(CURRENCIES[id].balance(save)).toLocaleString("en-US")}</b><small>${CURRENCIES[id].name.toUpperCase()}</small></button>`)
      .join("")}</div>`;
  }

  /** What `o` costs, with the server's price for a real-money offer. */
  private priceLabel(o: ShopOffer) {
    const p = o.price;
    if (p.kind === "money") return this.prices[p.sku] ?? p.label;
    if (p.kind === "currency") return `${CURRENCY_ICONS[p.currency]()} ${p.amount.toLocaleString("en-US")}`;
    return priceText(p);
  }

  /** The label and state of `o`'s button, and a line under it saying why it
   * waits, if it does. */
  private action(o: ShopOffer): { label: string; disabled: boolean; why: string } {
    const save = this.ctx.game.save, now = this.now, why = refusal(save, o, now, this.ctx.game.free ? "free" : "store");
    if (o.price.kind === "store") return { label: "Go to store", disabled: false, why: "" };
    if (why === "limit" && o.daily) return { label: "Claimed", disabled: true, why: `Next in <span data-countdown="day">${countdown(untilNextDay(now))}</span>` };
    if (why === "limit" || why === "owned") return { label: o.purchaseLimit === 1 ? "Owned" : `Purchased ${timesBought(save, o, now)}/${o.purchaseLimit}`, disabled: true, why: "" };
    if (why === "short" && o.price.kind === "currency")
      return { label: this.priceLabel(o), disabled: true, why: `You have ${whole(CURRENCIES[o.price.currency].balance(save)).toLocaleString("en-US")} ${CURRENCIES[o.price.currency].name}` };
    if (why) return { label: this.priceLabel(o), disabled: true, why: REFUSALS[why] };
    return { label: o.price.kind === "free" ? "Claim" : this.priceLabel(o), disabled: this.busy, why: "" };
  }

  private card(o: ShopOffer) {
    const r = RARITIES[o.rarity], a = this.action(o), ends = o.endTime !== undefined && o.endTime > this.now;
    return `<article class="shop-card${o.category === "limited" ? " shop-banner" : ""}" style="--rarity: ${r.color}">
      <button class="shop-card-face" data-detail="${o.id}" aria-label="${o.name}: details"><small class="shop-rarity">${r.displayName}</small><b class="shop-name">${o.name}</b>${o.badge ? `<span class="shop-badge">${o.badge}</span>` : ""}<span class="shop-effects">${o.effects.join(" · ")}</span>${ends ? `<small class="shop-expires">Expires in <span data-countdown="${o.id}">${countdown(o.endTime! - this.now)}</span></small>` : ""}</button>
      <button class="shop-buy" data-buy="${o.id}" ${a.disabled ? "disabled" : ""}>${a.label}</button>${a.why ? `<small class="shop-why">${a.why}</small>` : ""}</article>`;
  }

  /** The transactions made, newest first: shown in Dev mode only. */
  private history() {
    const save = this.ctx.game.save;
    if (!save.settings.devMode) return "";
    const rows = [...save.shop.history].reverse().map((t) => `<li><small>${new Date(t.at).toISOString().slice(0, 16).replace("T", " ")}</small> ${t.item} · ${t.price}</li>`);
    return `<details class="shop-history"><summary>Purchase history (Dev)</summary><ul>${rows.join("") || "<li>Nothing yet</li>"}</ul></details>`;
  }

  private bind() {
    el("shop-back").onclick = () => this.ctx.navigate(this.ctx.game.mode);
    document.querySelectorAll<HTMLButtonElement>("[data-currency]").forEach((b) => (b.onclick = () => this.showCurrency(b.dataset.currency as CurrencyId)));
    document.querySelectorAll<HTMLButtonElement>("[data-detail]").forEach((b) => (b.onclick = () => this.showDetails(offer(b.dataset.detail!)!)));
    document.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((b) => (b.onclick = () => this.choose(offer(b.dataset.buy!)!)));
  }

  /** Once a second while the page shows: the countdowns, or the whole page
   * once a day turns or an offer ends. */
  tick() {
    const now = this.now, daily = OFFERS.filter((o) => o.daily);
    const turned = daily.some((o) => soldOut(this.ctx.game.save, o, now) !== !!document.querySelector(`[data-countdown="day"]`));
    const ended = OFFERS.some((o) => o.endTime !== undefined && o.endTime <= now && document.querySelector(`[data-countdown="${o.id}"]`));
    if (turned || ended) return this.render();
    document.querySelectorAll<HTMLElement>("[data-countdown]").forEach((span) => {
      const id = span.dataset.countdown!;
      span.textContent = countdown(id === "day" ? untilNextDay(now) : offer(id)!.endTime! - now);
    });
  }

  private showCurrency(id: CurrencyId) {
    const c = CURRENCIES[id], modal = this.ctx.modal;
    modal.innerHTML = `<small>SHOP</small><h2>${CURRENCY_ICONS[id]()} ${c.name}</h2><p>You have ${whole(c.balance(this.ctx.game.save)).toLocaleString("en-US")}.</p><p>${c.info}</p><div class="dialog-actions"><button id="cancel">Close</button></div>`;
    modal.showModal();
    el("cancel").onclick = () => modal.close();
  }

  /** The offer in full, without buying it: what it grants, its price, the
   * balance it leaves and its limit. */
  private showDetails(o: ShopOffer) {
    const save = this.ctx.game.save, r = RARITIES[o.rarity], a = this.action(o), modal = this.ctx.modal;
    const lines = [`Quantity: ${o.quantity}`, `Cost: ${this.priceLabel(o)}`];
    if (o.price.kind === "currency") {
      const c = CURRENCIES[o.price.currency];
      lines.push(`After: ${whole(c.balance(save) - o.price.amount).toLocaleString("en-US")} ${c.name}`);
    }
    if (o.purchaseLimit !== null) lines.push(`Purchased ${timesBought(save, o, this.now)}/${o.purchaseLimit}${o.daily ? " today" : ""}`);
    modal.innerHTML = `<small style="color: ${r.color}">${r.displayName.toUpperCase()}</small><h2>${o.name}</h2><p class="shop-guaranteed"><b>Guaranteed</b><br>${o.effects.join("<br>")}</p><p>${lines.join("<br>")}</p>${a.why ? `<p class="shop-why">${a.why}</p>` : ""}<div class="dialog-actions"><button id="cancel">Cancel</button><button id="confirm" ${a.disabled ? "disabled" : ""}>${a.label}</button></div>`;
    modal.showModal();
    el("cancel").onclick = () => modal.close();
    el("confirm").onclick = () => {
      modal.close();
      void this.buy(o);
    };
  }

  /** A card's button: an expensive Gem price asks first; the rest buy at once. */
  private choose(o: ShopOffer) {
    const p = o.price;
    if (p.kind === "currency" && p.currency === "gems" && p.amount >= CONFIRM_GEMS && !this.ctx.game.free) return this.showDetails(o);
    void this.buy(o);
  }

  /** Buys `o`: a store link opens the store; a real-money offer goes
   * through the store first (Dev free purchases skip it); then the server
   * confirms the time and the game makes the transaction. */
  private async buy(o: ShopOffer) {
    if (o.price.kind === "store") return this.server.openStore(o.price.url);
    if (this.busy) return;
    this.busy = true;
    try {
      let paid = false;
      if (o.price.kind === "money" && !this.ctx.game.free) {
        paid = await this.server.purchase(o.price.sku);
        if (!paid) return this.say("The store isn't open yet.");
      }
      // A store payment is granted even offline: the store has the money.
      const now = (await this.server.time()) ?? (paid ? this.now : null);
      if (now === null) return this.say("Can't reach the server. Try again when you're online.");
      const refused = this.ctx.game.buyOffer(o.id, now, paid);
      this.say(refused ? REFUSALS[refused] : `${o.name}: ${o.price.kind === "free" ? "claimed" : "purchased"}!`);
      this.ctx.update();
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private say(message: string) {
    this.message = message;
  }
}
