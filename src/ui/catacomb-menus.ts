// The Catacomb screen's bottom row (docs/CATACOMBS.md, step 5): Stats,
// Spirit, Forge and Academy in place of the hand and the Training bar. Stats
// spends magic skill points; the other three open in later updates.
import { el } from "./dom.ts";
import { controlIcon } from "./control-icon.ts";
import { MAGIC_STAT_IDS, MAGIC_STATS, movePoint, pointsEarned, pointsSpent, statLines, type MagicStatId } from "../catacombs/magic.ts";
import { INGOTS, SPIRIT_RARITIES } from "../catacombs/catalog.ts";
import { catacombStatRows } from "../catacombs/summary.ts";
import type { CatacombSave } from "../catacombs/state.ts";

export type CatacombMenu = "stats" | "spirit" | "forge" | "academy";
const MENUS: readonly { id: CatacombMenu; name: string }[] = [
  { id: "stats", name: "Stats" }, { id: "spirit", name: "Spirit" }, { id: "forge", name: "Forge" }, { id: "academy", name: "Academy" },
];
/** What each menu still to come will do, and what it spends. */
const LATER: Record<Exclude<CatacombMenu, "stats">, string> = {
  spirit: "Spend Spirit on boosts for the Catacombs.",
  forge: "Spend Ingots to upgrade the Blacksmith's forge.",
  academy: "Spend Spirit on boosts outside the Catacombs.",
};
const titled = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const n = (v: number) => Math.floor(v).toLocaleString("en-US");

/** A stat box: its name and the points in it; open, the − and + buttons
 * and a line for each stat it raises, a point's worth and the total. */
export function statBoxHtml(c: CatacombSave, id: MagicStatId, open: boolean) {
  const points = c.points[id], free = pointsEarned(c.mxp) - pointsSpent(c.points), name = MAGIC_STATS[id].name;
  const head = `<button type="button" class="catacomb-stat-head" data-stat="${id}" aria-expanded="${open}"><b>${name}</b><small>${n(points)}</small></button>`;
  if (!open) return `<div class="catacomb-stat" data-stat="${id}">${head}</div>`;
  const lines = statLines(id, points).map((l) => `<li>${l.name} +${n(l.per)} a point · <b>+${n(l.total)}</b></li>`).join("");
  return `<div class="catacomb-stat open" data-stat="${id}">${head}<div class="catacomb-stat-body">` +
    `<div class="catacomb-stat-buttons"><button type="button" class="catacomb-point" data-stat="${id}" data-delta="-1" aria-label="Take a point from ${name}"${points < 1 ? " disabled" : ""}>−</button>` +
    `<button type="button" class="catacomb-point" data-stat="${id}" data-delta="1" aria-label="Put a point in ${name}"${free < 1 ? " disabled" : ""}>+</button></div>` +
    `<ul class="catacomb-stat-lines">${lines}</ul></div></div>`;
}

/** The panel under the tabs for menu `menu`. */
export function menuPanelHtml(c: CatacombSave, menu: CatacombMenu, open: MagicStatId | null) {
  if (menu === "stats") {
    const free = pointsEarned(c.mxp) - pointsSpent(c.points);
    return `<button type="button" id="catacomb-stats-table" class="catacomb-table-button" aria-label="All Catacomb stats" title="All Catacomb stats">≡</button>` +
      MAGIC_STAT_IDS.map((id) => statBoxHtml(c, id, id === open)).join("") +
      `<small class="catacomb-free" title="Magic skill points to spend">${n(free)} free</small>`;
  }
  const held = menu === "forge"
    ? INGOTS.map((i) => `${titled(i)} ${n(c.ingots[i])}`).join(" · ")
    : SPIRIT_RARITIES.filter((r) => c.spirit[r] > 0).map((r) => `${titled(r)} ${n(c.spirit[r])}`).join(" · ") || "No Spirit yet.";
  return `<p class="catacomb-later">${LATER[menu]} It opens in a later update.</p><p class="catacomb-held">${held}</p>`;
}

/** The row itself: made once, under the board, shown only on the Catacomb screen. */
export class CatacombMenus {
  private menu: CatacombMenu = "stats";
  private open: MagicStatId | null = null;
  private shown = "";

  constructor(private catacombs: () => CatacombSave, private changed: () => void) {}

  /** Puts the row in place of the tab bar's (once). */
  mount() {
    if (el("catacomb-menus")) return;
    document.querySelector("nav")!.insertAdjacentHTML("afterend",
      `<section id="catacomb-menus" class="catacomb-menus catacomb-only" aria-label="Catacomb menus"><div class="catacomb-tabs" role="tablist">` +
      MENUS.map((m) => `<button type="button" role="tab" data-menu="${m.id}">${m.name}</button>`).join("") +
      `</div><div id="catacomb-panel" class="catacomb-panel" role="tabpanel"></div></section>`);
    el("catacomb-menus").onclick = (e) => this.press(e.target as Element);
  }

  private press(target: Element) {
    const tab = target.closest<HTMLElement>("[role=tab][data-menu]"), head = target.closest<HTMLElement>(".catacomb-stat-head");
    const point = target.closest<HTMLButtonElement>(".catacomb-point");
    if (tab) this.menu = tab.dataset.menu as CatacombMenu;
    else if (point && !point.disabled) {
      if (movePoint(this.catacombs(), point.dataset.stat as MagicStatId, Number(point.dataset.delta) as 1 | -1)) this.changed();
    } else if (head) {
      const id = head.dataset.stat as MagicStatId;
      this.open = this.open === id ? null : id;
    } else if (target.closest("#catacomb-stats-table")) return this.showTable();
    else return;
    this.render(true);
  }

  /** Redraws the row when what it shows has changed (or `force`). */
  render(force = false) {
    const c = this.catacombs(), html = menuPanelHtml(c, this.menu, this.open);
    if (!force && html === this.shown) return;
    this.shown = html;
    el("catacomb-panel").innerHTML = html;
    el("catacomb-panel").dataset.shows = this.menu;
    for (const b of el("catacomb-menus").querySelectorAll<HTMLElement>("[role=tab][data-menu]")) b.setAttribute("aria-selected", String(b.dataset.menu === this.menu));
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

  /** Puts the table away (the screen closing). */
  close() {
    document.querySelector(".catacomb-stats-layer")?.remove();
  }
}
