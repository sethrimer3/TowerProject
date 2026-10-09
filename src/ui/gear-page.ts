import { GOLD_SHOP, type GoldItemId } from "../config.ts";
import { loadout, provisionBulk, provisionOpen, provisionText, type Stat } from "../loadout.ts";
import { keyCount, whole } from "../whole.ts";
import { unlockFloor } from "../goals.ts";
import type { AppContext } from "./app.ts";
import { helpButton } from "./dialogs.ts";
import { el, itemSprite, uiSprite } from "./dom.ts";
import { devAmount } from "./hud.ts";
import { buyQuantityHtml, readQuantity } from "./buy-quantity-select.ts";
import { EquipmentPanel } from "./equipment-panel.ts";

/** Each provision's picture. */
const PROVISION_SPRITES = { heal: "potion_flat", guard: "upgrade_defense", edge: "upgrade_attack", yellowKey: "key_yellow" } as const satisfies Record<GoldItemId, string>;
/** Short names for a provision's stats, in the total its owned copies give. */
const TOTAL_WORDS: Record<Stat, string> = { attack: "ATK", defense: "DEF", maxHp: "MAX HP", shroud: "SHROUD", regen: "REGEN", yellow: "YELLOW KEYS", blue: "BLUE KEYS", red: "RED KEYS", undos: "UNDOS" };
/** Pictures for the starting stats over the provisions; the rest go by their short name. */
const STAT_SPRITES: Partial<Record<Stat, string>> = {
  maxHp: uiSprite("health"), attack: itemSprite("upgrade_attack"), defense: itemSprite("upgrade_defense"),
  yellow: itemSprite("key_yellow"), blue: itemSprite("key_blue"), red: itemSprite("key_red"),
};
/** The order the starting stats show in. */
const STAT_ORDER: Stat[] = ["maxHp", "attack", "defense", "shroud", "regen", "yellow", "blue", "red", "undos"];
type GearTab = "provisions" | "equipment";
const TAB_NAMES: Record<GearTab, string> = { provisions: "Provisions", equipment: "Equipment" };

/** The Gear page: provisions (the Gear skill) and Equipment (opened by
 * Tower I's floor 60 Goal). */
export class GearPage {
  private tab: GearTab = "provisions";
  /** The provision just bought, whose icon glows on the next render. */
  private bought: GoldItemId | null = null;
  private equipment: EquipmentPanel;

  constructor(private ctx: AppContext) {
    this.equipment = new EquipmentPanel(ctx);
  }

  /** Which tabs can be opened now. */
  private open(tab: GearTab) {
    const save = this.ctx.game.save;
    return tab === "equipment" ? save.equipment.unlocked : !!save.upgrades.gear;
  }

  /** Opens on the Equipment screen (the forest's Blacksmith, or Equipment
   * newly open), on the loadout of the mode the board shows. */
  openEquipment() {
    this.tab = "equipment";
    this.equipment.opened();
  }

  render() {
    if (!this.open(this.tab)) this.tab = this.open("equipment") ? "equipment" : "provisions";
    const save = this.ctx.game.save;
    if (this.tab === "equipment") save.equipment.seen = true;
    const body = this.tab === "equipment" ? this.equipment.html() : this.provisionsHtml();
    const tabs = (["provisions", "equipment"] as const).filter((t) => t === "equipment" || save.upgrades.gear);
    const lockHint = (t: GearTab) => t === "equipment" ? `Claim Tower I's floor ${unlockFloor("equipment")} Goal to open Equipment` : "Locked";
    const intro = this.tab === "equipment"
      ? `<h2>Equipment${helpButton("How Equipment works", "equip-help")}</h2>`
      : `<h2>Traveler’s gear<button class="tree-help" id="gear-help" aria-label="About provisions" title="About provisions">?</button></h2>`;
    el("gear").innerHTML = `<div class="page-title"><small>YOUR COMPANIONS IN THE DARK</small>${intro}</div>
    <div class="tree-tabs gear-tabs" role="group" aria-label="Gear tabs">
      ${tabs.map((t) => `<button data-geartab="${t}" aria-pressed="${this.tab === t}" ${this.open(t) ? "" : `disabled title="${lockHint(t)}"`}>${TAB_NAMES[t]}</button>`).join("")}
    </div>
    ${body}`;
    this.bind();
    if (this.tab === "equipment") {
      this.equipment.bind();
      el("equip-help").onclick = () => this.equipment.showHelp();
    } else el("gear-help").onclick = () => this.showHelp();
  }

  /** The Provisions screen's help, behind its heading's ? button. */
  private showHelp() {
    const modal = this.ctx.modal;
    modal.innerHTML = `<small>GEAR</small><h2>Provisions</h2><p>Provisions are bought with Gold and kept for good: each one you own goes with you into every run.</p><p class="hint">Each one bought makes the next of its kind cost more.</p><div class="dialog-actions"><button id="gear-help-ok">Got it</button></div>`;
    modal.showModal();
    el("gear-help-ok").onclick = () => modal.close();
  }

  /** Click handlers by data attribute; each gets that attribute's value. */
  private bind() {
    const { game } = this.ctx;
    const handlers: Record<string, (value: string) => void> = {
      geartab: (v) => {
        if (v === "equipment" && this.tab !== "equipment") this.equipment.opened();
        this.tab = v as GearTab;
        this.rerender();
      },
      gold: (v) => { if (game.gear.buyProvision(v as GoldItemId, game.buyQuantityFor("provisions"))) this.bought = v as GoldItemId; this.changed(); },
    };
    // Buy Quantity, kept for this page alone.
    const quantity = document.querySelector<HTMLSelectElement>("#gear [data-buy-quantity]");
    if (quantity) quantity.onchange = () => {
      game.setBuyQuantity(readQuantity(quantity.value), "provisions");
      this.changed();
    };
    for (const [key, handle] of Object.entries(handlers)) {
      const attr = key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
      document.querySelectorAll<HTMLButtonElement>(`#gear [data-${attr}]`).forEach(b => b.onclick = () => handle(b.dataset[key]!));
    }
  }

  private rerender() {
    this.ctx.renderPage();
  }
  /** After a change that alters the player's stats or items in the HUD. */
  private changed() {
    this.ctx.save();
    this.ctx.renderPage();
    this.ctx.update();
  }

  /** The hero's starting stats that the provisions on sale raise, as a
   * run in the board's mode starts with them; a stat just raised glows. */
  private startingStatsHtml(open: (typeof GOLD_SHOP)[number][], bought: GoldItemId | null) {
    const game = this.ctx.game, l = loadout(game.save, game.mode);
    const value: Record<Stat, number> = {
      attack: l.attack, defense: l.defense, maxHp: l.maxHp, shroud: l.shroud, regen: l.regen,
      yellow: l.keys.yellow + l.startKeys.yellow, blue: l.keys.blue + l.startKeys.blue, red: l.keys.red, undos: l.undoCapacity,
    };
    const raised = new Set(Object.keys(GOLD_SHOP.find((item) => item.id === bought)?.grants ?? {}));
    const stats = STAT_ORDER.filter((stat) => open.some((item) => stat in item.grants));
    if (!stats.length) return "";
    const shown = (stat: Stat) => (stat === "yellow" || stat === "blue" || stat === "red" ? keyCount(value[stat]) : whole(value[stat]));
    return `<div class="starting-stats"><small>STARTING STATS</small><div class="starting-stat-row">${stats.map((stat) =>
      `<span class="starting-stat${raised.has(stat) ? " raised" : ""}" title="${TOTAL_WORDS[stat]}">${STAT_SPRITES[stat] ?? `<i>${TOTAL_WORDS[stat]}</i>`}<b>${shown(stat)}</b></span>`).join("")}</div></div>`;
  }

  private provisionsHtml(): string {
    const game = this.ctx.game;
    const provisionSprite = (id: GoldItemId) => itemSprite(PROVISION_SPRITES[id]);
    const bought = this.bought, q = game.buyQuantityFor("provisions");
    this.bought = null;
    const open = GOLD_SHOP.filter((item) => provisionOpen(game.save, item.id));
    // What all the copies owned add, for provisions giving more than one.
    const total = (item: (typeof GOLD_SHOP)[number], owned: number) =>
      (Object.entries(item.grants) as [Stat, number][]).filter(([, n]) => n > 1).map(([stat, n]) => ` · +${n * owned} ${TOTAL_WORDS[stat]}`).join("");
    return `<div class="provision-head"><div class="purse-big" title="Gold">${uiSprite("gold")}<b>${devAmount(game, game.save.gold)}</b></div>${this.startingStatsHtml(open, bought)}${buyQuantityHtml(game.buyQuantities, q)}</div>${open.map((item) => {
      const owned = game.save.provisions[item.id], bulk = provisionBulk(game.save, item.id, q, game.free ? Infinity : game.save.gold), price = whole(bulk.cost);
      return `<article class="card"><div class="item-icon${item.id === bought ? " bought" : ""}">${provisionSprite(item.id)}</div><div><small>${owned ? `OWNED × ${owned}${total(item, owned)}` : "NOT YET OWNED"}</small><h3>${item.name}</h3><p>${provisionText(item.id)}</p></div><button data-gold="${item.id}" ${!bulk.affordable && !game.free ? "disabled" : ""}>Buy · ${uiSprite("gold", "stat-sprite")} ${price}${q !== 1 ? `<small class="buy-count">x${bulk.count}</small>` : ""}</button></article>`;
    }).join("")}`;
  }
}
