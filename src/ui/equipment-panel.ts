import type { Mode } from "../entities.ts";
import {
  CATEGORIES, CATEGORY_IDS, EQUIP_MATERIALS, EQUIP_MATERIAL_IDS, itemDef, materialOf, uniquesOf,
  type CategoryId, type EquipMaterialId,
} from "../equipment/catalog.ts";
import {
  EFFECT_CANDIDATES, EQUIP_RARITIES, EQUIPMENT_CAPACITY, PITY, PULL_GEMS, PULL_RATES, RARITY_TIERS, rarityRank, REFINE_CHOICE_EVERY, REFINE_GUARANTEE_EVERY,
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

/** The Equipment tab's views: what each hero wears, the pieces owned, the
 * forge (merging and salvage), and Gem pulls. */
type View = "loadout" | "inventory" | "forge" | "pulls";
const VIEWS: { id: View; name: string }[] = [
  { id: "loadout", name: "Equipped" }, { id: "inventory", name: "Inventory" }, { id: "forge", name: "Forge" }, { id: "pulls", name: "Acquire" },
];
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
const rarityTag = (r: EquipRarity) => `<span class="rarity-tag rar-${r}">${RARITY_TIERS[r].name}</span>`;
const matAmount = (id: EquipMaterialId, n: number) => `${materialIcon(id)}<b>${currencyAmount(n)}</b>`;

/** The Equipment screen, inside the Gear page (and opened by the forest's
 * Blacksmith). Each view is drawn from the save; presses go through the
 * game's EquipmentDesk. */
export class EquipmentPanel {
  private view: View = "loadout";
  /** The loadout shown: the board's mode when the page opens. */
  private mode: Mode = "tower";
  private category: CategoryId | "all" = "all";
  private rarity: EquipRarity | "all" = "all";
  private sort: SortKey = "rarity";
  private selecting = false;
  private selected = new Set<string>();
  private pullCategory: CategoryId = "weapon";

  constructor(private ctx: AppContext) {}

  private get game() {
    return this.ctx.game;
  }
  private get e() {
    return this.ctx.game.save.equipment;
  }

  /** Opens on the loadout of the mode the board shows. */
  opened() {
    this.view = "loadout";
    this.mode = this.game.mode;
    this.selected.clear();
    this.selecting = false;
  }

  html() {
    const body = this.view === "loadout" ? this.loadoutHtml() : this.view === "inventory" ? this.inventoryHtml()
      : this.view === "forge" ? this.forgeHtml() : this.pullsHtml();
    return `${this.materialsHtml()}<div class="tree-tabs equip-views" role="group" aria-label="Equipment views">${VIEWS.map((v) =>
      `<button data-eq-view="${v.id}" aria-pressed="${this.view === v.id}">${v.name}</button>`).join("")}</div>${body}`;
  }

  /** The nine material balances, and Gold, always in sight. */
  private materialsHtml() {
    const mats = EQUIP_MATERIAL_IDS.map((m) => `<span class="mat-balance" title="${EQUIP_MATERIALS[m].name}: ${EQUIP_MATERIALS[m].description}">${matAmount(m, this.e.materials[m])}</span>`).join("");
    return `<div class="equip-materials" id="equip-materials" aria-label="Upgrade materials"><span class="mat-balance" title="Gold">${uiSprite("gold", "ui-sprite gold-icon")}<b>${devAmount(this.game, this.game.save.gold)}</b></span>${mats}</div>`;
  }

  // --- Views ---

  private loadoutHtml() {
    const worn = this.e.equipped[this.mode];
    const modes = this.game.save.upgrades.delve
      ? `<div class="tree-tabs equip-modes" role="group" aria-label="Loadout">${(["tower", "delve"] as const).map((m) =>
        `<button data-eq-mode="${m}" aria-pressed="${this.mode === m}">${uiSprite(m)} ${MODE_NAMES[m]}</button>`).join("")}</div>
        <p class="hint">Each mode's hero wears its own pieces from the shared inventory. <button class="link-button" data-eq-copy="${this.mode === "tower" ? "delve" : "tower"}">Copy the ${MODE_NAMES[this.mode === "tower" ? "delve" : "tower"]} loadout here</button></p>` : "";
    const slots = CATEGORY_IDS.map((c) => {
      const item = worn[c] ? findItem(this.e, worn[c]!) : undefined;
      const body = item ? `<h3>${nameOf(item)}</h3><p class="item-meta">${rarityTag(item.rarity)} Lv ${item.level}/${maxLevel(item)}</p>` : `<h3 class="empty-slot">Empty</h3><p class="item-meta">Tap to choose</p>`;
      return `<button class="equip-slot${item ? ` rar-${item.rarity}` : ""}" data-eq-slot="${c}"><span class="equip-icon-frame${item ? ` rar-${item.rarity}` : ""}">${categoryIcon(c)}</span><span><small>${CATEGORIES[c].name.toUpperCase()}</small>${body}</span></button>`;
    }).join("");
    const totals = equipmentEffects(this.e, this.mode), lines = (Object.entries(totals) as [keyof typeof totals, number][]).filter(([, v]) => v);
    const summary = lines.length ? `<ul class="effect-list">${lines.map(([k, v]) => `<li>${effectText(k, v)}</li>`).join("")}</ul>` : `<p class="hint">Nothing worn yet: tap a slot to choose a piece.</p>`;
    return `${modes}<div class="equip-slots">${slots}</div><h3 class="equip-heading">${MODE_NAMES[this.mode]} loadout totals</h3>${summary}`;
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
    const head = `<p class="hint equip-count">${this.e.items.length} / ${EQUIPMENT_CAPACITY} pieces</p>`;
    const actions = this.selecting ? this.selectionBar() : "";
    const list = items.length ? `<div class="equip-grid">${items.map((i) => this.itemCard(i)).join("")}</div>`
      : `<p class="hint">${this.e.items.length ? "No pieces match these filters." : "No equipment yet. Bosses from floor 60 drop Standard pieces, and Gem pulls in Acquire bring Unique ones."}</p>`;
    return head + this.filtersHtml() + actions + list;
  }

  /** The selection's actions: dismantle what can be, compare two. */
  private selectionBar() {
    const chosen = [...this.selected].map((id) => findItem(this.e, id)).filter((i): i is EquipItem => !!i);
    const compare = chosen.length === 2 ? `<button data-eq-compare="1">Compare</button>` : "";
    return `<div class="equip-selection"><span>${chosen.length} selected</span><button data-eq-select="none"${chosen.length ? "" : " disabled"}>Clear</button>${compare}<button class="danger" data-eq-dismantle="selected"${chosen.length ? "" : " disabled"}>${ACTION_ICONS.dismantle} Dismantle</button></div>`;
  }

  /** One piece as a card: icon, name, category, rarity (word and border),
   * level, what it does, and whether it is worn or locked. */
  private itemCard(item: EquipItem, action = "eq-item") {
    const def = itemDef(item.def)!, worn = wornIn(this.e, item.id), selected = this.selected.has(item.id);
    const blocked = this.selecting && isProtected(this.e, item);
    const flags = [
      ...worn.map((m) => `<span class="equip-flag worn" title="Worn in the ${MODE_NAMES[m]}">${uiSprite(m, "ui-sprite flag-sprite")}E</span>`),
      ...(item.locked ? [`<span class="equip-flag locked" title="Locked">${ACTION_ICONS.lock}</span>`] : []),
    ].join("");
    const lines = itemLines(item).filter((l) => l.open).map((l) => effectText(l.line.kind, l.value, l.line.mode)).join(" · ");
    const slots = slotPlan(item).map(({ slot, open }) => {
      const def = slot?.effect ? slotEffectDef(slot.effect) : undefined;
      return def && slot?.rarity ? `<span class="slot-chip rar-${slot.rarity}">${slotEffectName(def, slot.rarity)}</span>` : `<span class="slot-chip ${open ? "slot-empty" : "slot-locked"}">${open ? "Empty" : "Locked"}</span>`;
    }).join("");
    return `<button class="equip-card rar-${item.rarity}${selected ? " selected" : ""}" data-${action}="${item.id}"${blocked ? ` disabled title="Locked or worn: unlock or take it off first"` : ""} aria-pressed="${this.selecting ? selected : false}">
      <span class="equip-icon-frame rar-${item.rarity}">${categoryIcon(def.category)}<span class="rarity-mark">${RARITY_TIERS[item.rarity].mark}</span></span>
      <span class="equip-card-body"><small>${CATEGORIES[def.category].name.toUpperCase()} · ${def.class === "unique" ? "UNIQUE" : "STANDARD"}</small>
      <strong>${def.name}</strong><span class="item-meta">${rarityTag(item.rarity)} Lv ${item.level}/${maxLevel(item)} ${flags}</span>
      <span class="item-lines">${lines}</span><span class="item-slots">${slots}</span>${def.class === "unique" ? `<span class="item-identity">${def.identity}</span>` : ""}</span></button>`;
  }

  private forgeHtml() {
    // Each definition and rarity with enough unprotected copies to merge.
    const sets = new Map<string, EquipItem[]>();
    for (const i of this.e.items) {
      if (!RARITY_TIERS[i.rarity].next) continue;
      const key = `${i.def}|${i.rarity}`;
      sets.set(key, [...(sets.get(key) ?? []), i]);
    }
    const ready = [...sets.values()].filter((group) => group.some((t) => mergeFodder(this.e, t).length >= RARITY_TIERS[t.rarity].merge - 1));
    const merges = ready.length ? ready.map((group) => {
      const target = [...group].sort((a, b) => b.level - a.level || idNumber(a) - idNumber(b))[0];
      return `<div class="forge-row"><span class="equip-icon-frame rar-${target.rarity}">${categoryIcon(categoryOf(target))}</span><span><strong>${nameOf(target)}</strong> ${rarityTag(target.rarity)} × ${group.length}</span><button data-eq-merge="${target.id}">${ACTION_ICONS.merge} Merge</button></div>`;
    }).join("") : `<p class="hint">Three copies of the same piece at the same rarity merge into one of the next rarity. None are ready yet.</p>`;
    const quick = EQUIP_RARITIES.map((r) => {
      const n = this.e.items.filter((i) => i.rarity === r && !isProtected(this.e, i)).length;
      return `<button data-eq-salvage-all="${r}"${n ? "" : " disabled"}>${ACTION_ICONS.dismantle} All ${RARITY_TIERS[r].name} (${n})</button>`;
    }).join("");
    const salvage = EQUIP_RARITIES.map((r) => `${RARITY_TIERS[r].name} ${RARITY_TIERS[r].salvage}`).join(" · ");
    return `<h3 class="equip-heading">${ACTION_ICONS.merge} Merge</h3><p class="hint">Merging keeps the piece you choose, with its level; the other two copies are used up.</p>${merges}
      <h3 class="equip-heading">${ACTION_ICONS.dismantle} Salvage</h3><p class="hint">Dismantling breaks a piece into its category's material (${salvage}; Unique pieces twice that). Upgrades put into it are not returned. Locked and worn pieces are never included.</p>
      <div class="equip-quick">${quick}</div><p class="hint">Or choose pieces one by one: Inventory, then Select.</p>`;
  }

  private pullsHtml() {
    const c = this.pullCategory, gems = this.game.save.gems;
    const cats = CATEGORY_IDS.map((id) => `<button class="pull-cat" data-eq-pullcat="${id}" aria-pressed="${c === id}">${categoryIcon(id)}<span>${CATEGORIES[id].name}</span><small>${this.e.pity[id]}/${PITY}</small></button>`).join("");
    const pool = uniquesOf(c).map((d) => `<li><strong>${d.name}</strong>: ${d.identity}</li>`).join("");
    const rates = EQUIP_RARITIES.map((r) => `${rarityTag(r)} ${PULL_RATES[r]}%`).join(" ");
    const button = (n: PullCount) => {
      const short = !this.game.free && gems < PULL_GEMS[n];
      return `<button class="gem-buy${short ? " short" : ""}" data-eq-pull="${n}">Pull ×${n} · ${gemIcon()} <span class="price">${PULL_GEMS[n]}</span></button>`;
    };
    return `<p class="hint">Choose a category, then pull: each pull brings one of its three Unique pieces at a rolled rarity. Bosses never drop Unique pieces.</p>
      <div class="pull-cats">${cats}</div>
      <div class="pull-box"><h3>${categoryIcon(c)} ${CATEGORIES[c].plural}</h3><ul class="pull-pool">${pool}</ul>
      <p class="hint">Rates: ${rates}. Pity: ${this.e.pity[c]}/${PITY}. The ${PITY}th pull in a row without a Rare ${CATEGORIES[c].name.toLowerCase()} is a Rare; each category counts its own.</p>
      <div class="pull-buttons">${button(1)}${button(10)}</div><p class="hint">${gemIcon()} ${devAmount(this.game, gems)} held</p></div>`;
  }

  // --- Presses ---

  /** Click handlers by data attribute; each gets that attribute's value. */
  bind() {
    const handlers: Record<string, (v: string, b: HTMLElement) => void> = {
      eqView: (v) => { this.view = v as View; this.selecting = false; this.selected.clear(); this.rerender(); },
      eqMode: (v) => { this.mode = v as Mode; this.rerender(); },
      eqCopy: (v) => { this.game.equipment.copyLoadout(v as Mode, this.mode); this.changed(); },
      eqSlot: (v) => this.chooseFor(v as CategoryId),
      eqCat: (v) => { this.category = v as CategoryId | "all"; this.rerender(); },
      eqRar: (v) => { this.rarity = v as EquipRarity | "all"; this.rerender(); },
      eqSelect: (v) => {
        if (v === "toggle") this.selecting = !this.selecting;
        this.selected.clear();
        this.rerender();
      },
      eqItem: (v) => {
        if (!this.selecting) return this.showItem(v);
        if (this.selected.has(v)) this.selected.delete(v);
        else this.selected.add(v);
        this.rerender();
      },
      eqCompare: () => { const [a, b] = [...this.selected]; this.showCompare(a, b); },
      eqDismantle: () => this.confirmDismantle([...this.selected]),
      eqMerge: (v) => this.showMerge(v),
      eqSalvageAll: (v) => this.confirmDismantle(this.e.items.filter((i) => i.rarity === v && !isProtected(this.e, i)).map((i) => i.id)),
      eqPullcat: (v) => { this.pullCategory = v as CategoryId; this.rerender(); },
      eqPull: (v) => this.pull(Number(v) as PullCount),
    };
    for (const [key, handle] of Object.entries(handlers)) {
      const attr = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      document.querySelectorAll<HTMLElement>(`#gear [data-${attr}]`).forEach((b) => (b.onclick = () => handle(b.dataset[key]!, b)));
    }
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

  /** A slot pressed: the pieces of its category to wear, the one worn first. */
  private chooseFor(category: CategoryId) {
    const { modal } = this.ctx, wornId = this.e.equipped[this.mode][category];
    const items = this.e.items.filter((i) => categoryOf(i) === category)
      .sort((a, b) => Number(b.id === wornId) - Number(a.id === wornId) || rarityRank(b.rarity) - rarityRank(a.rarity) || b.level - a.level);
    const list = items.length ? `<div class="equip-grid modal-list">${items.map((i) => this.itemCard(i, "eq-pick")).join("")}</div>` : `<p class="hint">No ${CATEGORIES[category].plural.toLowerCase()} owned yet.</p>`;
    modal.innerHTML = `<small>${MODE_NAMES[this.mode].toUpperCase()} LOADOUT</small><h2>${categoryIcon(category)} ${CATEGORIES[category].name}</h2><p class="hint">${CATEGORIES[category].role}.</p>${list}
      <div class="dialog-actions">${wornId ? `<button id="eq-unequip">Take off</button>` : ""}<button id="eq-close">Close</button></div>`;
    modal.showModal();
    el("eq-close").onclick = () => modal.close();
    const off = document.querySelector<HTMLButtonElement>("#eq-unequip");
    if (off) off.onclick = () => { this.game.equipment.unequip(this.mode, category); modal.close(); this.changed(); };
    modal.querySelectorAll<HTMLElement>("[data-eq-pick]").forEach((b) => (b.onclick = () => this.showItem(b.dataset.eqPick!)));
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
    const mergeButton = next ? `<button id="eq-merge"${fodder.length >= RARITY_TIERS[item.rarity].merge - 1 ? "" : " disabled"} title="Needs ${RARITY_TIERS[item.rarity].merge - 1} more unlocked, unworn copies">${ACTION_ICONS.merge} Merge (${fodder.length}/${RARITY_TIERS[item.rarity].merge - 1})</button>` : "";
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
    on("#eq-merge", () => this.showMerge(item.id));
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
      <p class="hint">Next milestone: ${this.milestoneText(item, milestone.reward)}. Every Refine counts, whatever you keep: every ${REFINE_GUARANTEE_EVERY}th guarantees a ${RARITY_TIERS[effectCap(item)].name} candidate, every ${REFINE_CHOICE_EVERY}th earns a Choice.</p></div>` : "";
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

  /** The merge for `targetId`: it survives; the player picks the copies used
   * up (the two lowest-level ones at first), warned when they were leveled. */
  private showMerge(targetId: string) {
    const target = findItem(this.e, targetId);
    if (!target) return;
    const t = RARITY_TIERS[target.rarity], next = t.next;
    if (!next) return;
    const need = t.merge - 1, fodder = mergeFodder(this.e, target);
    const chosen = new Set(fodder.slice(0, need).map((i) => i.id));
    const blocked = this.e.items.filter((i) => i.id !== target.id && i.def === target.def && i.rarity === target.rarity && isProtected(this.e, i));
    const { modal } = this.ctx;
    const draw = () => {
      const picked = fodder.filter((i) => chosen.has(i.id));
      const lost = picked.filter((i) => i.level > 1 || i.spent);
      const unlocks = itemDef(target.def)!.effects.filter((l) => l.from === next).map((l) => effectText(l.kind, lineValue(l, next, target.level), l.mode));
      const list = fodder.map((i) => `<label class="merge-pick"><input type="checkbox" data-merge-pick="${i.id}"${chosen.has(i.id) ? " checked" : ""}> ${nameOf(i)} ${rarityTag(i.rarity)} Lv ${i.level}</label>`).join("");
      const blockedList = blocked.length ? `<p class="hint">Not offered (locked or worn): ${blocked.map((i) => `${nameOf(i)} Lv ${i.level}`).join(", ")}.</p>` : "";
      const warning = lost.length ? `<p class="warning">⚠ ${lost.length === 1 ? "One copy has" : `${lost.length} copies have`} been leveled: what was put into ${lost.length === 1 ? "it" : "them"} (${currencyAmount(lost.reduce((n, i) => n + (i.spent?.gold ?? 0), 0))} Gold, ${lost.reduce((n, i) => n + (i.spent?.material ?? 0), 0)} material) is lost.</p>` : "";
      modal.innerHTML = `<small>${ACTION_ICONS.merge} MERGE</small><h2>${nameOf(target)}</h2>
        <p>${rarityTag(target.rarity)} Lv ${target.level} → ${rarityTag(next)} Lv ${target.level} (up to ${RARITY_TIERS[next].maxLevel})</p>
        ${unlocks.length ? `<p class="hint">Unlocks: ${unlocks.join(" · ")}</p>` : ""}
        <p class="hint">It keeps its effect slots, their effects and Refinement. Its slots may then hold ${RARITY_TIERS[next].name} effects, and leveling it to ${RARITY_TIERS[next].slotLevel} opens effect slot ${rarityRank(next) + 1}.</p>
        <p class="hint">Choose ${need} copies to use up (${picked.length}/${need}). The piece you opened survives.</p><div class="merge-list">${list}</div>${blockedList}${warning}
        <div class="dialog-actions"><button id="eq-cancel">Cancel</button><button id="eq-do-merge"${picked.length === need ? "" : " disabled"}>${ACTION_ICONS.merge} Merge</button></div>`;
      modal.querySelectorAll<HTMLInputElement>("[data-merge-pick]").forEach((box) => (box.onchange = () => {
        if (box.checked) chosen.add(box.dataset.mergePick!);
        else chosen.delete(box.dataset.mergePick!);
        draw();
      }));
      el("eq-cancel").onclick = () => modal.close();
      el("eq-do-merge").onclick = () => {
        const result = this.game.equipment.merge(target.id, picked.map((i) => i.id));
        if (typeof result === "string") return;
        this.changed();
        this.showItem(target.id);
      };
    };
    draw();
    if (!modal.open) modal.showModal();
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

  /** `count` Gem pulls in the chosen category, then every result in one dialog. */
  private pull(count: PullCount) {
    const result = this.game.equipment.pull(this.pullCategory, count);
    if (result === "gems") return askForGems(this.ctx);
    const { modal } = this.ctx;
    if (result === "room" || result === "locked") {
      modal.innerHTML = `<h2>No room</h2><p>The inventory holds ${EQUIPMENT_CAPACITY} pieces. Dismantle some in the Forge to make room for ${count}.</p><div class="dialog-actions"><button id="eq-close">Close</button></div>`;
      modal.showModal();
      el("eq-close").onclick = () => modal.close();
      return;
    }
    this.ctx.save();
    this.ctx.update();
    this.rerender();
    const cards = result.map(({ item, pity }) => `<div class="pull-result rar-${item.rarity}"><span class="equip-icon-frame rar-${item.rarity}">${categoryIcon(categoryOf(item))}<span class="rarity-mark">${RARITY_TIERS[item.rarity].mark}</span></span><strong>${nameOf(item)}</strong>${rarityTag(item.rarity)}${pity ? `<small>Pity</small>` : ""}</div>`).join("");
    const rares = result.filter((r) => r.item.rarity === "rare").length;
    modal.innerHTML = `<small>${CATEGORIES[this.pullCategory].plural.toUpperCase()} · ${count} PULL${count === 1 ? "" : "S"}</small><h2>${rares ? `${rares} Rare!` : "Pulled"}</h2>
      <div class="pull-results">${cards}</div><p class="hint">Pity now ${this.e.pity[this.pullCategory]}/${PITY}.</p><div class="dialog-actions"><button id="eq-close">Close</button></div>`;
    modal.showModal();
    el("eq-close").onclick = () => modal.close();
  }
}
