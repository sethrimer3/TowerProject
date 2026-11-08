import { controlIcon } from "./control-icon.ts";
import { kitIcon } from "../sprites/kit.ts";
import { EVENT_MISSION_COUNT, EVENT_MISSIONS, TIER_MEDALS, TIERS, type RelicMilestone } from "../events/catalog.ts";
import { isFinished, milestoneReached, unclaimedTiers, type EventMission } from "../events/progress.ts";
import { offer } from "../shop/offers.ts";
import { stubServer, type ShopServer } from "../shop/server.ts";
import { shortCountdown } from "../tournament/schedule.ts";
import type { AppContext } from "./app.ts";
import { arcaniteIcon, checkIcon, el, eventIcon, gemIcon, goldIcon, medalIcon, relicIcon } from "./dom.ts";
import { flyToPurse } from "./flourish.ts";
import { currencyAmount } from "./hud.ts";
import { heldAmount } from "./currencies-dialog.ts";
import { offerShown, revealReward } from "./reward-reveal.ts";
import { CURRENCY_ROWS, THEME_MEDALS, storeRelics, type CurrencyOffer, type StoreItem } from "../events/store.ts";
import { BONUS_TRACKS } from "../events/music.ts";
import { EQUIP_MATERIALS } from "../equipment/catalog.ts";
import { materialIcon } from "./equipment-icons.ts";
import { THEMES, TRACK_GOLD_PER_MILLE, ownsTheme, perMilleText, type ThemeId } from "../theme-collection.ts";
import { themeGoldHtml, themeMenuTitle, themePreview } from "./theme-menu.ts";
import { bonusText } from "../economy/relic-effects.ts";
import { RARITY_NAMES, RELICS } from "../economy/relics.ts";
import { relicButton } from "./relic-pop.ts";

/** The Events screen's tabs: the event's missions and relics, and its Store. */
type EventsTab = "missions" | "store";
const TAB_NAMES: Record<EventsTab, string> = { missions: "Missions", store: "Store" };
/** A Store item as its button's `data-store` holds it. */
const itemKey = (item: StoreItem) => `${item.kind}:${item.id}`;
const itemOf = (key: string): StoreItem => {
  const at = key.indexOf(":");
  return { kind: key.slice(0, at), id: key.slice(at + 1) } as StoreItem;
};

/** How long a mission whose last tier is claimed stays where it is before it
 * moves under the rest (ms). */
const MOVE_AFTER_MS = 2000;
/** A countdown on the page: *9d 4h*, *7h 12m*, *12m*. */
const countdown = (ms: number) => shortCountdown(ms).replace(/([dh])(?=\d)/g, "$1 ");
const LOCK = kitIcon("lock", "", "relic-lock");

/** The Events screen (docs/EVENTS.md): the running event's name and banner
 * and the time it has left; its relic track, a bar filling with the Medals
 * it has paid, its relics above and its premium relics (the Event
 * Booster's) below; the booster's offer; and its missions, each with its
 * tier (*1/3*), the Medals its next tier pays and a bar, which reads Claim
 * and those Medals and is pressed to claim them once the tier is done, those finished moved
 * under the rest a moment after their last tier is claimed. Opened by
 * the Events button, in the forest's actions column or the run's menu; its
 * X returns to whichever page opened it. */
export class EventsPage {
  /** The page the screen was opened from, which its X returns to. */
  private from = "";
  /** What the page last drew, but for the countdowns. */
  private shown = "";
  /** The missions new since the page was last opened, marked NEW. */
  private fresh = new Set<number>();
  /** The timer moving completed missions under the rest. */
  private moving: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private tab: EventsTab = "missions";

  constructor(private ctx: AppContext, private server: ShopServer = stubServer) {}

  /** Opens the screen afresh, from page `from`. */
  open(from: string) {
    const events = this.ctx.game.events;
    this.from = from;
    this.tab = "missions";
    events.refresh();
    const seen = new Set(this.ctx.game.save.events.seen);
    this.fresh = new Set(events.missions.filter((m) => !seen.has(m.id)).map((m) => m.id));
    events.seenAll();
    this.ctx.save();
    this.render();
  }

  private get active() {
    return el("events").classList.contains("active");
  }

  private state() {
    const e = this.ctx.game.save.events;
    return JSON.stringify([e.id, e.missions, e.moved, this.ctx.game.events.boosted, this.tab]);
  }

  /** Every second while the screen shows: the countdowns, or the whole
   * screen once what it shows has changed (new missions, progress, a new event). */
  rerender() {
    if (!this.active) return;
    if (this.shown !== this.state()) {
      // Missions released while the screen shows are seen as they come.
      const before = new Set(this.ctx.game.save.events.seen);
      for (const m of this.ctx.game.events.missions) if (!before.has(m.id)) this.fresh.add(m.id);
      this.ctx.game.events.seenAll();
      return this.render(true);
    }
    const ends = document.getElementById("event-ends"), next = document.getElementById("event-next");
    if (ends) ends.innerHTML = this.endsText();
    if (next) next.innerHTML = this.nextText();
  }

  /** Draws the screen; `animate` slides missions that moved to their new places. */
  render(animate = false) {
    const game = this.ctx.game, events = game.events, info = events.info;
    const before = animate ? this.places() : null;
    this.shown = this.state();
    const e = game.save.events;
    // Completed missions move under the rest only once the page has shown them done for a moment.
    const order = [...events.missions].sort((a, b) => Number(e.moved.includes(a.id)) - Number(e.moved.includes(b.id)) || a.id - b.id);
    el("events").innerHTML =
      `<button class="missions-close" id="events-close" aria-label="Close" title="Close">${controlIcon("close")}</button>` +
      `<header class="event-banner"><span class="event-banner-art" aria-hidden="true">${eventIcon("event-icon event-banner-icon")}</span>` +
      `<div class="page-title"><small>EVENT</small><h2>${info.name}</h2></div><div class="event-banner-foot"><p class="event-ends" id="event-ends">${this.endsText()}</p>${this.heldHtml()}</div></header>` +
      `<div class="tree-tabs page-tabs event-tabs" role="group" aria-label="Event tabs">${(["missions", "store"] as const).map((t) => `<button data-event-tab="${t}" aria-pressed="${this.tab === t}">${TAB_NAMES[t]}</button>`).join("")}</div>` +
      (this.tab === "store" ? this.storeHtml() :
        this.track(info.milestones) +
        this.boost() +
        `<p class="missions-next" id="event-next">${this.nextText()}</p>` +
        (order.length ? `<ul class="mission-list event-missions">${order.map((m) => this.missionHtml(m)).join("")}</ul>` : `<p class="hint">The event's missions come soon.</p>`));
    this.bind();
    if (before) this.slide(before);
    this.scheduleMove();
  }

  /** The Medals held, in the banner beside the time left: the currency the
   * event's missions pay, which the pages' currencies bar leaves to its dialog. */
  private heldHtml() {
    const medals = this.ctx.game.save.medals, exact = medals.toLocaleString("en-US");
    return `<span class="event-held" title="Medals held: ${exact}" aria-label="${exact} Medals held">${medalIcon()}<b id="event-medals-held">${heldAmount(this.ctx.game, medals)}</b></span>`;
  }

  private endsText() {
    const events = this.ctx.game.events;
    return `Ends in <b>${countdown(events.info.endsAt - events.now)}</b>`;
  }

  /** How many missions are out, and when more come. */
  private nextText() {
    const events = this.ctx.game.events, n = events.missions.length, next = events.nextRelease;
    return next === null ? `${n} missions · all released` : `${n}/${EVENT_MISSION_COUNT} missions · 2 more in <b>${countdown(next - events.now)}</b>`;
  }

  /** The relic track: a bar across the track's whole width filling to the
   * last milestone with the Medals the event has paid toward its relics, and
   * reading how many, the free relics above it and the Event Booster's
   * below, each row named at its left, under the relics' line, and each
   * relic lit once reached. */
  private track(milestones: readonly RelicMilestone[]) {
    const game = this.ctx.game, events = game.events, e = game.save.events, medals = events.medals;
    const top = Math.max(...milestones.map((m) => m.medals));
    const relic = (m: RelicMilestone) => {
      const reached = milestoneReached(e, m), locked = m.premium && !events.boosted;
      const def = m.relic ? RELICS[m.relic] : undefined;
      const name = def?.name ?? `${m.premium ? "Premium " : ""}${RARITY_NAMES[m.rarity]} Relic`;
      const label = `${name} at ${m.medals.toLocaleString("en-US")} Medals${reached ? " (won)" : locked ? " (Event Booster)" : ""}`;
      // A relic of the theme's set shows its name and bonus when pressed.
      const [tag, attrs] = def ? ["button", ` data-relic="${m.relic}"`] : ["span", ` role="img" title="${label}"`];
      return `<${tag} class="event-relic ${m.rarity}${reached ? " reached" : ""}${locked ? " locked" : ""}" style="--at:${(100 * m.medals) / top}%" aria-label="${label}"${attrs}>` +
        `<span class="event-relic-art">${relicIcon(def ?? m.rarity)}${reached ? checkIcon() : locked ? LOCK : ""}</span><small>${m.medals.toLocaleString("en-US")}</small></${tag}>`;
    };
    const row = (premium: boolean) => `<b class="event-row-name${premium ? " premium" : ""}">${premium ? "Event Boost Relics" : "Free Relics"}</b>` +
      `<div class="event-relics ${premium ? "premium" : "standard"}">${milestones.filter((m) => m.premium === premium).map(relic).join("")}</div>`;
    const count = `<span class="event-bar-count"><b>${medals.toLocaleString("en-US")}</b>${medalIcon()}${events.boosted ? " ×2" : ""}</span>`;
    return `<section class="weekly event-track" aria-label="Relics"><div class="weekly-head"><b>Relics</b></div>` +
      `<div class="event-track-body">${row(false)}<div class="weekly-bar event-bar" role="progressbar" aria-label="Medals" aria-valuemin="0" aria-valuemax="${top}" aria-valuenow="${Math.min(medals, top)}"><i style="width:${Math.min(100, (100 * medals) / top)}%"></i>${count}</div>${row(true)}</div></section>`;
  }

  /** The Event Booster's offer, or that it is active. */
  private boost() {
    const events = this.ctx.game.events, o = offer("eventBoost")!;
    const price = o.price.kind === "money" ? o.price.label : "";
    if (events.boosted)
      return `<section class="event-boost active"><span class="event-boost-art">${medalIcon()}<b>×2</b></span><div><b>Event Booster active</b><p>Every Medal this event pays counts double, and its premium relics are open.</p></div>${checkIcon()}</section>`;
    return `<section class="event-boost"><span class="event-boost-art">${medalIcon()}<b>×2</b></span><div><b>Event Booster</b><p>Doubles every Medal this event pays, those already claimed too, and opens its two premium relics.</p><p class="event-boost-message" id="event-boost-message" aria-live="polite"></p></div>` +
      `<button id="event-boost-buy" class="event-boost-buy" aria-label="Buy the Event Booster for ${price}">${price}</button></section>`;
  }

  /** A mission: what its next tier to claim asks, the tiers claimed and
   * that tier's Medals (on the bar instead, beside Claim, once it is
   * ready), and its bar, which reads Claim and claims that tier
   * while it is done (a press a tier); finished, its last tier and a check. */
  private missionHtml(m: EventMission) {
    const def = EVENT_MISSIONS[m.type], finished = isFinished(m), ready = unclaimedTiers(m) > 0;
    const tier = Math.min(m.claimed, TIERS - 1), target = def.targets[tier], boost = this.ctx.game.events.boosted ? 2 : 1;
    const medals = TIER_MEDALS[tier] * boost;
    // A tier ready to claim shows its Medals on the Claim bar instead.
    const reward = finished ? checkIcon() : ready ? "" : `<span class="mission-reward" title="${medals} Medals">${medalIcon()}<b>${medals}</b></span>`;
    const fill = `<i style="width:${Math.min(100, (100 * m.progress) / target)}%"></i>`;
    const bar = ready
      ? `<button type="button" class="mission-bar event-claim" data-claim="${m.id}" aria-label="Claim ${medals} Medals">${fill}<span>Claim <b class="event-claim-medals">${medals}${medalIcon()}</b></span></button>`
      : `<div class="mission-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${Math.min(m.progress, target)}">${fill}<span>${finished ? "Complete!" : `${m.progress.toLocaleString("en-US")}/${target.toLocaleString("en-US")}`}</span></div>`;
    const fresh = this.fresh.has(m.id) ? `<small class="event-new">NEW</small>` : "";
    return `<li class="mission event-mission${finished ? " complete" : ready ? " ready" : ""}" data-mission="${m.id}"><div class="mission-body">` +
      `<div class="event-mission-head"><b class="mission-text">${fresh}${def.text(target)}</b><span class="event-tier"><small>${m.claimed}/${TIERS}</small>${reward}</span></div>${bar}</div></li>`;
  }

  /** The Store tab: Currencies (Gems and Arcanite, then each Equipment
   * supply, dearer with each bought this event), the event's featured
   * themes, any relics its theme sells, and the bonus tracks. */
  private storeHtml() {
    const game = this.ctx.game, featured = game.events.featured;
    const currencies = CURRENCY_ROWS.map((row) => `<div class="store-row" style="--cols:${row.length}">${row.map((o) => this.currencyHtml(o)).join("")}</div>`).join("");
    const themes = (["ui", "game"] as const).map((kind) => featured[kind]).filter((id): id is ThemeId => id !== null).map((id) => this.themeHtml(id)).join("");
    const relics = storeRelics(game.save.events.id ?? 0);
    const relicsHtml = relics.length
      ? `<section class="store-section"><h3>Relics</h3><div class="store-row" style="--cols:${Math.min(2, relics.length)}">${relics.map((r) =>
        `<div class="store-offer store-relic">${relicIcon(RELICS[r.id] ?? "epic")}<b>${r.relic.name}</b><small>${bonusText(r.relic.bonus)}</small>${this.buyButton({ kind: "relic", id: r.id }, r.relic.name)}</div>`).join("")}</div></section>`
      : "";
    const tracks = BONUS_TRACKS.length
      ? `<div class="store-row" style="--cols:2">${BONUS_TRACKS.map((t) => `<div class="store-offer store-track"><b>${t.name}</b><small>${perMilleText(TRACK_GOLD_PER_MILLE)}${goldIcon()}</small>${this.buyButton({ kind: "track", id: t.id }, t.name)}</div>`).join("")}</div>`
      : `<p class="hint">Come back in the future for new songs!</p>`;
    return `<p class="event-store-message" id="event-store-message" aria-live="polite"></p>` +
      `<section class="store-section"><h3>Currencies</h3>${currencies}<p class="hint">Each bought raises its price, until the next event.</p></section>` +
      `<section class="store-section"><h3>Themes</h3><div class="store-row" style="--cols:2">${themes}</div></section>` +
      relicsHtml +
      `<section class="store-section"><h3>Music</h3><p class="hint">Bonus tracks join the music for good, each adding ${perMilleText(TRACK_GOLD_PER_MILLE)}${goldIcon()}.</p>${tracks}</section>`;
  }

  /** A Currencies offer: what it gives and its price now. */
  private currencyHtml(o: CurrencyOffer) {
    const icon = o.reward.kind === "material" ? materialIcon(o.reward.material) : o.reward.currency === "gems" ? gemIcon() : arcaniteIcon();
    const name = o.reward.kind === "material" ? EQUIP_MATERIALS[o.reward.material].name : o.reward.currency === "gems" ? "Gems" : "Arcanite";
    return `<div class="store-offer"><span class="store-reward">${icon}<b>${o.amount.toLocaleString("en-US")}</b></span><small>${name}</small>${this.buyButton({ kind: "currency", id: o.id }, `${o.amount} ${name}`)}</div>`;
  }

  /** A featured theme: its preview, name, kind and Gold, and its price, or Owned. */
  private themeHtml(id: ThemeId) {
    const t = THEMES[id], kind = themeMenuTitle(t.kind).replace(/s$/, "");
    const status = ownsTheme(this.ctx.game.save, id) ? `<span class="store-owned">${checkIcon()} Owned</span>` : this.buyButton({ kind: "theme", id }, `the ${t.name} ${kind}`, THEME_MEDALS[t.kind]);
    return `<div class="store-offer store-theme">${themePreview(t.kind, t.look, t.name)}<b>${t.name}</b><small>${kind} · ${themeGoldHtml(id)}</small>${status}</div>`;
  }

  /** A Store item's Buy button, its price in Medals (only the price turns
   * red while the Medals held fall short), or Owned once it can't be bought. */
  private buyButton(item: StoreItem, what: string, shown?: number) {
    const price = this.ctx.game.events.price(item) ?? shown;
    if (price === undefined) return `<span class="store-owned">${checkIcon()} Owned</span>`;
    const save = this.ctx.game.save, short = !save.settings.freePurchases && save.medals < price;
    return `<button type="button" class="store-buy${short ? " short" : ""}" data-store="${itemKey(item)}" aria-label="Buy ${what} for ${price} Medals">${medalIcon()} <b>${price.toLocaleString("en-US")}</b></button>`;
  }

  /** Buys a Store item; short of Medals, says where they come from. */
  private buyStore(key: string) {
    const game = this.ctx.game;
    if (!game.events.buy(itemOf(key))) {
      const message = document.getElementById("event-store-message");
      if (message) message.textContent = "Not enough Medals. The event's missions pay more.";
      return;
    }
    this.ctx.save();
    this.ctx.update();
    this.render();
  }

  private bind() {
    const ctx = this.ctx;
    el("events-close").onclick = () => ctx.navigate(this.from || "board");
    el("events").querySelectorAll<HTMLButtonElement>("[data-event-tab]").forEach((b) => (b.onclick = () => {
      this.tab = b.dataset.eventTab as EventsTab;
      this.render();
    }));
    el("events").querySelectorAll<HTMLButtonElement>("[data-relic]").forEach((b) => relicButton(b, RELICS[b.dataset.relic!]!, ctx.game.save.settings.reduceMotion));
    el("events").querySelectorAll<HTMLButtonElement>("[data-store]").forEach((b) => (b.onclick = () => this.buyStore(b.dataset.store!)));
    document.getElementById("event-boost-buy")?.addEventListener("click", () => void this.buyBoost());
    el("events").querySelectorAll<HTMLButtonElement>("[data-claim]").forEach((b) => (b.onclick = () => this.claim(Number(b.dataset.claim))));
  }

  /** Claims mission `id`'s next tier: saved, redrawn (showing the next
   * tier, Claim again while it too is done), and its Medals flown from the
   * Claim bar to the Medals held in the banner, which count them as they land. */
  private claim(id: number) {
    const game = this.ctx.game, from = el("events").querySelector(`[data-claim="${id}"]`)?.getBoundingClientRect(), before = game.save.medals, medals = game.events.claim(id);
    if (!from || medals === null) return;
    this.ctx.update();
    this.render();
    const held = (n: number) => { const b = document.getElementById("event-medals-held"); if (b) b.textContent = heldAmount(game, n); };
    held(before);
    flyToPurse(from, [{ html: `${medalIcon()}<b>+${currencyAmount(medals)}</b>`, to: document.querySelector("#events .event-held"), landed: () => held(game.save.medals) }]);
  }

  /** Each mission's place on the screen, by id. */
  private places() {
    return new Map(Array.from(el("events").querySelectorAll<HTMLElement>("[data-mission]"), (li) => [li.dataset.mission!, li.getBoundingClientRect().top]));
  }

  /** Slides each mission from where it stood (`before`) to its new place. */
  private slide(before: Map<string, number>) {
    if (this.ctx.game.save.settings.reduceMotion) return;
    el("events").querySelectorAll<HTMLElement>("[data-mission]").forEach((li) => {
      const was = before.get(li.dataset.mission!), dy = was === undefined ? 0 : was - li.getBoundingClientRect().top;
      if (dy) li.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 450, easing: "cubic-bezier(.3, .8, .3, 1)" });
    });
  }

  /** Finished missions not yet moved go under the rest after a moment,
   * while the screen shows. */
  private scheduleMove() {
    const e = this.ctx.game.save.events;
    const waiting = this.ctx.game.events.missions.filter((m) => isFinished(m) && !e.moved.includes(m.id));
    if (!waiting.length || this.moving) return;
    this.moving = setTimeout(() => {
      this.moving = null;
      if (!this.active) return;
      for (const m of waiting) this.ctx.game.events.move(m.id);
      this.ctx.update();
      this.render(true);
    }, MOVE_AFTER_MS);
  }

  /** Buys the Event Booster through the store; Dev mode (or free purchases) skips it. */
  private async buyBoost() {
    if (this.busy) return;
    this.busy = true;
    const game = this.ctx.game, dev = game.save.settings.devMode || game.free, o = offer("eventBoost")!;
    try {
      const paid = dev || (o.price.kind === "money" && (await this.server.purchase(o.price.sku)));
      const message = () => document.getElementById("event-boost-message");
      if (!paid) return void (message() && (message()!.textContent = "The store isn't open yet."));
      const now = (await this.server.time()) ?? game.clock();
      if (game.shop.buy("eventBoost", now, true)) return void (message() && (message()!.textContent = "Already active."));
      this.ctx.update();
      this.render();
      const shown = offerShown(o);
      if (shown) revealReward(shown, game.save.settings.reduceMotion);
    } finally {
      this.busy = false;
    }
  }
}
