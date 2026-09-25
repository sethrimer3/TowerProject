import { GOLD_SHOP, type GoldItemId } from "../config.ts";
import { canCraft, getSalvageReturns, isEquipped, CONSUMABLES, canCraftConsumable, type ConsumableId } from "../crafting.ts";
import {
  EQUIPMENT_SLOTS,
  RECIPES,
  SLOT_NAMES,
  calculateEquipmentStats,
  enhancementTotals,
  ENHANCEMENT_CAPS,
  equipmentName,
  type CraftedEquipment,
  type EquipmentSlot,
} from "../equipment.ts";
import { materialDef, METALS, GEMS, RARE_ENHANCEMENTS, type MaterialId, type MaterialStack, type MetalId } from "../materials.ts";
import { metalBarSprite, monsterPartSprite } from "../material-sprites.ts";
import type { AppContext } from "./app.ts";
import { el, itemSprite, SLOT_ICONS, uiSprite } from "./dom.ts";
import { devAmount } from "./hud.ts";

type GearTab = "equipped" | "inventory" | "crafting" | "provisions";
type Bonuses = { flatAttack: number; flatDefense: number; flatMaxHp: number; percentAttack: number; percentDefense: number; percentMaxHp: number };

function statBadges(s: Bonuses): string {
  const parts: string[] = [];
  if (s.flatAttack) parts.push(`${itemSprite("upgrade_attack", "stat-sprite")} +${s.flatAttack}`);
  if (s.flatDefense) parts.push(`${itemSprite("upgrade_defense", "stat-sprite")} +${s.flatDefense}`);
  if (s.flatMaxHp) parts.push(`${uiSprite("health", "stat-sprite")} +${s.flatMaxHp}`);
  if (s.percentAttack) parts.push(`${itemSprite("upgrade_attack", "stat-sprite")} +${(s.percentAttack * 100).toFixed(1)}%`);
  if (s.percentDefense) parts.push(`${itemSprite("upgrade_defense", "stat-sprite")} +${(s.percentDefense * 100).toFixed(1)}%`);
  if (s.percentMaxHp) parts.push(`${uiSprite("health", "stat-sprite")} +${(s.percentMaxHp * 100).toFixed(1)}%`);
  return parts.length ? parts.join(" · ") : "No bonuses";
}
const metalName = (item: CraftedEquipment) => METALS.find(m => m.id === item.metal)!.name.toUpperCase();
const stackList = (stacks: MaterialStack[], sep: string) => stacks.map(r => `${r.quantity} ${materialDef(r.id).name}`).join(sep);

/** The Gear page: equipped slots, the inventory, crafting, and provisions. */
export class GearPage {
  private tab: GearTab = "equipped";
  private filter: EquipmentSlot | "all" = "all";
  private craftSlot: EquipmentSlot = "weapon";
  private craftMetal: MetalId = "iron";
  private enhancements: MaterialStack[] = [];

  constructor(private ctx: AppContext) {}

  render() {
    const body =
      this.tab === "equipped" ? this.equippedHtml()
      : this.tab === "inventory" ? this.inventoryHtml()
      : this.tab === "crafting" ? this.craftingHtml()
      : this.provisionsHtml();
    el("gear").innerHTML = `<div class="page-title"><small>YOUR COMPANIONS IN THE DARK</small><h2>Traveler’s gear</h2><p>Craft equipment from persistent materials collected in Tower and Delve, then equip up to nine pieces at once.</p></div>
    <div class="tree-tabs gear-tabs" role="group" aria-label="Gear tabs">
      <button data-geartab="equipped" aria-pressed="${this.tab === "equipped"}">Equipped</button>
      <button data-geartab="inventory" aria-pressed="${this.tab === "inventory"}">Inventory</button>
      <button data-geartab="crafting" aria-pressed="${this.tab === "crafting"}">Crafting</button>
      <button data-geartab="provisions" aria-pressed="${this.tab === "provisions"}">Provisions</button>
    </div>
    ${body}`;
    this.bind();
  }

  /** Click handlers by data attribute; each gets that attribute's value. */
  private bind() {
    const { game } = this.ctx;
    const item = (id: string) => game.save.equipmentInventory.find(e => e.id === id);
    const handlers: Record<string, (value: string) => void> = {
      geartab: (v) => { this.tab = v as GearTab; this.rerender(); },
      gold: (v) => { game.buyGold(v as GoldItemId); this.saved(); },
      slot: (v) => this.openSlot(v as EquipmentSlot),
      filter: (v) => { this.filter = v as EquipmentSlot | "all"; this.rerender(); },
      inspect: (v) => { const it = item(v); if (it) this.showItemActions(it, isEquipped(game.save, it.id)); },
      equip: (v) => { game.equipItem(v); this.changed(); },
      unequip: (v) => { game.unequipSlot(v as EquipmentSlot); this.changed(); },
      salvage: (v) => { const it = item(v); if (it) this.confirmSalvage(it); },
      craftSlot: (v) => { this.craftSlot = v as EquipmentSlot; this.enhancements = []; this.rerender(); },
      craftMetal: (v) => { this.craftMetal = v as MetalId; this.rerender(); },
      enhPlus: (v) => this.adjustEnhancement(v as MaterialId, 1),
      enhMinus: (v) => this.adjustEnhancement(v as MaterialId, -1),
      craftConsumable: (v) => { game.craftConsumable(v as ConsumableId); this.saved(); },
      useConsumable: (v) => { game.useConsumable(v as ConsumableId); this.changed(); },
    };
    for (const [key, handle] of Object.entries(handlers)) {
      const attr = key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
      document.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`).forEach(b => b.onclick = () => handle(b.dataset[key]!));
    }
    const craftBtn = document.querySelector<HTMLButtonElement>("#craft-btn");
    if (craftBtn) craftBtn.onclick = () => {
      if (game.craftEquipment(this.craftSlot, this.craftMetal, this.enhancements)) this.enhancements = [];
      this.saved();
    };
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

  /** An equipped slot opens its item; an empty one lists items for it. */
  private openSlot(slot: EquipmentSlot) {
    const id = this.ctx.game.save.equipped[slot];
    if (id) {
      const item = this.ctx.game.save.equipmentInventory.find(e => e.id === id);
      if (item) this.showItemActions(item, true);
      return;
    }
    this.filter = slot;
    this.tab = "inventory";
    this.rerender();
  }

  private adjustEnhancement(id: MaterialId, delta: 1 | -1) {
    const existing = this.enhancements.find(s => s.id === id);
    if (delta > 0) {
      if (existing) existing.quantity++;
      else this.enhancements.push({ id, quantity: 1 });
    } else if (existing) {
      existing.quantity--;
      if (existing.quantity <= 0) this.enhancements = this.enhancements.filter(s => s.id !== id);
    }
    this.rerender();
  }

  private confirmSalvage(item: CraftedEquipment) {
    const returns = getSalvageReturns(item);
    this.ctx.confirm(
      "Salvage this item?",
      returns.length ? `Returns ${stackList(returns, ", ")}. This cannot be undone.` : "Returns nothing. This cannot be undone.",
      "Salvage",
      () => { this.ctx.game.salvageEquipment(item.id); this.changed(); },
    );
  }

  private showItemActions(item: CraftedEquipment, equipped: boolean) {
    const { game, modal } = this.ctx;
    const enhancements = item.enhancements.length ? "Enhanced with " + stackList(item.enhancements, ", ") + "." : "No enhancements.";
    const actions = equipped ? `<button id="item-unequip">Unequip</button>` : `<button id="item-equip">Equip</button><button id="item-salvage" class="danger">Salvage</button>`;
    modal.innerHTML = `<small>${SLOT_NAMES[item.slot].toUpperCase()} · ${metalName(item)}</small><h2>${item.name}</h2><p>${statBadges(item)}</p><p class="hint">${enhancements}</p><div class="dialog-actions">${actions}<button id="item-close">Close</button></div>`;
    modal.showModal();
    el("item-close").onclick = () => modal.close();
    const button = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`);
    const equipBtn = button("item-equip");
    if (equipBtn) equipBtn.onclick = () => { game.equipItem(item.id); modal.close(); this.changed(); };
    const unequipBtn = button("item-unequip");
    if (unequipBtn) unequipBtn.onclick = () => { game.unequipSlot(item.slot); modal.close(); this.changed(); };
    const salvageBtn = button("item-salvage");
    if (salvageBtn) salvageBtn.onclick = () => this.confirmSalvage(item);
  }

  private equippedHtml(): string {
    const save = this.ctx.game.save;
    return `<div class="slot-grid">${EQUIPMENT_SLOTS.map(slot => {
      const id = save.equipped[slot];
      const item = id ? save.equipmentInventory.find(e => e.id === id) : undefined;
      return `<button class="slot-card ${item ? "filled" : "empty"}" data-slot="${slot}"><div class="item-icon">${SLOT_ICONS[slot]}</div><div><small>${SLOT_NAMES[slot].toUpperCase()}</small><h3>${item ? item.name : "Empty"}</h3><p>${item ? statBadges(item) : "Tap to equip"}</p></div></button>`;
    }).join("")}</div>`;
  }

  private inventoryHtml(): string {
    const save = this.ctx.game.save;
    const filters = `<div class="tree-tabs slot-filter"><button data-filter="all" aria-pressed="${this.filter === "all"}">All</button>${EQUIPMENT_SLOTS.map(s => `<button data-filter="${s}" aria-pressed="${this.filter === s}">${SLOT_ICONS[s]}</button>`).join("")}</div>`;
    const items = save.equipmentInventory.filter(e => this.filter === "all" || e.slot === this.filter);
    const card = (item: CraftedEquipment) => {
      const equipped = isEquipped(save, item.id);
      const actions = equipped ? `<button data-unequip="${item.slot}">Unequip</button>` : `<button data-equip="${item.id}">Equip</button><button data-salvage="${item.id}" class="danger">Salvage</button>`;
      return `<article class="card"><div class="item-icon">${SLOT_ICONS[item.slot]}</div><div><small>${SLOT_NAMES[item.slot].toUpperCase()} · ${metalName(item)}${equipped ? " · EQUIPPED" : ""}</small><h3>${item.name}</h3><p>${statBadges(item)}</p></div><div class="card-actions"><button data-inspect="${item.id}">Inspect</button>${actions}</div></article>`;
    };
    const cards = items.length
      ? items.map(card).join("")
      : `<p class="hint">No crafted equipment yet. Visit Crafting to build your first piece.</p>`;
    return filters + cards;
  }

  /** Metals and monster parts show ∞ in dev mode, like currencies. */
  private materialAmount(id: MaterialId, value: number) {
    const category = materialDef(id).category;
    return this.ctx.game.save.settings.devMode && (category === "metal" || category.startsWith("monster-")) ? "∞" : String(value);
  }

  private craftingHtml(): string {
    const game = this.ctx.game, slot = this.craftSlot, metal = this.craftMetal, chosen = this.enhancements;
    const recipe = RECIPES[slot];
    const metalDef = METALS.find(m => m.id === metal)!;
    const owned = (id: MaterialId) => game.save.materials[id] ?? 0;
    const totals = enhancementTotals(chosen);
    const stats = calculateEquipmentStats(slot, metal, chosen);
    const ok = canCraft(game.save, slot, metal, chosen);
    const slotButtons = `<div class="tree-tabs slot-filter">${EQUIPMENT_SLOTS.map(s => `<button data-craft-slot="${s}" aria-pressed="${slot === s}">${SLOT_ICONS[s]} ${SLOT_NAMES[s]}</button>`).join("")}</div>`;
    const metalButtons = `<div class="tree-tabs slot-filter">${METALS.map(m => `<button data-craft-metal="${m.id}" aria-pressed="${metal === m.id}">${metalBarSprite(m.id)} ${m.name}</button>`).join("")}</div>`;
    const barsOwned = owned(metalDef.materialId), commonOwned = owned(recipe.commonMaterial);
    const recipeLine = `<p class="hint">Recipe: ${metalBarSprite(metalDef.id, "stat-sprite")} <b class="${barsOwned >= recipe.bars ? "safe" : "danger"}">${recipe.bars} ${materialDef(metalDef.materialId).name}</b> (${this.materialAmount(metalDef.materialId, barsOwned)} owned) + ${monsterPartSprite(recipe.commonMaterial, "stat-sprite")} <b class="${commonOwned >= recipe.commonAmount ? "safe" : "danger"}">${recipe.commonAmount} ${materialDef(recipe.commonMaterial).name}</b> (${this.materialAmount(recipe.commonMaterial, commonOwned)} owned)</p>`;
    const stepper = (id: MaterialId, label: string, cap: number, usedInCategory: number) => {
      const qty = chosen.find(s => s.id === id)?.quantity ?? 0;
      const atCap = usedInCategory >= cap && qty === 0;
      const atOwned = qty >= owned(id);
      return `<div class="stepper"><span>${monsterPartSprite(id, "stat-sprite")}${materialDef(id).name} <small>${label} · ${this.materialAmount(id, owned(id))} owned</small></span><div class="stepper-controls"><button data-enh-minus="${id}" ${qty <= 0 ? "disabled" : ""}>−</button><b>${qty}</b><button data-enh-plus="${id}" ${atCap || atOwned ? "disabled" : ""}>+</button></div></div>`;
    };
    const gemRows = GEMS.map(g => stepper(g.id, `+${(g.enhancement.percent * 100).toFixed(1)}% ${g.enhancement.stat}/ea`, ENHANCEMENT_CAPS.gems, totals.gems)).join("");
    const rareRows = (Object.keys(RARE_ENHANCEMENTS) as MaterialId[]).map(id => {
      const def = RARE_ENHANCEMENTS[id]!;
      const label = [def.flatAttack ? `+${def.flatAttack} ATK` : "", def.flatDefense ? `+${def.flatDefense} DEF` : "", def.flatMaxHp ? `+${def.flatMaxHp} HP` : ""].filter(Boolean).join(" ");
      return stepper(id, `${label}/ea`, ENHANCEMENT_CAPS.rareParts, totals.rareParts);
    }).join("");
    const preview = `<p class="hint">Preview — ${equipmentName(slot, metal)}: ${statBadges(stats)}</p>`;
    const craftBtn = `<button class="wide" id="craft-btn" ${ok ? "" : "disabled"}>Craft ${equipmentName(slot, metal)}</button>`;
    const consumableRows = CONSUMABLES.map(c => {
      const ownedC = game.save.consumables[c.id] ?? 0;
      const craftableC = canCraftConsumable(game.save, c.id);
      return `<article class="card"><div class="item-icon">${itemSprite("potion_flat")}</div><div><small>${ownedC ? `OWNED × ${ownedC}` : "CONSUMABLE"} · ${stackList(c.recipe, " + ")}</small><h3>${c.name}</h3><p>${c.description}</p></div><div class="card-actions"><button data-craft-consumable="${c.id}" ${craftableC ? "" : "disabled"}>Craft</button>${ownedC ? `<button data-use-consumable="${c.id}" ${game.run.outside || game.summary ? "disabled" : ""}>Use</button>` : ""}</div></article>`;
    }).join("");
    return `<h3>1. Choose a slot</h3>${slotButtons}<h3>2. Choose a metal</h3>${metalButtons}${recipeLine}<h3>3. Optional enhancements</h3><p class="hint">Up to ${ENHANCEMENT_CAPS.gems} gems and ${ENHANCEMENT_CAPS.rareParts} rare monster parts (${totals.gems}/${ENHANCEMENT_CAPS.gems} gems, ${totals.rareParts}/${ENHANCEMENT_CAPS.rareParts} rare parts selected).</p>${gemRows}${rareRows}${preview}${craftBtn}<h3>Consumables</h3>${consumableRows}`;
  }

  private provisionsHtml(): string {
    const game = this.ctx.game;
    const provisionSprite = (id: GoldItemId) => itemSprite(id === "heal" ? "potion_flat" : id === "edge" ? "upgrade_attack" : "upgrade_defense");
    return `<p class="hint">Spend Gold earned in the tower on provisions that apply next run. ${uiSprite("gold", "stat-sprite")} ${devAmount(game, game.save.gold)} Gold.</p>${GOLD_SHOP.map((item) => `<article class="card"><div class="item-icon">${provisionSprite(item.id)}</div><div><small>${game.save.provisions[item.id] ? `OWNED × ${game.save.provisions[item.id]}` : "APPLIES NEXT RUN"}</small><h3>${item.name}</h3><p>${item.description}</p></div><button data-gold="${item.id}" ${game.save.gold < item.cost ? "disabled" : ""}>Buy · ${uiSprite("gold", "stat-sprite")} ${item.cost}</button></article>`).join("")}`;
  }
}
