import { controlIcon } from "./control-icon.ts";
import type { Mode } from "../entities.ts";
import {
  CATEGORIES, CATEGORY_IDS, EQUIP_MATERIALS, EQUIP_MATERIAL_IDS, itemDef, materialsOf, hasMaterials, standardsOf, uniquesOf,
  type CategoryId, type EquipMaterialId,
} from "../equipment/catalog.ts";
import {
  CRAFT_MATERIAL, EFFECT_CANDIDATES, EQUIP_RARITIES, EQUIPMENT_CAPACITY, PITY, PULL_ALL_DISCOUNT, PULL_GEMS, PULL_RATES, pullGems, RARITY_TIERS, rarityRank, REFINE_CHOICE_EVERY, REFINE_GUARANTEE_EVERY,
  STARS, starPercent, type EquipRarity, type PullCount,
} from "../equipment/balance.ts";
import {
  autoMerges, availableCategories, categoryOpen, categoryOf, defaultFodder, findItem, fodderFits, isProtected, isUnique, levelCap, levelCost, maxLevel, mergeFodder, mergePlan,
  openSlotCount, salvageTotals, wornIn, type EffectChoice, type EffectSlot, type EquipItem, type MergePlan,
} from "../equipment/inventory.ts";
import { effectText, equipmentEffects, pieceEfficiency, pieceMain } from "../equipment/effects.ts";
import { FAMILIES, slotEffectDef, slotEffectName, slotValue } from "../equipment/slot-effects.ts";
import {
  choicesLeft, effectCap, improveCost, nextMilestone, refineCost, slotEffects, slotPlan, slotPool, type SlotRefusal,
} from "../equipment/slots.ts";
import type { AppContext } from "./app.ts";
import { askForGems, helpButton, showHelp } from "./dialogs.ts";
import { el, equipTicketIcon, gemIcon, riseFrom, uiSprite } from "./dom.ts";
import { currencyAmount, devAmount, priceAmount } from "./hud.ts";
import { ACTION_ICONS, categoryIcon, itemIcon, materialIcon } from "./equipment-icons.ts";
import { playSlagMerge } from "./slag-merge.ts";
import { drawTogglesOpen, pullRates } from "../equipment/acquire.ts";
import { relicAmount } from "../economy/relic-effects.ts";
import { isPower, POWER_TEXT, powerTier } from "../equipment/powers.ts";
import { isPowerKind } from "../equipment/catalog.ts";
import { kitIcon } from "../sprites/kit.ts";

/** The Equipment screen's views, chosen by the tabs along its bottom: the
 * list (the loadout over the inventory), Assemble (merging), Craft and Acquire
 * (Gem pulls). */
type View = "list" | "assemble" | "craft" | "pulls";
const VIEWS: { id: View; name: string }[] = [{ id: "list", name: "List" }, { id: "assemble", name: "Assemble" }, { id: "craft", name: "Craft" }, { id: "pulls", name: "Acquire" }];
type SortKey = "rarity" | "level" | "category" | "newest" | "name";
const SORTS: { id: SortKey; name: string }[] = [
  { id: "rarity", name: "Rarity" }, { id: "level", name: "Level" }, { id: "category", name: "Category" }, { id: "newest", name: "Newest" }, { id: "name", name: "Name" },
];
const MODE_NAMES: Record<Mode, string> = { tower: "Tower", delve: "Delve" };
/** Why a slot command was refused, for the player. */
const REFUSALS: Partial<Record<SlotRefusal, string>> = {
  gold: "Not enough Gold.", material: "Not enough material.", offered: "Choose a candidate or keep the current substat first.",
};
const idNumber = (item: EquipItem) => Number(item.id.slice(1));
const nameOf = (item: EquipItem) => itemDef(item.def)!.name;
/** "a Rare", "an Uncommon". */
const article = (word: string) => `${/^[AEIOU]/.test(word) ? "an" : "a"} ${word}`;
const rarityTag = (r: EquipRarity, stars = 0) => `<span class="rarity-tag rar-${r}">${RARITY_TIERS[r].name}${stars ? ` ★${stars}` : ""}</span>`;
/** "Ancestral ★2", "Epic". */
const rarityName = (item: Pick<EquipItem, "rarity" | "stars">) => `${RARITY_TIERS[item.rarity].name}${item.stars ? ` ★${item.stars}` : ""}`;
/** A piece's main effect (and a Chestplate's efficiency) in words, at its
 * own rarity and level, before any worn Chestplate's efficiency. */
function mainLines(item: EquipItem) {
  const main = pieceMain(item), eff = pieceEfficiency(item);
  return [...(main ? [effectText(main.kind, main.value)] : []), ...(eff ? [`+${String(Math.round(eff * 100) / 100)}% to the other worn pieces' main effects`] : [])];
}
const matAmount = (id: EquipMaterialId, n: number) => `${materialIcon(id)}<b>${currencyAmount(n)}</b>`;
/** The starting plus, each future corner between the two pieces it joins:
 * the Amulet (Shield and Helmet) top left, the Belt (Helmet and Sword) top
 * right, the Cape (Shield and Boots) bottom left, the Gloves (Sword and
 * Boots) bottom right. Corners stay empty until opened. */
const GRID: readonly CategoryId[] = ["amulet", "helmet", "belt", "shield", "chestplate", "weapon", "cape", "boots", "gloves"];
/** Sets what pressing the button `sel` finds does, if it is there. */
const onPress = (sel: string, fn: () => void) => { const b = document.querySelector<HTMLButtonElement>(sel); if (b) b.onclick = fn; };

/** The Equipment screen, inside the Gear page (and opened by the forest's
 * Blacksmith). Each view is drawn from the save; presses go through the
 * game's EquipmentDesk. */
export class EquipmentPanel {
  private view: View = "list";
  /** The loadout shown: the board's mode when the page opens. */
  private mode: Mode = "tower";
  private category: CategoryId | "all" = "all";
  private rarity: EquipRarity | "all" = "all";
  private sort: SortKey = "rarity";
  private selecting = false;
  /** Whether the Salvage section is open, kept across redraws. */
  private salvageOpen = false;
  private selected = new Set<string>();
  private pullCategory: CategoryId | "all" = "all";
  /** The piece being assembled into the next rarity, and the copies chosen
   * to use up. */
  private target: string | null = null;
  private copies: string[] = [];

  constructor(private ctx: AppContext) {}

  private get game() {
    return this.ctx.game;
  }
  private get e() {
    return this.ctx.game.save.equipment;
  }

  /** Opens on the list, with the loadout of the mode the board shows. */
  opened() {
    this.view = "list";
    this.mode = this.game.mode;
    this.selected.clear();
    this.selecting = false;
    this.target = null;
  }

  html() {
    const body = this.view === "list" ? this.listHtml() : this.view === "assemble" ? this.assembleHtml() : this.view === "craft" ? this.craftHtml() : this.pullsHtml();
    const ready = this.mergeable().length > 0;
    return `${this.materialsHtml()}<div class="eq-screen">${body}</div>
      <div class="eq-views" role="group" aria-label="Equipment views">${VIEWS.map((v) =>
        `<button data-eq-view="${v.id}" aria-pressed="${this.view === v.id}">${v.name}${v.id === "assemble" && ready ? `<span class="eq-new" title="A piece is ready to assemble">N</span>` : ""}${v.id === "pulls" && this.e.tickets ? `<span class="eq-new" title="Equipment Tickets to spend">${this.e.tickets}</span>` : ""}</button>`).join("")}</div>`;
  }

  /** The four material balances, and Gold, always in sight. */
  private materialsHtml() {
    const mats = EQUIP_MATERIAL_IDS.map((m) => `<span class="mat-balance" title="${EQUIP_MATERIALS[m].name}: ${EQUIP_MATERIALS[m].description}">${matAmount(m, this.e.materials[m])}</span>`).join("");
    return `<div class="equip-materials" id="equip-materials" aria-label="Upgrade materials"><span class="mat-balance" title="Gold">${uiSprite("gold", "ui-sprite gold-icon")}<b>${devAmount(this.game, this.game.save.gold)}</b></span>${mats}</div>`;
  }

  /** A piece as a square tile: its icon on its rarity's colour, the rarity
   * mark, its level, a check when the shown loadout wears it, a lock. */
  private tile(item: EquipItem, attr: string, extra = "") {
    const def = itemDef(item.def)!, worn = this.e.equipped[this.mode][def.category] === item.id;
    const label = `${def.name}, ${rarityName(item)}, Level ${item.level}${worn ? `, worn in the ${MODE_NAMES[this.mode]}` : ""}${item.locked ? ", locked" : ""}`;
    return `<button class="eq-tile rar-${item.rarity}${extra}" data-${attr}="${item.id}" title="${label}" aria-label="${label}">${itemIcon(def.id, "eq-tile-icon")}
      <span class="eq-tile-mark">${RARITY_TIERS[item.rarity].mark}${item.stars ? `<span class="eq-tile-stars">★${item.stars}</span>` : ""}</span><span class="eq-tile-level">${item.level}</span>
      ${worn ? kitIcon("ui-equip-worn", "✓", "eq-tile-worn") : ""}${item.locked ? `<span class="eq-tile-lock">${ACTION_ICONS.lock}</span>` : ""}${def.class === "unique" ? kitIcon("ui-equip-unique", "★", "eq-tile-unique") : ""}</button>`;
  }
  /** An empty place for a piece of `category`, its icon dimmed. */
  private ghost(category: CategoryId, attr = "", label = CATEGORIES[category].name) {
    return `<${attr ? "button" : "span"} class="eq-tile eq-ghost"${attr} title="${label}" aria-label="${label}">${categoryIcon(category, "eq-tile-icon")}</${attr ? "button" : "span"}>`;
  }

  // --- List: the loadout over the inventory ---

  private listHtml() {
    return this.loadoutHtml() + this.inventoryHtml();
  }

  /** The mode's loadout: its switch at the top left, Equipment's ? by its
   * heading, the unlocked slots in a
   * 3×3 grid shaped like the hero, and what they add up to. A worn piece
   * opens its details; an empty slot shows only that category below. */
  private loadoutHtml() {
    const worn = this.e.equipped[this.mode], delve = this.game.tournament.unlocked, other = this.mode === "tower" ? "delve" : "tower";
    const slots = GRID.map((c) => {
      if (!categoryOpen(this.e, c)) return `<div class="eq-slot eq-slot-reserved" aria-hidden="true"></div>`;
      const item = worn[c] ? findItem(this.e, worn[c]!) : undefined;
      const name = item ? `<small class="eq-slot-name rar-${item.rarity}">${nameOf(item)}</small>` : `<small class="eq-slot-name">${CATEGORIES[c].name}</small>`;
      return `<div class="eq-slot${item ? ` rar-${item.rarity}` : ""}" data-eq-category="${c}">${item ? this.tile(item, "eq-item") : this.ghost(c, ` data-eq-slot="${c}"`, `${CATEGORIES[c].name}: empty`)}${name}</div>`;
    }).join("");
    const switcher = delve
      ? `<button class="eq-mode" data-eq-mode="${other}" title="Showing the ${MODE_NAMES[this.mode]} loadout: switch to the ${MODE_NAMES[other]}'s">${uiSprite(this.mode)}<span>${MODE_NAMES[this.mode]}</span><b aria-hidden="true">${controlIcon("swap")}</b></button>`
      : `<span class="eq-mode">${uiSprite(this.mode)}<span>${MODE_NAMES[this.mode]}</span></span>`;
    const totals = equipmentEffects(this.e, this.mode), lines = (Object.entries(totals) as [keyof typeof totals, number][]).filter(([, v]) => v);
    // A power reads as its piece's name and its words.
    const line = ([k, v]: [keyof typeof totals, number]) => (isPowerKind(k) ? `<li><strong>${itemDef(k)!.name}</strong>: ${POWER_TEXT[k](v)}</li>` : `<li>${effectText(k, v)}</li>`);
    const summary = lines.length ? `<ul class="eq-totals">${lines.map(line).join("")}</ul>` : `<p class="eq-totals-empty">Nothing worn yet.</p>`;
    const copy = delve ? `<button class="link-button eq-copy" data-eq-copy="${other}">Copy the ${MODE_NAMES[other]}'s</button>` : "";
    return `<div class="eq-loadout" aria-label="${MODE_NAMES[this.mode]} loadout"><div class="eq-loadout-head">${switcher}<h3>Loadout${helpButton("How Equipment works", "equip-help")}</h3>${copy}</div>
      <div class="eq-slots">${slots}</div>${summary}</div>`;
  }

  /** The pieces shown after the filters, in the chosen order. */
  private shown() {
    const order: Record<SortKey, (a: EquipItem, b: EquipItem) => number> = {
      rarity: (a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.level - a.level,
      level: (a, b) => b.level - a.level || rarityRank(b.rarity) - rarityRank(a.rarity),
      category: (a, b) => CATEGORY_IDS.indexOf(categoryOf(a)) - CATEGORY_IDS.indexOf(categoryOf(b)) || rarityRank(b.rarity) - rarityRank(a.rarity),
      newest: (a, b) => idNumber(b) - idNumber(a),
      name: (a, b) => nameOf(a).localeCompare(nameOf(b), "en"),
    };
    return this.e.items
      .filter((i) => (this.category === "all" || categoryOf(i) === this.category) && (this.rarity === "all" || i.rarity === this.rarity))
      .sort((a, b) => order[this.sort](a, b) || idNumber(a) - idNumber(b));
  }

  private filtersHtml() {
    const cats = `<div class="tree-tabs equip-filter" role="group" aria-label="Category"><button data-eq-cat="all" aria-pressed="${this.category === "all"}">All</button>${availableCategories(this.e).map((c) =>
      `<button data-eq-cat="${c}" aria-pressed="${this.category === c}" title="${CATEGORIES[c].plural}" aria-label="${CATEGORIES[c].plural}">${categoryIcon(c)}</button>`).join("")}</div>`;
    const rars = `<div class="tree-tabs equip-filter" role="group" aria-label="Rarity"><button data-eq-rar="all" aria-pressed="${this.rarity === "all"}">Any rarity</button>${EQUIP_RARITIES.map((r) =>
      `<button data-eq-rar="${r}" aria-pressed="${this.rarity === r}" class="rar-${r}">${RARITY_TIERS[r].name}</button>`).join("")}</div>`;
    const sort = `<label class="equip-sort">Sort <select id="eq-sort">${SORTS.map((s) => `<option value="${s.id}"${s.id === this.sort ? " selected" : ""}>${s.name}</option>`).join("")}</select></label>`;
    return `${cats}${rars}<div class="equip-toolbar">${sort}<button data-eq-select="toggle" aria-pressed="${this.selecting}">${this.selecting ? "Done" : "Select"}</button></div>`;
  }

  private inventoryHtml() {
    const items = this.shown();
    const head = `<h3 class="eq-section">Pieces <small>${this.e.items.length} / ${EQUIPMENT_CAPACITY}</small></h3>`;
    const actions = this.selecting ? this.selectionBar() : "";
    const grid = items.length ? `<div class="eq-grid">${items.map((i) => {
      const extra = this.selected.has(i.id) ? " selected" : this.selecting && isProtected(this.e, i) ? " eq-blocked" : "";
      return this.tile(i, "eq-item", extra);
    }).join("")}</div>`
      : `<p class="hint">${this.e.items.length ? "No pieces match these filters." : "No equipment yet."}</p>`;
    return head + this.filtersHtml() + actions + grid + this.salvageHtml();
  }

  /** The selection's actions: dismantle what can be, compare two. */
  private selectionBar() {
    const chosen = [...this.selected].map((id) => findItem(this.e, id)).filter((i): i is EquipItem => !!i);
    const compare = chosen.length === 2 ? `<button data-eq-compare="1">Compare</button>` : "";
    return `<div class="equip-selection"><span>${chosen.length} selected</span><button data-eq-select="none"${chosen.length ? "" : " disabled"}>Clear</button>${compare}<button class="danger" data-eq-dismantle="selected"${chosen.length ? "" : " disabled"}>${ACTION_ICONS.dismantle} Dismantle</button></div>`;
  }

  /** Quick salvage: every unprotected piece of a rarity at once, and the
   * Auto-salvage toggle for Common drops found in a run. */
  private salvageHtml() {
    const quick = EQUIP_RARITIES.map((r) => {
      const n = this.e.items.filter((i) => i.rarity === r && !isProtected(this.e, i)).length;
      return `<button data-eq-salvage-all="${r}"${n ? "" : " disabled"}>${ACTION_ICONS.dismantle} All ${RARITY_TIERS[r].name} (${n})</button>`;
    }).join("");
    const auto = this.e.autoSalvage;
    const toggle = `<button class="eq-auto-salvage" data-eq-auto-salvage="1" aria-pressed="${auto}"><span class="eq-check" aria-hidden="true">${auto ? kitIcon("check", "✓", "eq-check-icon") : ""}</span>${kitIcon("ui-equip-salvage", "", "eq-salvage-icon")}Auto-salvage common drops</button>`;
    return `<details class="eq-salvage"${this.salvageOpen ? " open" : ""}><summary>${ACTION_ICONS.dismantle} Salvage</summary><div class="equip-quick">${quick}</div>${toggle}<p class="hint">While on, a ${RARITY_TIERS.common.name} piece an Equipment Chest holds, or a Gem pull brings, is dismantled at once into its material instead of joining the inventory.</p></details>`;
  }

  // --- Assemble: pieces alike into the next rarity, or a Star ---

  /** Every piece with enough unprotected pieces to assemble, best first. */
  private mergeable() {
    return this.e.items.filter((i) => { const plan = mergePlan(i); return !!plan && fodderFits(i, plan, defaultFodder(this.e, i)); })
      .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.level - a.level || idNumber(a) - idNumber(b));
  }

  /** Starts assembling `id`: the piece kept, with the pieces `defaultFodder`
   * would use up already chosen. */
  private assemble(id: string) {
    const item = findItem(this.e, id);
    if (!item || !mergePlan(item)) return;
    this.target = id;
    this.copies = defaultFodder(this.e, item).map((i) => i.id);
    this.view = "assemble";
  }

  /** The recipe in words: "2× Kingsbane Epic + 1× any Epic Sword → 1×
   * Kingsbane Legendary", or the Star a Legendary copy adds. */
  private formulaHtml(target: EquipItem, plan: MergePlan) {
    const name = (r: EquipRarity, stars = 0) => `<span class="rar-${r} eq-need-name">${nameOf(target)}</span> ${rarityTag(r, stars)}`;
    const arrow = `<span class="eq-formula-arrow">→</span>`;
    if (plan.kind === "star") return `${name("ancestral", target.stars ?? 0)} + ${name(STARS.fodder)} ${arrow} ${name("ancestral", plan.stars)}`;
    const any = plan.any ? ` + <b>${plan.any}×</b> any ${rarityTag(target.rarity)} ${CATEGORIES[categoryOf(target)].name}` : "";
    return `<b>${plan.same}×</b> ${name(target.rarity)}${any} ${arrow} <b>1×</b> ${name(plan.next)}`;
  }

  /** What the merge changes: the rarity or Stars, the level cap, the main effect. */
  private mergeHint(target: EquipItem, plan: MergePlan) {
    const after: EquipItem = plan.kind === "star" ? { ...target, stars: plan.stars } : { ...target, rarity: plan.next };
    const main = (i: EquipItem) => mainLines(i)[0] ?? "";
    const was = main(target), now = main(after);
    const effect = was && now !== was ? ` Main effect ${was} → ${now}.` : "";
    if (plan.kind === "star") return `${rarityTag("ancestral", target.stars ?? 0)} → ${rarityTag("ancestral", plan.stars)}: level cap ${maxLevel(target)} → ${maxLevel(after)}, main effect ×${starPercent(plan.stars) / 100}.${effect}`;
    return `${rarityTag(target.rarity)} Lv ${target.level} → ${rarityTag(plan.next)} Lv ${target.level} (up to ${levelCap(plan.next)}).${effect}`;
  }

  /** The result above its inputs (the piece kept, plus the copies used up),
   * what is still needed, and below it the pieces to choose from. */
  private assembleHtml() {
    const target = this.target ? findItem(this.e, this.target) : undefined, plan = target && mergePlan(target);
    if (!target || !plan) {
      this.target = null;
      const ready = this.mergeable();
      const list = ready.length ? `<div class="eq-grid">${ready.map((i) => this.tile(i, "eq-target")).join("")}</div>`
        : `<p class="hint">None are ready yet.</p>`;
      const empty = `<span class="eq-tile eq-ghost" aria-hidden="true"></span>`;
      return `<div class="eq-assemble"><div class="eq-recipe"><span class="eq-inputs">${this.inputsHtml([empty, empty, empty])}</span><span class="eq-arrow" aria-hidden="true">${controlIcon("forward", "▶")}</span><span class="eq-tile eq-ghost eq-result-slot" aria-hidden="true">?</span></div>
        <div class="eq-need-row"><p class="eq-need">Choose the piece to keep</p><button id="eq-auto-asm"${autoMerges(this.e).length ? "" : " disabled"}>${ACTION_ICONS.merge} Auto-assemble</button></div></div><h3 class="eq-section">List</h3>${list}${this.assembleActions(false)}`;
    }
    const need = plan.need, category = categoryOf(target);
    const fodder = mergeFodder(this.e, target), copies = this.copies.map((id) => fodder.find((i) => i.id === id)).filter((i): i is EquipItem => !!i);
    const result: EquipItem = plan.kind === "star" ? { ...target, stars: plan.stars } : { ...target, rarity: plan.next };
    const inputs = this.inputsHtml([this.tile(target, "eq-untarget", " eq-kept"),
      ...Array.from({ length: need }, (_, k) => copies[k] ? this.tile(copies[k], "eq-unpick") : this.ghost(category))]);
    const lost = copies.filter((i) => i.spent);
    const warning = lost.length ? `<p class="warning">⚠ ${lost.length === 1 ? "One piece has" : `${lost.length} pieces have`} been leveled: what was put into ${lost.length === 1 ? "it" : "them"} (${currencyAmount(lost.reduce((n, i) => n + (i.spent?.gold ?? 0), 0))} Gold, ${lost.reduce((n, i) => n + (i.spent?.material ?? 0), 0)} material) is lost.</p>` : "";
    const ready = fodderFits(target, plan, copies);
    const blocked = this.e.items.filter((i) => i.id !== target.id && isProtected(this.e, i) && (plan.kind === "star"
      ? i.def === target.def && i.rarity === STARS.fodder
      : i.rarity === target.rarity && (plan.any ? categoryOf(i) === category : i.def === target.def)));
    const left = fodder.filter((i) => !this.copies.includes(i.id));
    const list = left.length ? `<div class="eq-grid">${left.map((i) => this.tile(i, "eq-pick")).join("")}</div>` : `<p class="hint">No other pieces left to choose.</p>`;
    const sameNote = plan.kind === "rarity" && plan.any && copies.length === need && !ready ? `: ${plan.same - 1} must be ${nameOf(target)}` : "";
    return `<div class="eq-assemble"><p class="eq-formula">${this.formulaHtml(target, plan)}</p>
      <div class="eq-recipe"><span class="eq-inputs">${inputs}</span><span class="eq-arrow" aria-hidden="true">${controlIcon("forward", "▶")}</span>${this.tile(result, "eq-result", " eq-result-slot")}</div>
      <p class="eq-need">${copies.length + 1} of ${need + 1} pieces chosen${ready ? ": ready to assemble" : copies.length < need ? `: choose ${need - copies.length} more below` : sameNote}</p></div>
      <p class="hint">${this.mergeHint(target, plan)}</p>
      ${warning}${blocked.length ? `<p class="hint">Not offered (locked or worn): ${blocked.map((i) => `${nameOf(i)} Lv ${i.level}`).join(", ")}.</p>` : ""}
      <h3 class="eq-section">List</h3>${list}${this.assembleActions(ready)}`;
  }

  /** The pieces going in, numbered 1 to 3 and joined by +. */
  private inputsHtml(tiles: string[]) {
    return tiles.map((tile, k) => `${k ? `<span class="eq-plus" aria-hidden="true">+</span>` : ""}<span class="eq-input"><span class="eq-input-n">${k + 1}</span>${tile}</span>`).join("");
  }

  private assembleActions(ready: boolean) {
    return `<div class="eq-assemble-actions"><button id="eq-asm-cancel" class="danger"${this.target ? "" : " disabled"}>Cancel</button><button id="eq-asm-go" class="eq-go"${ready ? "" : " disabled"}>${ACTION_ICONS.merge} Assemble</button></div>`;
  }

  /** Assembles the chosen piece, melts the three into the new one, then
   * shows what it became. */
  private doAssemble() {
    if (!this.target) return;
    const going = [this.target, ...this.copies].map((id) => findItem(this.e, id)).filter((i): i is EquipItem => !!i)
      .map((i) => ({ def: i.def, rarity: i.rarity }));
    const result = this.game.equipment.merge(this.target, this.copies);
    if (typeof result === "string") return;
    const id = this.target;
    this.target = null;
    this.copies = [];
    this.changed();
    const item = findItem(this.e, id);
    if (item) playSlagMerge(going, { def: item.def, rarity: item.rarity }, this.game.save.settings.reduceMotion, () => this.showResult("Assemble Complete!", [item]));
  }

  /** Auto-assemble: every merge the inventory makes at once (`autoMerges`),
   * each with a box to leave it out, then Assemble makes those checked,
   * without the melt. The ✕ or a press outside the dialog cancels. */
  private showAutoAssemble() {
    const merges = autoMerges(this.e), chosen = new Set(merges.map((_, k) => k));
    if (!merges.length) return;
    const { modal } = this.ctx;
    const rows = merges.map((m, k) => {
      const target = findItem(this.e, m.target)!, plan = mergePlan(target)!, next = plan.kind === "rarity" ? plan.next : target.rarity;
      const fodder = m.fodder.map((id) => findItem(this.e, id)!);
      const lost = fodder.some((i) => i.spent) ? ` <span class="warning" title="A piece used up has been leveled: what was put into it is lost">⚠</span>` : "";
      return `<li><label class="eq-auto-row"><input type="checkbox" data-eq-auto="${k}" checked>
        <span class="equip-icon-frame rar-${target.rarity}">${itemIcon(target.def)}</span>
        <span class="eq-auto-text"><strong class="rar-${target.rarity} eq-need-name">${nameOf(target)}</strong>
        <span>${rarityTag(target.rarity)} → ${rarityTag(next)} Lv ${target.level}${target.locked ? ` ${ACTION_ICONS.lock}` : ""}</span>
        <small>Uses up Lv ${fodder.map((i) => i.level).join(", Lv ")}${lost}</small></span></label></li>`;
    }).join("");
    modal.innerHTML = `<div class="eq-auto"><button id="eq-auto-close" class="dialog-x" aria-label="Close" title="Close">${controlIcon("close")}</button>
      <small>${ACTION_ICONS.merge} ASSEMBLE</small><h2>Auto-assemble</h2>
      <p class="eq-auto-note">Every merge your pieces make. Worn pieces take no part; locked ones are only kept. Uncheck any to leave it out.</p>
      <ul class="eq-auto-list">${rows}</ul>
      <div class="dialog-actions"><button id="eq-auto-go" class="eq-go">${ACTION_ICONS.merge} Assemble (<span id="eq-auto-count">${chosen.size}</span>)</button></div></div>`;
    const go = el("eq-auto-go") as HTMLButtonElement;
    modal.querySelectorAll<HTMLInputElement>("[data-eq-auto]").forEach((box) => (box.onchange = () => {
      const k = Number(box.dataset.eqAuto);
      if (box.checked) chosen.add(k);
      else chosen.delete(k);
      el("eq-auto-count").textContent = String(chosen.size);
      go.disabled = !chosen.size;
    }));
    // A press on the backdrop (outside the dialog's box) cancels.
    modal.onclick = (ev) => {
      const r = modal.getBoundingClientRect();
      if (ev.target === modal && (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom)) modal.close();
    };
    modal.addEventListener("close", () => { modal.onclick = null; }, { once: true });
    el("eq-auto-close").onclick = () => modal.close();
    go.onclick = () => {
      modal.onclick = null;
      const made = merges.filter((_, k) => chosen.has(k))
        .filter((m) => typeof this.game.equipment.merge(m.target, m.fodder) !== "string")
        .map((m) => findItem(this.e, m.target)).filter((i): i is EquipItem => !!i);
      this.target = null;
      this.copies = [];
      this.changed();
      if (made.length) this.showResult("Assemble Complete!", made);
      else modal.close();
    };
    modal.showModal();
  }

  // --- Craft: deterministic Standard pieces from base resources ---

  private craftHtml() {
    return `<h3 class="eq-section">Craft equipment</h3><p class="hint">A Common Standard piece costs ${CRAFT_MATERIAL} of each resource its category's recipe shows. Chestplates use all four.</p>
      <div class="eq-crafts">${availableCategories(this.e).flatMap((c) => standardsOf(c).map((def) => {
        const ready = this.game.free || hasMaterials(this.e.materials, c, CRAFT_MATERIAL);
        const price = materialsOf(c).map(m => `<span title="${EQUIP_MATERIALS[m].name}">${materialIcon(m)} ${CRAFT_MATERIAL}</span>`).join(" + ");
        return `<article class="eq-craft" data-eq-recipe="${def.id}">${itemIcon(def.id)}<strong>${def.name}</strong><p>${def.identity}</p><div class="eq-recipe-cost">${price}</div><button data-eq-craft="${def.id}"${ready ? "" : " disabled"}>Craft</button></article>`;
      })).join("")}</div>`;
  }

  private craft(def: string) {
    const result = this.game.equipment.craft(def);
    if (typeof result === "string") return;
    this.changed();
    this.showResult("Craft complete!", [result]);
  }

  // --- Acquire: Gem pulls ---

  private pullsHtml() {
    const c = this.pullCategory, all = c === "all", gems = this.game.save.gems;
    const off = `<span class="pull-off">−${PULL_ALL_DISCOUNT}%</span>`;
    const cats = `<button class="pull-cat pull-all" data-eq-pullcat="all" aria-pressed="${all}">${off}<span class="pull-all-icons">${availableCategories(this.e).slice(0, 4).map((id) => categoryIcon(id)).join("")}</span><span>All types</span><small>${this.e.pity.all}/${PITY}</small></button>`
      + availableCategories(this.e).map((id) => `<button class="pull-cat" data-eq-pullcat="${id}" aria-pressed="${c === id}">${categoryIcon(id)}<span>${CATEGORIES[id].name}</span><small>${this.e.pity[id]}/${PITY}</small></button>`).join("");
    const rates = pullRates(this.e, c, this.epicMore).map(({ rarity, chance }) => `${rarityTag(rarity)} ${chance}%`).join(" ");
    const button = (n: PullCount) => {
      const paid = this.game.equipment.pullPrice(n, c);
      if (!paid.tickets) {
        const price = pullGems(n, all), short = !this.game.free && gems < price;
        const was = all ? `<s class="was">${PULL_GEMS[n]}</s> ` : "";
        return `<button class="gem-buy${short ? " short" : ""}" data-eq-pull="${n}">Pull ×${n} · ${gemIcon()} ${was}<span class="price">${price}</span></button>`;
      }
      // Tickets first, then Gems for the pulls they don't cover.
      const short = gems < paid.gems, rest = n - paid.tickets;
      const was = all && paid.gems ? `<s class="was">${(PULL_GEMS[n] * rest) / n}</s> ` : "";
      const gemPart = paid.gems ? `<span class="pull-plus">+</span>${gemIcon()} ${was}<span class="price">${paid.gems}</span>` : "";
      const label = `Pull ×${n} for ${paid.tickets} Equipment Ticket${paid.tickets === 1 ? "" : "s"}${paid.gems ? ` and ${paid.gems} Gems` : ""}`;
      return `<button class="gem-buy${short ? " short" : ""}" data-eq-pull="${n}" aria-label="${label}" title="${label}">Pull ×${n} · ${equipTicketIcon()}<b>${paid.tickets}</b>${gemPart}</button>`;
    };
    const tickets = this.e.tickets ? ` · ${equipTicketIcon()} ${this.e.tickets} Equipment Ticket${this.e.tickets === 1 ? "" : "s"}` : "";
    const pity = `Pity ${this.e.pity[c]}/${PITY}: the ${PITY}th pull without an Epic or better brings an Epic Unique.`;
    const box = all
      ? `<h3>All types ${off}</h3><p class="hint">Rates: ${rates} · ${pity}</p>`
      : `<h3>${categoryIcon(c)} ${CATEGORIES[c].plural}</h3><ul class="pull-pool">${uniquesOf(c).map((d) => `<li class="${this.e.drawOff.includes(d.id) ? "pull-off-draw" : ""}">${itemIcon(d.id)}<span><strong>${d.name}</strong>: ${d.identity}</span></li>`).join("")}</ul>
        <p class="hint">Common to Rare bring a ${CATEGORIES[c].name} Standard piece, Epic and Legendary a Unique. Rates: ${rates} · ${pity}</p>`;
    return `<div class="pull-cats">${cats}</div>
      <div class="pull-box${all ? " pull-box-all" : ""}">${box}
      <div class="pull-buttons">${button(1)}${button(10)}<button class="pull-rates" id="eq-rates" aria-label="Draw rates">Rates</button></div><p class="hint">${gemIcon()} ${devAmount(this.game, gems)}${tickets} held</p></div>`;
  }

  /** Relics' Epic chance more, which moves from Common. */
  private get epicMore() {
    return relicAmount(this.game.save, "rarePull");
  }

  /** The draw rates of the chosen pulls: each rarity's chance and each named
   * piece's share of it, and, once a five-Star piece is owned, a box for
   * each Unique to leave it out of future pulls (its share going evenly to
   * the rest). */
  private showRates() {
    const { modal } = this.ctx, c = this.pullCategory, toggles = drawTogglesOpen(this.e);
    const percent = (n: number) => `${Number(n.toFixed(n && n < 0.01 ? 4 : 3))}%`;
    const rows = pullRates(this.e, c, this.epicMore).map(({ rarity, chance, pieces }) => {
      const list = pieces.map(({ def, chance: share }) => {
        const d = itemDef(def)!, off = this.e.drawOff.includes(def);
        const box = toggles && d.class === "unique" ? `<input type="checkbox" data-eq-draw="${def}"${off ? "" : " checked"} aria-label="Include ${d.name} in Gem pulls">` : "";
        return `<li class="${off ? "pull-off-draw" : ""}">${box}${itemIcon(def)}<span>${d.name}</span><b>${percent(share)}</b></li>`;
      }).join("");
      return `<tr><th>${rarityTag(rarity)}</th><td>${percent(chance)}</td></tr><tr><td colspan="2"><ul class="pull-rate-pieces">${list}</ul></td></tr>`;
    }).join("");
    const note = toggles ? `<p class="hint">Uncheck a Unique to leave it out of future pulls; its share goes evenly to the others of its rarity.</p>` : "";
    modal.innerHTML = `<div class="eq-rates"><button id="eq-close" class="dialog-x" aria-label="Close" title="Close">${controlIcon("close")}</button>
      <small>GEM PULLS</small><h2>Draw rates · ${c === "all" ? "All types" : CATEGORIES[c].plural}</h2>
      <table class="pull-rate-table"><tbody>${rows}</tbody></table>${note}
      <p class="hint">Pity aside: the ${PITY}th pull without an Epic or better brings an Epic Unique.</p></div>`;
    if (!modal.open) modal.showModal();
    el("eq-close").onclick = () => modal.close();
    modal.querySelectorAll<HTMLInputElement>("[data-eq-draw]").forEach((box) => (box.onchange = () => {
      this.game.equipment.setDrawn(box.dataset.eqDraw!, box.checked);
      this.ctx.save();
      this.rerender();
      this.showRates();
    }));
  }

  /** `count` Gem pulls in the chosen category, then every result at once. */
  private pull(count: PullCount) {
    const result = this.game.equipment.pull(this.pullCategory, count);
    if (result === "gems") return askForGems(this.ctx);
    const { modal } = this.ctx;
    if (result === "excluded") {
      const c = this.pullCategory, what = c === "all" ? "every type" : CATEGORIES[c].plural;
      modal.innerHTML = `<h2>Every Unique left out</h2><p>You've maxed every Unique of ${what} and left them all out of Gem pulls, so these pulls would bring nothing new.</p><p>Turn some back on in Rates if you want to buy more of ${what}.</p><div class="dialog-actions"><button id="eq-close">Close</button><button id="eq-to-rates" class="eq-go">Rates</button></div>`;
      modal.showModal();
      el("eq-close").onclick = () => modal.close();
      el("eq-to-rates").onclick = () => this.showRates();
      return;
    }
    if (result === "room" || result === "locked") {
      modal.innerHTML = `<h2>No room</h2><p>The inventory holds ${EQUIPMENT_CAPACITY} pieces. Dismantle some to make room for ${count}.</p><div class="dialog-actions"><button id="eq-close">Close</button></div>`;
      modal.showModal();
      el("eq-close").onclick = () => modal.close();
      return;
    }
    this.ctx.save();
    this.ctx.update();
    this.rerender();
    const best = result.reduce<EquipRarity | null>((b, r) => (!b || rarityRank(r.item.rarity) > rarityRank(b) ? r.item.rarity : b), null);
    const top = best && rarityRank(best) >= rarityRank("epic") ? result.filter((r) => r.item.rarity === best).length : 0;
    const c = this.pullCategory;
    const salvaged = new Map(result.filter((r) => r.salvaged).map((r) => [r.item.id, r.salvaged!]));
    const sure = result.filter((r) => r.sure).map((r) => r.item.id);
    const notes = [...(sure.length ? ["One of your first ticket pulls: a sure Epic Unique. Wear it from List!"] : []),
      `Pity now ${this.e.pity[c]}/${PITY}.`, ...(salvaged.size ? [`Auto-salvage dismantled ${salvaged.size} Common piece${salvaged.size === 1 ? "" : "s"}.`] : [])];
    this.showResult(top ? `${top} ${RARITY_TIERS[best!].name}!` : "Pull Complete!", result.map((r) => r.item), result.filter((r) => r.pity).map((r) => r.item.id),
      notes.join(" "), salvaged, sure);
  }

  /** The full screen shown after an assemble or a pull: what came of it,
   * each piece with its name and rarity (and, for one Auto-salvage
   * dismantled, the material it returned), and OK. */
  private showResult(title: string, items: EquipItem[], pity: string[] = [], note = "", salvaged = new Map<string, { id: EquipMaterialId; quantity: number }>(), sure: string[] = []) {
    const { modal } = this.ctx;
    const salvage = (id: string) => {
      const s = salvaged.get(id);
      return s ? `<span class="eq-result-salvaged">${materialIcon(s.id)} Salvaged +${s.quantity} ${EQUIP_MATERIALS[s.id].name}</span>` : "";
    };
    const cards = items.map((item) => `<div class="eq-result-item${salvaged.has(item.id) ? " salvaged" : ""}">${this.tile(item, "eq-shown")}<strong>${nameOf(item)}</strong>${rarityTag(item.rarity)}${pity.includes(item.id) ? `<small>Pity</small>` : ""}${sure.includes(item.id) ? `<small>Sure</small>` : ""}${salvage(item.id)}</div>`).join("");
    modal.classList.add("eq-result");
    modal.innerHTML = `<h2 class="eq-result-title">${title}</h2><div class="eq-result-items">${cards}</div>${note ? `<p class="hint">${note}</p>` : ""}<div class="dialog-actions"><button id="eq-ok" class="eq-go">OK</button></div>`;
    modal.addEventListener("close", () => modal.classList.remove("eq-result"), { once: true });
    if (!modal.open) modal.showModal();
    el("eq-ok").onclick = () => modal.close();
  }

  // --- Presses ---

  /** Click handlers by data attribute; each gets that attribute's value. */
  bind() {
    const handlers: Record<string, (v: string, b: HTMLElement) => void> = {
      eqView: (v) => { this.view = v as View; this.selecting = false; this.selected.clear(); this.rerender(); },
      eqMode: (v) => { this.mode = v as Mode; this.rerender(); },
      eqCopy: (v) => { this.game.equipment.copyLoadout(v as Mode, this.mode); this.changed(); },
      eqSlot: (v) => { this.category = this.category === v ? "all" : v as CategoryId; this.rerender(); },
      eqCat: (v) => { this.category = v as CategoryId | "all"; this.rerender(); },
      eqRar: (v) => { this.rarity = v as EquipRarity | "all"; this.rerender(); },
      eqSelect: (v) => {
        if (v === "toggle") this.selecting = !this.selecting;
        this.selected.clear();
        this.rerender();
      },
      eqItem: (v) => {
        if (!this.selecting) return this.showItem(v);
        const item = findItem(this.e, v);
        if (!item || isProtected(this.e, item)) return;
        if (this.selected.has(v)) this.selected.delete(v);
        else this.selected.add(v);
        this.rerender();
      },
      eqCompare: () => { const [a, b] = [...this.selected]; this.showCompare(a, b); },
      eqDismantle: () => this.confirmDismantle([...this.selected]),
      eqAutoSalvage: () => {
        this.game.equipment.setAutoSalvage(!this.e.autoSalvage);
        this.ctx.save();
        this.rerender();
      },
      eqSalvageAll: (v) => this.confirmDismantle(this.e.items.filter((i) => i.rarity === v && !isProtected(this.e, i)).map((i) => i.id)),
      eqTarget: (v) => { this.assemble(v); this.rerender(); },
      eqUntarget: () => { this.target = null; this.rerender(); },
      eqPick: (v) => {
        const target = this.target ? findItem(this.e, this.target) : undefined;
        const plan = target && mergePlan(target);
        if (plan && this.copies.length < plan.need) this.copies.push(v);
        this.rerender();
      },
      eqUnpick: (v) => { this.copies = this.copies.filter((id) => id !== v); this.rerender(); },
      eqCraft: (v) => this.craft(v),
      eqPullcat: (v) => { this.pullCategory = v as CategoryId | "all"; this.rerender(); },
      eqPull: (v) => this.pull(Number(v) as PullCount),
    };
    for (const [key, handle] of Object.entries(handlers)) {
      const attr = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      document.querySelectorAll<HTMLElement>(`#gear [data-${attr}]`).forEach((b) => (b.onclick = () => handle(b.dataset[key]!, b)));
    }
    const on = (id: string, fn: () => void) => { const b = document.querySelector<HTMLButtonElement>(`#gear #${id}`); if (b) b.onclick = fn; };
    on("eq-asm-cancel", () => { this.target = null; this.copies = []; this.rerender(); });
    on("eq-asm-go", () => this.doAssemble());
    on("eq-auto-asm", () => this.showAutoAssemble());
    on("eq-rates", () => this.showRates());
    const salvage = document.querySelector<HTMLDetailsElement>("#gear .eq-salvage");
    if (salvage) salvage.ontoggle = () => { this.salvageOpen = salvage.open; };
    const sort = document.querySelector<HTMLSelectElement>("#eq-sort");
    if (sort) sort.onchange = () => { this.sort = sort.value as SortKey; this.rerender(); };
  }

  /** How Equipment works: the text kept off its views, behind the ? beside
   * the page's heading. */
  showHelp() {
    const salvage = EQUIP_RARITIES.map((r) => `${RARITY_TIERS[r].name} ${RARITY_TIERS[r].salvage}`).join(" · ");
    const caps = EQUIP_RARITIES.map((r) => `${RARITY_TIERS[r].name} ${RARITY_TIERS[r].maxLevel}`).join(" · ");
    showHelp(this.ctx, "GEAR", "Equipment", `<p><b>Wearing.</b> Each hero wears one piece of each kind; the Tower and the Delve keep separate loadouts. Tap a piece to equip, level or lock it. Start with Helmet, Shield, Chestplate, Sword and Boots. Other slots await future unlocks. Each category has three Standard pieces, from Equipment Chests, crafting and Gem pulls, and three Uniques, from Gem pulls only.</p>
      <p><b>Leveling.</b> Pieces start at level 0. Leveling raises only the piece's main effect: Swords ATK, Shields DEF, Helmets Arcanum Damage, Boots Gold found and Chestplates max HP, and a Chestplate also raises the other worn pieces' main effects. Each rarity has its level cap (${caps}); each Star adds ${STARS.levels}, up to ${levelCap("ancestral", STARS.most)}. Substat slots open at levels 1, 41, 61, 81, 121, 161, 201 and 241.</p>
      <p><b>Craft.</b> Craft Common Standard pieces with four base resources. Helmets use Padding, Shields Rivets, Swords Whetstones and Boots Hobnails. Chestplates use all four. Later pieces combine two resources, such as Rivets and Padding for an Amulet. Leveling and Refinement use the same recipes.</p><p><b>Assemble.</b> Three copies of a piece make one of the next rarity from Uncommon to Rare and Rare to Epic; two copies and one more piece of its category at the same rarity from Epic to Legendary and Legendary to Mythic; two Mythic copies make an Ancestral. An Ancestral and a Legendary copy of it add a Star (up to ${STARS.most}), each raising the main effect by ${STARS.boost}% of itself. Common pieces never merge, and Standard pieces go no higher than Legendary. The piece kept keeps its level, substat slots and Refinement; what was put into the others is lost. Locked and worn pieces don't count. Auto-assemble lists every rarity merge your unworn pieces make at once, to make all you leave checked.</p>
      <p><b>Acquire.</b> Each pull brings a piece at a rolled rarity, of the chosen category, or of a random one for ${PULL_ALL_DISCOUNT}% less: a Standard piece at Common, Uncommon or Rare, a Unique at Epic or Legendary. The ${PITY}th pull in a row without an Epic or better brings an Epic Unique; each category and pulls of all types count their own. An Equipment Ticket pays for one pull in place of its Gems: pulls use tickets first, then Gems for the rest. Rates, beside the buttons, shows each piece's chance; once you own a five-Star piece, it lets you leave Uniques out of future pulls.</p>
      <p><b>Salvage.</b> Dismantling turns a piece into its recipe's first base resource (${salvage}; Unique twice that), not returning upgrades. Locked and worn pieces are never included; press Select to choose pieces one by one. With Auto-salvage on, Common pieces Equipment Chests hold are dismantled as they are found, and those Gem pulls bring once pulled.</p>`);
  }

  /** The welcome on first opening Equipment: what tickets and Gems buy, the
   * rarity chances, pity, and a push to spend the tickets and wear what
   * they bring. Its Acquire button leads to the pulls. */
  showWelcome() {
    const { modal } = this.ctx, held = this.e.tickets;
    const rows = pullRates(this.e, "all", this.epicMore).map(({ rarity, chance }) =>
      `<tr><th>${rarityTag(rarity)}</th><td>${chance}%</td><td>${rarityRank(rarity) >= rarityRank("epic") ? "a Unique" : "a Standard piece"}</td></tr>`).join("");
    const tickets = held
      ? `<p>The Blacksmith gives you ${equipTicketIcon()} <b>${held}</b> Equipment Ticket${held === 1 ? "" : "s"}. Each pays for one pull in place of its Gems; pulls use your tickets first, then Gems for the rest.${this.e.welcome.epic ? ` One of your first ${this.e.welcome.left} ticket pulls is sure to bring an Epic Unique.` : ""}</p>`
      : `<p>Each pull costs ${gemIcon()} Gems; an Equipment Ticket pays for one in place of its Gems.</p>`;
    modal.innerHTML = `<small>EQUIPMENT</small><h2>Equip your hero</h2>${tickets}
      <p>Each pull in Acquire brings a piece at a rolled rarity:</p>
      <table class="eq-welcome-rates"><tbody>${rows}</tbody></table>
      <p><b>Pity.</b> The ${PITY}th pull in a row without an Epic or better is sure to bring an Epic Unique. Each category, and pulls of all types, counts its own.</p>
      <p class="hint">Spend your tickets, then tap the pieces they bring in List to wear them: each raises your stats, and Uniques bring powers of their own.</p>
      <div class="dialog-actions"><button id="eq-welcome-later">Later</button><button id="eq-welcome-go" class="eq-go">To Acquire</button></div>`;
    if (!modal.open) modal.showModal();
    el("eq-welcome-later").onclick = () => modal.close();
    el("eq-welcome-go").onclick = () => {
      modal.close();
      this.view = "pulls";
      this.rerender();
    };
  }

  private rerender() {
    this.ctx.renderPage();
  }
  /** After a change to what a hero wears or how strong it is. */
  private changed() {
    this.ctx.save();
    this.ctx.renderPage();
    this.ctx.update();
  }

  /** A piece's details: everything it does at each rarity, how it compares
   * with what is worn, and what can be done with it. */
  private showItem(id: string) {
    const item = findItem(this.e, id);
    if (!item) return;
    const { modal } = this.ctx, def = itemDef(item.def)!;
    modal.innerHTML = `<div class="equip-detail"><button id="eq-close" class="dialog-x" aria-label="Close" title="Close">${controlIcon("close")}</button>
      <small>${CATEGORIES[def.category].name.toUpperCase()} · ${def.class === "unique" ? "UNIQUE" : "STANDARD"}</small>
      <h2 class="equip-title"><span class="equip-icon-frame rar-${item.rarity}">${itemIcon(def.id)}</span>${def.name}</h2>
      <p class="item-meta">${rarityTag(item.rarity, item.stars)} Level ${item.level}/${maxLevel(item)}</p>${this.progressHtml(item)}<p class="item-identity">${def.identity}.</p>${def.class === "unique" && isPower(def.id) ? `<h3 class="equip-heading">Power</h3><p class="item-power">${POWER_TEXT[def.id](powerTier(item.rarity))}.</p>` : ""}
      <h3 class="equip-heading">Main effect</h3><ul class="effect-list">${this.mainHtml(item)}</ul>
      <h3 class="equip-heading">Substats</h3>${this.slotsHtml(item)}${this.compareWorn(item)}${this.levelHtml(item)}${this.notesHtml(item)}
      ${this.itemActionsHtml(item)}</div>`;
    modal.showModal();
    this.bindItem(item);
  }

  /** What leveling the piece raises, now and at the next level. */
  private mainHtml(item: EquipItem) {
    const now = mainLines(item), next = item.level < maxLevel(item) ? mainLines({ ...item, level: item.level + 1 }) : [];
    if (!now.length) return `<li class="locked-line">None yet.</li>`;
    return now.map((text, k) => `<li>${text}${next[k] ? ` <small class="unlock-at">(next level ${next[k]})</small>` : ""}</li>`).join("");
  }

  /** What the next level costs and the buttons that buy it, or, at the
   * rarity's highest level, what merging up would bring. */
  private levelHtml(item: EquipItem) {
    const cost = levelCost(item), mat = categoryOf(item);
    if (cost) {
      const off = this.affords(cost, mat) ? "" : " disabled";
      return `<p class="level-cost">Next level: ${this.costText(cost, mat)}</p>
        <div class="dialog-actions"><button id="eq-level"${off}>${ACTION_ICONS.upgrade} Level up</button><button id="eq-level10"${off}>+10</button><button id="eq-levelmax"${off}>Max</button></div>`;
    }
    return `<p class="hint">At ${rarityName(item)}'s highest level.${this.nextStepText(item)}</p>`;
  }

  /** What merging next does for `item`'s cap, in words (" Merge to Epic to
   * raise its cap to 80."), or nothing at the top. */
  private nextStepText(item: EquipItem) {
    const plan = mergePlan(item);
    if (!plan) return "";
    if (plan.kind === "star") return ` A ${RARITY_TIERS[STARS.fodder].name} copy adds Star ${plan.stars}, raising its cap to ${levelCap("ancestral", plan.stars)}.`;
    return ` Merge to ${RARITY_TIERS[plan.next].name} to raise its cap to ${levelCap(plan.next)}.`;
  }

  /** What has been spent on the piece, and why it can't be used up, if it can't. */
  private notesHtml(item: EquipItem) {
    const invested = item.spent ? `<p class="hint">Invested: ${currencyAmount(item.spent.gold)} Gold and ${item.spent.material} materials.</p>` : "";
    const protectedNote = isProtected(this.e, item) ? `<p class="hint">${item.locked ? "Locked" : "Worn"}: it can't be dismantled or used up in a merge until you ${item.locked ? "unlock it" : "take it off"}.</p>` : "";
    return invested + protectedNote;
  }

  /** Equip or take off in each loadout, Lock, Assemble and Dismantle. */
  private itemActionsHtml(item: EquipItem) {
    const worn = wornIn(this.e, item.id);
    const equipButtons = (this.game.tournament.unlocked ? (["tower", "delve"] as const) : (["tower"] as const)).map((m) => worn.includes(m)
      ? `<button data-eq-off="${m}">Take off (${MODE_NAMES[m]})</button>`
      : `<button data-eq-on="${m}">Equip (${MODE_NAMES[m]})</button>`).join("");
    const plan = mergePlan(item), chosen = plan ? defaultFodder(this.e, item) : [];
    const mergeButton = plan ? `<button id="eq-merge"${fodderFits(item, plan, chosen) ? "" : " disabled"} title="Needs ${plan.need} more unlocked, unworn pieces">${ACTION_ICONS.merge} ${plan.kind === "star" ? "Add a Star" : "Assemble"} (${chosen.length}/${plan.need})</button>` : "";
    const dismantle = isProtected(this.e, item) ? "" : `<button id="eq-dismantle" class="danger">${ACTION_ICONS.dismantle} Dismantle</button>`;
    return `<div class="equip-actions"><div class="equip-actions-row">${equipButtons}</div><div class="equip-actions-row"><button id="eq-lock">${ACTION_ICONS.lock} ${item.locked ? "Unlock" : "Lock"}</button>${mergeButton}${dismantle}</div></div>`;
  }

  private bindItem(item: EquipItem) {
    const { modal } = this.ctx;
    const again = () => this.showItem(item.id);
    const level = (n: number) => () => { this.game.equipment.levelUp(item.id, n); this.changed(); again(); };
    onPress("#eq-close", () => modal.close());
    onPress("#eq-level", level(1));
    onPress("#eq-level10", level(10));
    onPress("#eq-levelmax", level(maxLevel(item)));
    onPress("#eq-lock", () => { this.game.equipment.setLocked(item.id, !item.locked); this.ctx.save(); this.rerender(); again(); });
    onPress("#eq-merge", () => { modal.close(); this.assemble(item.id); this.rerender(); });
    onPress("#eq-dismantle", () => this.confirmDismantle([item.id]));
    modal.querySelectorAll<HTMLElement>("[data-eq-slotopen]").forEach((b) => (b.onclick = () => this.showSlot(item.id, Number(b.dataset.eqSlotopen))));
    modal.querySelectorAll<HTMLElement>("[data-eq-on]").forEach((b) => (b.onclick = () => { this.game.equipment.equip(b.dataset.eqOn as Mode, item.id); this.changed(); again(); }));
    modal.querySelectorAll<HTMLElement>("[data-eq-off]").forEach((b) => (b.onclick = () => { this.game.equipment.unequip(b.dataset.eqOff as Mode, categoryOf(item)); this.changed(); again(); }));
  }

  /** A price in Gold and `mat`, as icons and amounts. */
  private costText(c: { gold: number; material: number }, category: CategoryId) {
    return `${uiSprite("gold", "ui-sprite gold-icon")} ${priceAmount(c.gold)} + ${materialsOf(category).map(m => `<span title="${EQUIP_MATERIALS[m].name}">${materialIcon(m)} ${c.material}</span>`).join(" + ")}`;
  }
  /** Whether the Gold and `mat` held pay `c` (always, with free purchases on). */
  private affords(c: { gold: number; material: number }, category: CategoryId) {
    return this.game.free || (this.game.save.gold >= c.gold && hasMaterials(this.e.materials, category, c.material));
  }

  /** Where `item` stands on its way up: what merging next raises its cap to. */
  private progressHtml(item: EquipItem) {
    if (item.rarity === "common") return `<p class="hint">${RARITY_TIERS.common.name} pieces can't be merged: wear them as they are, or salvage them.</p>`;
    const step = this.nextStepText(item);
    if (step) return `<p class="hint">${step.trim()}</p>`;
    return `<p class="hint">${item.rarity === "ancestral" ? "Every Star added: its cap can rise no higher." : `${isUnique(item) ? "Top rarity" : `Standard pieces go no higher than ${RARITY_TIERS[item.rarity].name}`}.`}</p>`;
  }

  /** An effect at a rarity on `item`: its name, rarity and what it does there. */
  private choiceHtml(item: EquipItem, choice: EffectChoice) {
    const def = slotEffectDef(choice.effect)!;
    return `<strong>${slotEffectName(def, choice.rarity)}</strong> ${rarityTag(choice.rarity)} <span class="slot-text">${effectText(def.kind, slotValue(def, choice.rarity), def.mode)}</span>`;
  }

  /** The item's effect slots: each open one's effect (or its free first
   * roll), its Refinement, and each locked one's requirement. */
  private slotsHtml(item: EquipItem) {
    return `<ul class="slot-list">${slotPlan(item).map(({ index, level, open, needs: req, slot }) => {
      const head = `<small>SUBSTAT ${index + 1}</small>`;
      if (!open || !slot) {
        const needs = req ? ` · needs ${rarityTag(req.rarity, req.stars)}` : "";
        return `<li class="slot-row slot-locked">${head}<span>Unlocks at Level ${level}${needs}</span></li>`;
      }
      if (!slot.effect || !slot.rarity) {
        return `<li class="slot-row">${head}<span>${slot.offer ? "Candidates waiting" : "Open: its first roll is free"}</span><button data-eq-slotopen="${index}">${slot.offer ? "Choose" : "Roll (free)"}</button></li>`;
      }
      const refined = slot.refinement ? ` · Refinement ${slot.refinement}` : "";
      return `<li class="slot-row rar-${slot.rarity}">${head}<span>${this.choiceHtml(item, { effect: slot.effect, rarity: slot.rarity })}</span><small class="slot-meta">${slot.offer ? "Candidates waiting" : ""}${refined}${choicesLeft(slot) ? ` · ${choicesLeft(slot)} Choice${choicesLeft(slot) === 1 ? "" : "s"}` : ""}</small><button data-eq-slotopen="${index}">${slot.offer ? "Choose" : "Refine"}</button></li>`;
    }).join("")}</ul>`;
  }

  /** What a Refinement milestone brings, in words. */
  private milestoneText(item: EquipItem, reward: "choice" | "guarantee") {
    const cap = RARITY_TIERS[effectCap(item)].name;
    return reward === "choice" ? `a Choice: any substat, ${cap}` : `a guaranteed ${cap} candidate`;
  }

  /** One slot's screen: the effect held (CURRENT), any candidates on offer,
   * its Refinement and next milestone, and Refine, Improve and Choice. */
  private showSlot(id: string, index: number, note = "") {
    const item = findItem(this.e, id), slot = item?.slots[index];
    if (!item || !slot || index >= openSlotCount(item)) return;
    const { modal } = this.ctx;
    const current = slot.effect && slot.rarity ? `<div class="slot-current"><small>CURRENT</small><p>${this.choiceHtml(item, { effect: slot.effect, rarity: slot.rarity })}</p></div>` : "";
    const first = !slot.effect && !slot.offer ? `<p class="hint">This slot's first roll is free: ${EFFECT_CANDIDATES} candidates from the ${CATEGORIES[categoryOf(item)].name.toLowerCase()}'s substats; take the one you like.</p><div class="dialog-actions"><button id="eq-first">Roll (free)</button></div>` : "";
    modal.innerHTML = `<small>${nameOf(item).toUpperCase()} · SUBSTAT ${index + 1}</small><h2>${slot.effect ? "Refine" : "New substat slot"}</h2>
      ${note ? `<p class="warning">${note}</p>` : ""}${current}${this.offerHtml(item, slot)}${first}${this.refinementHtml(item, slot)}${this.slotActionsHtml(item, slot)}
      <div class="dialog-actions"><button id="eq-back">Back</button></div>`;
    if (!modal.open) modal.showModal();
    const after = (result: unknown) => {
      this.changed();
      this.showSlot(id, index, typeof result === "string" && REFUSALS[result as SlotRefusal] ? REFUSALS[result as SlotRefusal] : "");
    };
    onPress("#eq-back", () => this.showItem(id));
    onPress("#eq-first", () => after(this.game.equipment.firstRoll(id, index)));
    onPress("#eq-refine", () => after(this.game.equipment.refine(id, index)));
    onPress("#eq-keep", () => after(this.game.equipment.keepCurrent(id, index)));
    onPress("#eq-improve", () => after(this.game.equipment.improve(id, index)));
    onPress("#eq-choice", () => this.showChoice(id, index));
    modal.querySelectorAll<HTMLElement>("[data-eq-take]").forEach((b) => (b.onclick = () => after(this.game.equipment.takeCandidate(id, index, Number(b.dataset.eqTake)))));
  }

  /** The candidates a slot's roll offers, to take one of (or keep the current effect). */
  private offerHtml(item: EquipItem, slot: EffectSlot) {
    if (!slot.offer) return "";
    return `<div class="slot-offer"><small>${slot.effect ? "NEW CANDIDATES" : "CHOOSE ONE"}</small>${slot.offer.map((c, i) =>
      `<button class="slot-candidate rar-${c.rarity}" data-eq-take="${i}">${this.choiceHtml(item, c)}</button>`).join("")}
      ${slot.effect ? `<button id="eq-keep">Keep Current</button>` : ""}</div>`;
  }

  /** A slot's Refinement, the bar to its next guarantee and what its next milestone brings. */
  private refinementHtml(item: EquipItem, slot: EffectSlot) {
    if (!slot.effect) return "";
    const milestone = nextMilestone(slot), refinement = slot.refinement ?? 0;
    return `<div class="refine-progress"><small>REFINEMENT</small><p>Refinement: ${refinement} / ${milestone.at}</p>
      <div class="refine-bar"><span style="width:${Math.round(((refinement % REFINE_GUARANTEE_EVERY) / REFINE_GUARANTEE_EVERY) * 100)}%"></span></div>
      <p class="hint">Next milestone: ${this.milestoneText(item, milestone.reward)}. Every Refine counts, whatever you keep: every ${REFINE_GUARANTEE_EVERY}th guarantees ${article(RARITY_TIERS[effectCap(item)].name)} candidate, every ${REFINE_CHOICE_EVERY}th earns a Choice.</p></div>`;
  }

  /** Refine, Improve (while the effect is below the piece's cap) and Use a
   * Choice, with their prices, for a slot holding an effect and no offer. */
  private slotActionsHtml(item: EquipItem, slot: EffectSlot) {
    if (!slot.effect || slot.offer) return "";
    const mat = categoryOf(item), rc = refineCost(item), ic = improveCost(item);
    const canImprove = slot.rarity && rarityRank(slot.rarity) < rarityRank(effectCap(item));
    return `<p class="level-cost">Refine: ${this.costText(rc, mat)}</p>
      <div class="dialog-actions"><button id="eq-refine"${this.affords(rc, mat) ? "" : " disabled"}>Refine</button>
      ${canImprove ? `<button id="eq-improve"${this.affords(ic, mat) ? "" : " disabled"} title="${this.costText(ic, mat).replace(/<[^>]+>/g, "")}">Improve to ${RARITY_TIERS[EQUIP_RARITIES[rarityRank(slot.rarity!) + 1]].name}</button>` : ""}
      ${choicesLeft(slot) ? `<button id="eq-choice">Use a Choice (${choicesLeft(slot)})</button>` : ""}</div>
      ${canImprove ? `<p class="hint">Improve: the same substat one rarity higher, for ${this.costText(ic, mat)}.</p>` : ""}`;
  }

  /** Spending a Choice: every effect the slot may hold, by family, at the
   * item's highest effect rarity. */
  private showChoice(id: string, index: number) {
    const item = findItem(this.e, id);
    if (!item) return;
    const { modal } = this.ctx, cap = effectCap(item), pool = slotPool(item, index);
    const families = [...new Set(pool.map((d) => d.family))];
    modal.innerHTML = `<small>${nameOf(item).toUpperCase()} · SUBSTAT ${index + 1}</small><h2>Use a Choice</h2>
      <p class="hint">Take any of these at ${rarityTag(cap)}. Any candidates on offer go.</p>
      ${families.map((f) => `<h3 class="equip-heading">${FAMILIES[f].name}</h3>${pool.filter((d) => d.family === f).map((d) =>
        `<button class="slot-candidate rar-${cap}" data-eq-exact="${d.id}">${this.choiceHtml(item, { effect: d.id, rarity: cap })}</button>`).join("")}`).join("")}
      <div class="dialog-actions"><button id="eq-back">Back</button></div>`;
    el("eq-back").onclick = () => this.showSlot(id, index);
    modal.querySelectorAll<HTMLElement>("[data-eq-exact]").forEach((b) => (b.onclick = () => {
      this.game.equipment.spendChoice(id, index, b.dataset.eqExact!);
      this.changed();
      this.showSlot(id, index);
    }));
  }

  /** What each loadout's worn piece of the same category does, beside this one. */
  private compareWorn(item: EquipItem) {
    const category = categoryOf(item);
    const others = (["tower", "delve"] as const).map((m) => this.e.equipped[m][category]).filter((id, i, all): id is string => !!id && id !== item.id && all.indexOf(id) === i);
    if (!others.length) return "";
    return others.map((id) => {
      const worn = findItem(this.e, id)!;
      return `<div class="compare-box"><small>COMPARED WITH THE WORN ${CATEGORIES[category].name.toUpperCase()}</small>${this.compareTable(item, worn)}</div>`;
    }).join("");
  }

  /** Two pieces' open effects side by side, each kind once. */
  private compareTable(a: EquipItem, b: EquipItem) {
    const sum = (i: EquipItem) => {
      const t = new Map<string, number>();
      const main = pieceMain(i);
      if (main) t.set(`${main.kind}|`, main.value);
      for (const { def, rarity } of slotEffects(i)) t.set(`${def.kind}|${def.mode ?? ""}`, (t.get(`${def.kind}|${def.mode ?? ""}`) ?? 0) + slotValue(def, rarity));
      return t;
    };
    const ta = sum(a), tb = sum(b), keys = [...new Set([...ta.keys(), ...tb.keys()])];
    const cell = (t: Map<string, number>, key: string) => {
      const [kind, mode] = key.split("|");
      return t.has(key) ? effectText(kind as never, t.get(key)!, (mode || undefined) as Mode | undefined) : "—";
    };
    const head = (i: EquipItem) => `${nameOf(i)}<br>${rarityTag(i.rarity, i.stars)} Lv ${i.level}`;
    return `<table class="compare-table"><thead><tr><th>${head(a)}</th><th>${head(b)}</th></tr></thead><tbody>${keys.map((k) => `<tr><td>${cell(ta, k)}</td><td>${cell(tb, k)}</td></tr>`).join("")}</tbody></table>`;
  }

  private showCompare(a: string, b: string) {
    const ia = findItem(this.e, a), ib = findItem(this.e, b);
    if (!ia || !ib) return;
    const { modal } = this.ctx;
    modal.innerHTML = `<small>COMPARE</small><h2>${nameOf(ia)} and ${nameOf(ib)}</h2>${this.compareTable(ia, ib)}<div class="dialog-actions"><button id="eq-close">Close</button></div>`;
    modal.showModal();
    el("eq-close").onclick = () => modal.close();
  }

  /** Asks before dismantling `ids` (none locked or worn): how many, their
   * rarities, the materials returned, and a warning for valuable ones. */
  private confirmDismantle(ids: string[]) {
    const items = ids.map((id) => findItem(this.e, id)).filter((i): i is EquipItem => !!i && !isProtected(this.e, i));
    if (!items.length) return;
    const totals = salvageTotals(this.e, items.map((i) => i.id));
    const byRarity = EQUIP_RARITIES.map((r) => [r, items.filter((i) => i.rarity === r).length] as const).filter(([, n]) => n);
    const valuable = items.filter((i) => rarityRank(i.rarity) >= rarityRank("rare") || isUnique(i) || i.level > 0);
    const warn = valuable.length ? `<p class="warning">⚠ Includes ${valuable.length} valuable piece${valuable.length === 1 ? "" : "s"} (Rare or above, Unique or leveled): ${valuable.slice(0, 4).map((i) => `${nameOf(i)} ${rarityName(i)} Lv ${i.level}`).join(", ")}${valuable.length > 4 ? " …" : ""}. Upgrades are not returned.</p>` : "";
    const { modal } = this.ctx;
    modal.innerHTML = `<small>${ACTION_ICONS.dismantle} SALVAGE</small><h2>Dismantle ${items.length} piece${items.length === 1 ? "" : "s"}?</h2>
      <p>${byRarity.map(([r, n]) => `${n} ${rarityTag(r)}`).join(" ")}</p>
      <p class="salvage-total">Returns ${(Object.entries(totals) as [EquipMaterialId, number][]).map(([m, n]) => `${materialIcon(m)} +${n} ${EQUIP_MATERIALS[m].name}`).join(" · ")}</p>${warn}
      <p class="hint">This can't be undone.</p><div class="dialog-actions"><button id="eq-cancel">Keep them</button><button id="eq-do-dismantle" class="danger">Dismantle</button></div>`;
    modal.showModal();
    el("eq-cancel").onclick = () => modal.close();
    el("eq-do-dismantle").onclick = () => {
      const result = this.game.equipment.dismantle(items.map((i) => i.id));
      modal.close();
      if (typeof result === "string") return;
      this.selected.clear();
      this.ctx.save();
      this.rerender();
      // A light reward: each material gained rises from its balance.
      for (const [m, n] of Object.entries(result) as [EquipMaterialId, number][])
        riseFrom(document.querySelector<HTMLElement>(`#equip-materials [title^="${EQUIP_MATERIALS[m].name}"]`), `${materialIcon(m)} +${n}`);
    };
  }

}
