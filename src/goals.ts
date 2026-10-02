import type { Save } from "./entities.ts";
import { CURRENCIES, type CurrencyId } from "./shop/currency.ts";
import { owns, type EntitlementId } from "./shop/entitlements.ts";
import { TIERS } from "./tiers.ts";

// Goals: each tower's checkpoints, one every ten floors, each with a reward
// the player claims once the tower's highest floor reaches it, and a premium
// reward beside it, claimed the same way once the Premium Pass for the
// tower's set of three is owned. Claims last between runs (`save.goals`).

/** What a checkpoint pays: Warp (starting a run at a reached checkpoint),
 * or an amount of a currency. */
export type GoalReward = { kind: "warp" } | { kind: "currency"; currency: CurrencyId; amount: number };
export type Checkpoint = { floor: number; reward: GoalReward; premium: GoalReward };

/** Floors between checkpoints. */
export const CHECKPOINT_EVERY = 10;
/** Checkpoints each tower has, for now. */
export const CHECKPOINTS_PER_TOWER = 10;

const gold = (amount: number): GoalReward => ({ kind: "currency", currency: "gold", amount });
const gems = (amount: number): GoalReward => ({ kind: "currency", currency: "gems", amount });

/** A tower's checkpoints, lowest first.
 * TODO: the stub rewards (100 Gold × checkpoint × tower, 10 Gems × checkpoint)
 * are placeholders, to be tuned. */
function towerCheckpoints(tower: number): Checkpoint[] {
  return Array.from({ length: CHECKPOINTS_PER_TOWER }, (_, i) => {
    const n = i + 1, floor = n * CHECKPOINT_EVERY;
    if (tower === 1 && n === 1) return { floor, reward: { kind: "warp" }, premium: gold(100) };
    return { floor, reward: gold(100 * n * tower), premium: gems(10 * n) };
  });
}

/** Every tower's checkpoints, by tower (1 to `TIERS`). */
export const CHECKPOINTS: Readonly<Record<number, readonly Checkpoint[]>> = Object.fromEntries(
  Array.from({ length: TIERS }, (_, i) => [i + 1, towerCheckpoints(i + 1)]),
);

export const checkpoint = (tower: number, floor: number) => CHECKPOINTS[tower]?.find((c) => c.floor === floor);

/** Each Premium Pass: the three towers it opens premium rewards in, and
 * its price (the store prices it by `sku` once connected). */
export type Pass = { id: EntitlementId; n: number; towers: number[]; sku: string; label: string };
export const PASSES: readonly Pass[] = [
  { id: "pass1", n: 1, towers: [1, 2, 3], sku: "premium_pass_1", label: "$9.99" },
  { id: "pass2", n: 2, towers: [4, 5, 6], sku: "premium_pass_2", label: "$19.99" },
  { id: "pass3", n: 3, towers: [7, 8, 9], sku: "premium_pass_3", label: "$29.99" },
];
/** The pass whose set holds `tower`. */
export const passFor = (tower: number) => PASSES.find((p) => p.towers.includes(tower))!;

/** What the Goals save keeps: the floors of the checkpoints claimed in
 * each tower, and of the premium rewards claimed. */
export type GoalsSave = { claimed: Record<string, number[]>; premium: Record<string, number[]> };
export const defaultGoals = (): GoalsSave => ({ claimed: {}, premium: {} });

/** The highest floor reached in `tower` (shown from 1), in either the
 * selected tower's records or the waiting ones. */
export function highestFloor(save: Save, tower: number) {
  const t = save.tower;
  if (tower === t.tier) return t.reached + 1;
  const record = t.tierRecords[tower];
  return record ? record.reached + 1 : 1;
}

/** Where a reward stands: not reached yet, waiting for the pass (premium
 * only), ready to claim, or claimed. */
export type GoalState = "locked" | "needsPass" | "ready" | "claimed";

export function goalState(save: Save, tower: number, floor: number, premium: boolean): GoalState {
  const list = (premium ? save.goals.premium : save.goals.claimed)[tower] ?? [];
  if (list.includes(floor)) return "claimed";
  if (premium && !owns(save, passFor(tower).id)) return "needsPass";
  return highestFloor(save, tower) >= floor ? "ready" : "locked";
}

/** Claims a reward that is ready, paying it to its owner; returns it, or
 * null when it isn't ready. */
export function claimGoal(save: Save, tower: number, floor: number, premium: boolean): GoalReward | null {
  const c = checkpoint(tower, floor);
  if (!c || goalState(save, tower, floor, premium) !== "ready") return null;
  const reward = premium ? c.premium : c.reward;
  if (reward.kind === "currency") CURRENCIES[reward.currency].credit(save, reward.amount);
  ((premium ? save.goals.premium : save.goals.claimed)[tower] ??= []).push(floor);
  return reward;
}

/** Whether Warp is owned: Tower I's first checkpoint claimed. */
export const warpUnlocked = (save: Save) => goalState(save, 1, CHECKPOINT_EVERY, false) === "claimed";

/** Whether a run can warp to `floor` in `tower`: Warp owned and that
 * checkpoint reached. */
export const canWarp = (save: Save, tower: number, floor: number) =>
  warpUnlocked(save) && tower <= save.tower.tiersOpen && !!checkpoint(tower, floor) && highestFloor(save, tower) >= floor;

/** The premium rewards a pass opens, each currency's total. */
export function passTotals(pass: Pass): Partial<Record<CurrencyId, number>> {
  const totals: Partial<Record<CurrencyId, number>> = {};
  for (const tower of pass.towers)
    for (const c of CHECKPOINTS[tower]!)
      if (c.premium.kind === "currency") totals[c.premium.currency] = (totals[c.premium.currency] ?? 0) + c.premium.amount;
  return totals;
}

/** The saved claims: known towers and checkpoint floors, each once. */
export function decodeGoals(raw: any): GoalsSave {
  const goals = defaultGoals();
  for (const key of ["claimed", "premium"] as const) {
    const byTower = raw?.[key];
    if (!byTower || typeof byTower !== "object") continue;
    for (const [tower, floors] of Object.entries(byTower) as [string, unknown][]) {
      if (!CHECKPOINTS[Number(tower)] || !/^[1-9]$/.test(tower) || !Array.isArray(floors)) continue;
      const known = [...new Set(floors)].filter((f): f is number => typeof f === "number" && !!checkpoint(Number(tower), f));
      if (known.length) goals[key][tower] = known.sort((a, b) => a - b);
    }
  }
  return goals;
}
