import { controlIcon } from "./control-icon.ts";
import { shortStat } from "./hud.ts";
import { hallStrength, spawnOdds, STRENGTHS, UNDEAD, undeadRewards, undeadStats, type CatacombStrength, type UndeadId } from "../catacombs/catalog.ts";
import { SLOT_XS } from "../catacombs/hall.ts";

const RARITY_NAMES = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary", mythic: "Mythic", ancestral: "Ancestral" } as const;
const STRENGTH_NAMES: Record<CatacombStrength, string> = { normal: "", strong: "Strong ", elite: "Elite ", boss: "Boss " };

/** One undead's row: its name, chance, stats here, and what it pays. */
function row(id: UndeadId, strength: CatacombStrength, chance: string, hall: number, number: number) {
  const s = undeadStats(id, strength, hall, number), r = undeadRewards(id, strength);
  return `<tr><th scope="row">${STRENGTH_NAMES[strength]}${UNDEAD[id].name}</th><td>${chance}</td><td>${shortStat(s.mhp)}</td><td>${shortStat(s.matk)}</td><td>${shortStat(s.mdef)}</td>` +
    `<td>${r.mxp.toLocaleString("en-US")}</td><td>${r.spirit} ${RARITY_NAMES[r.rarity]}</td></tr>`;
}

/** The Catacomb enemy table for hall `hall` of Catacomb `number`: each type
 * that can stand on a slot, its chance a slot, its MHP, MAtk and MDef here,
 * and the MXP and Spirit it pays; then the hall's Strong, Elite or Boss, if
 * it has one, on the last slot. */
export function catacombOddsHtml(hall: number, number: number) {
  const odds = spawnOdds(hall), ranked = hallStrength(hall);
  const slots = ranked ? SLOT_XS.length - 1 : SLOT_XS.length;
  const rows = odds.map((o) => row(o.id, "normal", `${o.percent}%`, hall, number)).join("");
  const total = odds.reduce((s, o) => s + o.percent, 0);
  const last = ranked ? odds.map((o) => row(o.id, ranked, `${Math.round((1000 * o.percent) / total) / 10}%`, hall, number)).join("") : "";
  const head = `<thead><tr><th scope="col">Undead</th><th scope="col">Chance</th><th scope="col">MHP</th><th scope="col">MAtk</th><th scope="col">MDef</th><th scope="col">MXP</th><th scope="col">Spirit</th></tr></thead>`;
  return `<button type="button" class="enemy-odds-x" aria-label="Close">${controlIcon("close")}</button><h2>Undead in Hall ${hall.toLocaleString("en-US")}</h2>` +
    `<p class="hint">Each of ${slots} slots rolls once. A hall that rolls none gets one Wisp.</p>` +
    `<table class="enemy-odds-table">${head}<tbody>${rows}</tbody></table>` +
    (ranked ? `<p class="hint">The last slot always holds a ${STRENGTH_NAMES[ranked].trim()} undead: ${Math.round(STRENGTHS[ranked].mhp * 100)}% MHP, ${STRENGTHS[ranked].rewards}× MXP and Spirit.</p><table class="enemy-odds-table">${head}<tbody>${last}</tbody></table>` : "");
}
