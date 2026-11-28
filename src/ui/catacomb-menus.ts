// The Catacomb screen's menus (docs/CATACOMBS.md): Skills, Spirit, Forge
// and Academy as tabs in the tab bar, in place of the hand, with the open
// menu's panel over them and the abilities over that, as a run's hand sits
// over its tabs. Skills spends magic skill points, Spirit buys
// upgrades with Spirit; Forge and Academy open in later updates.
import { kitIcon } from "../sprites/kit.ts";
import { catacombMenuSprite } from "../sprites/catacombs.ts";
import { el, spiritIcon } from "./dom.ts";
import { controlIcon } from "./control-icon.ts";
import { MAGIC_SKILL_IDS, MAGIC_SKILLS, movePoint, pointsEarned, pointsSpent, skillLines, type MagicSkillId } from "../catacombs/magic.ts";
import { INGOTS, SPIRIT_RARITIES } from "../catacombs/catalog.ts";
import { ABILITIES, ABILITY_IDS, abilityUnlocked, canCast, castAbility, type AbilityId } from "../catacombs/abilities.ts";
import { buyUpgrade, SPIRIT_UPGRADE_IDS, SPIRIT_UPGRADES, upgradePrice, type SpiritUpgradeId } from "../catacombs/spirit-upgrades.ts";
import { catacombStatRows } from "../catacombs/summary.ts";
import type { CatacombSave } from "../catacombs/state.ts";

export type CatacombMenu = "skills" | "spirit" | "forge" | "academy";
const MENUS: readonly { id: CatacombMenu; name: string }[] = [
  { id: "skills", name: "Skills" }, { id: "spirit", name: "Spirit" }, { id: "forge", name: "Forge" }, { id: "academy", name: "Academy" },
];
/** What each menu still to come will do, and what it spends. */
const LATER: Record<"forge" | "academy", string> = {
  forge: "Spend Ingots to upgrade the Blacksmith's forge.",
  academy: "Spend Spirit on boosts outside the Catacombs.",
};
const titled = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const n = (v: number) => Math.floor(v).toLocaleString("en-US");
/** An effect's amount: a percent keeps its fraction (+0.2%), a flat amount is whole. */
const amount = (v: number, percent: boolean) => (percent ? `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}%` : n(v));

/** A skill box: its name and points of its cap; open, the − and + buttons
 * and a line for each effect, a point's worth and the total. */
export function skillBoxHtml(c: CatacombSave, id: MagicSkillId, open: boolean) {
  const points = c.points[id], free = pointsEarned(c.mxp) - pointsSpent(c.points), { name, cap } = MAGIC_SKILLS[id];
  const head = `<button type="button" class="catacomb-stat-head" data-skill="${id}" aria-expanded="${open}"><b>${name}</b><small>${n(points)}/${n(cap)}</small></button>`;
  if (!open) return `<div class="catacomb-stat" data-skill="${id}">${head}</div>`;
  const lines = skillLines(id, points).map((l) => `<li>${l.name} +${amount(l.per, l.percent)} a point · <b>+${amount(l.total, l.percent)}</b></li>`).join("");
  return `<div class="catacomb-stat open" data-skill="${id}">${head}<div class="catacomb-stat-body">` +
    `<div class="catacomb-stat-buttons"><button type="button" class="catacomb-point" data-skill="${id}" data-delta="-1" aria-label="Take a point from ${name}"${points < 1 ? " disabled" : ""}>−</button>` +
    `<button type="button" class="catacomb-point" data-skill="${id}" data-delta="1" aria-label="Put a point in ${name}"${free < 1 || points >= cap ? " disabled" : ""}>+</button></div>` +
    `<ul class="catacomb-stat-lines">${lines}</ul></div></div>`;
}

/** A Spirit upgrade: its name, level, what it does, and its next level's
 * price as a buy button (MAX once maxed, disabled while short of Spirit). */
export function upgradeHtml(c: CatacombSave, id: SpiritUpgradeId) {
  const u = SPIRIT_UPGRADES[id], level = c.upgrades[id], price = upgradePrice(c, id);
  const buy = price
    ? `<button type="button" class="catacomb-buy" data-upgrade="${id}" aria-label="Buy ${u.name} for ${n(price.amount)} ${titled(price.rarity)} Spirit"${c.spirit[price.rarity] < price.amount ? " disabled" : ""}>${spiritIcon(price.rarity)}<b>${n(price.amount)}</b></button>`
    : `<button type="button" class="catacomb-buy" disabled>MAX</button>`;
  return `<div class="catacomb-upgrade" data-upgrade="${id}"><div><b>${u.name}</b> <small>${n(level)}/${n(u.prices.length)}</small><p>${u.brief}</p></div>${buy}</div>`;
}

/** The panel under the tabs for menu `menu`. */
export function menuPanelHtml(c: CatacombSave, menu: CatacombMenu, open: MagicSkillId | null) {
  if (menu === "skills") {
    const free = pointsEarned(c.mxp) - pointsSpent(c.points);
    return `<button type="button" id="catacomb-stats-table" class="catacomb-table-button" aria-label="All Catacomb stats" title="All Catacomb stats">≡</button>` +
      MAGIC_SKILL_IDS.map((id) => skillBoxHtml(c, id, id === open)).join("") +
      `<small class="catacomb-free" title="Magic skill points to spend">${n(free)} free</small>`;
  }
  const spirit = SPIRIT_RARITIES.filter((r) => c.spirit[r] >= 1).map((r) => `${spiritIcon(r)}${n(c.spirit[r])}`).join(" · ") || "No Spirit yet.";
  if (menu === "spirit") return `<p class="catacomb-held">${spirit}</p>` + SPIRIT_UPGRADE_IDS.map((id) => upgradeHtml(c, id)).join("");
  const held = menu === "forge" ? INGOTS.map((i) => `${titled(i)} ${n(c.ingots[i])}`).join(" · ") : spirit;
  return `<p class="catacomb-later">${LATER[menu]} It opens in a later update.</p><p class="catacomb-held">${held}</p>`;
}

/** One ability's slot: a slim Auto toggle over its button, and under it the
 * turns until its charge is back (Ready when it holds one). */
export function abilityHtml(c: CatacombSave, id: AbilityId) {
  const a = c.abilities[id], name = ABILITIES[id].name, buff = c.buffs[id];
  return `<div class="catacomb-ability" data-ability="${id}">` +
    `<button type="button" class="catacomb-auto" data-auto="${id}" aria-pressed="${a.auto}" aria-label="Cast ${name} by itself when ready">Auto</button>` +
    `<button type="button" class="catacomb-cast" data-cast="${id}" aria-label="Cast ${name}"${canCast(c, id) ? "" : " disabled"}>${name}${buff ? ` <small>${n(buff)}</small>` : ""}</button>` +
    `<small class="catacomb-cooldown">${a.charges > 0 ? "Ready" : n(a.cooldown)}</small></div>`;
}

/** The ability row: each ability unlocked so far. */
export const abilitiesHtml = (c: CatacombSave) => ABILITY_IDS.filter((id) => abilityUnlocked(c, id)).map((id) => abilityHtml(c, id)).join("");

/** How long a press is held before it shows an ability's tooltip instead of casting (ms). */
const HOLD_MS = 450;

/** The row itself: made once, under the board, shown only on the Catacomb screen. */
export class CatacombMenus {
  private menu: CatacombMenu = "skills";
  private open: MagicSkillId | null = null;
  private shown = "";
  private shownAbilities = "";
  private holding: number | undefined;
  private held = false;

  constructor(private catacombs: () => CatacombSave, private changed: () => void) {}

  /** Puts the tabs in the tab bar and the panel over it (once). */
  mount() {
    if (el("catacomb-menus")) return;
    const nav = document.querySelector("nav")!;
    nav.insertAdjacentHTML("beforebegin",
      `<section id="catacomb-menus" class="catacomb-menus catacomb-only" aria-label="Catacomb menus">` +
      `<div id="catacomb-abilities" class="catacomb-abilities" aria-label="Abilities"></div>` +
      `<div id="catacomb-panel" class="catacomb-panel" role="tabpanel"></div></section>`);
    nav.insertAdjacentHTML("beforeend", `<div id="catacomb-tabs" class="catacomb-tabs catacomb-only" role="tablist" aria-label="Catacomb menus">` +
      MENUS.map((m) => `<button type="button" role="tab" data-menu="${m.id}">${kitIcon(catacombMenuSprite(m.id), "", "catacomb-tab-icon")}<small>${m.name}</small></button>`).join("") + `</div>`);
    el("catacomb-menus").onclick = el("catacomb-tabs").onclick = (e) => this.press(e.target as Element);
    // Hovering an ability, or holding it, shows what it does.
    const abilities = el("catacomb-abilities");
    abilities.addEventListener("pointerover", (e) => { if (e.pointerType === "mouse") this.tip(e.target as Element); });
    abilities.addEventListener("pointerout", (e) => { if (e.pointerType === "mouse") this.untip(); });
    abilities.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      const target = e.target as Element;
      this.held = false;
      this.holding = window.setTimeout(() => { this.held = true; this.tip(target); }, HOLD_MS);
    });
    for (const type of ["pointerup", "pointercancel"] as const) abilities.addEventListener(type, () => { clearTimeout(this.holding); if (this.held) setTimeout(() => this.untip(), 900); });
  }

  private press(target: Element) {
    const tab = target.closest<HTMLElement>("[role=tab][data-menu]"), head = target.closest<HTMLElement>(".catacomb-stat-head");
    const point = target.closest<HTMLButtonElement>(".catacomb-point"), buy = target.closest<HTMLButtonElement>(".catacomb-buy[data-upgrade]");
    const cast = target.closest<HTMLButtonElement>(".catacomb-cast"), auto = target.closest<HTMLElement>(".catacomb-auto");
    const c = this.catacombs();
    if (cast || auto) {
      // A hold showed the tooltip: it casts nothing.
      if (this.held) { this.held = false; return; }
      if (cast && !cast.disabled && castAbility(c, cast.dataset.cast as AbilityId)) this.changed();
      if (auto) { const a = c.abilities[auto.dataset.auto as AbilityId]; a.auto = !a.auto; this.changed(); }
    } else if (tab) this.menu = tab.dataset.menu as CatacombMenu;
    else if (point && !point.disabled) {
      if (movePoint(c, point.dataset.skill as MagicSkillId, Number(point.dataset.delta) as 1 | -1)) this.changed();
    } else if (buy && !buy.disabled) {
      if (buyUpgrade(c, buy.dataset.upgrade as SpiritUpgradeId)) this.changed();
    } else if (head) {
      const id = head.dataset.skill as MagicSkillId;
      this.open = this.open === id ? null : id;
    } else if (target.closest("#catacomb-stats-table")) return this.showTable();
    else return;
    this.render(true);
  }

  /** Redraws the row when what it shows has changed (or `force`). */
  render(force = false) {
    const c = this.catacombs(), html = menuPanelHtml(c, this.menu, this.open), abilities = abilitiesHtml(c);
    if (force || abilities !== this.shownAbilities) {
      this.shownAbilities = abilities;
      el("catacomb-abilities").innerHTML = abilities;
      el("catacomb-abilities").hidden = !abilities;
    }
    if (!force && html === this.shown) return;
    this.shown = html;
    el("catacomb-panel").innerHTML = html;
    el("catacomb-panel").dataset.shows = this.menu;
    for (const b of el("catacomb-tabs").querySelectorAll<HTMLElement>("[role=tab][data-menu]")) {
      b.setAttribute("aria-selected", String(b.dataset.menu === this.menu));
      b.classList.toggle("selected", b.dataset.menu === this.menu);
    }
  }

  /** An ability's tooltip, over its slot. */
  private tip(target: Element) {
    const slot = target.closest<HTMLElement>(".catacomb-ability");
    if (!slot) return;
    const id = slot.dataset.ability as AbilityId, a = ABILITIES[id];
    let tip = document.querySelector<HTMLElement>(".catacomb-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "catacomb-tip";
      tip.setAttribute("role", "tooltip");
      document.body.append(tip);
    }
    tip.innerHTML = `<b>${a.name}</b><span>${a.brief}</span><small>Cooldown: ${a.cooldown} turns.</small>`;
    const box = slot.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(innerWidth - 228, box.left + box.width / 2 - 110))}px`;
    tip.style.top = `${Math.max(8, box.top - 8)}px`;
  }

  private untip() {
    document.querySelector(".catacomb-tip")?.remove();
  }

  /** Every Catacomb stat in one table, put away by a tap anywhere. */
  private showTable() {
    document.querySelector(".catacomb-stats-layer")?.remove();
    const layer = document.createElement("div");
    layer.className = "enemy-odds-layer catacomb-stats-layer";
    const rows = catacombStatRows(this.catacombs(), this.lore()).map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("");
    layer.innerHTML = `<div class="enemy-odds-box catacomb-stats" role="dialog" aria-label="Catacomb stats"><button type="button" class="enemy-odds-x" aria-label="Close">${controlIcon("close")}</button>` +
      `<h2>Catacomb stats</h2><table class="stats-table"><tbody>${rows}</tbody></table></div>`;
    layer.onclick = () => layer.remove();
    (document.querySelector("#app") ?? document.body).append(layer);
  }

  /** The Lore held, for the table: set by the view. */
  lore: () => number = () => 0;

  /** Puts the table and any tooltip away (the screen closing). */
  close() {
    document.querySelector(".catacomb-stats-layer")?.remove();
    this.untip();
  }
}
