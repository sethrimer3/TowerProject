import type { Game } from "../state.ts";
import { pngIcon } from "../sprites/kit.ts";
import { el } from "./dom.ts";
import { showCardTip } from "./card-tip.ts";
import { BOOST_IDS, BOOSTS, boostValueText, countdown, type BoostId } from "../boosts/catalog.ts";
import { boostLabel, boostLeft, boostStrength } from "../boosts/boosts.ts";
import { GOLD_BOOST_FACTOR, goldBoostLeft } from "../economy/gold-boost.ts";
import { LEVEL_BOOST_FACTOR, levelBoostLeft } from "../economy/level-boost.ts";

/** One row of the boost table: what it is (`key`, a boost's id, or the
 * run's Level-up Boost, or the Gold ad's), its icon, what it does and its
 * time left, and its name and a few words on it for its tap (`name`,
 * `about`). `gold` marks the rows that change the Gold bonus. */
export type BoostRow = { key: BoostId | "levelUp" | "ads"; icon: string; label: string; left: number; gold: boolean; name: string; about: string };

/** The temporary boosts running now, in a fixed order: the run's Level-up
 * Boost (inside a run), the Gold ad's, then each Golden Scarab boost. */
export function boostRows(game: Game): BoostRow[] {
  const now = game.clock(), save = game.save, rows: BoostRow[] = [];
  const level = game.run.outside ? 0 : levelBoostLeft(game.run, now);
  if (level > 0) rows.push({ key: "levelUp", icon: "arrow-up", label: `Level-up Boost: Gold ×${LEVEL_BOOST_FACTOR}`, left: level, gold: true,
    name: "Level-up Boost", about: `A new level: you earn ×${LEVEL_BOOST_FACTOR} Gold for a while.` });
  const ad = goldBoostLeft(save, now);
  if (ad > 0) rows.push({ key: "ads", icon: "ad-screen", label: `Ad Boost: Gold ×${GOLD_BOOST_FACTOR}`, left: ad, gold: true,
    name: "Ad Boost", about: `Thanks for watching: you earn ×${GOLD_BOOST_FACTOR} Gold.` });
  for (const id of BOOST_IDS) {
    const left = boostLeft(save, id, now), value = boostStrength(save, id);
    if (left > 0) rows.push({ key: id, icon: BOOSTS[id].icon, label: `Golden Scarab: ${boostLabel(id, value)}`, left, gold: id === "gold",
      name: `Golden Scarab: ${BOOSTS[id].name}`, about: BOOSTS[id].about(boostValueText(id, value)) });
  }
  return rows;
}

/** The rows (and their labels) the table shows now, so it is built again only when they change. */
let shown = "";

/** The boost table over the board's top-left corner, in the forest and
 * inside a run: a bordered column, a row a boost running, each its icon
 * and time left ("11:55"), counting down each second (main's tick); hidden
 * with none. Returns the rows that change the Gold bonus, so the HUD can
 * work it out again the moment one starts or ends. */
export function renderBoostTable(game: Game): string {
  const box = el("boost-table"), rows = boostRows(game), key = rows.map((r) => `${r.key}:${r.label}`).join("|");
  bindBoostTips(box, game);
  box.hidden = !rows.length;
  const aria = (r: BoostRow) => `${r.label}, ${countdown(r.left)} left`;
  if (key !== shown) {
    box.innerHTML = rows.map((r) => `<div class="boost-row" data-boost="${r.key}" title="${r.label}" aria-label="${aria(r)}" role="img">${pngIcon(r.icon, "boost-icon")}<span class="boost-time">${countdown(r.left)}</span></div>`).join("");
    shown = key;
  } else {
    rows.forEach((r, i) => {
      const row = box.children[i] as HTMLElement | undefined, time = row?.querySelector(".boost-time");
      if (!row || !time) return;
      const text = countdown(r.left);
      if (time.textContent !== text) {
        time.textContent = text;
        row.setAttribute("aria-label", aria(r));
      }
    });
  }
  return rows.filter((r) => r.gold).map((r) => r.key).join(",");
}

/** The table whose taps show tips, bound once. */
let bound: HTMLElement | null = null;

/** A tap (or click) on a row shows its boost's name and what it does, over
 * the row, until the next press or a few seconds pass (`showCardTip`); the
 * tap goes no further, so the board under it takes no step. */
function bindBoostTips(box: HTMLElement, game: Game) {
  if (bound === box) return;
  bound = box;
  box.addEventListener("click", (e) => {
    const row = (e.target as Element).closest<HTMLElement>(".boost-row"), r = row && boostRows(game).find((b) => b.key === row.dataset.boost);
    if (!row || !r) return;
    e.stopPropagation();
    showCardTip(row, r.name, r.about);
  });
  for (const type of ["pointerdown", "pointerup"] as const) box.addEventListener(type, (e) => e.stopPropagation());
}

/** What a claimed scarab's drop shows: the boost's icon, its value and the
 * time it added, "×1.75 +12:35". */
export const claimHtml = (id: BoostId, value: number, ms: number) =>
  `${pngIcon(BOOSTS[id].icon, "boost-icon")}<b>${boostValueText(id, value)}</b> <small>+${countdown(ms)}</small>`;
