import { FAMILIARS, FAMILIAR_IDS, statAt, type FamiliarId } from "../familiars/catalog.ts";
import { offer } from "../shop/offers.ts";
import { pngIcon } from "../sprites/kit.ts";
import type { AppContext } from "./app.ts";
import { closesOnBackdrop } from "./dialogs.ts";
import { el, medalIcon } from "./dom.ts";
import { showHatch } from "./hatch-reveal.ts";

const SLOTS = [0, 1, 2, 3] as const;
export const familiarIcon = (id: FamiliarId, className = "familiar-icon") => pngIcon(`familiar-${id}-icon`, className);
const eggIcon = (id: FamiliarId) => pngIcon(`familiar-egg-${id}`, "familiar-egg");
const medals = (n: number) => n.toLocaleString("en-US");

/** The Events screen's Familiars tab (docs/agents/familiars.md): a row for
 * each familiar, its egg to hatch or its four stats to grow, its summary
 * from its header and, hatched, its switch; with the dialogs they open.
 * `buyBoost` is the Events screen's, for the dialog shown when Medals fall
 * short; `changed` redraws the screen. */
export class FamiliarsPanel {
  constructor(private ctx: AppContext, private changed: () => void, private buyBoost: (messageId: string, bought: () => void) => void) {}

  private get desk() {
    return this.ctx.game.familiars;
  }

  /** What the tab shows, for the screen's once-a-second look for changes. */
  state() {
    const save = this.ctx.game.save;
    return [save.familiars, save.medals, save.settings.freePurchases, FAMILIAR_IDS.map((id) => this.desk.values(id).cooldown)];
  }

  html() {
    return `<ul class="familiar-list" id="familiar-list">${FAMILIAR_IDS.map((id) => this.row(id)).join("")}</ul>`;
  }

  private row(id: FamiliarId) {
    const { name } = FAMILIARS[id], hatched = this.desk.hatched(id), on = this.desk.isOn(id);
    const toggle = hatched
      ? `<button type="button" class="familiar-switch" data-familiar-switch="${id}" role="switch" aria-checked="${on}" aria-label="${name} in climbs"><i></i></button>`
      : "";
    return `<li class="familiar-row${hatched ? " hatched" : ""}${hatched && !on ? " off" : ""}" data-familiar="${id}"><div class="familiar-head">` +
      `<button type="button" class="familiar-about" data-familiar-about="${id}" aria-label="About the ${name}">${familiarIcon(id)}<b>${name}</b></button>${toggle}</div>` +
      (hatched ? `<div class="familiar-stats">${SLOTS.map((slot) => this.stat(id, slot)).join("")}</div>` : this.egg(id)) +
      `</li>`;
  }

  private egg(id: FamiliarId) {
    const price = this.desk.hatchPrice!, short = this.desk.hatchRefusal(id) === "short";
    return `<button type="button" class="familiar-hatch${short ? " unaffordable" : ""}" data-familiar-hatch="${id}" aria-label="Hatch the ${FAMILIARS[id].name} for ${price} Medals">` +
      `<span>Hatch</span>${eggIcon(id)}<b>${medals(price)}</b>${medalIcon()}</button>`;
  }

  private stat(id: FamiliarId, slot: number) {
    const stat = statAt(id, slot), price = this.desk.upgradePrice(id, slot), value = (stat.boxed ?? stat.shown)(this.desk.preview(id, slot).now);
    const body = `<span class="familiar-stat-name">${stat.name}</span><b>${value}</b><hr>` +
      `<span class="familiar-stat-cost">${price === null ? "Max" : `${medals(price)}${medalIcon()}`}</span>`;
    if (price === null) return `<div class="familiar-stat maxed" role="img" aria-label="${stat.name}: ${value}, at its maximum">${body}</div>`;
    const short = this.desk.upgradeRefusal(id, slot) === "short";
    return `<button type="button" class="familiar-stat${short ? " unaffordable" : ""}" data-familiar-stat="${id}:${slot}" aria-label="Upgrade ${stat.name}, ${value}, for ${price} Medals">${body}</button>`;
  }

  bind() {
    const list = document.getElementById("familiar-list");
    if (!list) return;
    list.querySelectorAll<HTMLButtonElement>("[data-familiar-about]").forEach((b) => (b.onclick = () => this.about(b.dataset.familiarAbout as FamiliarId)));
    list.querySelectorAll<HTMLButtonElement>("[data-familiar-hatch]").forEach((b) => (b.onclick = () => this.askHatch(b.dataset.familiarHatch as FamiliarId)));
    list.querySelectorAll<HTMLButtonElement>("[data-familiar-switch]").forEach((b) => (b.onclick = () => {
      if (this.desk.toggle(b.dataset.familiarSwitch as FamiliarId)) this.saved();
    }));
    list.querySelectorAll<HTMLButtonElement>("[data-familiar-stat]").forEach((b) => (b.onclick = () => {
      const [id, slot] = b.dataset.familiarStat!.split(":") as [FamiliarId, string];
      this.askUpgrade(id, Number(slot));
    }));
  }

  private saved() {
    this.ctx.save();
    this.ctx.update();
    this.changed();
  }

  private askHatch(id: FamiliarId) {
    const price = this.desk.hatchPrice, refusal = this.desk.hatchRefusal(id), { name, summary } = FAMILIARS[id];
    if (price === null) return;
    if (refusal === "locked") return this.locked();
    if (refusal === "short") return this.short(price);
    if (refusal) return;
    this.ctx.confirm(
      { title: `Hatch the ${name}?`, body: summary, label: `Hatch · ${medalIcon()} <b>${medals(price)}</b>`, cancel: "Cancel", aria: `Hatch for ${price} Medals` },
      () => {
        if (!this.desk.hatch(id)) return;
        // Bought and saved before the egg moves, so closing the game mid-reveal loses nothing.
        this.saved();
        showHatch(id, this.ctx.game.save.settings.reduceMotion);
      },
    );
  }

  private askUpgrade(id: FamiliarId, slot: number) {
    const price = this.desk.upgradePrice(id, slot), refusal = this.desk.upgradeRefusal(id, slot);
    if (price === null) return;
    if (refusal === "locked") return this.locked();
    if (refusal === "short") return this.short(price);
    if (refusal) return;
    const stat = statAt(id, slot), { now, next } = this.desk.preview(id, slot);
    this.ctx.confirm(
      { title: `${FAMILIARS[id].name}: ${stat.name}`, body: `${stat.shown(now)} → <b>${stat.shown(next!)}</b>`, label: `Upgrade · ${medalIcon()} <b>${medals(price)}</b>`, cancel: "Cancel", aria: `Upgrade for ${price} Medals` },
      () => {
        if (this.desk.upgrade(id, slot)) this.saved();
      },
    );
  }

  /** The familiar's name, look and work, and each stat now and a level on. */
  private about(id: FamiliarId) {
    const { name, summary } = FAMILIARS[id], modal = this.ctx.modal;
    const rows = SLOTS.map((slot) => {
      const stat = statAt(id, slot), { now, next } = this.desk.preview(id, slot);
      return `<tr><th scope="row">${stat.name}</th><td>${stat.shown(now)}</td><td class="${next === null ? "familiar-max" : "familiar-next"}">${next === null ? "Max" : stat.shown(next)}</td></tr>`;
    }).join("");
    modal.innerHTML = `<div class="familiar-dialog"><h2>${name}</h2>${familiarIcon(id, "familiar-portrait")}<p>${summary}</p>` +
      `<table class="stats-table familiar-table"><thead><tr><th scope="col">Stat</th><td>Now</td><td>Upgraded</td></tr></thead><tbody>${rows}</tbody></table>` +
      `<div class="dialog-actions"><button id="familiar-ok">OK</button></div></div>`;
    modal.showModal();
    closesOnBackdrop(modal);
    el("familiar-ok").onclick = () => modal.close();
  }

  private notice(title: string, body: string) {
    const modal = this.ctx.modal;
    modal.innerHTML = `<h2>${title}</h2><p>${body}</p><div class="dialog-actions"><button id="familiar-ok">OK</button></div>`;
    modal.showModal();
    el("familiar-ok").onclick = () => modal.close();
  }

  private locked() {
    this.notice("Events aren't open yet", "Claim Tower I's floor 70 Goal to open Events and earn Medals.");
  }

  /** Short of Medals: the running event's Booster until it is bought, then where Medals come from. */
  private short(price: number) {
    const { events, save } = this.ctx.game;
    if (events.boosted) return this.notice("Not enough Medals", "Not enough Medals. The event's missions pay more.");
    const o = offer("eventBoost")!, cost = o.price.kind === "money" ? o.price.label : "", modal = this.ctx.modal;
    modal.innerHTML = `<div class="familiar-short"><h2>Not enough Medals</h2><p>${medalIcon()} <b>${medals(Math.ceil(price - save.medals))}</b> more needed.</p>` +
      `<section class="event-boost"><span class="event-boost-art">${medalIcon()}<b>×2</b></span><div><b>${events.info.name} Event Booster</b>` +
      `<p>Doubles every Medal this event pays, those already claimed too, and opens its two premium relics.</p>` +
      `<p class="event-boost-message" id="familiar-boost-message" aria-live="polite"></p></div></section>` +
      `<div class="dialog-actions"><button id="familiar-short-cancel">Cancel</button><button id="familiar-boost-buy" class="event-boost-buy" aria-label="Buy the Event Booster for ${cost}">Buy · ${cost}</button></div></div>`;
    modal.showModal();
    el("familiar-short-cancel").onclick = () => modal.close();
    el("familiar-boost-buy").onclick = () => this.buyBoost("familiar-boost-message", () => modal.close());
  }
}
