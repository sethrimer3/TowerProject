import { controlIcon } from "./control-icon.ts";
import { shortStat } from "./hud.ts";
import { cellIcon, itemSprite, mxpIcon, spiritIcon, uiSprite } from "./dom.ts";
import { strengthMarks } from "./enemy-odds-box.ts";
import { undeadIconUrl } from "../render/catacomb-board.ts";
import { fixedHall, hallStrength, loreBonus, spawnOdds, STRENGTHS, UNDEAD, undeadRewards, undeadStats, type CatacombStrength, type UndeadId } from "../catacombs/catalog.ts";
import { tierNumeral } from "../tiers.ts";

const RARITY_NAMES = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary", mythic: "Mythic", ancestral: "Ancestral" } as const;
const STRENGTH_NAMES: Record<CatacombStrength, string> = { normal: "", strong: "Strong", elite: "Elite", boss: "Boss" };

/** A column head: its icon, as the run's enemy table shows it, named for screen readers. */
const iconHead = (icon: string, label: string) => `<th scope="col" title="${label}" aria-label="${label}">${icon}</th>`;
const HEAD = `<thead><tr><th scope="col">Undead</th><th scope="col">Chance</th>` +
  iconHead(uiSprite("health", "stat-sprite"), "MHP") +
  iconHead(itemSprite("upgrade_attack", "stat-sprite"), "MAtk") +
  iconHead(itemSprite("upgrade_defense", "stat-sprite"), "MDef") +
  iconHead(mxpIcon("mxp-icon stat-sprite"), "MXP") +
  iconHead(spiritIcon("fragments"), "Spirit") + `</tr></thead>`;

/** One undead's row: its rank chevrons and picture by its name, as the
 * board shows it, its chance, stats here, and what it pays. */
function row(id: UndeadId, strength: CatacombStrength, chance: string, hall: number, number: number) {
  const s = undeadStats(id, strength, hall, number), r = undeadRewards(id, strength), name = `${STRENGTH_NAMES[strength]} ${UNDEAD[id].name}`.trim();
  return `<tr><th scope="row"><span class="odds-name">${strengthMarks(strength)}<img class="odds-undead" src="${undeadIconUrl(id)}" alt="">${name}</span></th>` +
    `<td>${chance}</td><td>${shortStat(s.mhp)}</td><td>${shortStat(s.matk)}</td><td>${shortStat(s.mdef)}</td>` +
    `<td>${r.mxp.toLocaleString("en-US")}</td><td title="${r.spirit} ${RARITY_NAMES[r.rarity]} Spirit">${spiritIcon(r.rarity)}${r.spirit}</td></tr>`;
}

/** The Catacomb enemy table for hall `hall` of Catacomb `number`: each type
 * that can stand on a slot, its chance a slot, its MHP, MAtk and MDef here,
 * and the MXP and Spirit it pays; then the hall's Strong, Elite or Boss, if
 * it has one, on the last slot; then the Lore bonus. */
export function catacombOddsHtml(hall: number, number: number) {
  const odds = spawnOdds(hall), ranked = hallStrength(hall), fixed = fixedHall(hall);
  const title = `<button type="button" class="enemy-odds-x" aria-label="Close">${controlIcon("close")}</button><h2>Undead in Hall ${hall.toLocaleString("en-US")}</h2>`;
  const lore = `<p class="hint catacomb-lore-bonus">${cellIcon()} Lore bonus <b>×${loreBonus(number)}</b>: Tower ${tierNumeral(number)}'s Gold bonus.</p>`;
  if (fixed) {
    // A fixed hall's six are set: a row each, the ranked last one its own.
    const ids = [...new Set(fixed)], last = fixed[fixed.length - 1]!;
    const count = (id: UndeadId) => fixed.filter((f, i) => f === id && !(ranked && i === fixed.length - 1)).length;
    const rows = ids.filter((id) => count(id) > 0).map((id) => row(id, "normal", `${count(id)} of 6`, hall, number)).join("") +
      (ranked ? row(last, ranked, "1 of 6", hall, number) : "");
    return `${title}<p class="hint">A set hall: its six undead are always the same.</p><table class="enemy-odds-table">${HEAD}<tbody>${rows}</tbody></table>${lore}`;
  }
  const rows = odds.map((o) => row(o.id, "normal", `${o.percent}%`, hall, number)).join("");
  const total = odds.reduce((s, o) => s + o.percent, 0);
  const last = ranked ? odds.map((o) => row(o.id, ranked, `${Math.round((1000 * o.percent) / total) / 10}%`, hall, number)).join("") : "";
  return title +
    `<table class="enemy-odds-table">${HEAD}<tbody>${rows}</tbody></table>` +
    (ranked ? `<p class="hint">The last slot always holds a ${STRENGTH_NAMES[ranked]} undead: ${Math.round(STRENGTHS[ranked].mhp * 100)}% MHP, ${STRENGTHS[ranked].rewards}× MXP and Spirit.</p><table class="enemy-odds-table">${HEAD}<tbody>${last}</tbody></table>` : "") +
    lore;
}
