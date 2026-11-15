import type { Save } from "./save/shape.ts";
import { CURRENCIES, type CurrencyId } from "./shop/currency.ts";
import { owns, type EntitlementId } from "./shop/entitlements.ts";
import { TIERS } from "./tiers.ts";
import { earn } from "./save/profile.ts";
import { towerRelicId } from "./economy/relics.ts";
import { openEquipment } from "./equipment/inventory.ts";

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
 * Reroll Daily Mission (Tower IV floor 30: the Archives' project that lets
 * a daily mission be swapped for another for Gems, game/mission-desk.ts),
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
 * a share of the skipped floors' Silver, economy/warp-loot.ts) and Boss Potion Drop
 * (floor 200: the Archives' project that has each boss give the hero a
 * percent potion, Finds.bossPotion), and Tower II's Training Discount (floor
 * 80: the Archives' project that cuts a trainer's Gold) and Card Groups
 * (floor 90: the Deck links neighbouring cards of the hand into a group
 * whose cards share one priority, cards/cards.ts), and Tower V's Flying Enemy
 * Card (floor 10: the FLYING ENEMY card joins the deck, `GOAL_CARDS` in
 * cards/cards.ts) and Super Critical Research (floor 200: the Archives'
 * two Super Critical projects, which need the skill too), and Tower IV's
 * Drop & Material Research (floor 70: the Archives' Common Drop Chance, a
 * boss's chance of a Common piece, RunPurse.killDrops, and Daily Mission
 * Materials, missionReward), and Tower VI's
 * Esoteric Research (floor 150: every Archives project of 100 or 150 levels
 * opens its last 50, maxLevel in progression/archives.ts). */
export type GoalUnlock =
  | "damagePrediction" | "combatForecast" | "attackLore" | "warp" | "damageVisual" | "relativeDamageColor" | "equipment" | "tournament" | "events" | "researchSpeed"
  | "shardAttack" | "shardDefense" | "parryPercent"
  | "shrines" | "firstBoonChoice" | "improveTradeoffs" | "autoPickBoons" | "boonOptions" | "banBoons" | "autoPickRanking"
  | "badgeSlots" | "noteTaking" | "archerCard" | "attackRange" | "attackSpeed" | "attackPerTile" | "chargedShot" | "multishot" | "rapidFire"
  | "trainingDiscount" | "cardGroups" | "flyingEnemyCard" | "warpLoot" | "superCriticalResearch" | "aetherShield" | "rerollMission"
  | "bossPotion" | "dropResearch" | "esotericResearch";
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
  warpLoot: "Warp Loot", superCriticalResearch: "Super Critical Research", aetherShield: "Unlock Aether Shield",
  rerollMission: "Reroll Daily Mission", bossPotion: "Boss Potion Drop", dropResearch: "Drop & Material Research",
  esotericResearch: "Esoteric Research",
};
/** What a checkpoint pays: an unlock, the next tower opened, an amount of a
 * currency or of Breakthrough points, or a relic. A `breakthrough` reward is
 * the checkpoint's own, paid besides the point every standard reward pays
 * (`GOAL_BREAKTHROUGH`). */
export type GoalReward =
  | { kind: "unlock"; unlock: GoalUnlock }
  | { kind: "tower"; tower: number }
  | { kind: "currency"; currency: CurrencyId; amount: number }
  | { kind: "breakthrough"; amount: number }
  | { kind: "relic"; relic: string };
export type Checkpoint = { floor: number; reward: GoalReward; premium: GoalReward };

/** Floors between checkpoints. */
export const CHECKPOINT_EVERY = 10;
/** The floors of every tower's checkpoints: every ten to 100, every 50 to
 * 300, then 400, 500, 750, 1,000, 1,250, 1,500, 2,000, 2,500 and 4,500. */
export const CHECKPOINT_FLOORS: readonly number[] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 4500];

const gold = (amount: number): GoalReward => ({ kind: "currency", currency: "gold", amount });
const gems = (amount: number): GoalReward => ({ kind: "currency", currency: "gems", amount });
const arcanite = (amount: number): GoalReward => ({ kind: "currency", currency: "arcanite", amount });
const breakthrough = (amount: number): GoalReward => ({ kind: "breakthrough", amount });

const unlock = (unlock: GoalUnlock): GoalReward => ({ kind: "unlock", unlock });
const relic = (tower: number, rarity: "epic" | "legendary"): GoalReward => ({ kind: "relic", relic: towerRelicId(tower, rarity) });
/** The checkpoint floor whose rewards are the tower's relics (`TOWER_RELICS`):
 * an epic one, and a legendary one as its premium reward. */
export const RELIC_FLOOR = 4500;
const opens = (tower: number): GoalReward => ({ kind: "tower", tower });
/** A checkpoint's two rewards. */
type CheckpointSet = Omit<Checkpoint, "floor">;
/** Tower I's checkpoints, every floor but the relics' (`RELIC_FLOOR`). */
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
  100: { reward: opens(2), premium: gems(30) },
  150: { reward: unlock("researchSpeed"), premium: gold(15_000) },
  200: { reward: gems(30), premium: gems(35) },
  250: { reward: unlock("noteTaking"), premium: gold(50_000) },
  300: { reward: gems(30), premium: gems(40) },
  400: { reward: gold(100_000), premium: gold(200_000) },
  500: { reward: gems(35), premium: gems(45) },
  750: { reward: gems(40), premium: gems(50) },
  1000: { reward: gems(45), premium: gems(55) },
  1250: { reward: gems(50), premium: gems(60) },
  1500: { reward: arcanite(5), premium: arcanite(10) },
  2000: { reward: gems(55), premium: gems(70) },
  2500: { reward: arcanite(10), premium: arcanite(15) },
};

/** Tower II's checkpoints. */
const TOWER_TWO: Record<number, CheckpointSet> = {
  10: { reward: unlock("relativeDamageColor"), premium: gold(2000) },
  20: { reward: unlock("shardAttack"), premium: gems(15) },
  30: { reward: unlock("shardDefense"), premium: gems(20) },
  40: { reward: unlock("warp"), premium: gold(4000) },
  50: { reward: gems(25), premium: gems(30) },
  60: { reward: unlock("equipment"), premium: gold(5000) },
  70: { reward: gold(10000), premium: gold(15000) },
  80: { reward: unlock("trainingDiscount"), premium: gold(25000) },
  90: { reward: unlock("cardGroups"), premium: gold(50000) },
  100: { reward: opens(3), premium: gems(35) },
  150: { reward: unlock("shrines"), premium: gold(200_000) },
  200: { reward: gems(35), premium: gems(40) },
  250: { reward: unlock("firstBoonChoice"), premium: gold(400_000) },
  300: { reward: gems(40), premium: gems(45) },
  400: { reward: unlock("improveTradeoffs"), premium: gold(6_000_000) },
  500: { reward: gems(40), premium: gems(50) },
  750: { reward: gems(45), premium: gems(60) },
  1000: { reward: gems(50), premium: gems(65) },
  1250: { reward: arcanite(10), premium: arcanite(15) },
  1500: { reward: arcanite(10), premium: arcanite(25) },
  2000: { reward: gems(60), premium: gems(80) },
  2500: { reward: arcanite(15), premium: arcanite(20) },
};
/** Tower III's checkpoints. */
const TOWER_THREE: Record<number, CheckpointSet> = {
  10: { reward: unlock("archerCard"), premium: gold(20_000) },
  20: { reward: unlock("attackRange"), premium: gems(20) },
  30: { reward: unlock("attackSpeed"), premium: gems(20) },
  40: { reward: gems(25), premium: gold(50_000) },
  50: { reward: unlock("attackPerTile"), premium: gems(25) },
  60: { reward: unlock("chargedShot"), premium: gold(100_000) },
  70: { reward: unlock("multishot"), premium: gems(30) },
  80: { reward: unlock("rapidFire"), premium: gold(200_000) },
  90: { reward: gems(30), premium: gems(40) },
  100: { reward: opens(4), premium: gems(45) },
  150: { reward: unlock("warpLoot"), premium: gold(500_000) },
  200: { reward: unlock("bossPotion"), premium: gold(1_000_000) },
  250: { reward: breakthrough(5), premium: gold(2_000_000) },
  300: { reward: gold(2_500_000), premium: gold(5_000_000) },
  400: { reward: breakthrough(5), premium: gold(10_000_000) },
  500: { reward: gems(40), premium: arcanite(15) },
  750: { reward: gems(50), premium: gems(65) },
  1000: { reward: arcanite(15), premium: arcanite(20) },
  1250: { reward: gems(60), premium: gems(75) },
  1500: { reward: arcanite(20), premium: arcanite(25) },
  2000: { reward: gems(70), premium: gems(90) },
  2500: { reward: arcanite(25), premium: arcanite(30) },
};
/** Tower IV's checkpoints. */
const TOWER_FOUR: Record<number, CheckpointSet> = {
  10: { reward: gold(100_000), premium: gold(150_000) },
  20: { reward: gems(25), premium: gems(30) },
  30: { reward: unlock("rerollMission"), premium: gold(150_000) },
  40: { reward: gems(30), premium: gems(40) },
  50: { reward: unlock("autoPickBoons"), premium: gold(300_000) },
  60: { reward: gems(40), premium: gems(50) },
  70: { reward: unlock("dropResearch"), premium: gold(500_000) },
  80: { reward: unlock("boonOptions"), premium: gold(750_000) },
  90: { reward: gems(45), premium: gems(55) },
  100: { reward: opens(5), premium: gems(50) },
  150: { reward: gold(1_000_000), premium: gold(1_500_000) },
  200: { reward: breakthrough(5), premium: gold(2_000_000) },
  250: { reward: gems(45), premium: gems(60) },
  300: { reward: gold(6_000_000), premium: gold(12_000_000) },
  400: { reward: gems(50), premium: gems(65) },
  500: { reward: gems(55), premium: arcanite(20) },
  750: { reward: gems(60), premium: gems(75) },
  1000: { reward: arcanite(20), premium: arcanite(25) },
  1250: { reward: gems(70), premium: gems(85) },
  1500: { reward: arcanite(25), premium: arcanite(30) },
  2000: { reward: gems(80), premium: gems(100) },
  2500: { reward: arcanite(30), premium: arcanite(35) },
};
/** Tower V's checkpoints. */
const TOWER_FIVE: Record<number, CheckpointSet> = {
  10: { reward: unlock("flyingEnemyCard"), premium: gold(500_000) },
  20: { reward: gems(30), premium: gems(35) },
  30: { reward: unlock("parryPercent"), premium: gold(1_000_000) },
  40: { reward: unlock("banBoons"), premium: gems(40) },
  50: { reward: gold(2_000_000), premium: gold(5_000_000) },
  60: { reward: gems(40), premium: gems(50) },
  70: { reward: gold(3_000_000), premium: gold(6_000_000) },
  80: { reward: gems(45), premium: gems(55) },
  90: { reward: gold(4_000_000), premium: gold(8_000_000) },
  100: { reward: opens(6), premium: gems(55) },
  150: { reward: breakthrough(5), premium: gold(10_000_000) },
  200: { reward: unlock("superCriticalResearch"), premium: gold(20_000_000) },
  250: { reward: gems(50), premium: gems(65) },
  300: { reward: gold(15_000_000), premium: gold(30_000_000) },
  400: { reward: gems(60), premium: gems(80) },
  500: { reward: breakthrough(5), premium: gold(50_000_000) },
  750: { reward: gems(70), premium: gems(90) },
  1000: { reward: arcanite(25), premium: arcanite(30) },
  1250: { reward: gems(80), premium: gems(95) },
  1500: { reward: arcanite(30), premium: arcanite(35) },
  2000: { reward: gems(90), premium: gems(110) },
  2500: { reward: arcanite(35), premium: arcanite(40) },
};
/** Tower VI's checkpoints. */
const TOWER_SIX: Record<number, CheckpointSet> = {
  10: { reward: unlock("autoPickRanking"), premium: gold(1_000_000) },
  20: { reward: gems(35), premium: gems(40) },
  30: { reward: gold(2_000_000), premium: gold(4_000_000) },
  40: { reward: gems(35), premium: gems(45) },
  50: { reward: unlock("badgeSlots"), premium: gold(5_000_000) },
  60: { reward: gems(40), premium: gems(50) },
  70: { reward: gold(5_000_000), premium: gold(10_000_000) },
  80: { reward: gems(45), premium: gems(55) },
  90: { reward: gold(8_000_000), premium: gold(15_000_000) },
  100: { reward: opens(7), premium: gems(60) },
  150: { reward: unlock("esotericResearch"), premium: gold(20_000_000) },
  200: { reward: gems(50), premium: gems(60) },
  250: { reward: gems(55), premium: gems(70) },
  300: { reward: gold(20_000_000), premium: gold(40_000_000) },
  400: { reward: gems(65), premium: arcanite(20) },
  500: { reward: gems(70), premium: gems(80) },
  750: { reward: gold(25_000_000), premium: gold(50_000_000) },
  1000: { reward: arcanite(30), premium: arcanite(35) },
  1250: { reward: gems(90), premium: gems(100) },
  1500: { reward: arcanite(30), premium: arcanite(35) },
  2000: { reward: gems(100), premium: gems(120) },
  2500: { reward: arcanite(40), premium: arcanite(45) },
};
/** Tower VII's checkpoints. */
const TOWER_SEVEN: Record<number, CheckpointSet> = {
  10: { reward: gold(4_000_000), premium: gold(8_000_000) },
  20: { reward: gems(40), premium: gems(50) },
  30: { reward: breakthrough(5), premium: gold(10_000_000) },
  40: { reward: gems(45), premium: gems(55) },
  50: { reward: gold(7_500_000), premium: gold(15_000_000) },
  60: { reward: arcanite(10), premium: arcanite(15) },
  70: { reward: gold(10_000_000), premium: gold(20_000_000) },
  80: { reward: breakthrough(5), premium: arcanite(20) },
  90: { reward: gold(12_500_000), premium: gold(25_000_000) },
  100: { reward: opens(8), premium: gems(60) },
  150: { reward: gems(50), premium: gems(60) },
  200: { reward: gems(55), premium: gems(65) },
  250: { reward: gems(55), premium: gems(70) },
  300: { reward: gems(60), premium: gems(75) },
  400: { reward: arcanite(10), premium: arcanite(20) },
  500: { reward: gems(70), premium: gems(90) },
  750: { reward: arcanite(15), premium: arcanite(25) },
  1000: { reward: gems(80), premium: gems(100) },
  1250: { reward: arcanite(20), premium: arcanite(30) },
  1500: { reward: gems(90), premium: gems(120) },
  2000: { reward: arcanite(35), premium: arcanite(40) },
  2500: { reward: arcanite(45), premium: arcanite(50) },
};
/** Tower VIII's checkpoints. */
const TOWER_EIGHT: Record<number, CheckpointSet> = {
  10: { reward: unlock("aetherShield"), premium: gold(50_000_000) },
  20: { reward: gems(45), premium: gems(55) },
  30: { reward: breakthrough(5), premium: arcanite(10) },
  40: { reward: gems(50), premium: gems(60) },
  50: { reward: gold(50_000_000), premium: gold(75_000_000) },
  60: { reward: gems(55), premium: gems(70) },
  70: { reward: gold(100_000_000), premium: gold(150_000_000) },
  80: { reward: arcanite(15), premium: arcanite(15) },
  90: { reward: gems(60), premium: gems(80) },
  100: { reward: opens(9), premium: gems(80) },
  150: { reward: gems(65), premium: gems(85) },
  200: { reward: arcanite(15), premium: arcanite(20) },
  250: { reward: gems(70), premium: gems(90) },
  300: { reward: gold(200_000_000), premium: gold(400_000_000) },
  400: { reward: gems(75), premium: gems(95) },
  500: { reward: arcanite(20), premium: arcanite(25) },
  750: { reward: gems(85), premium: gems(110) },
  1000: { reward: arcanite(25), premium: arcanite(30) },
  1250: { reward: gems(90), premium: gems(120) },
  1500: { reward: arcanite(30), premium: arcanite(35) },
  2000: { reward: gems(100), premium: gems(130) },
  2500: { reward: arcanite(50), premium: arcanite(55) },
};
/** Tower IX's checkpoints: the last tower, so floor 100 opens none. */
const TOWER_NINE: Record<number, CheckpointSet> = {
  10: { reward: gold(100_000_000), premium: gold(200_000_000) },
  20: { reward: gems(50), premium: gems(60) },
  30: { reward: arcanite(10), premium: arcanite(10) },
  40: { reward: gems(55), premium: gems(65) },
  50: { reward: gold(150_000_000), premium: gold(300_000_000) },
  60: { reward: gems(60), premium: gems(75) },
  70: { reward: gold(200_000_000), premium: gold(400_000_000) },
  80: { reward: arcanite(15), premium: arcanite(20) },
  90: { reward: gems(65), premium: gems(85) },
  100: { reward: gold(250_000_000), premium: gems(90) },
  150: { reward: gems(75), premium: gems(95) },
  200: { reward: arcanite(25), premium: arcanite(30) },
  250: { reward: gems(80), premium: gems(100) },
  300: { reward: gold(500_000_000), premium: gold(1_000_000_000) },
  400: { reward: gems(85), premium: gems(105) },
  500: { reward: arcanite(30), premium: arcanite(35) },
  750: { reward: gems(95), premium: gems(120) },
  1000: { reward: arcanite(35), premium: arcanite(40) },
  1250: { reward: gems(100), premium: gems(130) },
  1500: { reward: arcanite(40), premium: arcanite(45) },
  2000: { reward: gems(120), premium: gems(150) },
  2500: { reward: arcanite(55), premium: arcanite(60) },
};
/** The checkpoint floor whose reward opens the next tower. */
export const TOWER_UNLOCK_FLOOR = 100;

/** A tower's checkpoints, lowest first: its table's, and the relics at
 * `RELIC_FLOOR`. Every other floor must be in the table. */
function towerCheckpoints(tower: number): Checkpoint[] {
  const sets: Record<number, Record<number, CheckpointSet>> = { 1: TOWER_ONE, 2: TOWER_TWO, 3: TOWER_THREE, 4: TOWER_FOUR, 5: TOWER_FIVE, 6: TOWER_SIX, 7: TOWER_SEVEN, 8: TOWER_EIGHT, 9: TOWER_NINE };
  return CHECKPOINT_FLOORS.map((floor) => {
    if (floor === RELIC_FLOOR) return { floor, reward: relic(tower, "epic"), premium: relic(tower, "legendary") };
    const set = sets[tower]?.[floor];
    if (!set) throw new Error(`Tower ${tower} has no rewards for floor ${floor}`);
    return { floor, ...set };
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

/** The Breakthrough points each standard Goal reward pays besides itself,
 * unsaid on the Goals page (a premium reward pays none). */
export const GOAL_BREAKTHROUGH = 1;

/** Claims a reward that can be claimed (`canClaimGoal`), paying it to its
 * owner, and a standard one's Breakthrough point; returns it, or null when
 * it can't be. */
export function claimGoal(save: Save, tower: number, floor: number, premium: boolean): GoalReward | null {
  const c = checkpoint(tower, floor);
  if (!c || !canClaimGoal(save, tower, floor, premium)) return null;
  const reward = premium ? c.premium : c.reward;
  if (reward.kind === "currency") CURRENCIES[reward.currency].credit(save, reward.amount);
  if (reward.kind === "breakthrough") {
    save.breakthrough += reward.amount;
    earn(save, "breakthrough", reward.amount);
  }
  if (reward.kind === "tower") openTower(save, reward.tower);
  if (reward.kind === "relic" && !save.relics.includes(reward.relic)) save.relics = [...save.relics, reward.relic];
  if (!premium) {
    save.breakthrough += GOAL_BREAKTHROUGH;
    earn(save, "breakthrough", GOAL_BREAKTHROUGH);
  }
  // Equipment keeps its own flag, which a save that claimed it before it
  // moved to Tower II may already hold. Opening it gives its welcome's
  // Equipment Tickets.
  if (reward.kind === "unlock" && reward.unlock === "equipment") openEquipment(save.equipment);
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
