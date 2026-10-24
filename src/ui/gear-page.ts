import { GOLD_SHOP, type GoldItemId } from "../config.ts";
import { provisionOpen, provisionPrice, provisionText } from "../progression/loadout.ts";
import { whole } from "../whole.ts";
import { unlockAt } from "../goals.ts";
import { tierNumeral } from "../tiers.ts";
import type { AppContext } from "./app.ts";
import { helpButton } from "./dialogs.ts";
import { bombIcon, el, itemSprite, uiSprite } from "./dom.ts";
import { priceAmount } from "./hud.ts";
import { EquipmentPanel } from "./equipment-panel.ts";

/** Each provision's picture. */
const PROVISION_SPRITES = { heal: "potion_flat", guard: "upgrade_defense", edge: "upgrade_attack", yellowKey: "key_yellow" } as const satisfies Record<Exclude<GoldItemId, "bomb">, string>;
type GearTab = "provisions" | "equipment";
const TAB_NAMES: Record<GearTab, string> = { provisions: "Provisions", equipment: "Equipment" };

/** The Gear page: provisions (the Gear skill) and Equipment (opened by
 * Tower II's floor 60 Goal). */
export class GearPage {
  private tab: GearTab = "provisions";
  /** The provision just bought, whose icon glows and count bounces on the next render. */
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
    if (this.tab === "equipment") this.ctx.game.notices.shown("equipment");
    const body = this.tab === "equipment" ? this.equipment.html() : this.provisionsHtml();
    const tabs = (["provisions", "equipment"] as const).filter((t) => t === "equipment" || save.upgrades.gear);
    const lockHint = (t: GearTab) => t === "equipment" ? `Claim Tower ${tierNumeral(unlockAt("equipment").tower)}'s floor ${unlockAt("equipment").floor} Goal to open Equipment` : "Locked";
    el("gear").innerHTML = `<div class="tree-tabs page-tabs gear-tabs" role="group" aria-label="Gear tabs">
      ${tabs.map((t) => `<button data-geartab="${t}" aria-pressed="${this.tab === t}" ${this.open(t) ? "" : `disabled title="${lockHint(t)}"`}>${TAB_NAMES[t]}</button>`).join("")}
    </div>
    ${body}`;
    this.bind();
    if (this.tab === "equipment") {
      this.equipment.bind();
      // Only the list's loadout carries Equipment's ? button.
      const help = document.getElementById("equip-help");
      if (help) help.onclick = () => this.equipment.showHelp();
    } else el("gear-help").onclick = () => this.showHelp();
  }

  /** The Provisions screen's help, behind the ? button at its top. */
  private showHelp() {
    const modal = this.ctx.modal;
    modal.innerHTML = `<small>GEAR</small><h2>Provisions</h2><p>Provisions are bought with Gold and kept for good: each one you own is one use in every run, pressed from its button beside the board when you need it. A Gold Key uses itself.</p><p>Undo never gives a use back, and a boost keeps counting down through it.</p><p class="hint">Each one bought makes the next of its kind cost a hundred times more.</p><div class="dialog-actions"><button id="gear-help-ok">Got it</button></div>`;
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
    const provisionSprite = (id: GoldItemId) => (id === "bomb" ? bombIcon("ui-sprite") : itemSprite(PROVISION_SPRITES[id]));
    const bought = this.bought;
    this.bought = null;
    const open = GOLD_SHOP.filter((item) => provisionOpen(game.save, item.id));
    return `<div class="provision-head">${helpButton("About provisions", "gear-help")}<p class="hint">Each one owned is one use in every run.</p></div>${open.map((item) => {
      const owned = game.save.provisions[item.id], price = provisionPrice(game.save, item.id), just = item.id === bought ? " bought" : "";
      // The count owned, in a circle at the icon's foot.
      const count = owned ? `<b class="owned-count${just}" title="${whole(owned)} owned" aria-label="${whole(owned)} owned">${whole(owned)}</b>` : "";
      return `<article class="card provision"><div class="item-icon${just}">${provisionSprite(item.id)}${count}</div><div class="provision-text"><h3>${item.name}</h3><p>${provisionText(item.id)}</p></div><button data-gold="${item.id}" ${price > game.save.gold && !game.free ? "disabled" : ""}>Buy · ${uiSprite("gold", "stat-sprite")} ${priceAmount(price)}</button></article>`;
    }).join("")}`;
  }
}
