// The Training rows worn equipment raises, read in one place: `trainedAmount`
// passes each open row's value (after relics) through `gearRowValue` when
// the holder carries the worn effects (`gear`, the game's `trainingNow`).
// Chances add points (their rows keep hundredths of a percent), factors and
// the Archer's and the Aether Shield's rows rise by a percent of their value,
// Multishot Targets by whole targets, and the shield's regrow turns fall by a
// percent (its research's floor still holding). Equipment is its own kind of
// bonus, so its percent multiplies the row's other sources.
import type { TrainingId } from "../progression/training.ts";
import type { EffectKind } from "./catalog.ts";

export type GearTotals = Partial<Record<EffectKind, number>>;
type Raise = "percent" | "points" | "count" | "cut";
export const GEAR_ROWS: Partial<Record<TrainingId, { kind: EffectKind; raise: Raise }>> = {
  critChance: { kind: "critChance", raise: "points" },
  critFactor: { kind: "critFactor", raise: "percent" },
  superCritChance: { kind: "superCritChance", raise: "points" },
  superCritFactor: { kind: "superCritFactor", raise: "percent" },
  attackRange: { kind: "attackRange", raise: "percent" },
  attackSpeed: { kind: "attackSpeed", raise: "percent" },
  attackPerTile: { kind: "attackPerTile", raise: "percent" },
  multishotChance: { kind: "multishotChance", raise: "points" },
  multishotTargets: { kind: "multishotTargets", raise: "count" },
  rapidFireChance: { kind: "rapidFireChance", raise: "points" },
  rapidFireDuration: { kind: "rapidFireDuration", raise: "percent" },
  shieldHp: { kind: "shieldHpPct", raise: "percent" },
  regrowShield: { kind: "regrowCut", raise: "cut" },
  overheal: { kind: "overhealPct", raise: "percent" },
};

/** Row `id`'s `value` as the worn `gear` raises it (unchanged without). */
export function gearRowValue(gear: GearTotals | undefined, id: TrainingId, value: number) {
  const row = GEAR_ROWS[id], n = row && gear ? gear[row.kind] ?? 0 : 0;
  if (!n) return value;
  const exact = (v: number) => Math.round(v * 1e6) / 1e6;
  switch (row!.raise) {
    case "points": return exact(value + n * 100);
    case "count": return value + Math.floor(n);
    case "cut": return exact((value * (100 - Math.min(100, n))) / 100);
    default: return exact((value * (100 + n)) / 100);
  }
}
