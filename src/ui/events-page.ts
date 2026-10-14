import { EVENT_MISSION_COUNT, EVENT_MISSIONS, TIER_MEDALS, TIERS, type RelicMilestone } from "../events/catalog.ts";
import { isFinished, milestoneReached, unclaimedTiers, type EventMission } from "../events/progress.ts";
import { offer } from "../shop/offers.ts";
import { stubServer, type ShopServer } from "../shop/server.ts";
import { shortCountdown } from "../tournament/schedule.ts";
import type { AppContext } from "./app.ts";
import { checkIcon, el, eventIcon, medalIcon, relicIcon } from "./dom.ts";
import { offerShown, revealReward } from "./reward-reveal.ts";

/** How long a mission whose last tier is claimed stays where it is before it
 * moves under the rest (ms). */
const MOVE_AFTER_MS = 2000;
/** A countdown on the page: *9d 4h*, *7h 12m*, *12m*. */
const countdown = (ms: number) => shortCountdown(ms).replace(/([dh])(?=\d)/g, "$1 ");
const LOCK = `<svg class="relic-lock" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="#3a3f4b" stroke="#c9ced8" stroke-width="1.1"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="#c9ced8" stroke-width="1.4"/></svg>`;

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

  constructor(private ctx: AppContext, private server: ShopServer = stubServer) {}

  /** Opens the screen afresh, from page `from`. */
  open(from: string) {
    const events = this.ctx.game.events;
    this.from = from;
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
    return JSON.stringify([e.id, e.missions, e.moved, this.ctx.game.events.boosted]);
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
      `<button class="missions-close" id="events-close" aria-label="Close" title="Close">✕</button>` +
      `<header class="event-banner"><span class="event-banner-art" aria-hidden="true">${eventIcon("event-icon event-banner-icon")}</span>` +
      `<div class="page-title"><small>EVENT</small><h2>${info.name}</h2></div><p class="event-ends" id="event-ends">${this.endsText()}</p></header>` +
      this.track(info.milestones) +
      this.boost() +
      `<p class="missions-next" id="event-next">${this.nextText()}</p>` +
      (order.length ? `<ul class="mission-list event-missions">${order.map((m) => this.missionHtml(m)).join("")}</ul>` : `<p class="hint">The event's missions come soon.</p>`);
    this.bind();
    if (before) this.slide(before);
    this.scheduleMove();
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

  /** The relic track: a bar filling to the last milestone with the Medals
   * the event has paid toward its relics, the relics for all above it and
   * the premium ones below, each lit once reached. */
  private track(milestones: readonly RelicMilestone[]) {
    const game = this.ctx.game, events = game.events, e = game.save.events, medals = events.medals;
    const top = Math.max(...milestones.map((m) => m.medals));
    const relic = (m: RelicMilestone) => {
      const reached = milestoneReached(e, m), locked = m.premium && !events.boosted;
      const name = `${m.premium ? "Premium " : ""}${m.rarity === "epic" ? "Epic" : "Rare"} Relic`;
      const label = `${name} at ${m.medals.toLocaleString("en-US")} Medals${reached ? " (won)" : locked ? " (Event Booster)" : ""}`;
      return `<span class="event-relic ${m.rarity}${reached ? " reached" : ""}${locked ? " locked" : ""}" style="--at:${(100 * m.medals) / top}%" title="${label}" aria-label="${label}" role="img">` +
        `<span class="event-relic-art">${relicIcon(m.rarity)}${reached ? checkIcon() : locked ? LOCK : ""}</span><small>${m.medals.toLocaleString("en-US")}</small></span>`;
    };
    const row = (premium: boolean) => `<div class="event-relics ${premium ? "premium" : "standard"}">${milestones.filter((m) => m.premium === premium).map(relic).join("")}</div>`;
    const next = milestones.filter((m) => !milestoneReached(e, m) && (!m.premium || events.boosted)).sort((a, b) => a.medals - b.medals)[0];
    return `<section class="weekly event-track" aria-label="Relics"><div class="weekly-head"><b>Relics</b><small>${medalIcon()} <b>${medals.toLocaleString("en-US")}</b> Medals${events.boosted ? " · ×2" : ""}</small></div>` +
      `<div class="event-track-body">${row(false)}<div class="weekly-bar event-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${top}" aria-valuenow="${Math.min(medals, top)}"><i style="width:${Math.min(100, (100 * medals) / top)}%"></i></div>${row(true)}</div>` +
      `<small class="weekly-count">${next ? `${(next.medals - medals).toLocaleString("en-US")} Medals to the next relic` : "Every relic won"} · premium relics below</small></section>`;
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

  private bind() {
    const ctx = this.ctx;
    el("events-close").onclick = () => ctx.navigate(this.from || "board");
    document.getElementById("event-boost-buy")?.addEventListener("click", () => void this.buyBoost());
    el("events").querySelectorAll<HTMLButtonElement>("[data-claim]").forEach((b) => (b.onclick = () => this.claim(Number(b.dataset.claim))));
  }

  /** Claims mission `id`'s next tier: saved, redrawn (showing the next
   * tier, Claim again while it too is done), and its Medals risen to the
   * middle of the screen. */
  private claim(id: number) {
    const game = this.ctx.game, m = game.events.missions.find((x) => x.id === id), medals = game.events.claim(id);
    if (!m || medals === null) return;
    this.ctx.update();
    this.render();
    revealReward({ icon: medalIcon(), amount: `+${medals.toLocaleString("en-US")}`, kicker: "EVENT MISSION", name: "Medals", text: EVENT_MISSIONS[m.type].text(EVENT_MISSIONS[m.type].targets[m.claimed - 1]!), permanent: false }, game.save.settings.reduceMotion);
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
      if (game.buyOffer("eventBoost", now, true)) return void (message() && (message()!.textContent = "Already active."));
      this.ctx.update();
      this.render();
      const shown = offerShown(o);
      if (shown) revealReward(shown, game.save.settings.reduceMotion);
    } finally {
      this.busy = false;
    }
  }
}
