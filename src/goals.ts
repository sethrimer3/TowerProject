import type { Save } from "./entities.ts";
import { CURRENCIES, type CurrencyId } from "./shop/currency.ts";
import { owns, type EntitlementId } from "./shop/entitlements.ts";
import { TIERS } from "./tiers.ts";

// Goals: each tower's checkpoints, one every ten floors, each with a reward
// the player claims once the checkpoint's floor is completed (the floor
// above it reached) in that tower, and a premium
// reward beside it, claimed the same way once the Premium Pass for the
// tower's set of three is owned. Claims last between runs (`save.goals`).

/** What a checkpoint can unlock: Combat Forecast (an enemy's inspect panel
 * says how many hits defeat it), Attack Lore (and how much more ATK would
 * take one hit fewer), and Warp (starting a run past a completed
 * checkpoint). */
export type GoalUnlock = "combatForecast" | "attackLore" | "warp";
export const UNLOCK_NAMES: Record<GoalUnlock, string> = { combatForecast: "Combat Forecast", attackLore: "Attack Lore", warp: "Warp" };
/** What a checkpoint pays: an unlock, or an amount of a currency. */
export type GoalReward = { kind: "unlock"; unlock: GoalUnlock } | { kind: "currency"; currency: CurrencyId; amount: number };
export type Checkpoint = { floor: number; reward: GoalReward; premium: GoalReward };

/** Floors between checkpoints. */
export const CHECKPOINT_EVERY = 10;
/** Checkpoints each tower has, for now. */
export const CHECKPOINTS_PER_TOWER = 10;

const gold = (amount: number): GoalReward => ({ kind: "currency", currency: "gold", amount });
const gems = (amount: number): GoalReward => ({ kind: "currency", currency: "gems", amount });

const unlock = (unlock: GoalUnlock): GoalReward => ({ kind: "unlock", unlock });
/** Tower I's first checkpoints: an unlock each, and Gems. */
const TOWER_ONE: Record<number, Omit<Checkpoint, "floor">> = {
  10: { reward: unlock("combatForecast"), premium: gems(15) },
  20: { reward: unlock("attackLore"), premium: gems(25) },
  30: { reward: unlock("warp"), premium: gems(35) },
};

/** A tower's checkpoints, lowest first.
 * TODO: the stub rewards (100 Gold × checkpoint × tower, 10 Gems × checkpoint)
 * are placeholders, to be tuned. */
function towerCheckpoints(tower: number): Checkpoint[] {
  return Array.from({ length: CHECKPOINTS_PER_TOWER }, (_, i) => {
    const n = i + 1, floor = n * CHECKPOINT_EVERY, set = tower === 1 ? TOWER_ONE[floor] : undefined;
    return { floor, ...(set ?? { reward: gold(100 * n * tower), premium: gems(10 * n) }) };
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

/** The highest floor completed in `tower`: a floor counts once the floor
 * above it is reached, so it is the highest height reached (0 before the
 * first floor is completed), in the selected tower's records or the
 * waiting ones. */
export function floorsCompleted(save: Save, tower: number) {
  const t = save.tower;
  return tower === t.tier ? t.reached : t.tierRecords[tower]?.reached ?? 0;
}

/** Where a reward stands: its floor not completed yet, waiting for the pass (premium
 * only), ready to claim, or claimed. */
export type GoalState = "locked" | "needsPass" | "ready" | "claimed";

export function goalState(save: Save, tower: number, floor: number, premium: boolean): GoalState {
  const list = (premium ? save.goals.premium : save.goals.claimed)[tower] ?? [];
  if (list.includes(floor)) return "claimed";
  if (premium && !owns(save, passFor(tower).id)) return "needsPass";
  return floorsCompleted(save, tower) >= floor ? "ready" : "locked";
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

/** Whether `what` is owned: the Tower I checkpoint that unlocks it claimed. */
export const goalUnlocked = (save: Save, what: GoalUnlock) => goalState(save, 1, unlockFloor(what), false) === "claimed";
/** The Tower I checkpoint floor whose reward unlocks `what`. */
export const unlockFloor = (what: GoalUnlock) =>
  CHECKPOINTS[1]!.find((c) => c.reward.kind === "unlock" && c.reward.unlock === what)!.floor;
/** Whether Warp is owned. */
export const warpUnlocked = (save: Save) => goalUnlocked(save, "warp");

/** Whether a run can warp past `floor` in `tower`: Warp owned and that
 * checkpoint's floor completed. */
export const canWarp = (save: Save, tower: number, floor: number) =>
  warpUnlocked(save) && tower <= save.tower.tiersOpen && !!checkpoint(tower, floor) && floorsCompleted(save, tower) >= floor;

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
