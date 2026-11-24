/** Boosts: what a Golden Scarab gives the player who is watching, for a
 * while on the wall clock. Each speeds up real-time or meta progress
 * (XP, Gold, research, travel to the stairs), never how strong the hero is
 * inside a run. This module holds only the catalog and its arithmetic, so
 * the Archives and the rules that read a boost can import it freely;
 * `boosts.ts` reads the save. */

export type BoostId = "cardXp" | "research" | "training" | "speed" | "endRush" | "gold" | "xp" | "equipmentDrops" | "gemBank" | "rubies" | "cells";
/** The boosts, in the order the boost table lists them when their times tie. */
export const BOOST_IDS: readonly BoostId[] = ["gold", "xp", "cardXp", "research", "training", "speed", "endRush", "equipmentDrops", "gemBank", "rubies", "cells"];

export type BoostDef = {
  /** The boost's name, as the boost table's tooltip and the Codex read it. */
  name: string;
  /** Its icon (a PNG in `public/assets/style/`, drawn with `pngIcon`). */
  icon: string;
  /** What its effect is before Golden Scarab Effect: a factor (×1.5), or
   * with `plus`, whole steps or tiles added (+1). */
  base: number;
  plus?: true;
  /** What it raises, after its value: "Card XP" in "×1.5 Card XP". */
  what: string;
};

export const BOOSTS: Record<BoostId, BoostDef> = {
  gold: { name: "Gold Bonus", icon: "gold", base: 1.5, what: "Gold" },
  xp: { name: "XP", icon: "badge-xp", base: 1.5, what: "XP" },
  cardXp: { name: "Card XP", icon: "ui-card-points", base: 1.5, what: "Card XP" },
  research: { name: "Research Speed", icon: "hourglass", base: 1.5, what: "research speed" },
  training: { name: "Training Speed", icon: "relic-shop-trainer", base: 1.5, what: "training speed" },
  speed: { name: "Game Speed", icon: "boon-play-speed", base: 1, plus: true, what: "steps / sec" },
  endRush: { name: "End Rush", icon: "badge-dash", base: 3, plus: true, what: "End Rush tiles" },
  equipmentDrops: { name: "Equipment Drops", icon: "combat-chest-equipment", base: 1.5, what: "equipment drop chance" },
  gemBank: { name: "Gem Bank Refill", icon: "gem", base: 2, what: "Gem Bank refill speed" },
  rubies: { name: "Rubies", icon: "ruby", base: 1.5, what: "Rubies" },
  cells: { name: "Cells", icon: "cell", base: 1.5, what: "Cells" },
};

/** A boost's value with Golden Scarab Effect at `effect` percent (100 with
 * no research): a factor raised as a whole (×1.5 at 102% is ×1.53), or the
 * steps or tiles added, rounded down (+3 at 150% is +4). */
export function scaledBoost(id: BoostId, effect: number) {
  const { base, plus } = BOOSTS[id], value = (base * effect) / 100;
  return plus ? Math.floor(value + 1e-9) : Math.round(value * 1000) / 1000;
}

/** A boost's value as the player reads it: "×1.53", "+4". */
export const boostValueText = (id: BoostId, value: number) => (BOOSTS[id].plus ? `+${value}` : `×${Number(value.toFixed(3))}`);

/** How long one Golden Scarab's boost lasts before Golden Scarab Duration. */
export const BOOST_MS = 12 * 60 * 1000;
/** How long after a Golden Scarab is claimed before the next can appear,
 * before Golden Scarab Cooldown (in seconds, as its research counts it). */
export const SCARAB_COOLDOWN_SECONDS = 15 * 60;
/** A Golden Scarab missed (its floor left behind) comes back this many new floors on. */
export const SCARAB_MISSED_FLOORS = 3;

/** Time left as a countdown: 11:55, 0:05, 1:02:30 from an hour. */
export function countdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
