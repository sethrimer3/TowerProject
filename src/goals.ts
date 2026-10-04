import type { Save } from "./entities.ts";
import { CURRENCIES, type CurrencyId } from "./shop/currency.ts";
import { owns, type EntitlementId } from "./shop/entitlements.ts";
import { TIERS } from "./tiers.ts";

// Goals: each tower's checkpoints, one every ten floors, each with a reward
// the player claims once the checkpoint's floor is completed (the floor
// above it reached) in that tower, and a premium
// reward beside it, claimed the same way once the Premium Pass for the
// tower's set of three is owned. Claims last between runs (`save.goals`),
// as do each tower's areas mastered and cleared (tower/area-ledger.ts).
// Floor 100's reward in every tower below the last opens the next tower.

/** What a checkpoint can unlock: Damage Prediction (an enemy's inspect
 * panel says what the fight would cost and whether it is survivable),
 * Combat Forecast (how many hits defeat it), Attack Lore (and how much more
 * ATK would take one hit fewer), Warp (starting a run past a completed
 * checkpoint), Damage Visual (each enemy on the board wears what its
 * fight would cost) and Relative Damage Color (Tower II: that cost coloured
 * by its share of the hero's HP). */
export type GoalUnlock = "damagePrediction" | "combatForecast" | "attackLore" | "warp" | "damageVisual" | "relativeDamageColor";
export const UNLOCK_NAMES: Record<GoalUnlock, string> = {
  damagePrediction: "Damage Prediction", combatForecast: "Combat Forecast", attackLore: "Attack Lore", warp: "Warp", damageVisual: "Damage Visual",
  relativeDamageColor: "Relative Damage Color",
};
/** What a checkpoint pays: an unlock, the next tower opened, or an amount of a currency. */
export type GoalReward =
  | { kind: "unlock"; unlock: GoalUnlock }
  | { kind: "tower"; tower: number }
  | { kind: "currency"; currency: CurrencyId; amount: number };
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
  10: { reward: unlock("damagePrediction"), premium: gems(10) },
  20: { reward: unlock("combatForecast"), premium: gems(15) },
  30: { reward: unlock("attackLore"), premium: gems(25) },
  40: { reward: unlock("warp"), premium: gems(35) },
  50: { reward: unlock("damageVisual"), premium: gems(50) },
};

/** Tower II's first checkpoint: an unlock. */
const TOWER_TWO: Record<number, Omit<Checkpoint, "floor">> = {
  10: { reward: unlock("relativeDamageColor"), premium: gems(10) },
};
/** The checkpoint floor whose reward opens the next tower. */
export const TOWER_UNLOCK_FLOOR = 100;

/** A tower's checkpoints, lowest first.
 * TODO: the stub rewards (100 Gold × checkpoint × tower, 10 Gems × checkpoint)
 * are placeholders, to be tuned. */
function towerCheckpoints(tower: number): Checkpoint[] {
  const sets: Record<number, Record<number, Omit<Checkpoint, "floor">>> = { 1: TOWER_ONE, 2: TOWER_TWO };
  return Array.from({ length: CHECKPOINTS_PER_TOWER }, (_, i) => {
    const n = i + 1, floor = n * CHECKPOINT_EVERY, set = sets[tower]?.[floor];
    const opens = floor === TOWER_UNLOCK_FLOOR && tower < TIERS ? { kind: "tower" as const, tower: tower + 1 } : null;
    return { floor, ...(set ?? { reward: opens ?? gold(100 * n * tower), premium: gems(10 * n) }) };
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

/** What the Goals save keeps, by tower: the floors of the checkpoints
 * claimed, and of the premium rewards claimed; and each area mastered (no
 * damage taken across it; only an area ending at a checkpoint) and cleared
 * (no enemy left in it), by the area's last floor. */
export type GoalsSave = {
  claimed: Record<string, number[]>;
  premium: Record<string, number[]>;
  mastered: Record<string, number[]>;
  cleared: Record<string, number[]>;
};
export const defaultGoals = (): GoalsSave => ({ claimed: {}, premium: {}, mastered: {}, cleared: {} });

/** Whether the area ending on `floor` in `tower` is mastered, or cleared. */
export const areaMastered = (save: Save, tower: number, floor: number) => !!save.goals.mastered[tower]?.includes(floor);
export const areaCleared = (save: Save, tower: number, floor: number) => !!save.goals.cleared[tower]?.includes(floor);

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

/** Whether any open tower has a reward ready to claim, standard or premium
 * (the Goals button's dot). */
export const goalsWaiting = (save: Save) =>
  Array.from({ length: save.tower.tiersOpen }, (_, i) => i + 1).some((tower) =>
    CHECKPOINTS[tower]!.some((c) => goalState(save, tower, c.floor, false) === "ready" || goalState(save, tower, c.floor, true) === "ready"));

/** Claims a reward that is ready, paying it to its owner; returns it, or
 * null when it isn't ready. */
export function claimGoal(save: Save, tower: number, floor: number, premium: boolean): GoalReward | null {
  const c = checkpoint(tower, floor);
  if (!c || goalState(save, tower, floor, premium) !== "ready") return null;
  const reward = premium ? c.premium : c.reward;
  if (reward.kind === "currency") CURRENCIES[reward.currency].credit(save, reward.amount);
  if (reward.kind === "tower") openTower(save, reward.tower);
  ((premium ? save.goals.premium : save.goals.claimed)[tower] ??= []).push(floor);
  return reward;
}

/** Opens `tower` and every one below it, and the Delve's caves with them
 * (they follow the Towers opened); a tower already open stays so. */
function openTower(save: Save, tower: number) {
  save.tower.tiersOpen = Math.max(save.tower.tiersOpen, Math.min(TIERS, tower));
  save.delve.tiersOpen = save.tower.tiersOpen;
}

/** Whether `what` is owned: the checkpoint that unlocks it claimed. */
export const goalUnlocked = (save: Save, what: GoalUnlock) => {
  const at = unlockAt(what);
  return goalState(save, at.tower, at.floor, false) === "claimed";
};
/** The tower and checkpoint floor whose reward unlocks `what`. */
export function unlockAt(what: GoalUnlock) {
  for (let tower = 1; tower <= TIERS; tower++) {
    const c = CHECKPOINTS[tower]!.find((c) => c.reward.kind === "unlock" && c.reward.unlock === what);
    if (c) return { tower, floor: c.floor };
  }
  throw new Error(`no checkpoint unlocks ${what}`);
}
/** The checkpoint floor whose reward unlocks `what`. */
export const unlockFloor = (what: GoalUnlock) => unlockAt(what).floor;
/** Whether Warp is owned. */
export const warpUnlocked = (save: Save) => goalUnlocked(save, "warp");

/** Whether a run can warp past `floor` in `tower`: Warp owned and the area
 * ending at that checkpoint mastered. */
export const canWarp = (save: Save, tower: number, floor: number) =>
  warpUnlocked(save) && tower <= save.tower.tiersOpen && !!checkpoint(tower, floor) && areaMastered(save, tower, floor);

/** The premium rewards a pass opens, each currency's total. */
export function passTotals(pass: Pass): Partial<Record<CurrencyId, number>> {
  const totals: Partial<Record<CurrencyId, number>> = {};
  for (const tower of pass.towers)
    for (const c of CHECKPOINTS[tower]!)
      if (c.premium.kind === "currency") totals[c.premium.currency] = (totals[c.premium.currency] ?? 0) + c.premium.amount;
  return totals;
}

/** The saved claims and areas: known towers and floors, each once. Claims
 * and areas mastered are checkpoint floors; an area cleared may end past
 * the last checkpoint, on any multiple of ten. */
export function decodeGoals(raw: any): GoalsSave {
  const goals = defaultGoals();
  for (const key of ["claimed", "premium", "mastered", "cleared"] as const) {
    const byTower = raw?.[key];
    const valid = key === "cleared" ? areaEnd : (tower: number, f: number) => !!checkpoint(tower, f);
    if (byTower && typeof byTower === "object") decodeFloors(byTower, goals[key], valid);
  }
  return goals;
}
/** The last floor of an area. */
const areaEnd = (_tower: number, f: number) => Number.isSafeInteger(f) && f > 0 && f % CHECKPOINT_EVERY === 0;
/** Each known tower's valid floors, each once, in order. */
function decodeFloors(byTower: object, out: Record<string, number[]>, valid: (tower: number, floor: number) => boolean) {
  for (const [tower, floors] of Object.entries(byTower) as [string, unknown][]) {
    if (!isTower(tower) || !Array.isArray(floors)) continue;
    const known = [...new Set(floors)].filter((f): f is number => typeof f === "number" && valid(Number(tower), f));
    if (known.length) out[tower] = known.sort((a, b) => a - b);
  }
}
/** A tower with checkpoints, by its saved key (1 to 9). */
const isTower = (key: string) => /^[1-9]$/.test(key) && !!CHECKPOINTS[Number(key)];
