import { GOLD_SHOP, type GoldItemId } from "../config.ts";
import { provisionOpen, provisionPrice, provisionText, type Stat } from "../loadout.ts";
import { CONSUMABLES, canCraftConsumable, consumableText, type ConsumableId } from "../crafting.ts";
import { EQUIPMENT_FLOOR } from "../equipment/balance.ts";
import { materialDef, type MaterialStack } from "../materials.ts";
import type { AppContext } from "./app.ts";
import { el, itemSprite, uiSprite } from "./dom.ts";
import { devAmount } from "./hud.ts";
import { EquipmentPanel } from "./equipment-panel.ts";

/** Each provision's picture. */
const PROVISION_SPRITES = { heal: "potion_flat", guard: "upgrade_defense", edge: "upgrade_attack", yellowKey: "key_yellow" } as const satisfies Record<GoldItemId, string>;
/** Short names for a provision's stats, in the total its owned copies give. */
const TOTAL_WORDS: Record<Stat, string> = { attack: "ATK", defense: "DEF", maxHp: "MAX HP", shroud: "SHROUD", regen: "REGEN", yellow: "YELLOW KEYS", blue: "BLUE KEYS", red: "RED KEYS", undos: "UNDOS" };
type GearTab = "provisions" | "equipment" | "crafting";
const TAB_NAMES: Record<GearTab, string> = { provisions: "Provisions", equipment: "Equipment", crafting: "Crafting" };
const stackList = (stacks: MaterialStack[], sep: string) => stacks.map(r => `${r.quantity} ${materialDef(r.id).name}`).join(sep);

/** The Gear page: provisions (the Gear skill), Equipment (open from the
 * first floor 60) and crafting (closed for now). */
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
    return tab === "provisions" ? !!save.upgrades.gear : tab === "equipment" ? save.equipment.unlocked : false;
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
    const body = this.tab === "equipment" ? this.equipment.html() : this.tab === "crafting" ? this.craftingHtml() : this.provisionsHtml();
    const tabs = (["provisions", "equipment", "crafting"] as const).filter((t) => t !== "provisions" || save.upgrades.gear);
    const lockHint = (t: GearTab) => t === "equipment" ? `Reach floor ${EQUIPMENT_FLOOR} to open Equipment` : "Locked";
    const intro = this.tab === "equipment"
      ? `<h2>Equipment</h2><p>Each hero wears one piece of each kind; level them with Gold and materials, merge three alike into a rarer one.</p>`
      : `<h2>Traveler’s gear</h2><p>Provisions bought with Gold go with you into every run.</p>`;
    el("gear").innerHTML = `<div class="page-title"><small>YOUR COMPANIONS IN THE DARK</small>${intro}</div>
    <div class="tree-tabs gear-tabs" role="group" aria-label="Gear tabs">
      ${tabs.map((t) => `<button data-geartab="${t}" aria-pressed="${this.tab === t}" ${this.open(t) ? "" : `disabled title="${lockHint(t)}"`}>${TAB_NAMES[t]}</button>`).join("")}
    </div>
    ${body}`;
    this.bind();
    if (this.tab === "equipment") this.equipment.bind();
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
      gold: (v) => { if (game.gear.buyProvision(v as GoldItemId)) this.bought = v as GoldItemId; this.changed(); },
      craftConsumable: (v) => { game.gear.craftConsumable(v as ConsumableId); this.saved(); },
      useConsumable: (v) => { game.useConsumable(v as ConsumableId); this.changed(); },
    };
    for (const [key, handle] of Object.entries(handlers)) {
      const attr = key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
      document.querySelectorAll<HTMLButtonElement>(`#gear [data-${attr}]`).forEach(b => b.onclick = () => handle(b.dataset[key]!));
    }
  }

  private rerender() {
    this.ctx.renderPage();
  }
  /** After a change to the save that the HUD doesn't show. */
  private saved() {
    this.ctx.save();
    this.ctx.renderPage();
  }
  /** After a change that alters the player's stats or items in the HUD. */
  private changed() {
    this.ctx.save();
    this.ctx.renderPage();
    this.ctx.update();
  }

  /** Crafting: consumables from monster materials (the tab is closed for now). */
  private craftingHtml(): string {
    const game = this.ctx.game;
    return `<h3>Consumables</h3>${CONSUMABLES.map(c => {
      const owned = game.save.consumables[c.id] ?? 0;
      return `<article class="card"><div class="item-icon">${itemSprite("potion_flat")}</div><div><small>${owned ? `OWNED × ${owned}` : "CONSUMABLE"} · ${stackList(c.recipe, " + ")}</small><h3>${c.name}</h3><p>${consumableText(c, game.stepRules)}</p></div><div class="card-actions"><button data-craft-consumable="${c.id}" ${canCraftConsumable(game.save, c.id) ? "" : "disabled"}>Craft</button>${owned ? `<button data-use-consumable="${c.id}" ${game.run.outside || game.fallen ? "disabled" : ""}>Use</button>` : ""}</div></article>`;
    }).join("")}`;
  }

  private provisionsHtml(): string {
    const game = this.ctx.game;
    const provisionSprite = (id: GoldItemId) => itemSprite(PROVISION_SPRITES[id]);
    const bought = this.bought;
    this.bought = null;
    // What all the copies owned add, for provisions giving more than one.
    const total = (item: (typeof GOLD_SHOP)[number], owned: number) =>
      (Object.entries(item.grants) as [Stat, number][]).filter(([, n]) => n > 1).map(([stat, n]) => ` · +${n * owned} ${TOTAL_WORDS[stat]}`).join("");
    return `<div class="provision-head"><div class="purse-big" title="Gold">${uiSprite("gold")}<b>${devAmount(game, game.save.gold)}</b></div><p class="hint">Spend Gold on provisions: each one you buy is carried into every run from now on, and the next costs more.</p></div>${GOLD_SHOP.filter((item) => provisionOpen(game.save, item.id)).map((item) => {
      const owned = game.save.provisions[item.id], price = provisionPrice(game.save, item.id);
      return `<article class="card"><div class="item-icon${item.id === bought ? " bought" : ""}">${provisionSprite(item.id)}</div><div><small>${owned ? `OWNED × ${owned}${total(item, owned)}` : "NOT YET OWNED"}</small><h3>${item.name}</h3><p>${provisionText(item.id)}</p></div><button data-gold="${item.id}" ${game.save.gold < price && !game.free ? "disabled" : ""}>Buy · ${uiSprite("gold", "stat-sprite")} ${price}</button></article>`;
    }).join("")}`;
  }
}
