import type { Mode } from "../entities.ts";
import {
  CATEGORIES, CATEGORY_IDS, EQUIP_MATERIALS, EQUIP_MATERIAL_IDS, itemDef, materialOf, uniquesOf,
  type CategoryId, type EquipMaterialId,
} from "../equipment/catalog.ts";
import {
  EFFECT_CANDIDATES, EQUIP_RARITIES, EQUIPMENT_CAPACITY, PITY, PULL_ALL_DISCOUNT, PULL_GEMS, PULL_RATES, pullGems, RARITY_TIERS, rarityRank, REFINE_CHOICE_EVERY, REFINE_GUARANTEE_EVERY,
  type EquipRarity, type PullCount,
} from "../equipment/balance.ts";
import {
  categoryOf, findItem, isProtected, levelCost, maxLevel, mergeFodder, openSlotCount, salvageTotals, wornIn,
  type EffectChoice, type EquipItem,
} from "../equipment/inventory.ts";
import { effectText, equipmentEffects, itemLines, lineValue } from "../equipment/effects.ts";
import { FAMILIES, slotEffectDef, slotEffectName, slotValue } from "../equipment/slot-effects.ts";
import {
  choicesLeft, effectCap, improveCost, nextMilestone, refineCost, slotEffects, slotPlan, slotPool, type SlotRefusal,
} from "../equipment/slots.ts";
import type { AppContext } from "./app.ts";
import { askForGems } from "./dialogs.ts";
import { el, gemIcon, riseFrom, uiSprite } from "./dom.ts";
import { currencyAmount, devAmount } from "./hud.ts";
import { ACTION_ICONS, categoryIcon, materialIcon } from "./equipment-icons.ts";
import { playSlagMerge } from "./slag-merge.ts";

/** The Equipment screen's views, chosen by the tabs along its bottom: the
 * list (the loadout over the inventory), Assemble (merging) and Acquire
 * (Gem pulls). */
type View = "list" | "assemble" | "pulls";
const VIEWS: { id: View; name: string }[] = [{ id: "list", name: "List" }, { id: "assemble", name: "Assemble" }, { id: "pulls", name: "Acquire" }];
type SortKey = "rarity" | "level" | "category" | "newest" | "name";
const SORTS: { id: SortKey; name: string }[] = [
  { id: "rarity", name: "Rarity" }, { id: "level", name: "Level" }, { id: "category", name: "Category" }, { id: "newest", name: "Newest" }, { id: "name", name: "Name" },
];
const MODE_NAMES: Record<Mode, string> = { tower: "Tower", delve: "Delve" };
/** Why a slot command was refused, for the player. */
const REFUSALS: Partial<Record<SlotRefusal, string>> = {
  gold: "Not enough Gold.", material: "Not enough material.", offered: "Choose a candidate or keep the current effect first.",
};
const idNumber = (item: EquipItem) => Number(item.id.slice(1));
const nameOf = (item: EquipItem) => itemDef(item.def)!.name;
/** "a Rare", "an Uncommon". */
const article = (word: string) => `${/^[AEIOU]/.test(word) ? "an" : "a"} ${word}`;
const rarityTag = (r: EquipRarity) => `<span class="rarity-tag rar-${r}">${RARITY_TIERS[r].name}</span>`;
const matAmount = (id: EquipMaterialId, n: number) => `${materialIcon(id)}<b>${currencyAmount(n)}</b>`;
/** The loadout's nine slots as a 3×3 grid laid out like the hero: the
 * helmet, chestplate and boots down the middle, the ring and amulet at the
 * top corners, the weapon and cape at the sides, the gloves and belt at the
 * bottom corners. */
const GRID: readonly CategoryId[] = ["ring", "helmet", "amulet", "weapon", "chestplate", "cape", "gloves", "boots", "belt"];

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
    const body = this.view === "list" ? this.listHtml() : this.view === "assemble" ? this.assembleHtml() : this.pullsHtml();
    const ready = this.mergeable().length > 0;
    return `${this.materialsHtml()}<div class="eq-screen">${body}</div>
      <div class="eq-views" role="group" aria-label="Equipment views">${VIEWS.map((v) =>
        `<button data-eq-view="${v.id}" aria-pressed="${this.view === v.id}">${v.name}${v.id === "assemble" && ready ? `<span class="eq-new" title="A piece is ready to assemble">N</span>` : ""}</button>`).join("")}</div>`;
  }

  /** The nine material balances, and Gold, always in sight. */
  private materialsHtml() {
    const mats = EQUIP_MATERIAL_IDS.map((m) => `<span class="mat-balance" title="${EQUIP_MATERIALS[m].name}: ${EQUIP_MATERIALS[m].description}">${matAmount(m, this.e.materials[m])}</span>`).join("");
    return `<div class="equip-materials" id="equip-materials" aria-label="Upgrade materials"><span class="mat-balance" title="Gold">${uiSprite("gold", "ui-sprite gold-icon")}<b>${devAmount(this.game, this.game.save.gold)}</b></span>${mats}</div>`;
  }

  /** A piece as a square tile: its icon on its rarity's colour, the rarity
   * mark, its level, a check when the shown loadout wears it, a lock. */
  private tile(item: EquipItem, attr: string, extra = "") {
    const def = itemDef(item.def)!, worn = this.e.equipped[this.mode][def.category] === item.id;
    const label = `${def.name}, ${RARITY_TIERS[item.rarity].name}, Level ${item.level}${worn ? `, worn in the ${MODE_NAMES[this.mode]}` : ""}${item.locked ? ", locked" : ""}`;
    return `<button class="eq-tile rar-${item.rarity}${extra}" data-${attr}="${item.id}" title="${label}" aria-label="${label}">${categoryIcon(def.category, "eq-tile-icon")}
      <span class="eq-tile-mark">${RARITY_TIERS[item.rarity].mark}</span><span class="eq-tile-level">${item.level}</span>
      ${worn ? `<span class="eq-tile-worn" aria-hidden="true">✓</span>` : ""}${item.locked ? `<span class="eq-tile-lock">${ACTION_ICONS.lock}</span>` : ""}${def.class === "unique" ? `<span class="eq-tile-unique" aria-hidden="true">★</span>` : ""}</button>`;
  }
  /** An empty place for a piece of `category`, its icon dimmed. */
  private ghost(category: CategoryId, attr = "", label = CATEGORIES[category].name) {
    return `<${attr ? "button" : "span"} class="eq-tile eq-ghost"${attr} title="${label}" aria-label="${label}">${categoryIcon(category, "eq-tile-icon")}</${attr ? "button" : "span"}>`;
  }

  // --- List: the loadout over the inventory ---

  private listHtml() {
    return this.loadoutHtml() + this.inventoryHtml();
  }

  /** The mode's loadout: its switch at the top left, the nine slots in a
   * 3×3 grid shaped like the hero, and what they add up to. A worn piece
   * opens its details; an empty slot shows only that category below. */
  private loadoutHtml() {
    const worn = this.e.equipped[this.mode], delve = !!this.game.save.upgrades.delve, other = this.mode === "tower" ? "delve" : "tower";
    const slots = GRID.map((c) => {
      const item = worn[c] ? findItem(this.e, worn[c]!) : undefined;
      const name = item ? `<small class="eq-slot-name rar-${item.rarity}">${nameOf(item)}</small>` : `<small class="eq-slot-name">${CATEGORIES[c].name}</small>`;
      return `<div class="eq-slot${item ? ` rar-${item.rarity}` : ""}">${item ? this.tile(item, "eq-item") : this.ghost(c, ` data-eq-slot="${c}"`, `${CATEGORIES[c].name}: empty`)}${name}</div>`;
    }).join("");
    const switcher = delve
      ? `<button class="eq-mode" data-eq-mode="${other}" title="Showing the ${MODE_NAMES[this.mode]} loadout: switch to the ${MODE_NAMES[other]}'s">${uiSprite(this.mode)}<span>${MODE_NAMES[this.mode]}</span><b aria-hidden="true">⇄</b></button>`
      : `<span class="eq-mode">${uiSprite(this.mode)}<span>${MODE_NAMES[this.mode]}</span></span>`;
    const totals = equipmentEffects(this.e, this.mode), lines = (Object.entries(totals) as [keyof typeof totals, number][]).filter(([, v]) => v);
    const summary = lines.length ? `<ul class="eq-totals">${lines.map(([k, v]) => `<li>${effectText(k, v)}</li>`).join("")}</ul>` : `<p class="eq-totals-empty">Nothing worn yet: tap a piece below to equip it.</p>`;
    const copy = delve ? `<button class="link-button eq-copy" data-eq-copy="${other}">Copy the ${MODE_NAMES[other]}'s</button>` : "";
    return `<div class="eq-loadout" aria-label="${MODE_NAMES[this.mode]} loadout"><div class="eq-loadout-head">${switcher}<h3>Loadout</h3>${copy}</div>
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
    const cats = `<div class="tree-tabs equip-filter" role="group" aria-label="Category"><button data-eq-cat="all" aria-pressed="${this.category === "all"}">All</button>${CATEGORY_IDS.map((c) =>
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
      : `<p class="hint">${this.e.items.length ? "No pieces match these filters." : "No equipment yet. Bosses from floor 60 drop Standard pieces, and Gem pulls in Acquire bring Unique ones."}</p>`;
    return head + this.filtersHtml() + actions + grid + this.salvageHtml();
  }

  /** The selection's actions: dismantle what can be, compare two. */
  private selectionBar() {
    const chosen = [...this.selected].map((id) => findItem(this.e, id)).filter((i): i is EquipItem => !!i);
    const compare = chosen.length === 2 ? `<button data-eq-compare="1">Compare</button>` : "";
    return `<div class="equip-selection"><span>${chosen.length} selected</span><button data-eq-select="none"${chosen.length ? "" : " disabled"}>Clear</button>${compare}<button class="danger" data-eq-dismantle="selected"${chosen.length ? "" : " disabled"}>${ACTION_ICONS.dismantle} Dismantle</button></div>`;
  }

  /** Quick salvage: every unprotected piece of a rarity at once. */
  private salvageHtml() {
    const quick = EQUIP_RARITIES.map((r) => {
      const n = this.e.items.filter((i) => i.rarity === r && !isProtected(this.e, i)).length;
      return `<button data-eq-salvage-all="${r}"${n ? "" : " disabled"}>${ACTION_ICONS.dismantle} All ${RARITY_TIERS[r].name} (${n})</button>`;
    }).join("");
    const salvage = EQUIP_RARITIES.map((r) => `${RARITY_TIERS[r].name} ${RARITY_TIERS[r].salvage}`).join(" · ");
    return `<details class="eq-salvage"><summary>${ACTION_ICONS.dismantle} Salvage</summary><p class="hint">Dismantling breaks a piece into its category's material (${salvage}; Unique pieces twice that). Upgrades put into it are not returned. Locked and worn pieces are never included; to choose pieces one by one, press Select.</p>
      <div class="equip-quick">${quick}</div></details>`;
  }

  // --- Assemble: three alike into the next rarity ---

  /** Every piece with enough unprotected copies to assemble, best first. */
  private mergeable() {
    return this.e.items.filter((i) => RARITY_TIERS[i.rarity].next && mergeFodder(this.e, i).length >= RARITY_TIERS[i.rarity].merge - 1)
      .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.level - a.level || idNumber(a) - idNumber(b));
  }

  /** Starts assembling `id`: the piece kept, with its lowest-level copies
   * chosen to use up. */
  private assemble(id: string) {
    const item = findItem(this.e, id);
    if (!item || !RARITY_TIERS[item.rarity].next) return;
    this.target = id;
    this.copies = mergeFodder(this.e, item).slice(0, RARITY_TIERS[item.rarity].merge - 1).map((i) => i.id);
    this.view = "assemble";
  }

  /** The result above its inputs (the piece kept, plus the copies used up),
   * what is still needed, and below it the pieces to choose from. */
  private assembleHtml() {
    const target = this.target ? findItem(this.e, this.target) : undefined;
    if (!target || !RARITY_TIERS[target.rarity].next) {
      this.target = null;
      const ready = this.mergeable();
      const list = ready.length ? `<div class="eq-grid">${ready.map((i) => this.tile(i, "eq-target")).join("")}</div>`
        : `<p class="hint">Three copies of the same piece at the same rarity assemble into one of the next rarity. None are ready yet: locked and worn copies don't count.</p>`;
      const empty = `<span class="eq-tile eq-ghost" aria-hidden="true"></span>`;
      return `<div class="eq-assemble"><p class="eq-formula"><b>3</b> alike <span class="eq-formula-arrow">→</span> <b>1</b> of the next rarity</p>
        <div class="eq-recipe"><span class="eq-inputs">${this.inputsHtml([empty, empty, empty])}</span><span class="eq-arrow" aria-hidden="true">▶</span><span class="eq-tile eq-ghost eq-result-slot" aria-hidden="true">?</span></div>
        <p class="eq-need">Choose the piece to keep</p></div><h3 class="eq-section">List</h3>${list}${this.assembleActions(false)}`;
    }
    const t = RARITY_TIERS[target.rarity], next = t.next!, need = t.merge - 1, category = categoryOf(target);
    const fodder = mergeFodder(this.e, target), copies = this.copies.map((id) => fodder.find((i) => i.id === id)).filter((i): i is EquipItem => !!i);
    const result = { ...target, rarity: next };
    const inputs = this.inputsHtml([this.tile(target, "eq-untarget", " eq-kept"),
      ...Array.from({ length: need }, (_, k) => copies[k] ? this.tile(copies[k], "eq-unpick") : this.ghost(category))]);
    const unlocks = itemDef(target.def)!.effects.filter((l) => l.from === next).map((l) => effectText(l.kind, lineValue(l, next, target.level), l.mode));
    const lost = copies.filter((i) => i.level > 1 || i.spent);
    const warning = lost.length ? `<p class="warning">⚠ ${lost.length === 1 ? "One copy has" : `${lost.length} copies have`} been leveled: what was put into ${lost.length === 1 ? "it" : "them"} (${currencyAmount(lost.reduce((n, i) => n + (i.spent?.gold ?? 0), 0))} Gold, ${lost.reduce((n, i) => n + (i.spent?.material ?? 0), 0)} material) is lost.</p>` : "";
    const blocked = this.e.items.filter((i) => i.id !== target.id && i.def === target.def && i.rarity === target.rarity && isProtected(this.e, i));
    const left = fodder.filter((i) => !this.copies.includes(i.id));
    const list = left.length ? `<div class="eq-grid">${left.map((i) => this.tile(i, "eq-pick")).join("")}</div>` : `<p class="hint">No other copies left to choose.</p>`;
    return `<div class="eq-assemble"><p class="eq-formula"><b>${t.merge}×</b> <span class="rar-${target.rarity} eq-need-name">${nameOf(target)}</span> ${rarityTag(target.rarity)} <span class="eq-formula-arrow">→</span> <b>1×</b> <span class="rar-${next} eq-need-name">${nameOf(target)}</span> ${rarityTag(next)}</p>
      <div class="eq-recipe"><span class="eq-inputs">${inputs}</span><span class="eq-arrow" aria-hidden="true">▶</span>${this.tile(result as EquipItem, "eq-result", " eq-result-slot")}</div>
      <p class="eq-need">${copies.length + 1} of ${t.merge} pieces chosen${copies.length === need ? ": ready to assemble" : `: choose ${need - copies.length} more below`}</p></div>
      <p class="hint">${rarityTag(target.rarity)} Lv ${target.level} → ${rarityTag(next)} Lv ${target.level} (up to ${RARITY_TIERS[next].maxLevel}). It keeps its effect slots, their effects and Refinement; leveling it to ${RARITY_TIERS[next].slotLevel} opens effect slot ${rarityRank(next) + 1}.${unlocks.length ? ` Unlocks: ${unlocks.join(" · ")}.` : ""}</p>
      ${warning}${blocked.length ? `<p class="hint">Not offered (locked or worn): ${blocked.map((i) => `${nameOf(i)} Lv ${i.level}`).join(", ")}.</p>` : ""}
      <h3 class="eq-section">List</h3>${list}${this.assembleActions(copies.length === need)}`;
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
      .map((i) => ({ category: categoryOf(i), rarity: i.rarity }));
    const result = this.game.equipment.merge(this.target, this.copies);
    if (typeof result === "string") return;
    const id = this.target;
    this.target = null;
    this.copies = [];
    this.changed();
    const item = findItem(this.e, id);
    if (item) playSlagMerge(going, { category: categoryOf(item), rarity: item.rarity }, this.game.save.settings.reduceMotion, () => this.showResult("Assemble Complete!", [item]));
  }

  // --- Acquire: Gem pulls ---

  private pullsHtml() {
    const c = this.pullCategory, all = c === "all", gems = this.game.save.gems;
    const off = `<span class="pull-off">−${PULL_ALL_DISCOUNT}%</span>`;
    const cats = `<button class="pull-cat pull-all" data-eq-pullcat="all" aria-pressed="${all}">${off}<span class="pull-all-icons">${GRID.slice(0, 4).map((id) => categoryIcon(id)).join("")}</span><span>All types</span><small>Discounted</small></button>`
      + CATEGORY_IDS.map((id) => `<button class="pull-cat" data-eq-pullcat="${id}" aria-pressed="${c === id}">${categoryIcon(id)}<span>${CATEGORIES[id].name}</span><small>${this.e.pity[id]}/${PITY}</small></button>`).join("");
    const rates = EQUIP_RARITIES.map((r) => `${rarityTag(r)} ${PULL_RATES[r]}%`).join(" ");
    const button = (n: PullCount) => {
      const price = pullGems(n, all), short = !this.game.free && gems < price;
      const was = all ? `<s class="was">${PULL_GEMS[n]}</s> ` : "";
      return `<button class="gem-buy${short ? " short" : ""}" data-eq-pull="${n}">Pull ×${n} · ${gemIcon()} ${was}<span class="price">${price}</span></button>`;
    };
    const box = all
      ? `<h3>All types ${off}</h3><p class="pull-deal">${PULL_ALL_DISCOUNT}% off: each pull brings a Unique piece of a random category, any of the nine.</p>
        <p class="hint">Rates: ${rates}. Each pull counts toward its own category's pity: the ${PITY}th in a row without a Rare in a category is a Rare.</p>`
      : `<h3>${categoryIcon(c)} ${CATEGORIES[c].plural}</h3><ul class="pull-pool">${uniquesOf(c).map((d) => `<li><strong>${d.name}</strong>: ${d.identity}</li>`).join("")}</ul>
        <p class="hint">Rates: ${rates}. Pity: ${this.e.pity[c]}/${PITY}. The ${PITY}th pull in a row without a Rare ${CATEGORIES[c].name.toLowerCase()} is a Rare; each category counts its own.</p>`;
    return `<p class="hint">Choose a category, or all types for ${PULL_ALL_DISCOUNT}% less, then pull: each pull brings a Unique piece at a rolled rarity. Bosses never drop Unique pieces.</p>
      <div class="pull-cats">${cats}</div>
      <div class="pull-box${all ? " pull-box-all" : ""}">${box}
      <div class="pull-buttons">${button(1)}${button(10)}</div><p class="hint">${gemIcon()} ${devAmount(this.game, gems)} held</p></div>`;
  }

  /** `count` Gem pulls in the chosen category, then every result at once. */
  private pull(count: PullCount) {
    const result = this.game.equipment.pull(this.pullCategory, count);
    if (result === "gems") return askForGems(this.ctx);
    const { modal } = this.ctx;
    if (result === "room" || result === "locked") {
      modal.innerHTML = `<h2>No room</h2><p>The inventory holds ${EQUIPMENT_CAPACITY} pieces. Dismantle some to make room for ${count}.</p><div class="dialog-actions"><button id="eq-close">Close</button></div>`;
      modal.showModal();
      el("eq-close").onclick = () => modal.close();
      return;
    }
    this.ctx.save();
    this.ctx.update();
    this.rerender();
    const rares = result.filter((r) => r.item.rarity === "rare").length;
    const c = this.pullCategory;
    this.showResult(rares ? `${rares} Rare!` : "Pull Complete!", result.map((r) => r.item), result.filter((r) => r.pity).map((r) => r.item.id),
      c === "all" ? "" : `Pity now ${this.e.pity[c]}/${PITY}.`);
  }

  /** The full screen shown after an assemble or a pull: what came of it,
   * each piece with its name and rarity, and OK. */
  private showResult(title: string, items: EquipItem[], pity: string[] = [], note = "") {
    const { modal } = this.ctx;
    const cards = items.map((item) => `<div class="eq-result-item">${this.tile(item, "eq-shown")}<strong>${nameOf(item)}</strong>${rarityTag(item.rarity)}${pity.includes(item.id) ? `<small>Pity</small>` : ""}</div>`).join("");
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
      eqSalvageAll: (v) => this.confirmDismantle(this.e.items.filter((i) => i.rarity === v && !isProtected(this.e, i)).map((i) => i.id)),
      eqTarget: (v) => { this.assemble(v); this.rerender(); },
      eqUntarget: () => { this.target = null; this.rerender(); },
      eqPick: (v) => {
        const target = this.target ? findItem(this.e, this.target) : undefined;
        if (target && this.copies.length < RARITY_TIERS[target.rarity].merge - 1) this.copies.push(v);
        this.rerender();
      },
      eqUnpick: (v) => { this.copies = this.copies.filter((id) => id !== v); this.rerender(); },
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
    const sort = document.querySelector<HTMLSelectElement>("#eq-sort");
    if (sort) sort.onchange = () => { this.sort = sort.value as SortKey; this.rerender(); };
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
    const { modal } = this.ctx, def = itemDef(item.def)!, category = def.category;
    const lines = itemLines(item).map(({ line, open, value }) =>
      `<li class="${open ? "" : "locked-line"}">${open ? "" : `<span class="unlock-at">${RARITY_TIERS[line.from!].name}:</span> `}${effectText(line.kind, open ? value : lineValue(line, line.from!, item.level), line.mode)}</li>`).join("");
    const cost = levelCost(item), free = this.game.free, mat = materialOf(category);
    const affordable = cost && (free || (this.game.save.gold >= cost.gold && this.e.materials[mat] >= cost.material));
    const level = cost
      ? `<p class="level-cost">Next level: ${uiSprite("gold", "ui-sprite gold-icon")} ${currencyAmount(cost.gold)} + ${materialIcon(mat)} ${cost.material} ${EQUIP_MATERIALS[mat].name}</p>
        <div class="dialog-actions"><button id="eq-level"${affordable ? "" : " disabled"}>${ACTION_ICONS.upgrade} Level up</button><button id="eq-level10"${affordable ? "" : " disabled"}>+10</button><button id="eq-levelmax"${affordable ? "" : " disabled"}>Max</button></div>`
      : `<p class="hint">At ${RARITY_TIERS[item.rarity].name}'s highest level.${RARITY_TIERS[item.rarity].next ? ` Merge to ${RARITY_TIERS[RARITY_TIERS[item.rarity].next!].name} to raise it to ${RARITY_TIERS[RARITY_TIERS[item.rarity].next!].maxLevel} and open effect slot ${rarityRank(RARITY_TIERS[item.rarity].next!) + 1} at Level ${RARITY_TIERS[RARITY_TIERS[item.rarity].next!].slotLevel}.` : ""}</p>`;
    const worn = wornIn(this.e, item.id);
    const equipButtons = (this.game.save.upgrades.delve ? (["tower", "delve"] as const) : (["tower"] as const)).map((m) => worn.includes(m)
      ? `<button data-eq-off="${m}">Take off (${MODE_NAMES[m]})</button>`
      : `<button data-eq-on="${m}">Equip (${MODE_NAMES[m]})</button>`).join("");
    const fodder = mergeFodder(this.e, item), next = RARITY_TIERS[item.rarity].next;
    const mergeButton = next ? `<button id="eq-merge"${fodder.length >= RARITY_TIERS[item.rarity].merge - 1 ? "" : " disabled"} title="Needs ${RARITY_TIERS[item.rarity].merge - 1} more unlocked, unworn copies">${ACTION_ICONS.merge} Assemble (${fodder.length}/${RARITY_TIERS[item.rarity].merge - 1})</button>` : "";
    const protectedNote = isProtected(this.e, item) ? `<p class="hint">${item.locked ? "Locked" : "Worn"}: it can't be dismantled or used up in a merge until you ${item.locked ? "unlock it" : "take it off"}.</p>` : "";
    const invested = item.spent ? `<p class="hint">Invested: ${currencyAmount(item.spent.gold)} Gold and ${item.spent.material} ${EQUIP_MATERIALS[mat].name}.</p>` : "";
    modal.innerHTML = `<small>${CATEGORIES[category].name.toUpperCase()} · ${def.class === "unique" ? "UNIQUE" : "STANDARD"}</small>
      <h2 class="equip-title"><span class="equip-icon-frame rar-${item.rarity}">${categoryIcon(category)}</span>${def.name}</h2>
      <p class="item-meta">${rarityTag(item.rarity)} Level ${item.level}/${maxLevel(item)}</p>${this.progressHtml(item)}<p class="item-identity">${def.identity}.</p>
      <h3 class="equip-heading">Intrinsic</h3><ul class="effect-list">${lines}</ul>
      <h3 class="equip-heading">Effect slots</h3>${this.slotsHtml(item)}${this.compareWorn(item)}${level}${invested}${protectedNote}
      <div class="dialog-actions">${equipButtons}<button id="eq-lock">${ACTION_ICONS.lock} ${item.locked ? "Unlock" : "Lock"}</button>${mergeButton}${isProtected(this.e, item) ? "" : `<button id="eq-dismantle" class="danger">${ACTION_ICONS.dismantle} Dismantle</button>`}<button id="eq-close">Close</button></div>`;
    modal.showModal();
    const on = (sel: string, fn: () => void) => { const b = document.querySelector<HTMLButtonElement>(sel); if (b) b.onclick = fn; };
    on("#eq-close", () => modal.close());
    const level1 = (n: number) => () => { this.game.equipment.levelUp(item.id, n); this.changed(); this.showItem(item.id); };
    on("#eq-level", level1(1));
    on("#eq-level10", level1(10));
    on("#eq-levelmax", level1(maxLevel(item)));
    on("#eq-lock", () => { this.game.equipment.setLocked(item.id, !item.locked); this.ctx.save(); this.rerender(); this.showItem(item.id); });
    on("#eq-merge", () => { modal.close(); this.assemble(item.id); this.rerender(); });
    on("#eq-dismantle", () => this.confirmDismantle([item.id]));
    modal.querySelectorAll<HTMLElement>("[data-eq-slotopen]").forEach((b) => (b.onclick = () => this.showSlot(item.id, Number(b.dataset.eqSlotopen))));
    modal.querySelectorAll<HTMLElement>("[data-eq-on]").forEach((b) => (b.onclick = () => { this.game.equipment.equip(b.dataset.eqOn as Mode, item.id); this.changed(); this.showItem(item.id); }));
    modal.querySelectorAll<HTMLElement>("[data-eq-off]").forEach((b) => (b.onclick = () => { this.game.equipment.unequip(b.dataset.eqOff as Mode, category); this.changed(); this.showItem(item.id); }));
  }

  /** Where `item` stands on its way up: the level cap, and what the next
   * rarity opens (a higher cap and another effect slot). */
  private progressHtml(item: EquipItem) {
    const next = RARITY_TIERS[item.rarity].next;
    if (!next) return `<p class="hint">Top rarity: every effect slot opens by leveling.</p>`;
    const t = RARITY_TIERS[next];
    return `<p class="hint">Next rarity: ${rarityTag(next)} raises the level cap to ${t.maxLevel}; Level ${t.slotLevel} then opens effect slot ${rarityRank(next) + 1}.</p>`;
  }

  /** An effect at a rarity on `item`: its name, rarity and what it does there. */
  private choiceHtml(item: EquipItem, choice: EffectChoice) {
    const def = slotEffectDef(choice.effect)!;
    return `<strong>${slotEffectName(def, choice.rarity)}</strong> ${rarityTag(choice.rarity)} <span class="slot-text">${effectText(def.kind, slotValue(def, choice.rarity, item.level), def.mode)}</span>`;
  }

  /** The item's effect slots: each open one's effect (or its free first
   * roll), its Refinement, and each locked one's requirement. */
  private slotsHtml(item: EquipItem) {
    return `<ul class="slot-list">${slotPlan(item).map(({ index, rarity, level, open, slot }) => {
      const head = `<small>EFFECT SLOT ${index + 1}</small>`;
      if (!open || !slot) {
        const needs = rarityRank(item.rarity) < rarityRank(rarity) ? ` · needs ${rarityTag(rarity)}` : "";
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
    return reward === "choice" ? `a Choice: any effect, ${cap}` : `a guaranteed ${cap} candidate`;
  }

  /** One slot's screen: the effect held (CURRENT), any candidates on offer,
   * its Refinement and next milestone, and Refine, Improve and Choice. */
  private showSlot(id: string, index: number, note = "") {
    const item = findItem(this.e, id), slot = item?.slots[index];
    if (!item || !slot || index >= openSlotCount(item)) return;
    const { modal } = this.ctx, free = this.game.free, mat = materialOf(categoryOf(item));
    const costText = (c: { gold: number; material: number }) => `${uiSprite("gold", "ui-sprite gold-icon")} ${currencyAmount(c.gold)} + ${materialIcon(mat)} ${c.material}`;
    const affords = (c: { gold: number; material: number }) => free || (this.game.save.gold >= c.gold && this.e.materials[mat] >= c.material);
    const current = slot.effect && slot.rarity ? `<div class="slot-current"><small>CURRENT</small><p>${this.choiceHtml(item, { effect: slot.effect, rarity: slot.rarity })}</p></div>` : "";
    const offer = slot.offer ? `<div class="slot-offer"><small>${slot.effect ? "NEW CANDIDATES" : "CHOOSE ONE"}</small>${slot.offer.map((c, i) =>
      `<button class="slot-candidate rar-${c.rarity}" data-eq-take="${i}">${this.choiceHtml(item, c)}</button>`).join("")}
      ${slot.effect ? `<button id="eq-keep">Keep Current</button>` : ""}</div>` : "";
    const milestone = nextMilestone(slot), refinement = slot.refinement ?? 0;
    const progress = slot.effect ? `<div class="refine-progress"><small>REFINEMENT</small><p>Refinement: ${refinement} / ${milestone.at}</p>
      <div class="refine-bar"><span style="width:${Math.round(((refinement % REFINE_GUARANTEE_EVERY) / REFINE_GUARANTEE_EVERY) * 100)}%"></span></div>
      <p class="hint">Next milestone: ${this.milestoneText(item, milestone.reward)}. Every Refine counts, whatever you keep: every ${REFINE_GUARANTEE_EVERY}th guarantees ${article(RARITY_TIERS[effectCap(item)].name)} candidate, every ${REFINE_CHOICE_EVERY}th earns a Choice.</p></div>` : "";
    const rc = refineCost(item), ic = improveCost(item);
    const canImprove = slot.rarity && rarityRank(slot.rarity) < rarityRank(effectCap(item));
    const actions = slot.effect && !slot.offer ? `<p class="level-cost">Refine: ${costText(rc)}</p>
      <div class="dialog-actions"><button id="eq-refine"${affords(rc) ? "" : " disabled"}>Refine</button>
      ${canImprove ? `<button id="eq-improve"${affords(ic) ? "" : " disabled"} title="${costText(ic).replace(/<[^>]+>/g, "")}">Improve to ${RARITY_TIERS[EQUIP_RARITIES[rarityRank(slot.rarity!) + 1]].name}</button>` : ""}
      ${choicesLeft(slot) ? `<button id="eq-choice">Use a Choice (${choicesLeft(slot)})</button>` : ""}</div>
      ${canImprove ? `<p class="hint">Improve: the same effect one rarity higher, for ${costText(ic)}.</p>` : ""}` : "";
    const first = !slot.effect && !slot.offer ? `<p class="hint">This slot's first roll is free: ${EFFECT_CANDIDATES} candidates from the ${CATEGORIES[categoryOf(item)].name.toLowerCase()}'s effects; take the one you like.</p><div class="dialog-actions"><button id="eq-first">Roll (free)</button></div>` : "";
    modal.innerHTML = `<small>${nameOf(item).toUpperCase()} · EFFECT SLOT ${index + 1}</small><h2>${slot.effect ? "Refine" : "New effect slot"}</h2>
      ${note ? `<p class="warning">${note}</p>` : ""}${current}${offer}${first}${progress}${actions}
      <div class="dialog-actions"><button id="eq-back">Back</button></div>`;
    if (!modal.open) modal.showModal();
    const on = (sel: string, fn: () => void) => { const b = document.querySelector<HTMLButtonElement>(sel); if (b) b.onclick = fn; };
    const after = (result: unknown) => {
      this.changed();
      this.showSlot(id, index, typeof result === "string" && REFUSALS[result as SlotRefusal] ? REFUSALS[result as SlotRefusal] : "");
    };
    on("#eq-back", () => this.showItem(id));
    on("#eq-first", () => after(this.game.equipment.firstRoll(id, index)));
    on("#eq-refine", () => after(this.game.equipment.refine(id, index)));
    on("#eq-keep", () => after(this.game.equipment.keepCurrent(id, index)));
    on("#eq-improve", () => after(this.game.equipment.improve(id, index)));
    on("#eq-choice", () => this.showChoice(id, index));
    modal.querySelectorAll<HTMLElement>("[data-eq-take]").forEach((b) => (b.onclick = () => after(this.game.equipment.takeCandidate(id, index, Number(b.dataset.eqTake)))));
  }

  /** Spending a Choice: every effect the slot may hold, by family, at the
   * item's highest effect rarity. */
  private showChoice(id: string, index: number) {
    const item = findItem(this.e, id);
    if (!item) return;
    const { modal } = this.ctx, cap = effectCap(item), pool = slotPool(item, index);
    const families = [...new Set(pool.map((d) => d.family))];
    modal.innerHTML = `<small>${nameOf(item).toUpperCase()} · EFFECT SLOT ${index + 1}</small><h2>Use a Choice</h2>
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
      for (const { line, open, value } of itemLines(i)) if (open) t.set(`${line.kind}|${line.mode ?? ""}`, (t.get(`${line.kind}|${line.mode ?? ""}`) ?? 0) + value);
      for (const { def, rarity } of slotEffects(i)) t.set(`${def.kind}|${def.mode ?? ""}`, (t.get(`${def.kind}|${def.mode ?? ""}`) ?? 0) + slotValue(def, rarity, i.level));
      return t;
    };
    const ta = sum(a), tb = sum(b), keys = [...new Set([...ta.keys(), ...tb.keys()])];
    const cell = (t: Map<string, number>, key: string) => {
      const [kind, mode] = key.split("|");
      return t.has(key) ? effectText(kind as never, t.get(key)!, (mode || undefined) as Mode | undefined) : "—";
    };
    const head = (i: EquipItem) => `${nameOf(i)}<br>${rarityTag(i.rarity)} Lv ${i.level}`;
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
    const valuable = items.filter((i) => i.rarity === "rare" || itemDef(i.def)!.class === "unique" || i.level > 1);
    const warn = valuable.length ? `<p class="warning">⚠ Includes ${valuable.length} valuable piece${valuable.length === 1 ? "" : "s"} (Rare, Unique or leveled): ${valuable.slice(0, 4).map((i) => `${nameOf(i)} ${RARITY_TIERS[i.rarity].name} Lv ${i.level}`).join(", ")}${valuable.length > 4 ? " …" : ""}. Upgrades are not returned.</p>` : "";
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
