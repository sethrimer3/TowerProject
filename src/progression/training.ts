import type { UpgradeId } from "./upgrades.ts";
import type { PriceSchedule } from "../economy/prices.ts";
import type { GoalUnlock } from "../goals.ts";
import type { ResearchTarget } from "./archives.ts";
import { snap } from "../exact.ts";
/** Training points each level earns, to spend on the hero's stats. */
export const TRAINING_PER_LEVEL = 3;
/** The groups the Training tab, and a run's training bar, show the rows
 * in, in order. */
export const TRAINING_GROUPS = { offense: "Offense", defense: "Defense", utility: "Utility" } as const;
export type TrainingId = (typeof TRAINING)[number]["id"];
export type TrainingRow = (typeof TRAINING)[number];
/** The Limit Break skills, in the order the chain buys them. */
export const LIMIT_BREAKS = ["limitBreak1", "limitBreak2", "limitBreak3", "limitBreak4", "limitBreak5", "limitBreak6", "limitBreak7", "limitBreak8", "limitBreak9", "limitBreak10"] as const satisfies readonly UpgradeId[];
/** Training levels each Limit Break adds to the cap of a row it raises. */
export const LIMIT_BREAK_RANKS = 500;
/** The Limit Breaks that raise `row`'s cap: its first `breaks` of them. */
const breaksOf = (row: TrainingRow) => ("breaks" in row ? row.breaks : 0);
/** The most levels `row` trains to with `upgrades` owned: its `max`,
 * `LIMIT_BREAK_RANKS` more for each Limit Break owned that raises it, and
 * what its own `raisedBy` skill adds once owned. */
export const trainingCap = (row: TrainingRow, upgrades: Partial<Record<UpgradeId, number>>) =>
  row.max + LIMIT_BREAK_RANKS * LIMIT_BREAKS.slice(0, breaksOf(row)).filter((id) => upgrades[id]).length + ("raisedBy" in row && upgrades[row.raisedBy.upgrade] ? row.raisedBy.ranks : 0);
/** The most levels `row` trains to with every skill that raises it owned,
 * which a saved rank may hold. */
export const trainingCeiling = (row: TrainingRow) => row.max + LIMIT_BREAK_RANKS * breaksOf(row) + ("raisedBy" in row ? row.raisedBy.ranks : 0);
/** A row that raises one of the character's stats. */
export type StatTrainingRow = Extract<TrainingRow, { stat: string }>;
export const isStatRow = (row: TrainingRow): row is StatTrainingRow => "stat" in row;
/** Rows open from the start. */
const cheap: PriceSchedule = { base: 5, step: 1, growth: 3 };
/** Max HP and Shroud: the cheapest, rising a little more slowly. */
const vital: PriceSchedule = { base: 3, step: 1, growth: 2 };
/** Rows a skill opens: steeper, so ranks from Inspiration's Training points
 * stay worth more than Silver's. */
const opened: PriceSchedule = { base: 10, step: 2, growth: 3 };
/** Rows a deeper skill opens. */
const deep: PriceSchedule = { base: 20, step: 4, growth: 4 };
/** The Free Upgrade rows: 75 for the first rank, then 75 × n × (1 + (n − 1) /
 * 11 + ((n − 1) / 49)³) for the n-th (1,582 for the 11th, 9,771 for the
 * 32nd, 92,815 for the 87th, 136,855 for the 100th), the same in Silver
 * and a trainer's Gold. */
const freeUpgrades = { base: 75, growth: 11, cubic: 49 };
/** Thorn Damage: 60 for the first rank, then 60 × n × (1 + ((n − 1) / 23)²)
 * for the n-th (993 for the 13th, 9,901 for the 41st, 113,781 for the
 * 99th), the same in Silver and a trainer's Gold. */
const thornPrices = { base: 60, growth: 23, power: 2 };
/** Parry %: 40 for the first rank, then 40 × n × (1 + ((n −
 * 1) / 23)²) for the n-th (590 for the 12th, 4,775 for the 36th, 40,953
 * for the 80th), the same in Silver and a trainer's Gold. */
const parryPrices = { base: 40, growth: 23, power: 2 };
/** Revive: 100 for the first rank, then 100 × n × (1 + ((n − 1) / 6.4)³) for
 * the n-th (1,277 for the 7th, 9,870 for the 13th, 95,724 for the 23rd,
 * 1,005,077 for the 41st, 35,554,490 for the 99th), the same in Silver and a trainer's Gold. */
const revivePrices = { base: 100, growth: 6.4, power: 3 };
/** Attack Range: 50 for the first rank, then 50 × n × (1 + (n − 1) / 12 +
 * ((n − 1) / 37)³) for the n-th (1,165 for the 12th, 8,573 for the 36th,
 * 64,075 for the 78th), the same in Silver and a trainer's Gold. */
const rangePrices = { base: 50, growth: 12, cubic: 37 };
/** Attack Speed: 30 for the first rank, then 30 × n × (1 + (n − 1) / 5 +
 * ((n − 1) / 32)³) for the n-th (1,166 for the 12th, 8,870 for the 34th,
 * 116,464 for the 92nd), the same in Silver and a trainer's Gold. */
const speedPrices = { base: 30, growth: 5, cubic: 32 };
/** ATK / m: 50 for the first rank, each 6.47% dearer than the one
 * before, that rise itself growing 0.022% a rank (589 for the 38th, 60,929
 * for the 98th, 1 million for the 130th, 998 million for the 200th; about
 * 10 billion in all), the same in Silver and a trainer's Gold. */
const perTilePrices = { base: 50, ratio: 1.0647, rise: 1.00022 };
/** Multishot Chance: 60 for the first rank, then 60 × n × (1 + ((n − 1) /
 * 12)^1.5) for the n-th (1,163 for the 11th, 9,893 for the 32nd, 99,554
 * for the 85th, 144,569 for the 99th), the same in Silver and a trainer's
 * Gold. */
const multishotChancePrices = { base: 60, growth: 12, power: 1.5 };
/** Multishot Targets: its seven ranks priced one by one, the same in
 * Silver and a trainer's Gold. */
const multishotTargetsPrices = { prices: [450, 2_000, 5_000, 12_500, 40_000, 120_000, 350_000] } as const;
/** Rapid Fire Chance and Duration: the n-th rank costs 120 + 42m + 7.85m² +
 * 0.085m³, m = n − 1, rounded up (1,002 for the 9th, 10,013 for the 30th,
 * 100,199 for the 82nd, 109,418 for Chance's 85th, 159,629 for Duration's
 * 99th), in whole numbers so every engine agrees, the same in Silver and a
 * trainer's Gold. */
const rapidFirePrices = (ranks: number) => ({
  prices: Array.from({ length: ranks }, (_, m) => Math.ceil((24_000 + 8_400 * m + 1_570 * m * m + 17 * m * m * m) / 200)),
});
const rapidFireChancePrices = rapidFirePrices(85), rapidFireDurationPrices = rapidFirePrices(99);
/** Overheal: the n-th rank costs 1,000 + (n⁴ − 1) × (800 + n) / 400, rounded
 * up (21,262 for the 10th, 5.4 million for the 40th, 1.2 billion for the
 * 150th, 10.3 billion for the 250th, 128 billion for the 450th, 203 billion
 * for the 500th), in whole numbers so every engine agrees, the same in
 * Silver and a trainer's Gold. */
const overhealPrices = {
  prices: Array.from({ length: 500 }, (_, m) => {
    const n = m + 1;
    return 1_000 + Math.ceil(((n * n * n * n - 1) * (800 + n)) / 400);
  }),
};
/** Prices from `first`, rising by a fixed ratio through each stretch of
 * ranks, multiplied out in order so every engine agrees. */
const stretchedPrices = (first: number, stretches: readonly (readonly [ranks: number, ratio: number])[]) => {
  const prices = [first];
  let price = first;
  for (const [ranks, ratio] of stretches) {
    for (let k = 0; k < ranks; k++) prices.push(Math.round((price *= ratio)));
  }
  return prices;
};
/** Super Critical Chance's trainers: 50,000 Gold for the first rank, about
 * 1.5 million for the 10th, 158 million for the 25th, 255 billion for the 100th. */
const superCritChanceGold = stretchedPrices(50_000, [[9, 1.459233], [15, 1.364073], [75, 1.103499]]);
/** Super Critical Factor's trainers: 30,000 Gold for the first rank, about
 * 848,000 for the 10th, 17 million for the 20th, 2 billion for the 50th, 618
 * billion for the 100th, 6.1 trillion for the 120th. */
const superCritFactorGold = stretchedPrices(30_000, [[9, 1.449615], [10, 1.349601], [30, 1.172248], [70, 1.1215]]);
/** The Super Critical rows' Silver: from 100 for the first rank, rising in
 * step with their trainers' Gold. */
const fromHundred = (gold: readonly number[]) => gold.map((price) => Math.ceil((price * 100) / gold[0]!));
/** Armor Break's trainers: 600 million Gold for the first rank, 3 billion for
 * the 50th, 105 billion for the 100th, 2.74 trillion for the 150th, 46 trillion
 * for the 200th, 1.6 quadrillion for the 250th, 20 quadrillion for the 300th. */
const armorBreakGold = stretchedPrices(600_000_000, [[49, 1.033391], [50, 1.073696], [50, 1.06741], [50, 1.058035], [50, 1.073562], [50, 1.051812]]);
/** Armor Break's Silver: from 150, rising faster than the Super Critical
 * rows' through their ranks (5,767 for the 10th, 56 million for the 50th, 25
 * billion for the 100th, 292 billion for the 120th), then ×1.08 a rank, still
 * faster than its trainers' Gold. */
const armorBreakSilver = stretchedPrices(150, [[9, 1.5], [15, 1.4], [25, 1.18], [70, 1.13], [180, 1.08]]);
/** The Enemy Level Skip rows' trainers, long-term sinks: 300 million Gold for
 * the first rank, about 3.72 billion for the 10th, 9 billion for the 20th, 45
 * billion for the 50th, 280 billion for the 100th, 5.26 trillion for the 200th,
 * 78 trillion for the 300th, 1.45 quadrillion for the 400th, 45.54 quadrillion
 * for the 500th, 1.57 quintillion for the 600th and 124 quintillion for the 700th. */
const LEVEL_SKIP_LATE: readonly (readonly [number, number])[] = [[100, 1.027333], [100, 1.029657], [100, 1.035071], [100, 1.036037], [100, 1.044661]];
const levelSkipGold = stretchedPrices(300_000_000, [[9, 1.322791], [10, 1.09237], [30, 1.055113], [50, 1.037239], [100, 1.029765], ...LEVEL_SKIP_LATE]);
/** Their Silver: 240, 341, 449 and 569 for the first four ranks, about 122,000
 * for the 50th, 1 million for the 100th and 35 million for the 200th, then
 * rising as their trainers' Gold does (825 trillion for the 700th). */
const levelSkipSilver = [240, 341, 449, ...stretchedPrices(569, [[46, 1.123775], [50, 1.042972], [100, 1.036193], ...LEVEL_SKIP_LATE])];
/** A trainer's Gold curve: each rank asks `TRAINING_GOLD_PER_POINT` Gold
 * a point of the row's cost times the rank's number, times 1 + ranks /
 * `growth` (see `trainingGold`), so a smaller `growth` pulls away faster. A
 * `cubic` scale adds (ranks / cubic)³ to that multiplier: a gentle start and
 * a steep last stretch. A curve with a `ratio` instead asks `start` for
 * the first rank and prices the rest as a `rise` schedule (`risingPrice`),
 * and one with `prices` asks each rank's price from that list. */
export type TrainerCurve = { growth: number; start?: number; power?: number; cubic?: number } | { start: number; ratio: number; rise: number } | { prices: readonly number[] };
/** The trainer curves, set by where each row's Silver schedule starts:
 * the dearer a row in a run, the steeper its trainers. Rows starting at 20
 * Silver: 20, 44, 72, 104 … 380 for the tenth rank. */
const steepTrainers: TrainerCurve = { growth: 10, cubic: 60 };
/** Rows starting at 10 Silver: 20, 42, 66, 92 … 290 for the tenth. */
const firmTrainers: TrainerCurve = { growth: 20, cubic: 45 };
/** Rows starting at 5 Silver: 20, 41, 63, 86 … 245 for the tenth. */
const mildTrainers: TrainerCurve = { growth: 40, cubic: 700 };
/** Max HP and Shroud, starting at 3 Silver: 20, 41, 62, 84 … 230 for the tenth. */
const gentleTrainers: TrainerCurve = { growth: 60, cubic: 800 };
/** The Offense crit rows: from 30 Gold, rising with the cube of the ranks done
 * (`power`), so the 13th rank costs 2,356, the 35th 121,000 and the 72nd 2.26 million. */
const critTrainers: TrainerCurve = { growth: 7, start: 30, power: 3 };
/** The Free Upgrade rows' trainers: the same curve as their Silver (`freeUpgrades`). */
const freeUpgradeTrainers: TrainerCurve = { growth: freeUpgrades.growth, start: freeUpgrades.base, cubic: freeUpgrades.cubic };
/** How a value row's amount reads on the Training tab and the run's cards
 * (`trainingText`): a multiplier (×1.30), meters (a tile is one), shots
 * every 10 turns, ATK multiplier a meter, a count with no unit (its name
 * says what), turns, a chance (a percent to the hundredth, 7.42%), a
 * percent, or a bare amount. */
export type TrainingUnit = "×" | "m" | "shots" | "perMeter" | "count" | "turns" | "chance" | "%" | "";
/** How long a trainer's ranks of a row take, when not the usual schedule
 * (`trainingSeconds`): `skip` passes over that many of its quickest first
 * ranks, so the row's first rank takes as long as the usual second; `each`
 * makes its n-th rank take n times that many seconds. */
export type TrainerTime = { readonly skip: number } | { readonly each: number };
/** One Training row, all of it in one place. Each rank costs `cost`
 * training points, and the row trains no further than its cap
 * (`trainingCap`): `max` ranks, `LIMIT_BREAK_RANKS` more for each of its
 * first `breaks` Limit Breaks owned, and `raisedBy`'s `ranks` once its
 * `upgrade` is owned, its ranks and those bought for a run with Silver
 * together. A row with `requires` shows, and trains, only once that
 * upgrade is owned, and one with `goal` once that Goals checkpoint is claimed
 * (`trainingOpen`).
 *
 * Its ranks add up on its rank `curve` (`trained`). A stat row's (`stat`) add
 * to that stat of the hero, never by the hero's level: levels only earn
 * the points that buy ranks. Any other row is a value row, whose amount is
 * `base` plus its curve, up to `cap`, in its own units, `scale` of them to
 * one `unit` shown (`amountAt`). The game reads a value row's amount by
 * `trainedAmount`: `off` (0 unless given) until its `needs` upgrade is owned
 * (its `requires` unless given), and its ranks counted only once its
 * `requires` is.
 *
 * `research` multiplies what the row's value does (`rowResearchFactor`).
 * A rank bought with Silver inside a run, for that run alone, costs by the
 * row's `silver` schedule, and one a trainer trains costs Gold by its `gold`
 * curve (`trainingGold`): two curves chosen apart, the dearer a row's first
 * Silver rank the steeper its trainers, and takes the usual trainer's time
 * a rank unless `time` says otherwise. */
export type TrainingDef = {
  readonly id: string;
  readonly name: string;
  readonly short?: string;
  readonly group: keyof typeof TRAINING_GROUPS;
  readonly requires?: UpgradeId;
  readonly goal?: GoalUnlock;
  readonly cost: number;
  readonly max: number;
  readonly breaks?: number;
  readonly raisedBy?: { readonly upgrade: UpgradeId; readonly ranks: number };
  readonly description: string;
  readonly stat?: string;
  readonly curve: TrainingCurve;
  readonly base?: number;
  readonly cap?: number;
  readonly scale?: number;
  readonly unit?: TrainingUnit;
  readonly needs?: UpgradeId;
  readonly off?: number;
  readonly research?: ResearchTarget;
  readonly silver: PriceSchedule;
  readonly gold: TrainerCurve;
  readonly time?: TrainerTime;
};
/** The Training rows, in the order the Training tab and a run's training
 * bar list them within each group. Every stat row's curve is super-linear,
 * every rank worth more than the one before, but Thorn Damage's and
 * Parry %'s, a flat percent a rank, and DEF's first twelve, 1 each. */
export const TRAINING = [
  {
    id: "hp", name: "Max HP", group: "defense", stat: "maxHp", curve: { per: 10, square: 1 }, cost: 1, max: 1000, breaks: 10,
    description: "Raises maximum HP.",
    silver: vital, gold: gentleTrainers,
  },
  {
    id: "attack", name: "ATK", group: "offense", stat: "attack", curve: { per: 1, square: 0.2 }, cost: 1, max: 1000, breaks: 10,
    description: "Raises ATK, the damage each strike deals before the enemy's DEF.",
    silver: cheap, gold: mildTrainers,
  },
  // The chance each of the hero's strikes is critical, in hundredths of a
  // percent: 1% a rank, before research.
  {
    id: "critChance", name: "Critical Chance", short: "Crit %", group: "offense", requires: "critical", cost: 1, max: 80,
    curve: { per: 100 }, scale: 100, unit: "chance", research: "critChancePercent",
    description: "Raises the chance each of your strikes is a critical hit.",
    silver: opened, gold: critTrainers,
  },
  // What a critical strike multiplies the hero's ATK by, in hundredths:
  // ×1.2 with Critical, and ×0.1 more a rank, before research.
  {
    id: "critFactor", name: "Critical Factor", short: "Crit x", group: "offense", requires: "critical", cost: 1, max: 150,
    curve: { per: 10 }, base: 120, off: 100, scale: 100, unit: "×", research: "critFactorPercent",
    description: "Raises how much a critical hit multiplies your ATK.",
    silver: { base: 12, step: 2, growth: 3 }, gold: critTrainers,
  },
  // The chance a critical hit is a Super Critical hit, in hundredths of a
  // percent: 0.2% a rank, 20% at its 100, before research (`critRule`).
  {
    id: "superCritChance", name: "Super Critical Chance", short: "SCrit %", group: "offense", requires: "superCritical", cost: 1, max: 100,
    curve: { per: 20 }, scale: 100, unit: "chance",
    description: "Raises the chance a critical hit becomes a Super Critical hit.",
    silver: { prices: fromHundred(superCritChanceGold) }, gold: { prices: superCritChanceGold },
  },
  // What a Super Critical hit multiplies a critical hit's ATK by, in
  // hundredths: ×1, and ×0.1 more a rank, ×13 at its 120, before research.
  {
    id: "superCritFactor", name: "Super Critical Factor", short: "SCrit x", group: "offense", requires: "superCritical", cost: 1, max: 120,
    curve: { per: 10 }, base: 100, off: 100, scale: 100, unit: "×", research: "superCritFactorPercent",
    description: "Raises how much a Super Critical hit multiplies a critical hit.",
    silver: { prices: fromHundred(superCritFactorGold) }, gold: { prices: superCritFactorGold },
  },
  // The percent of an enemy's original DEF each of the hero's hits takes off
  // it: 0.5% a rank, 150% at its 300.
  {
    id: "armorBreak", name: "Armor Break", group: "offense", stat: "armorBreak", curve: { per: 0.5 }, requires: "armorBreak", cost: 1, max: 300,
    description: "Each of your hits, in a fight or from an arrow, takes this share of the enemy's original DEF off it, even if the hit does no damage. Below 0 DEF, your hits deal that much extra damage.",
    silver: { prices: armorBreakSilver }, gold: { prices: armorBreakGold },
  },
  // The Archer's reach, in hundredths of a tile (a meter): 3 tiles, and 0.05 more a
  // rank, 7 at its 80 (enemies/ranged.ts).
  {
    id: "attackRange", name: "Attack Range", short: "Range", group: "offense", goal: "attackRange", cost: 1, max: 80,
    curve: { per: 5 }, base: 300, scale: 100, unit: "m",
    description: "Raises how far the Archer's shots reach, in meters.",
    silver: rangePrices, gold: { growth: rangePrices.growth, start: rangePrices.base, cubic: rangePrices.cubic },
  },
  // The Archer's rate of fire, in twentieths of a shot every 10 turns: 1
  // shot, and 0.05 more a rank, 6 at its 100 (enemies/ranged.ts).
  {
    id: "attackSpeed", name: "Attack Speed", short: "Speed", group: "offense", goal: "attackSpeed", cost: 1, max: 100,
    curve: { per: 1 }, base: 20, scale: 20, unit: "shots",
    description: "Raises how many shots the Archer fires every 10 turns.",
    silver: speedPrices, gold: { growth: speedPrices.growth, start: speedPrices.base, cubic: speedPrices.cubic },
  },
  // What ATK / m adds to an arrow's ATK multiplier for each tile to its
  // target, in hundred-thousandths of ×1: 0.01 for the first rank, and each
  // later rank 0.00004 less (0.00204 for the 200th), 1.204 a tile in all.
  // An arrow's ATK is multiplied by 1 + this × the Euclidean distance to
  // its target (enemies/ranged.ts). Its trainers start at a minute a rank.
  {
    id: "attackPerTile", name: "ATK / m", short: "ATK/m", group: "offense", goal: "attackPerTile", cost: 1, max: 200,
    curve: { per: 1002, square: -2 }, scale: 100_000, unit: "perMeter",
    description: "Multiplies the ATK of each of the Archer's shots by more for every meter its target stands away.",
    silver: perTilePrices, gold: { start: perTilePrices.base, ratio: perTilePrices.ratio, rise: perTilePrices.rise }, time: { skip: 1 },
  },
  // The chance each of the Archer's shots is a multishot, in hundredths of
  // a percent: 0.5% a rank, 49.5% at its 99 (enemies/ranged.ts). Its trainers
  // start at a minute a rank. Its trainers
  // start at a minute a rank.
  {
    id: "multishotChance", name: "Multishot Chance", short: "Multi %", group: "offense", goal: "multishot", cost: 1, max: 99,
    curve: { per: 50 }, scale: 100, unit: "%",
    description: "Raises the chance each of the Archer's shots fires more than one arrow, each at another enemy in range.",
    silver: multishotChancePrices, gold: { growth: multishotChancePrices.growth, start: multishotChancePrices.base, power: multishotChancePrices.power }, time: { skip: 1 },
  },
  // How many enemies a multishot fires at: 2, and one more a rank, 9 at its
  // 7. A trainer's n-th rank takes n hours.
  {
    id: "multishotTargets", name: "Multishot Targets", short: "Targets", group: "offense", goal: "multishot", cost: 1, max: 7,
    curve: { per: 1 }, base: 2, unit: "count",
    description: "Raises how many arrows a multishot fires, one at each of that many enemies in range.",
    silver: multishotTargetsPrices, gold: multishotTargetsPrices, time: { each: 3600 },
  },
  // The chance each of the Archer's shots, fired while Rapid Fire isn't,
  // starts it, in hundredths of a percent: 0.4% a rank, 34% at its 85.
  // While it lasts the Archer's arrows charge `RAPID_FIRE_SPEED` times as
  // fast (enemies/ranged.ts).
  {
    id: "rapidFireChance", name: "Rapid Fire Chance", short: "Rapid %", group: "offense", goal: "rapidFire", cost: 1, max: 85,
    curve: { per: 40 }, scale: 100, unit: "%",
    description: "Raises the chance each of the Archer's shots starts Rapid Fire: shots come four times as fast for a while.",
    silver: rapidFireChancePrices, gold: rapidFireChancePrices,
  },
  // How long Rapid Fire lasts, in hundredths of a turn: 1 turn, and 0.05
  // more a rank, 5.95 at its 99.
  {
    id: "rapidFireDuration", name: "Rapid Fire Duration", short: "Duration", group: "offense", goal: "rapidFire", cost: 1, max: 99,
    curve: { per: 5 }, base: 100, scale: 100, unit: "turns",
    description: "Raises how many turns Rapid Fire lasts once it starts.",
    silver: rapidFireDurationPrices, gold: rapidFireDurationPrices,
  },
  {
    // At least 1 DEF a rank: ranks 1–12 add 1 each, and the square takes
    // over from rank 13 (+2.08 and rising).
    id: "defense", name: "DEF", group: "defense", stat: "defense", curve: { per: 0, square: 1 / 12, atLeast: 1 }, cost: 1, max: 1000, breaks: 10,
    description: "Raises DEF, taken off the damage of every enemy strike.",
    silver: cheap, gold: mildTrainers,
  },
  // The HP regained each step taken in a run.
  {
    id: "regen", name: "Regen", group: "defense", stat: "regen", curve: { per: 0.1, square: 1 / 120 }, cost: 1, max: 1000, breaks: 10, requires: "regen",
    research: "regenPercent",
    description: "Raises the HP regained with every step taken in a climb.",
    silver: cheap, gold: mildTrainers,
  },
  // The damage the shroud blocks each fight.
  {
    id: "shroud", name: "Shroud", group: "defense", stat: "shroud", curve: { per: 5, square: 0.1, fourth: 0.0000064 }, cost: 1, max: 1000, breaks: 8, requires: "shroud",
    description: "Raises the damage the shroud blocks at the start of every fight.",
    silver: vital, gold: { ...gentleTrainers, cubic: 700 },
  },
  // The share of the damage a strike deals restored as HP, in percent: 0.1%
  // for the first rank, each later rank adding 0.001% less, 0.021% for the
  // 80th, 4.84% in all.
  {
    id: "lifesteal", name: "Lifesteal", group: "defense", stat: "lifesteal", curve: { per: 0.1005, square: -0.0005 }, cost: 1, max: 80, requires: "lifesteal",
    description: "Raises the share of the damage each of your strikes deals that is restored to you as HP.",
    // 60 Gold for the first rank, then 60 × n × (1 + ((n − 1) / 20.5)²) for the n-th: about 1,000 for the 13th, 9,000 for the 37th and 70,000 for the 80th.
    silver: { base: 60, growth: 20.5, power: 2 }, gold: { growth: 20.5, start: 60, power: 2 },
  },
  // 1% a rank.
  {
    id: "thorns", name: "Thorn Damage", short: "Thorns", group: "defense", stat: "thorns", curve: { per: 1 }, cost: 1, max: 99, requires: "thorns",
    description: "Each enemy strike costs the enemy this share of its max HP, half against bosses and Greater Bosses.",
    silver: thornPrices, gold: { growth: thornPrices.growth, start: thornPrices.base, power: thornPrices.power },
  },
  // 0.5% a rank.
  {
    id: "parry", name: "Parry %", group: "defense", stat: "parry", curve: { per: 0.5 }, cost: 1, max: 100, requires: "parry",
    description: "Raises how much every enemy strike's damage is cut.",
    silver: parryPrices, gold: { growth: parryPrices.growth, start: parryPrices.base, power: parryPrices.power },
  },
  // The chance each strike that would fell the hero revives it instead, in
  // hundredths of a percent: 0.5% with Revive, and 0.5% more a rank, up to
  // 50% (99 ranks).
  {
    id: "revive", name: "Revive", group: "defense", requires: "revive", cost: 1, max: 99,
    curve: { per: 50 }, base: 50, cap: 5000, scale: 100, unit: "%",
    description: "Raises the chance a strike that would fell you revives you at full HP instead.",
    silver: revivePrices, gold: { growth: revivePrices.growth, start: revivePrices.base, power: revivePrices.power },
  },
  // The Gold each floor climbed for the first time in a run pays, before
  // the tier's bonus and research: 3 with Spare Change, and 1 more a rank.
  {
    id: "floorGold", name: "Gold / Floor", group: "utility", requires: "spareChange", cost: 1, max: 150,
    curve: { per: 1 }, base: 3, unit: "", research: "floorGold",
    description: "Raises the Gold paid for each floor climbed for the first time in a climb.",
    silver: opened, gold: firmTrainers,
  },
  // The Silver each floor climbed for the first time in a run pays, before
  // research and Silver Bonus: none with Wishing Well alone, and 4 a rank.
  {
    id: "floorSilver", name: "Silver / Floor", group: "utility", requires: "wishingWell", cost: 1, max: 150,
    curve: { per: 4 }, unit: "", research: "floorSilver",
    description: "Raises the Silver paid for each floor climbed for the first time in a climb.",
    silver: opened, gold: firmTrainers,
  },
  // Silver Bonus's multiplier on all Silver a run finds, in percent: ×1, and
  // 1% more a rank (`silverFound`).
  {
    id: "silverBonus", name: "Silver Bonus", group: "utility", requires: "wealthy", cost: 1, max: 150,
    curve: { per: 1 }, base: 100, off: 100, scale: 100, unit: "×", research: "silverBonus",
    description: "Multiplies all Silver found in a climb.",
    silver: opened, gold: firmTrainers,
  },
  // Gold Bonus's multiplier on the Gold a kill, chest, item picked up or
  // door opened pays in a run, in percent: ×1, and 3% more a rank.
  {
    id: "goldBonus", name: "Gold Bonus", group: "utility", requires: "loot", cost: 1, max: 150,
    curve: { per: 3 }, base: 100, off: 100, scale: 100, unit: "×", research: "goldBonus",
    description: "Multiplies the Gold kills, chests, items picked up and doors opened pay in a climb, and what Floor Skip pays for them, with Gold Bonus research. Gold / Floor and Interest aren't raised.",
    silver: opened, gold: firmTrainers,
  },
  // The Free Upgrade rows: the chance each floor passed in a run trains a
  // stat of the row's group a level for free, in hundredths of a percent:
  // 0.5% a rank, 50% at its 100 (`FREE_TRAINING_ROWS`).
  {
    id: "freeOffense", name: "Free Offense Up", group: "utility", requires: "freeTraining", cost: 1, max: 100,
    curve: { per: 50 }, scale: 100, unit: "%",
    description: "Each floor passed in a climb has a chance to train a random Offense stat one level for free, for the climb.",
    silver: freeUpgrades, gold: freeUpgradeTrainers,
  },
  {
    id: "freeDefense", name: "Free Defense Up", group: "utility", requires: "freeTraining", cost: 1, max: 100,
    curve: { per: 50 }, scale: 100, unit: "%",
    description: "Each floor passed in a climb has a chance to train a random Defense stat one level for free, for the climb.",
    silver: freeUpgrades, gold: freeUpgradeTrainers,
  },
  {
    id: "freeUtility", name: "Free Utility Up", group: "utility", requires: "freeTraining", cost: 1, max: 100,
    curve: { per: 50 }, scale: 100, unit: "%",
    description: "Each floor passed in a climb has a chance to train a random Utility stat one level for free, for the climb.",
    silver: freeUpgrades, gold: freeUpgradeTrainers,
  },
  // What a percent potion restores beyond its HP, in hundredths of a
  // percent of max HP: 1% with Recovery, and 0.25% more a rank.
  {
    id: "potion", name: "Potion %", group: "utility", requires: "recovery", cost: 1, max: 300,
    curve: { per: 25 }, base: 100, scale: 100, unit: "%",
    description: "Percent potions restore more of your maximum HP.",
    silver: deep, gold: steepTrainers,
  },
  // The chance each potion that may be one is a percent potion, in
  // hundredths of a percent: 2% with Recovery, and 0.25% more a rank once
  // Find Potion opens the row, up to 20% (72 ranks).
  {
    id: "findPotion", name: "Find Potion", group: "utility", requires: "findPotion", needs: "recovery", cost: 1, max: 72,
    curve: { per: 25 }, base: 200, cap: 2000, scale: 100, unit: "%",
    description: "More of the potions found are percent potions.",
    silver: deep, gold: { ...steepTrainers, cubic: 25 },
  },
  // How far HP may rise above max HP once Overheal is owned, as a multiple
  // of max HP in thousandths: ×1 (none above), and 0.031 more a rank, ×16.5
  // at its 500 (`hpCeiling`).
  {
    id: "overheal", name: "Overheal", group: "utility", requires: "overheal", cost: 1, max: 500,
    curve: { per: 31 }, base: 1000, off: 1000, scale: 1000, unit: "×",
    description: "Raises how far potions, the smelt cards and badge heals can heal you above max HP.",
    silver: overhealPrices, gold: overhealPrices,
  },
  // The chance each floor new to a run leaves enemies' HP, or their ATK and
  // DEF, one floor lower on their curve, in hundredths of a percent: 0.05% a
  // rank, 17.5% at its 350, 35% at 700 (enemies/level-skips.ts).
  {
    id: "enemyHpSkip", name: "Enemy HP Level Skip", short: "HP Skip", group: "utility", requires: "enemyHpLevelSkips", cost: 1, max: 350, raisedBy: { upgrade: "enemyLevelSkipLimitBreak", ranks: 350 },
    curve: { per: 5 }, scale: 100, unit: "chance",
    description: "Raises the chance each new floor leaves enemies' HP where the last floor's stood. Below 10%, floors without a skip add up to a sure one.",
    silver: { prices: levelSkipSilver }, gold: { prices: levelSkipGold },
  },
  {
    id: "enemyCombatSkip", name: "Enemy Combat Level Skip", short: "Combat Skip", group: "utility", requires: "enemyCombatLevelSkips", cost: 1, max: 350, raisedBy: { upgrade: "enemyLevelSkipLimitBreak", ranks: 350 },
    curve: { per: 5 }, scale: 100, unit: "chance",
    description: "Raises the chance each new floor leaves enemies' ATK and DEF where the last floor's stood. Below 10%, floors without a skip add up to a sure one.",
    silver: { prices: levelSkipSilver }, gold: { prices: levelSkipGold },
  },
] as const satisfies readonly TrainingDef[];
/** A row's rank curve: what `n` ranks add up to is `per` × n +
 * `square` × n² + `cube` × (n − 1)³ + `fourth` × (n − 1)⁴, the cubic and
 * quartic terms counted from the second rank so the first is worth exactly
 * `per` + `square`. Rows that grew with the hero's level give a hero
 * with a rank a level in each what they gave at that level: ATK n + n²/5,
 * max HP 10n + n², Regen 0.1n + n²/120, and DEF n²/12, without the whole
 * point a rank its old curve began from. Shroud is 5.1 at rank 1, 60 at 10,
 * about 2,100 at 100, 15,000 at 200 and 62,000 at 300, about four billion at
 * its 5,000. */
/** A rank curve's terms; `atLeast`, when set, is the least each rank adds
 * (the curve is never below `atLeast` × ranks), so a row whose curve starts
 * slow still pays that much for each of its first ranks. */
export type TrainingCurve = { per: number; square?: number; cube?: number; fourth?: number; atLeast?: number };
/** What `ranks` ranks of `row` add up to on its curve (to the character,
 * for a stat row), rounded once. Only `+`, `*` and `Math.max`, so it is the
 * same in every engine. */
export function trained(row: Pick<TrainingDef, "curve">, ranks: number) {
  if (ranks <= 0) return 0;
  const c: TrainingCurve = row.curve, m = ranks - 1;
  const curve = c.per * ranks + (c.square ?? 0) * ranks * ranks + (c.cube ?? 0) * m * m * m + (c.fourth ?? 0) * m * m * m * m;
  return snap(Math.max(curve, (c.atLeast ?? 0) * ranks));
}
/** What the rank after `ranks` adds to `row`'s stat. */
export const trainingWorth = (row: StatTrainingRow, ranks: number) => snap(trained(row, ranks + 1) - trained(row, ranks));
/** Row `id`, read through its definition's type. */
export const trainingDef = (id: TrainingId): TrainingDef => TRAINING.find((t) => t.id === id)!;
/** A value row's amount at `ranks`, in its own units: its `base` and
 * curve, up to its `cap`. */
export const amountAt = (row: TrainingDef, ranks: number) => Math.min(row.cap ?? Infinity, (row.base ?? 0) + trained(row, ranks));
/** Value row `id`'s amount as the game reads it, in the row's own units,
 * at `ranks` (the ranks `save` holds; a run's `trainingNow` counts those
 * bought with Silver): `off` until its `needs` upgrade is owned, and its
 * ranks counted only once its `requires` is. */
export function trainedAmount(save: { upgrades: Partial<Record<UpgradeId, number>>; training?: Partial<Record<TrainingId, number>> }, id: TrainingId, ranks = save.training?.[id] ?? 0) {
  const row = trainingDef(id), needs = row.needs ?? row.requires;
  if (needs && !save.upgrades[needs]) return row.off ?? 0;
  return amountAt(row, row.requires && !save.upgrades[row.requires] ? 0 : ranks);
}
