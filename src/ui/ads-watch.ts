import { AD_PRIZES, AD_SERIES_LENGTH, ADS_PER_PRIZE, allClaimed, claimed, prizesReached, prizeWaiting, resetAt, type AdPrize } from "../ads/series.ts";
import { playAd } from "../ads/player.ts";
import { estimatedServerTime } from "../shop/clock.ts";
import { owns } from "../shop/entitlements.ts";
import { offer } from "../shop/offers.ts";
import type { AppContext } from "./app.ts";
import { revealBuys } from "./card-buy-reveal.ts";
import { adIcon, checkIcon, DECK_ICON, el, gemIcon, goldIcon } from "./dom.ts";
import { revealReward, type RewardShown } from "./reward-reveal.ts";
import type { ShopPage } from "./shop-page.ts";

/** What an ad button pays, as the Ads Watch dialog shows it: the amount
 * and its icon, and the same in words for screen readers. */
export type AdOffer = { amount: string; icon: string; label: string };

/** Pays what an ad button offers: false when it can't be paid now (its
 * cooldown not over, its store full), so no ad counts. */
export type AdGrant = () => boolean;

/** The bar's columns: the play mark's, then one per prize (px). */
const PLAY_W = 40, COLUMN_W = 76;

/** How far along the bar `watched` ads fill it (px from the bar's start):
 * each prize's column is reached at its middle, where its marker stands,
 * and the last prize's ends the bar. */
function fillAt(watched: number) {
  const prizes = watched / ADS_PER_PRIZE;
  return Math.round(prizes < 1 ? (prizes * COLUMN_W) / 2 : (prizes - 0.5) * COLUMN_W);
}

/** `ms` as days, hours and minutes: "2D:05H:13M". */
function resetCountdown(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60_000)), two = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(m / 1440)}D:${two(Math.floor(m / 60) % 24)}H:${two(m % 60)}M`;
}

/** A prize's face on its box: its icon and what it gives. */
function prizeFace(p: AdPrize) {
  switch (p.kind) {
    case "gold": return `${goldIcon()}<b>×${p.factor}</b><small>${p.hours}h</small>`;
    case "gems": return `${gemIcon()}<b>${p.amount}</b>`;
    case "cards": return `${DECK_ICON}<b>×${p.count}</b><small>Cards</small>`;
    case "discount": return `${adIcon()}<b>${p.percent}%</b><small>${p.hours}h off</small>`;
  }
}

/** A prize in words. */
function prizeName(p: AdPrize) {
  switch (p.kind) {
    case "gold": return `Gold ×${p.factor} for ${p.hours === 1 ? "1 hour" : `${p.hours} hours`}`;
    case "gems": return `${p.amount} Gems`;
    case "cards": return `${p.count} card draws`;
    case "discount": return `${p.percent}% off Permanent Ad-Disable for ${p.hours} hours`;
  }
}

/** The Ads Watch dialog: what an ad button offers, a golden Watch button
 * that plays the ad and pays it, the ad series' bar of prizes (one every
 * five ads, each claimed by pressing it), and Permanent Ad-Disable as the
 * Shop sells it. An ad that reaches a prize opens the dialog again, its
 * Watch button closed, so the prize can be claimed. With Ad-Disable owned,
 * ad buttons pay at once and the dialog never opens. */
export class AdsWatch {
  /** The ad button pressed: what it offers and what pays it. */
  private offer: { shown: AdOffer; grant: AdGrant } | null = null;
  /** Whether the ad was just watched: Watch stays closed. */
  private watched = false;
  /** What the last purchase from the dialog said, when it failed. */
  private message = "";
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ctx: AppContext, private readonly shop: ShopPage) {
    // A close is told after the fact, so one the dialog was opened again
    // since (an ad that reached a prize) leaves it be.
    ctx.modal.addEventListener("close", () => {
      if (!ctx.modal.open) this.closed();
    });
  }

  private get game() {
    return this.ctx.game;
  }

  /** An ad button pressed: with ads on, the dialog offering `shown`; with
   * Ad-Disable owned, `grant` pays at once. */
  watch(shown: AdOffer, grant: AdGrant) {
    if (!this.game.ads.on) return void grant();
    this.offer = { shown, grant };
    this.watched = false;
    this.message = "";
    this.open();
  }

  private open() {
    const modal = this.ctx.modal;
    this.render();
    if (!modal.open) modal.showModal();
    modal.classList.add("ads-watch-dialog");
    this.scrollToProgress();
    this.ticker ??= setInterval(() => this.tick(), 1000);
  }

  /** The dialog closed for good: it leaves the shared modal as it found it. */
  private closed() {
    const modal = this.ctx.modal;
    if (!modal.classList.contains("ads-watch-dialog")) return;
    modal.classList.remove("ads-watch-dialog");
    if (!modal.classList.length) modal.removeAttribute("class");
    modal.innerHTML = "";
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private render() {
    const s = this.game.ads.series, reached = prizesReached(s);
    const boxes = AD_PRIZES.map((p, i) => {
      const state = claimed(s, i) ? "claimed" : prizeWaiting(s, i) ? "ready" : "locked";
      const label = `${prizeName(p)}: ${state === "ready" ? "claim" : state === "claimed" ? "claimed" : `at ${(i + 1) * ADS_PER_PRIZE} ads`}`;
      return `<button type="button" class="ads-prize ${state}" data-ad-prize="${i}" style="grid-column:${i + 2}" ${state === "ready" ? "" : "disabled"} aria-label="${label}" title="${label}">${prizeFace(p)}${state === "claimed" ? checkIcon("ads-prize-check") : ""}</button>`;
    }).join("");
    const marks = AD_PRIZES.map((_, i) => `<small class="ads-mark${i < reached ? " reached" : ""}" style="grid-column:${i + 2}">${(i + 1) * ADS_PER_PRIZE}</small>`).join("");
    const width = PLAY_W + AD_PRIZES.length * COLUMN_W;
    const bar = `<div class="ads-scroll" id="ads-scroll"><div class="ads-bar" style="width:${width}px;grid-template-columns:${PLAY_W}px repeat(${AD_PRIZES.length}, ${COLUMN_W}px)">${boxes}`
      + `<div class="ads-track" style="grid-column:1 / -1"><span class="ads-play">${adIcon()}</span><span class="ads-rail" style="width:${fillAt(AD_SERIES_LENGTH)}px"><i class="ads-fill" id="ads-fill" style="width:${fillAt(s.watched)}px"></i></span></div>${marks}</div></div>`;
    const at = resetAt(s);
    const status = at !== null
      ? `<p class="ads-status">All prizes claimed. The prize row resets in <b id="ads-reset">${resetCountdown(at - this.now)}</b></p>`
      : `<p class="ads-status">${s.watched} / ${AD_SERIES_LENGTH} ads watched: a prize every ${ADS_PER_PRIZE}</p>`;
    this.ctx.modal.innerHTML = `<small>ADS</small><h2>Ads Watch</h2>${bar}${status}${this.offerBox()}${this.adFreeBox()}<div class="dialog-actions"><button id="ads-close">Close</button></div>`;
    this.bind();
  }

  /** The Shop's server time as estimated now. */
  private get now() {
    return estimatedServerTime(this.game.save.shop.clock, this.game.clock());
  }

  /** The offer the ad button made, shining, and the golden Watch button
   * under it: closed once the ad is watched; with Ad-Disable just bought,
   * a Claim button that pays it for nothing. */
  private offerBox() {
    if (!this.offer) return "";
    const { shown } = this.offer, on = this.game.ads.on;
    const button = on
      ? `<button type="button" class="ads-watch" id="ads-watch" ${this.watched ? "disabled" : ""} aria-label="Watch an ad for ${shown.label}">${adIcon()}${this.watched ? "Watched" : "Watch"}</button>`
      : `<button type="button" class="ads-watch" id="ads-watch" ${this.watched ? "disabled" : ""} aria-label="Claim ${shown.label}">${this.watched ? "Claimed" : "Claim"}</button>`;
    return `<div class="ads-offer"><span class="ads-offer-prize" aria-label="${shown.label}"><b>${shown.amount}</b>${shown.icon}</span>${button}</div>`;
  }

  /** Permanent Ad-Disable as the Shop shows it, with its buy button. */
  private adFreeBox() {
    if (owns(this.game.save, "adFree")) return `<p class="ads-owned">Ads are off for good: every ad button pays at once.</p>`;
    return `<div class="ads-shop shop-grid">${this.shop.offerCard("adFree")}</div>${this.message ? `<p class="shop-why">${this.message}</p>` : ""}`;
  }

  private bind() {
    const modal = this.ctx.modal;
    el("ads-close").onclick = () => modal.close();
    modal.querySelectorAll<HTMLButtonElement>("[data-ad-prize]").forEach((b) => (b.onclick = () => this.claim(Number(b.dataset.adPrize))));
    const watch = document.getElementById("ads-watch");
    if (watch) watch.onclick = () => void this.play();
    modal.querySelector<HTMLButtonElement>(".ads-shop [data-buy]")?.addEventListener("click", () => void this.buyAdFree());
    // The card's face opens the Shop's details there; here it is only shown.
    modal.querySelector<HTMLButtonElement>(".ads-shop [data-detail]")?.setAttribute("tabindex", "-1");
  }

  /** Keeps the bar's progress in view. */
  private scrollToProgress() {
    const scroll = document.getElementById("ads-scroll");
    if (scroll) scroll.scrollLeft = Math.max(0, PLAY_W + fillAt(this.game.ads.series.watched) - scroll.clientWidth / 2);
  }

  /** Watch: the dialog closes, the ad plays, the offer is paid and the ad
   * counts; one that reaches a prize opens the dialog again. With
   * Ad-Disable owned the offer is paid without an ad. */
  private async play() {
    const o = this.offer;
    if (!o || this.watched) return;
    this.ctx.modal.close();
    const on = this.game.ads.on;
    if (on && !(await playAd())) return;
    if (!o.grant()) return;
    this.watched = true;
    const prize = on ? this.game.ads.watched() : null;
    this.ctx.save();
    this.ctx.update();
    if (prize !== null) this.open();
  }

  /** Claims prize `i`: the dialog gives way to the prize's celebration,
   * and comes back once it is pressed away. */
  private claim(i: number) {
    const got = this.game.ads.claim(i);
    if (!got) return;
    this.ctx.save();
    this.ctx.update();
    this.ctx.modal.close();
    const back = () => this.open(), still = this.game.save.settings.reduceMotion;
    if (got.buys.length) return revealBuys(got.buys, still, undefined, got.gems ? () => revealReward(gemsShown(got.gems), still, back) : back);
    revealReward(got.prize.kind === "cards" ? gemsShown(got.gems) : prizeShown(got.prize), still, back);
  }

  /** Buys Permanent Ad-Disable as the Shop does; the dialog comes back once
   * what was bought is pressed away. */
  private async buyAdFree() {
    const o = offer("adFree")!;
    this.ctx.modal.close();
    const said = await this.shop.buy(o, () => this.open());
    this.message = owns(this.game.save, "adFree") ? "" : said;
    this.ctx.update();
  }

  /** Once a second while open: the reset countdown, the discount's on the
   * Ad-Disable card, and the whole dialog once the week turns. */
  private tick() {
    if (!this.ctx.modal.open || !this.ctx.modal.classList.contains("ads-watch-dialog")) return;
    const s = this.game.ads.series, at = resetAt(s), reset = document.getElementById("ads-reset");
    if (!!reset !== (at !== null)) return this.render();
    if (reset && at !== null) reset.textContent = resetCountdown(at - this.now);
    const discount = this.ctx.modal.querySelector<HTMLElement>("[data-countdown^='discount:']");
    if (discount && this.now >= this.game.save.ads.discountUntil) return this.render();
    if (discount) this.shop.tickCountdown(discount, this.now);
  }
}

/** Gems a prize gave, celebrated. */
const gemsShown = (gems: number): RewardShown => ({ icon: gemIcon(), amount: `+${gems}`, kicker: "AD REWARD", name: "Gems", permanent: false });

/** What a prize claimed shows as it rises to the screen's middle. */
function prizeShown(p: AdPrize): RewardShown {
  switch (p.kind) {
    case "gold": return { icon: goldIcon(), amount: `×${p.factor}`, kicker: "AD REWARD", name: prizeName(p), text: "Every Gold banked, on top of every other bonus", permanent: false };
    case "gems": return gemsShown(p.amount);
    case "cards": return { icon: DECK_ICON, amount: `×${p.count}`, kicker: "AD REWARD", name: prizeName(p), permanent: false };
    case "discount": return { icon: adIcon(), amount: `${p.percent}%`, kicker: "AD REWARD", name: "Permanent Ad-Disable", text: `${p.percent}% off in the Shop for ${p.hours} hours`, permanent: false };
  }
}
