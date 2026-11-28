// What a tapped Catacomb hall tile says (docs/agents/catacombs.md): the
// run's inspect box (tile-info.ts), its stats the Magician's MHP, MAtk and
// MDef, and every undead's forecast shown, since the Catacombs open long
// after Damage Prediction and Combat Forecast.
import { enemyStat, wholeChange } from "../whole.ts";
import { snap } from "../exact.ts";
import { KIND_COLORS, stat, statLines, type TileInfo } from "./tile-info.ts";
import { cellIcon, ingotIcon, itemSprite, mxpIcon, spiritIcon, uiSprite } from "./dom.ts";
import { DROP_IDS, DROPS, UNDEAD, undeadRewards, undeadStats, type CatacombStrength } from "../catacombs/catalog.ts";
import { CORRIDOR_ROW, hallCell, hallTargets, LORE_TORCH, SLOT_XS } from "../catacombs/hall.ts";
import { hitFor, lootFactor, striking } from "../catacombs/combat.ts";
import { magician } from "../catacombs/magic.ts";
import { forecastFight, type CatacombForecast } from "../catacombs/forecast.ts";
import { GOLD_CROSSHAIR_FACTOR, POTION_MHP } from "../catacombs/taps.ts";
import type { CatacombSave } from "../catacombs/state.ts";

const STRENGTH_NAMES: Record<CatacombStrength, string> = { normal: "", strong: "Strong", elite: "Elite", boss: "Boss" };
const INGOT_NAMES = { brass: "Brass", iron: "Iron", steel: "Steel", nickel: "Nickel" } as const;
const PLAIN = KIND_COLORS.floor!;

/** The forecast's lines, as a run's Damage Prediction and Combat Forecast
 * read: the fight's cost and verdict, then the strikes it takes. */
function forecastLines(f: CatacombForecast, crits: boolean) {
  if (f.stalemate) return `<br><strong class="danger">Neither side can harm the other</strong>`;
  const damage = Number.isFinite(f.damage) ? wholeChange(f.damage) : "∞";
  const verdict = f.strikes === 1 ? "Instakill" : !f.survives ? "LETHAL" : damage === 0 ? "Harmless" : "Survivable";
  const line = `<br><strong class="${f.survives ? "safe" : "danger"}">${damage} damage · ${verdict}</strong>`;
  if (f.strikes <= 1) return line;
  return `${line}<br><span class="forecast">${f.strikes.toLocaleString("en-US")} hits to defeat${crits ? " without MCrits" : ""}</span>`;
}

/** Slot `i`'s undead: its MHP, its MAtk with what each strike takes off the
 * Magician, its MDef with what each of the Magician's strikes takes off it,
 * what banishing it pays, its Drops and crosshair, then the forecast. */
function undeadInfo(c: CatacombSave, i: number): Omit<TileInfo, "color"> | null {
  const run = c.run!, slot = run.slots[i], f = forecastFight(c, i);
  if (!slot || !f) return null;
  const foe = undeadStats(slot.id, slot.strength, run.hall, c.number), m = striking(c), hero = magician(c), d = slot.drops ?? {};
  const r = undeadRewards(slot.id, slot.strength);
  const taken = Math.max(0, snap(foe.matk - m.mdef)), hit = hitFor(m, foe.mdef, false);
  const mxp = snap(r.mxp * hero.mxpGain * (d.mxp ?? 1)), spirit = snap(r.spirit * hero.spiritGain * lootFactor(hero, d.loot));
  const hurt = (n: number) => ` (<span class="hit-hurt">-${enemyStat(n)}</span>)`;
  const body = statLines(
    stat(uiSprite("health", "stat-sprite"), "MHP", enemyStat(slot.mhp)),
    stat(itemSprite("upgrade_attack", "stat-sprite"), "MAtk", enemyStat(foe.matk), hurt(taken)),
    stat(itemSprite("upgrade_defense", "stat-sprite"), "MDef", enemyStat(foe.mdef), hurt(hit)),
    stat(mxpIcon("mxp-icon stat-sprite"), "MXP", `<span class="hit-gold">${enemyStat(mxp)}</span>`),
    stat(spiritIcon(r.rarity), "Spirit", `<span class="hit-gold">${enemyStat(spirit)}</span>`),
  );
  const drops = DROP_IDS.filter((id) => d[id]).map((id) => `<br><small>${DROPS[id].name}: ${dropText(id, id === "loot" ? lootFactor(hero, d[id]) : d[id]!)}</small>`).join("");
  const mark = slot.mark === "gold" ? `<br><small>Gold crosshair: tap it for a free hit, ×${GOLD_CROSSHAIR_FACTOR}</small>`
    : slot.mark ? "<br><small>Crosshair: tap it for a free hit</small>" : "";
  return { title: `${STRENGTH_NAMES[slot.strength]} ${UNDEAD[slot.id].name}`.trim(), body: body + drops + mark + forecastLines(f, hero.critChance > 0) };
}

/** What a Drop on this undead gives, in a few words. */
function dropText(id: (typeof DROP_IDS)[number], amount: number) {
  const n = amount.toLocaleString("en-US");
  return id === "mxp" ? `×${n} MXP` : id === "loot" ? `×${n} Spirit` : id === "speed" ? `+${n} attacks at ×2 speed` : `+${n} MHP`;
}

/** Whether a tapped tile's box fades on its own, as a run's plain floor's and wall's do. */
export const plainTile = (info: TileInfo) => ["Wall", "Floor", "Entrance"].includes(info.title);

/** Title, colour and body for hall tile (x, y) as it stands now. */
export function catacombTileInfo(c: CatacombSave, x: number, y: number): TileInfo | null {
  const run = c.run;
  if (!run) return null;
  const slot = (SLOT_XS as readonly number[]).indexOf(x);
  if (slot >= 0 && y === CORRIDOR_ROW && run.slots[slot]) {
    const info = undeadInfo(c, slot);
    if (info) return { color: KIND_COLORS.enemy!, ...info };
  }
  if (run.potions.some(([px, py]) => px === x && py === y)) {
    const room = Math.min(POTION_MHP, snap(magician(c).mhp - run.hero.mhp));
    return { color: KIND_COLORS.potion!, title: "Potion", body: `<span>Restores ${POTION_MHP} MHP</span><br><span class="tile-gain">${uiSprite("health", "stat-sprite")} +${wholeChange(room)} MHP</span>` };
  }
  // The Lore and Ingots still to take; taken, their tiles are floor.
  const left = hallTargets(run.hall, c.number, run.slots).slice(run.target);
  const target = left.find((t) => t.x === x && t.y === y);
  const cell = hallCell(run.hall, x, y);
  if (target?.kind === "lore")
    return { color: KIND_COLORS.treasure!, title: "Lore", body: `<span>An old tablet, kept between climbs</span><br><span class="tile-gain">${cellIcon()} +${enemyStat(target.amount)} Lore</span>` };
  if (target?.kind === "ingot")
    return { color: "#d7e3ef", title: `${INGOT_NAMES[target.ingot]} Ingot`, body: `<span>Metal for the Forge</span><br><span class="tile-gain">${ingotIcon(target.ingot)} +${target.amount.toLocaleString("en-US")}</span>` };
  if (cell === "stairs") return { color: KIND_COLORS.stairs!, title: "Stairs Down", body: `Leads to Hall ${(run.hall + 1).toLocaleString("en-US")}` };
  if (cell === "entrance") return { color: PLAIN, title: "Entrance", body: "Where the Magician wakes after a fall." };
  if (cell === "torch") return { color: "#88c5db", title: "Blue Torch", body: x === LORE_TORCH[0] && y === LORE_TORCH[1] ? "It lights the hall." : "It lights the treasure room." };
  if (cell === "wall") return { color: PLAIN, title: "Wall", body: "Impassable obstacle." };
  return { color: PLAIN, title: "Floor", body: "The Magician's way through the hall." };
}
