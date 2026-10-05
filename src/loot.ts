// Pure loot-roll functions for generated treasure chests. Every function
// takes an injected rng so probability is testable without flaky
// statistics and never touches Math.random() itself. (What a kill drops is
// Equipment's: equipment/acquire.ts.)
import { METALS, metalStackRange, metalWeightsForFloor, type MaterialStack } from "./materials.ts";

const METAL_CHEST_CHANCE = 0.28;

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

export function rollGold(E: number, rng: () => number): number {
  return 3 + Math.floor(E / 5) + Math.floor(rng() * (4 + Math.floor(E / 10)));
}

/** What `rollGold` pays on average: Floor Skip Reward counts a chest it
 * never opens at this, so the payout is the same however the run goes. */
export const averageGold = (E: number) => 3 + Math.floor(E / 5) + (3 + Math.floor(E / 10)) / 2;

export type TreasureLoot = { gold: number; materials: MaterialStack[] };

/** Generated treasure chests always grant Gold, and may grant a stack of
 * metal bars (which the Defend page spends). They never grant equipment. */
export function rollTreasureLoot(E: number, rng: () => number): TreasureLoot {
  const metal = rollMetal(E, rng);
  return { gold: rollGold(E, rng), materials: metal ? [metal] : [] };
}
