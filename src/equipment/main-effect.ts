// A piece's main effect: the one thing leveling it raises. Each category
// gives one percent (Swords ATK, Shields DEF, Helmets Arcanum Damage, Boots
// Gold found, Chestplates max HP), its rarity's base at level 0 plus a
// schedule's steps, ten levels a band, each band's step split evenly over
// its ten levels; Stars raise the whole of it. A Chestplate also carries an
// efficiency, on the Gold schedule, that multiplies the other four worn
// pieces' main effects. Sums on the snap grid, so they are the same in every
// engine.
import { snap } from "../exact.ts";
import { starred, type EquipRarity } from "./balance.ts";
import type { CategoryId, EffectKind } from "./catalog.ts";

/** A main-effect schedule: the percent each rarity gives at level 0, and
 * what each band of ten levels adds (the first band's from 1 to 10). */
export type MainSchedule = { base: Record<EquipRarity, number>; bands: readonly number[] };
const STRIKE_BANDS = [2, 3, 4, 6, 7, 8, 12, 16, 24, 30, 60, 80, 90, 100, 110, 140, 170, 190, 210, 230, 240, 250, 260, 270, 280, 290, 300, 310, 320, 330];
const GOLD_BANDS = [1.2, 1.5, 1.8, 2.4, 3, 3.4, 3.8, 4.2, 4.8, 5.4, 6, 6.5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
/** Swords' ATK, Shields' DEF and Chestplates' max HP. */
export const STRIKE: MainSchedule = {
  base: { common: 1, uncommon: 2, rare: 3, epic: 7, legendary: 13, mythic: 20, ancestral: 30 }, bands: STRIKE_BANDS,
};
/** Helmets' Arcanum Damage: its own bases, and the strike steps 20% larger. */
export const ARCANA: MainSchedule = {
  base: { common: 3, uncommon: 5, rare: 8, epic: 12, legendary: 20, mythic: 30, ancestral: 40 }, bands: STRIKE_BANDS.map((b) => snap(b * 1.2)),
};
/** Boots' Gold found, and Chestplates' efficiency. */
export const GOLD: MainSchedule = {
  base: { common: 1, uncommon: 1.2, rare: 1.5, epic: 1.8, legendary: 2.5, mythic: 3.2, ancestral: 4 }, bands: GOLD_BANDS,
};

/** What each category's level raises, and on which schedule. Categories
 * not listed (the future corners) have no main effect yet. */
export const MAIN_EFFECTS: Partial<Record<CategoryId, { kind: EffectKind; schedule: MainSchedule; name: string }>> = {
  weapon: { kind: "attackPct", schedule: STRIKE, name: "ATK" },
  shield: { kind: "defensePct", schedule: STRIKE, name: "DEF" },
  helmet: { kind: "arcanumDamage", schedule: ARCANA, name: "Arcanum Damage" },
  boots: { kind: "goldFind", schedule: GOLD, name: "Gold found" },
  chestplate: { kind: "maxHpPct", schedule: STRIKE, name: "max HP" },
};
/** The Chestplate's second schedule: the percent the other worn pieces'
 * main effects are raised by. */
export const EFFICIENCY = { category: "chestplate" as CategoryId, schedule: GOLD };

/** A schedule's percent at `rarity` and `level`: the base, every full
 * band, and a tenth of the next band's step for each level into it. */
export function scheduleValue(schedule: MainSchedule, rarity: EquipRarity, level: number) {
  const full = Math.floor(level / 10), into = level % 10, bands = schedule.bands;
  let total = schedule.base[rarity];
  for (let i = 0; i < Math.min(full, bands.length); i++) total += bands[i];
  if (into && full < bands.length) total += (bands[full] * into) / 10;
  return snap(total);
}

type Piece = { category: CategoryId; rarity: EquipRarity; level: number; stars?: number };
/** A piece's main effect, as its kind and percent (Stars counted), before
 * any Chestplate's efficiency; null for a category without one. */
export function mainEffect(p: Piece) {
  const main = MAIN_EFFECTS[p.category];
  return main ? { kind: main.kind, value: starred(scheduleValue(main.schedule, p.rarity, p.level), p.stars ?? 0) } : null;
}
/** A Chestplate's efficiency percent (Stars counted); 0 for any other piece. */
export const efficiency = (p: Piece) =>
  p.category === EFFICIENCY.category ? starred(scheduleValue(EFFICIENCY.schedule, p.rarity, p.level), p.stars ?? 0) : 0;
/** A main effect raised by a worn Chestplate's `efficiency` percent. */
export const withEfficiency = (value: number, eff: number) => (eff ? snap((value * (100 + eff)) / 100) : value);
