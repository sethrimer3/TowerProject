import { GOLD_SHOP, type GoldItemId } from "../config.ts";
import { provisionOpen, provisionPrice, provisionText, type Stat } from "../loadout.ts";
import { unlockFloor } from "../goals.ts";
import type { AppContext } from "./app.ts";
import { el, itemSprite, uiSprite } from "./dom.ts";
import { devAmount } from "./hud.ts";
import { EquipmentPanel } from "./equipment-panel.ts";

/** Each provision's picture. */
const PROVISION_SPRITES = { heal: "potion_flat", guard: "upgrade_defense", edge: "upgrade_attack", yellowKey: "key_yellow" } as const satisfies Record<GoldItemId, string>;
/** Short names for a provision's stats, in the total its owned copies give. */
const TOTAL_WORDS: Record<Stat, string> = { attack: "ATK", defense: "DEF", maxHp: "MAX HP", shroud: "SHROUD", regen: "REGEN", yellow: "YELLOW KEYS", blue: "BLUE KEYS", red: "RED KEYS", undos: "UNDOS" };
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
      ? `<h2>Equipment</h2><p>Each hero wears one piece of each kind: tap a piece to equip or level it, and assemble three alike into a rarer one.</p>`
      : `<h2>Traveler’s gear<button class="tree-help" id="gear-help" aria-label="About provisions" title="About provisions">?</button></h2>`;
    el("gear").innerHTML = `<div class="page-title"><small>YOUR COMPANIONS IN THE DARK</small>${intro}</div>
    <div class="tree-tabs gear-tabs" role="group" aria-label="Gear tabs">
      ${tabs.map((t) => `<button data-geartab="${t}" aria-pressed="${this.tab === t}" ${this.open(t) ? "" : `disabled title="${lockHint(t)}"`}>${TAB_NAMES[t]}</button>`).join("")}
    </div>
    ${body}`;
    this.bind();
    if (this.tab === "equipment") this.equipment.bind();
    else el("gear-help").onclick = () => this.showHelp();
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
      gold: (v) => { if (game.gear.buyProvision(v as GoldItemId)) this.bought = v as GoldItemId; this.changed(); },
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

  private provisionsHtml(): string {
    const game = this.ctx.game;
    const provisionSprite = (id: GoldItemId) => itemSprite(PROVISION_SPRITES[id]);
    const bought = this.bought;
    this.bought = null;
    // What all the copies owned add, for provisions giving more than one.
    const total = (item: (typeof GOLD_SHOP)[number], owned: number) =>
      (Object.entries(item.grants) as [Stat, number][]).filter(([, n]) => n > 1).map(([stat, n]) => ` · +${n * owned} ${TOTAL_WORDS[stat]}`).join("");
    return `<div class="provision-head"><div class="purse-big" title="Gold">${uiSprite("gold")}<b>${devAmount(game, game.save.gold)}</b></div></div>${GOLD_SHOP.filter((item) => provisionOpen(game.save, item.id)).map((item) => {
      const owned = game.save.provisions[item.id], price = provisionPrice(game.save, item.id);
      return `<article class="card"><div class="item-icon${item.id === bought ? " bought" : ""}">${provisionSprite(item.id)}</div><div><small>${owned ? `OWNED × ${owned}${total(item, owned)}` : "NOT YET OWNED"}</small><h3>${item.name}</h3><p>${provisionText(item.id)}</p></div><button data-gold="${item.id}" ${game.save.gold < price && !game.free ? "disabled" : ""}>Buy · ${uiSprite("gold", "stat-sprite")} ${price}</button></article>`;
    }).join("")}`;
  }
}
