import type { Save } from "./save-shape.ts";
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
 * fight would cost), Relative Damage Color (Tower II: that cost coloured
 * by its share of the hero's HP), the Tournament (twice-weekly global
 * competition in the Delve, docs/TOURNAMENT.md), Events (fortnightly
 * missions paying Medals toward relics, docs/EVENTS.md) and Research Speed
 * (the Archives' project that shortens every research), Shard ATK and Shard
 * DEF (Tower II: the Archives' projects that raise what each ATK or DEF
 * shard gives), Equipment (Tower II: the Blacksmith,
 * equipment and its materials), Parry % (Tower V: the Archives' project
 * that raises Parry %), and the Shrines' research: Unlock Shrines (Tower II
 * floor 150), First Boon Choice (floor 250), Improve Trade-off Boons (floor
 * 400), Auto Pick Boons and Boon Option Quantity (Tower IV floors 50 and 80),
 * Ban Boons (Tower V floor 40) and Auto Pick Ranking (Tower VI floor 10),
 * Badge Slots (Tower VI floor 50: the Archives' project that lets each
 * card hold more badges), Note Taking (Tower I floor 250: the Archives'
 * project that opens the run's notes), and Tower III's Archer Card (floor
 * 10: the ARCHER card joins the deck, `GOAL_CARDS` in cards/cards.ts; while the
 * hand holds it the hero fires at the nearest enemy in range, enemies/ranged.ts), Attack Range
 * and Attack Speed (floors 20 and 30: the Training rows that improve it),
 * ATK / m (floor 50: the Training row that strikes harder from further
 * off), Charged Shot (floor 60: the Archives' project that strengthens
 * an arrow that waits), Multishot (floor 70: the Training rows that let
 * a shot fire at several enemies) and Rapid Fire (floor 80: the Training
 * rows that may make the Archer fire four times as fast for a while) and
 * Warp Loot (floor 150: the Archives' project that starts a Warp run with
 * a share of the skipped floors' Silver, economy/warp-loot.ts), and Tower II's Training Discount (floor
 * 80: the Archives' project that cuts a trainer's Gold) and Card Groups
 * (floor 90: the Deck links neighbouring cards of the hand into a group
 * whose cards share one priority, cards/cards.ts), and Tower V's Flying Enemy
 * Card (floor 10: the FLYING ENEMY card joins the deck, `GOAL_CARDS` in
 * cards/cards.ts). */
export type GoalUnlock =
  | "damagePrediction" | "combatForecast" | "attackLore" | "warp" | "damageVisual" | "relativeDamageColor" | "equipment" | "tournament" | "events" | "researchSpeed"
  | "shardAttack" | "shardDefense" | "parryPercent"
  | "shrines" | "firstBoonChoice" | "improveTradeoffs" | "autoPickBoons" | "boonOptions" | "banBoons" | "autoPickRanking"
  | "badgeSlots" | "noteTaking" | "archerCard" | "attackRange" | "attackSpeed" | "attackPerTile" | "chargedShot" | "multishot" | "rapidFire"
  | "trainingDiscount" | "cardGroups" | "flyingEnemyCard" | "warpLoot";
export const UNLOCK_NAMES: Record<GoalUnlock, string> = {
  damagePrediction: "Damage Prediction", combatForecast: "Combat Forecast", attackLore: "Attack Lore", warp: "Warp", damageVisual: "Damage Visual",
  relativeDamageColor: "Relative Damage Color", equipment: "Equipment", tournament: "Tournament", events: "Events",
  researchSpeed: "Research Speed", shardAttack: "Shard ATK", shardDefense: "Shard DEF",
  parryPercent: "Parry %",
  shrines: "Unlock Shrines", firstBoonChoice: "First Boon Choice", improveTradeoffs: "Improve Trade-off Boons",
  autoPickBoons: "Auto Pick Boons", boonOptions: "Boon Option Quantity", banBoons: "Ban Boons", autoPickRanking: "Auto Pick Ranking",
  badgeSlots: "Badge Slots", noteTaking: "Note Taking",
  archerCard: "Archer Card", attackRange: "Attack Range", attackSpeed: "Attack Speed", attackPerTile: "ATK / m", chargedShot: "Charged Shot", multishot: "Multishot", rapidFire: "Rapid Fire",
  trainingDiscount: "Training Discount", cardGroups: "Card Groups", flyingEnemyCard: "Flying Enemy Card",
  warpLoot: "Warp Loot",
};
/** What a checkpoint pays: an unlock, the next tower opened, or an amount of a currency. */
export type GoalReward =
  | { kind: "unlock"; unlock: GoalUnlock }
  | { kind: "tower"; tower: number }
  | { kind: "currency"; currency: CurrencyId; amount: number };
export type Checkpoint = { floor: number; reward: GoalReward; premium: GoalReward };

/** Floors between checkpoints. */
export const CHECKPOINT_EVERY = 10;
/** The floors of every tower's checkpoints: every ten to 100, every 50 to
 * 300, then 400, 500, 750, 1,000, 1,250, 1,500, 2,000, 2,500 and 4,500. */
export const CHECKPOINT_FLOORS: readonly number[] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 4500];

const gold = (amount: number): GoalReward => ({ kind: "currency", currency: "gold", amount });
const gems = (amount: number): GoalReward => ({ kind: "currency", currency: "gems", amount });
const shards = (amount: number): GoalReward => ({ kind: "currency", currency: "shards", amount });

const unlock = (unlock: GoalUnlock): GoalReward => ({ kind: "unlock", unlock });
/** A checkpoint's rewards that differ from the stub; either left out is the stub's. */
type CheckpointSet = Partial<Omit<Checkpoint, "floor">>;
/** Tower I's checkpoints that differ from the stub: an unlock each, Gems,
 * Gold and Ascension Shards, and its premium rewards. */
const TOWER_ONE: Record<number, CheckpointSet> = {
  10: { reward: unlock("damagePrediction"), premium: gold(100) },
  20: { reward: unlock("combatForecast"), premium: gems(10) },
  30: { reward: unlock("attackLore"), premium: gems(10) },
  40: { reward: gems(20), premium: gold(300) },
  50: { reward: unlock("damageVisual"), premium: gems(15) },
  60: { reward: unlock("tournament"), premium: gems(20) },
  70: { reward: unlock("events"), premium: gold(600) },
  80: { reward: gems(25), premium: gems(30) },
  90: { reward: gold(2000), premium: gems(30) },
  150: { reward: unlock("researchSpeed"), premium: gold(15_000) },
  200: { reward: gems(30), premium: gems(35) },
  250: { reward: unlock("noteTaking"), premium: gold(30_000) },
  300: { premium: gems(25) },
  400: { premium: gold(100_000) },
  500: { premium: gems(30) },
  750: { premium: gems(35) },
  1000: { premium: gems(40) },
  1250: { premium: gems(45) },
  1500: { reward: shards(5), premium: shards(10) },
  2000: { premium: gems(50) },
  2500: { premium: shards(15) },
  4500: { premium: shards(20) },
};

/** Tower II's checkpoints that differ from the stub: an unlock each, and Gold. */
const TOWER_TWO: Record<number, CheckpointSet> = {
  10: { reward: unlock("relativeDamageColor") },
  20: { reward: unlock("shardAttack") },
  30: { reward: unlock("shardDefense") },
  40: { reward: unlock("warp") },
  50: { reward: gems(25) },
  60: { reward: unlock("equipment") },
  70: { reward: gold(10000) },
  80: { reward: unlock("trainingDiscount") },
  90: { reward: unlock("cardGroups") },
  150: { reward: unlock("shrines") },
  250: { reward: unlock("firstBoonChoice") },
  400: { reward: unlock("improveTradeoffs") },
};
/** Tower III's checkpoints that differ from the stub. */
const TOWER_THREE: Record<number, CheckpointSet> = {
  10: { reward: unlock("archerCard") },
  20: { reward: unlock("attackRange") },
  30: { reward: unlock("attackSpeed") },
  50: { reward: unlock("attackPerTile") },
  60: { reward: unlock("chargedShot") },
  70: { reward: unlock("multishot") },
  80: { reward: unlock("rapidFire") },
  90: { reward: gems(30) },
  150: { reward: unlock("warpLoot") },
};
/** Tower IV's checkpoints that differ from the stub. */
const TOWER_FOUR: Record<number, CheckpointSet> = {
  50: { reward: unlock("autoPickBoons") },
  80: { reward: unlock("boonOptions") },
};
/** Tower V's checkpoints that differ from the stub. */
const TOWER_FIVE: Record<number, CheckpointSet> = {
  10: { reward: unlock("flyingEnemyCard") },
  30: { reward: unlock("parryPercent") },
  40: { reward: unlock("banBoons") },
};
/** Tower VI's checkpoints that differ from the stub. */
const TOWER_SIX: Record<number, CheckpointSet> = {
  10: { reward: unlock("autoPickRanking") },
  50: { reward: unlock("badgeSlots") },
};
/** The checkpoint floor whose reward opens the next tower. */
export const TOWER_UNLOCK_FLOOR = 100;

/** A tower's checkpoints, lowest first.
 * TODO: the stub rewards (100 Gold × checkpoint number × tower, 5 Gems × checkpoint number
 * premium) are placeholders, to be tuned. */
function towerCheckpoints(tower: number): Checkpoint[] {
  const sets: Record<number, Record<number, CheckpointSet>> = { 1: TOWER_ONE, 2: TOWER_TWO, 3: TOWER_THREE, 4: TOWER_FOUR, 5: TOWER_FIVE, 6: TOWER_SIX };
  return CHECKPOINT_FLOORS.map((floor, i) => {
    const n = i + 1, set = sets[tower]?.[floor];
    const opens = floor === TOWER_UNLOCK_FLOOR && tower < TIERS ? { kind: "tower" as const, tower: tower + 1 } : null;
    return { floor, reward: set?.reward ?? opens ?? gold(100 * n * tower), premium: set?.premium ?? gems(5 * n) };
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

/** Whether a reward can be claimed now: ready, or with Dev free purchases
 * on, its floor not completed yet. */
function canClaimGoal(save: Save, tower: number, floor: number, premium: boolean) {
  const state = goalState(save, tower, floor, premium);
  return state === "ready" || (state === "locked" && save.settings.freePurchases);
}

/** Claims a reward that can be claimed (`canClaimGoal`), paying it to its
 * owner; returns it, or null when it can't be. */
export function claimGoal(save: Save, tower: number, floor: number, premium: boolean): GoalReward | null {
  const c = checkpoint(tower, floor);
  if (!c || !canClaimGoal(save, tower, floor, premium)) return null;
  const reward = premium ? c.premium : c.reward;
  if (reward.kind === "currency") CURRENCIES[reward.currency].credit(save, reward.amount);
  if (reward.kind === "tower") openTower(save, reward.tower);
  // Equipment keeps its own flag, which a save that claimed it before it
  // moved to Tower II may already hold.
  if (reward.kind === "unlock" && reward.unlock === "equipment") save.equipment.unlocked = true;
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
export const goalUnlocked = (save: Pick<Save, "goals">, what: GoalUnlock) => {
  const at = unlockAt(what);
  return !!save.goals.claimed[at.tower]?.includes(at.floor);
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
/** The hero's class, as the HUD names it under its portrait: an Archer
 * while the hand holds the ARCHER card (`archer`, `shootsWith` in
 * cards/cards.ts), else a Wayfarer, or a Pathfinder once Tower II is open.
 * Cosmetic. */
export const heroClass = (save: Pick<Save, "tower">, archer: boolean) =>
  archer ? "Archer" : save.tower.tiersOpen >= 2 ? "Pathfinder" : "Wayfarer";
/** Whether Warp is owned. */
export const warpUnlocked = (save: Save) => goalUnlocked(save, "warp");

/** The lowest checkpoint in `tower`, up to `floor`, whose area isn't
 * mastered: what keeps the warp point at `floor` inactive. Null once every
 * one is mastered. */
export const unmasteredBelow = (save: Save, tower: number, floor: number) =>
  CHECKPOINTS[tower]?.find((c) => c.floor <= floor && !areaMastered(save, tower, c.floor))?.floor ?? null;

/** Whether a run can warp past `floor` in `tower`: Warp owned and the area
 * ending at that checkpoint mastered, with every one below it in the tower's
 * Goals, so a warp point is active only once each under it is unlocked. */
export const canWarp = (save: Save, tower: number, floor: number) =>
  warpUnlocked(save) && tower <= save.tower.tiersOpen && !!checkpoint(tower, floor) && unmasteredBelow(save, tower, floor) === null;

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
