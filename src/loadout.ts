import { whole } from "./whole.ts";
import { bulkBuy, type BuyQuantity } from "./buy-quantity.ts";
import { snap } from "./exact.ts";
import type { Mode, Save } from "./entities.ts";
import { FIND_POTION_BASE, FIND_POTION_MAX, FLOOR_GOLD_BASE, FLOOR_GOLD_RANK, FLOOR_SILVER_BASE, FLOOR_SILVER_RANK, FIND_POTION_RANK, REVIVE_BASE, REVIVE_MAX, REVIVE_RANK, GOLD_SHOP, KILL_GOLD_RANK, SILVER_BONUS_RANK, schedulePrice, POTION_PERCENT_BASE, POTION_PERCENT_RANK, TRAINING, TRAINING_PER_LEVEL, UPGRADES, isStatRow, levelForXp, trained, trainingOpen, trainingWorth, type GoldItemId, type StatTrainingRow, type TrainingId, type TrainingRow, type UpgradeId } from "./config.ts";
import { wornEffects } from "./equipment/effects.ts";
import { PIERCE_CAP } from "./equipment/balance.ts";
import { RESEARCH, researched } from "./archives.ts";
import { ranksInTraining, trainingGold } from "./training-jobs.ts";

/** What one rank of an upgrade, or one provision, adds to a character. */
export type Grants = Partial<Record<Stat, number>>;
export type Stat = "attack" | "defense" | "maxHp" | "shroud" | "regen" | "yellow" | "blue" | "red" | "undos";

/** The character a run starts with. */
export type Loadout = {
  attack: number;
  defense: number;
  maxHp: number;
  /** The damage the shroud blocks at the start of every fight. */
  shroud: number;
  /** The HP regained with every step in a run (Regen). */
  regen: number;
  /** The percent more ATK struck against bosses (equipment). */
  bossAttack: number;
  /** The percent of enemy DEF ignored (equipment's Piercing), up to `PIERCE_CAP`. */
  pierce: number;
  keys: { yellow: number; blue: number; red: number };
  /** Keys the equipment worn hands a run as it starts (on top of `keys`):
   * kept apart so changing equipment never adds keys to a run inside. */
  startKeys: { yellow: number; blue: number };
  undoCapacity: number;
};

/** Every character's baseline: 10 ATK plus the starter weapon (+2), which
 * Heirloom steel improves; no DEF; 100 HP; no shroud (Shroud gives the
 * first point); no Regen; no undo (Rehearsed steps gives the first). */
const BASE = { attack: 12, defense: 0, maxHp: 100, shroud: 0, regen: 0, undos: 0 };

const WORDS: Record<Stat, string> = {
  attack: "starting attack",
  defense: "starting defense",
  maxHp: "starting maximum HP",
  shroud: "damage blocked each fight",
  regen: "HP regained each step",
  yellow: "starting amber key",
  blue: "starting azure key",
  red: "starting crimson key",
  undos: "additional undo",
};

type Granting = { grants?: Grants };

/** The most undos a character can store, with every upgrade that adds one
 * at its highest level and every level of Undo Count. */
const UNDO_CAP = UPGRADES.reduce(
  (cap, u: Granting & { max: number }) => cap + (u.grants?.undos ?? 0) * u.max,
  BASE.undos + RESEARCH.undoCount.levels.length,
);
/** The last `capacity` snapshots of an undo history (none at 0, where
 * `slice(-0)` would keep them all). */
export const keepUndos = <T>(history: T[], capacity: number) => (capacity > 0 ? history.slice(-capacity) : []);
const grantsOf = (row: Granting): Grants => row.grants ?? {};

/** Adds `ranks` of each row's grants to `total`. */
function add(total: Record<Stat, number>, rows: readonly (Granting & { id: string })[], ranks: Record<string, number>) {
  for (const row of rows)
    for (const [stat, n] of Object.entries(grantsOf(row)) as [Stat, number][])
      total[stat] += n * (ranks[row.id] ?? 0);
}

/** The stats the Archives' ATK, DEF, Max HP and Shroud research multiply,
 * and the research target each reads. */
const STAT_RESEARCH = { attack: "attackPercent", defense: "defensePercent", maxHp: "maxHpPercent", shroud: "shroudPercent" } as const;
/** What `stat` is multiplied by, the whole of it a run starts with and
 * each rank a run trains or siphons: its research's percent (1 without). */
export const statFactor = (save: Pick<Save, "archives">, stat: Stat) =>
  stat in STAT_RESEARCH ? researched(save.archives, STAT_RESEARCH[stat as keyof typeof STAT_RESEARCH], 100) / 100 : 1;

/** The character a run in `mode` would start with now: the baseline,
 * permanent upgrades and training, then the equipment that mode's hero
 * wears (flat bonuses, then percentages of the total, fractions kept),
 * then the provisions bought, which last for good, the whole of ATK, DEF,
 * max HP and shroud then multiplied by their research (`statFactor`). */
export function loadout(save: Save, mode: Mode = "tower"): Loadout {
  const own = { ...BASE, yellow: 0, blue: 0, red: 0 };
  add(own, UPGRADES, save.upgrades);
  for (const row of TRAINING) if (isStatRow(row)) own[row.stat] += trained(row, save.training[row.id]);
  const prov = { attack: 0, defense: 0, maxHp: 0, shroud: 0, regen: 0, yellow: 0, blue: 0, red: 0, undos: 0 };
  add(prov, GOLD_SHOP, save.provisions);
  const eq = wornEffects(save, mode);
  // A drawback (Bloodprice Blade's max HP) never takes a stat below zero, or max HP below 1.
  const percent = (base: number, pct: number) => (pct ? snap(Math.max(0, (base * (100 + pct)) / 100)) : base);
  const plus = (base: number, more: number) => (more ? snap(base + more) : base);
  const researchedStat = (stat: Stat, value: number) => {
    const factor = statFactor(save, stat);
    return factor === 1 ? value : snap(value * factor);
  };
  return {
    attack: researchedStat("attack", snap(percent(plus(own.attack, eq.attack), eq.attackPct) + prov.attack)),
    defense: researchedStat("defense", snap(percent(plus(own.defense, eq.defense), eq.defensePct) + prov.defense)),
    maxHp: Math.max(1, researchedStat("maxHp", snap(percent(plus(own.maxHp, eq.maxHp), eq.maxHpPct) + prov.maxHp))),
    shroud: researchedStat("shroud", plus(own.shroud, eq.shroud)),
    regen: plus(own.regen, eq.regen),
    bossAttack: eq.bossAttack,
    pierce: Math.min(eq.pierce, PIERCE_CAP),
    keys: { yellow: own.yellow + prov.yellow, blue: own.blue + prov.blue, red: own.red + prov.red },
    startKeys: { yellow: eq.yellowKeys, blue: eq.blueKeys },
    // Undo needs Rehearsed steps (its first undo) or Echoes of time: Undo
    // Count research, which either opens, stores the rest.
    undoCapacity: save.upgrades.inspirationUndos || save.upgrades.undos ? researched(save.archives, "undoCapacity", own.undos) : 0,
  };
}

/** Text for a row's grants: "+2 starting attack", joined by "and". A row
 * may name a stat its own way. */
export function describeGrants(grants: Grants, words: Partial<Record<Stat, string>> = {}) {
  return (Object.entries(grants) as [Stat, number][])
    .map(([stat, n]) =>
      stat === "undos"
        ? `Store ${n === 1 ? "one" : n} ${words.undos ?? WORDS.undos}${n === 1 ? "" : "s"} (up to ${UNDO_CAP})`
        : `+${n} ${words[stat] ?? WORDS[stat]}`)
    .join(" and ");
}

/** An upgrade's description, written from its grants when it has any. */
export function upgradeText(id: UpgradeId) {
  const u: { description?: string; grants?: Grants; words?: Partial<Record<Stat, string>> } =
    UPGRADES.find((u) => u.id === id)!;
  return u.description ?? describeGrants(u.grants!, u.words);
}

/** A provision's description, written from its grants. */
export function provisionText(id: GoldItemId) {
  const item = GOLD_SHOP.find((g) => g.id === id)!;
  return describeGrants(item.grants, item.words);
}

/** Whether provision `id` shows and sells: its upgrade, if it names one, is owned. */
export function provisionOpen(save: Pick<Save, "upgrades">, id: GoldItemId) {
  const item = GOLD_SHOP.find((g) => g.id === id)!;
  return !("requires" in item) || save.upgrades[item.requires] > 0;
}
/** The Gold the next `id` provision costs, after those already bought. */
export const provisionPrice = (save: Pick<Save, "provisions">, id: GoldItemId) =>
  schedulePrice(GOLD_SHOP.find((g) => g.id === id)!.price, save.provisions[id]);

/** Training points: earned per level, spent on ranks of training bought
 * with them (`trainingPaid`; trainers' ranks cost Gold instead). `left`
 * never goes below zero, even if undo takes back a level already spent. */
export function trainingPoints(save: Pick<Save, "xp" | "trainingPaid">) {
  const earned = TRAINING_PER_LEVEL * levelForXp(save.xp),
    spent = TRAINING.reduce((sum, t) => sum + save.trainingPaid[t.id].points, 0);
  return { earned, spent, left: Math.max(0, earned - spent) };
}

/** Whether training points can be spent now: some row that shows can
 * take a rank they pay for (the Upgrades and Training tabs' dot). */
export function trainingWaiting(save: Save) {
  const left = trainingPoints(save).left;
  return left > 0 && TRAINING.some((t) => t.cost <= left && trainingOpen(t, save.upgrades) && !trainingMaxed(save, t.id));
}

/** What a percent potion restores beyond its HP, in hundredths of a
 * percent of max HP: none without Recovery. */
export const potionPercent = (save: Pick<Save, "upgrades" | "training">) =>
  save.upgrades.recovery ? POTION_PERCENT_BASE + POTION_PERCENT_RANK * save.training.potion : 0;

/** The chance each potion that may be one is a percent potion, in
 * hundredths of a percent: none without Recovery, and Find Potion training
 * raises it. */
export const percentPotionChance = (save: Pick<Save, "upgrades" | "training">) =>
  save.upgrades.recovery ? findPotionChance(save.upgrades.findPotion ? save.training.findPotion : 0) : 0;
const findPotionChance = (ranks: number) => Math.min(FIND_POTION_MAX, FIND_POTION_BASE + FIND_POTION_RANK * ranks);

/** The chance each strike that would fell the hero revives it, in
 * hundredths of a percent: none without Revive, and Revive training raises
 * it. */
export const reviveChance = (save: Pick<Save, "upgrades" | "training">) =>
  save.upgrades.revive ? reviveChanceAt(save.training.revive) : 0;
const reviveChanceAt = (ranks: number) => Math.min(REVIVE_MAX, REVIVE_BASE + REVIVE_RANK * ranks);

/** The Gold each floor climbed for the first time in a run pays, before
 * the tier's bonus and research: none without Spare Change. */
export const floorGold = (save: Pick<Save, "upgrades" | "training">) =>
  save.upgrades.spareChange ? floorGoldAt(save.training.floorGold) : 0;
const floorGoldAt = (ranks: number) => FLOOR_GOLD_BASE + FLOOR_GOLD_RANK * ranks;

/** The Silver each floor climbed for the first time in a run pays, before
 * research and Silver Bonus: none without Wishing Well. */
export const floorSilver = (save: Pick<Save, "upgrades" | "training">) =>
  save.upgrades.wishingWell ? floorSilverAt(save.training.floorSilver) : 0;
const floorSilverAt = (ranks: number) => FLOOR_SILVER_BASE + FLOOR_SILVER_RANK * ranks;

/** Silver Bonus training's multiplier on all Silver a run finds, in
 * percent: 100 without Wealthy. */
export const silverBonus = (save: Pick<Save, "upgrades" | "training">) =>
  bonusAt(save.upgrades.wealthy ? save.training.silverBonus : 0, SILVER_BONUS_RANK);
/** Gold / Kill training's multiplier on the Gold a kill pays, in percent:
 * 100 without Loot. */
export const killGold = (save: Pick<Save, "upgrades" | "training">) =>
  bonusAt(save.upgrades.loot ? save.training.killGold : 0, KILL_GOLD_RANK);
const bonusAt = (ranks: number, rank: number) => 100 + rank * ranks;
/** The training rows shown as a multiplier (×1.30), their value in percent,
 * and what a rank adds. */
const MULTIPLIER_ROWS: ReadonlyMap<TrainingId, number> = new Map([["silverBonus", SILVER_BONUS_RANK], ["killGold", KILL_GOLD_RANK]]);

/** How a Training row's value reads: a multiplier as ×1.30, the others
 * with their unit after. */
export const trainingText = (value: number, unit: string) => unit === "×" ? `×${value.toFixed(2)}` : `${value}${unit}`;

/** Whether `id` has as many ranks as it can take. */
/** How much faster trainers train than at first (Faster Trainers research:
 * 0.02 a level); a rank takes its time / (1 + this). */
export const trainingSpeed = (save: Pick<Save, "archives">) => researched(save.archives, "trainingSpeed", 0);

/** Whether `id` can take no more ranks: at its most, counting a rank a
 * trainer is training. */
export const trainingMaxed = (save: Pick<Save, "training"> & Partial<Pick<Save, "trainingJobs">>, id: TrainingId) => {
  const row = TRAINING.find((t) => t.id === id)!;
  return save.training[id] + ranksInTraining(save.trainingJobs, id) >= row.max;
};

/** What one more rank of `id` costs (in training points, or a trainer's
 * Gold) and does: to the next run's character
 * for a stat, in % to what a percent potion restores or the chance a
 * potion is one, to the Gold or Silver a new floor pays, or to a
 * multiplier (its unit "×", what a rank adds in percent). A row at its most
 * ranks has no next rank to buy. */
export function trainingStep(save: Save, id: TrainingId, count = 1) {
  const row = TRAINING.find((t) => t.id === id)!, maxed = trainingMaxed(save, id);
  const buy = trainingPrices(save, row, maxed);
  if (isStatRow(row)) return { row, ...statStep(save, row, count), ...buy };
  return { row, ...valueStep(id, save.training[id], maxed, count), ...buy };
}

/** What one press of `id`'s training-points button buys at Buy Quantity
 * `q`: the ranks (up to its most) and the points they take, and whether
 * the points held pay for them. */
export function trainingBulk(save: Save, id: TrainingId, q: BuyQuantity) {
  const row = TRAINING.find((t) => t.id === id)!;
  const room = row.max - save.training[id] - ranksInTraining(save.trainingJobs, id);
  return bulkBuy(q, Math.max(0, room), () => row.cost, save.settings.freePurchases ? Infinity : trainingPoints(save).left);
}

/** Whether the next rank of `row` can be bought now with training points
 * (`affordable`) or Gold (`goldAffordable`), whether there is one, and a
 * trainer's Gold price for it. */
function trainingPrices(save: Save, row: TrainingRow, maxed: boolean) {
  const free = save.settings.freePurchases, gold = trainingGold(row, save.trainerRanks[row.id]);
  return {
    affordable: !maxed && (free || trainingPoints(save).left >= row.cost),
    maxed,
    gold,
    goldAffordable: !maxed && (free || save.gold >= gold),
  };
}

/** A stat row: the hero's stat now and with one more rank, as the page
 * shows it (whole, its fraction kept in play), and what the next rank adds
 * on the row's curve. */
function statStep(save: Save, row: StatTrainingRow, count = 1) {
  const stat = row.stat, id = row.id;
  const now = loadout(save)[stat], next = loadout({ ...save, training: { ...save.training, [id]: save.training[id] + count } })[stat];
  return { unit: "", now: shownStat(stat, now), next: shownStat(stat, next), worth: trainingWorth(row, save.training[id]) };
}

/** A stat as the Training rows show it: whole, but Regen, a fraction of an
 * HP a step, to the hundredth (rounded down, like `whole`). */
export const shownStat = (stat: StatTrainingRow["stat"], value: number) =>
  stat === "regen" ? Math.floor(Math.round(value * 1e6) / 1e4) / 100 : whole(value);

/** Any other row at `ranks`: the Gold or Silver a new floor pays, a
 * multiplier (a rank reads as the percent it adds), or a percentage. */
function valueStep(id: TrainingId, ranks: number, maxed: boolean, count = 1) {
  if (id === "floorGold") return { unit: "", now: floorGoldAt(ranks), next: floorGoldAt(ranks + count), worth: FLOOR_GOLD_RANK };
  if (id === "floorSilver") return { unit: "", now: floorSilverAt(ranks), next: floorSilverAt(ranks + count), worth: FLOOR_SILVER_RANK };
  const bonus = MULTIPLIER_ROWS.get(id);
  if (bonus !== undefined) return { unit: "×", now: bonusAt(ranks, bonus) / 100, next: bonusAt(ranks + count, bonus) / 100, worth: bonus };
  const [value, rank] = percentRow(id);
  return { unit: "%", now: value(ranks) / 100, next: value(maxed ? ranks : ranks + count) / 100, worth: rank / 100 };
}

/** A percentage row's value at a number of ranks, and what a rank adds. */
function percentRow(id: TrainingId): [(ranks: number) => number, number] {
  if (id === "findPotion") return [findPotionChance, FIND_POTION_RANK];
  if (id === "revive") return [reviveChanceAt, REVIVE_RANK];
  return [(r: number) => POTION_PERCENT_BASE + POTION_PERCENT_RANK * r, POTION_PERCENT_RANK];
}
