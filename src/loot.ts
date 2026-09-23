// Pure loot-roll functions for enemy drops and generated treasure chests.
// Every function takes an injected rng so probability is testable without
// flaky statistics and never touches Math.random() itself. See
// docs/CRAFTING_AND_EQUIPMENT.md for the design source of truth.
import { GEMS, METALS, metalStackRange, metalWeightsForFloor, speciesByName, type MaterialStack } from "./materials.ts";
import { towerEnemyDrop } from "./scaling.ts";

const COMMON_DROP_CHANCE = 0.35;
const RARE_DROP_CHANCE = 0.02;
const METAL_CHEST_CHANCE = 0.28;
const EMPTY_VIAL_CHANCE = 0.04;

/** Common and rare rolls are independent — a kill may drop nothing, either,
 * or both. Materials are credited immediately by the caller. */
export function rollEnemyDrops(enemyName: string, rng: () => number): MaterialStack[] {
  const species = speciesByName(enemyName);
  if (!species) return [];
  const drops: MaterialStack[] = [];
  if (rng() < COMMON_DROP_CHANCE) drops.push({ id: species.common, quantity: 1 + Math.floor(rng() * 3) });
  if (rng() < RARE_DROP_CHANCE) drops.push({ id: species.rare, quantity: 1 });
  return drops;
}

/** Tower enemy identities have deterministic roles: attack-heavy drops
 * nothing, balanced drops the zone's common part, defense-heavy drops its
 * rare part. Every eligible kill awards exactly one part. */
export function towerEnemyDrops(enemyName: string): MaterialStack[] {
  const id = towerEnemyDrop(enemyName);
  return id ? [{ id, quantity: 1 }] : [];
}

export function rollMetal(E: number, rng: () => number): MaterialStack | null {
  if (rng() >= METAL_CHEST_CHANCE) return null;
  const weights = metalWeightsForFloor(E);
  const entries = Object.entries(weights) as [string, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  let chosen = entries[entries.length - 1][0];
  for (const [id, w] of entries) {
    if (roll < w) { chosen = id; break; }
    roll -= w;
  }
  const metal = METALS.find((m) => m.id === chosen)!;
  const { min, max } = metalStackRange(E);
  const quantity = min + Math.floor(rng() * (max - min + 1));
  return { id: metal.materialId, quantity };
}

export function rollGems(E: number, rng: () => number): MaterialStack[] {
  const results: MaterialStack[] = [];
  for (const gem of GEMS) {
    const chance = gem.chance(E);
    if (chance > 0 && rng() < chance) results.push({ id: gem.id, quantity: 1 });
  }
  return results;
}

export function rollEmptyVial(rng: () => number): MaterialStack | null {
  if (rng() >= EMPTY_VIAL_CHANCE) return null;
  return { id: "emptyVial", quantity: 1 + Math.floor(rng() * 2) };
}

export function rollGold(E: number, rng: () => number): number {
  return 3 + Math.floor(E / 5) + Math.floor(rng() * (4 + Math.floor(E / 10)));
}

export type TreasureLoot = { gold: number; materials: MaterialStack[] };

/** Generated treasure chests always grant Gold, and may independently grant
 * a metal stack, an Empty Vial stack, and any number of gems. They never
 * grant artifacts, heirlooms, finished equipment, or gear upgrades. */
export function rollTreasureLoot(E: number, rng: () => number): TreasureLoot {
  const materials: MaterialStack[] = [];
  const metal = rollMetal(E, rng);
  if (metal) materials.push(metal);
  const vial = rollEmptyVial(rng);
  if (vial) materials.push(vial);
  materials.push(...rollGems(E, rng));
  return { gold: rollGold(E, rng), materials };
}
