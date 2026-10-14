import { whole } from "./whole.ts";
import { bulkBuy, type BuyQuantity } from "./buy-quantity.ts";
import { snap } from "./exact.ts";
import { PARRY_CAP, type CritRule } from "./combat.ts";
import type { Mode, RunCore, Save } from "./entities.ts";
import { boonFactor, runBoons } from "./shrines.ts";
import { CRIT_CHANCE_RANK, CRIT_FACTOR_BASE, CRIT_FACTOR_RANK, FIND_POTION_BASE, FIND_POTION_MAX, FLOOR_GOLD_BASE, FLOOR_GOLD_RANK, FLOOR_SILVER_BASE, FLOOR_SILVER_RANK, FIND_POTION_RANK, FREE_TRAINING_RANK, TRAINING_GROUPS, REVIVE_BASE, REVIVE_MAX, REVIVE_RANK, GOLD_SHOP, GOLD_BONUS_RANK, SILVER_BONUS_RANK, schedulePrice, POTION_PERCENT_BASE, POTION_PERCENT_RANK, TRAINING, TRAINING_PER_LEVEL, UPGRADES, trainingCap, isStatRow, levelForXp, trained, trainingWorth, ATTACK_RANGE_BASE, ATTACK_RANGE_RANK, ATTACK_SPEED_BASE, ATTACK_SPEED_RANK, ATK_PER_TILE_FIRST, ATK_PER_TILE_FALL, MULTISHOT_CHANCE_RANK, MULTISHOT_TARGETS_BASE, MULTISHOT_TARGETS_RANK, type GoldItemId, type StatTrainingRow, type TrainingId, type TrainingRow, type UpgradeId } from "./config.ts";
import { raised, wornEffects } from "./equipment/effects.ts";
import { PIERCE_CAP } from "./equipment/balance.ts";
import { RESEARCH, researched, type ResearchTarget } from "./archives.ts";
import { ranksInTraining, trainingGold } from "./training-jobs.ts";
import { goalUnlocked } from "./goals.ts";

/** Whether `row` can be seen and trained: its upgrade owned, or the Goals
 * checkpoint that unlocks it claimed (Attack Range, Attack Speed). */
export const trainingOpen = (row: TrainingRow, save: Pick<Save, "upgrades" | "goals">) =>
  ("requires" in row ? save.upgrades[row.requires] > 0 : true) && ("goal" in row ? goalUnlocked(save, row.goal) : true);

/** What one rank of an upgrade, or one provision, adds to a character. */
export type Grants = Partial<Record<Stat, number>>;
export type Stat = "attack" | "defense" | "maxHp" | "shroud" | "regen" | "lifesteal" | "thorns" | "parry" | "yellow" | "blue" | "red" | "undos";

/** The character a run starts with. */
export type Loadout = {
  attack: number;
  defense: number;
  maxHp: number;
  /** The damage the shroud blocks at the start of every fight. */
  shroud: number;
  /** The HP regained with every step in a run (Regen). */
  regen: number;
  /** The percent of the damage each strike deals restored as HP (Lifesteal). */
  lifesteal: number;
  /** The percent of an enemy's max HP each of its strikes costs it (Thorn Damage). */
  thorns: number;
  /** The percent every enemy strike's damage is cut by, parried (Parry %). */
  parry: number;
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
const BASE = { attack: 12, defense: 0, maxHp: 100, shroud: 0, regen: 0, lifesteal: 0, thorns: 0, parry: 0, undos: 0 };

const WORDS: Record<Stat, string> = {
  attack: "starting attack",
  defense: "starting defense",
  maxHp: "starting maximum HP",
  shroud: "damage blocked each fight",
  regen: "HP regained each step",
  lifesteal: "% of strike damage restored as HP",
  thorns: "% of an enemy's max HP each of its strikes costs it",
  parry: "% less damage from every enemy strike",
  yellow: "starting gold key",
  blue: "starting azure key",
  red: "starting crimson key",
  undos: "additional undo",
};

type Granting = { grants?: Grants };

/** The most undos a run can have, with every upgrade that adds one
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
  const prov = { attack: 0, defense: 0, maxHp: 0, shroud: 0, regen: 0, lifesteal: 0, thorns: 0, parry: 0, yellow: 0, blue: 0, red: 0, undos: 0 };
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
    lifesteal: own.lifesteal,
    thorns: own.thorns,
    // Parry % research is kept in tenths of a percent.
    parry: Math.min(PARRY_CAP, snap(own.parry + researched(save.archives, "parryPercent", 0) / 10)),
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
        ? `${n === 1 ? "One" : n} ${words.undos ?? WORDS.undos}${n === 1 ? "" : "s"} a run (up to ${UNDO_CAP})`
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

/** What a press of provision `id`'s button buys at quantity `q` out of
 * `gold`: the ranks, each dearer than the last, and their summed price. */
export function provisionBulk(save: Pick<Save, "provisions">, id: GoldItemId, q: BuyQuantity, gold: number) {
  const price = GOLD_SHOP.find((g) => g.id === id)!.price, owned = save.provisions[id];
  return bulkBuy(q, Infinity, (k) => schedulePrice(price, owned + k), gold);
}

/** Training points: earned per level and by the weekly mission rewards
 * (`bonusTrainingPoints`), spent on ranks of training bought with them
 * (`trainingPaid`; trainers' ranks cost Gold instead). `left` never goes
 * below zero, even if undo takes back a level already spent. */
export function trainingPoints(save: Pick<Save, "xp" | "trainingPaid"> & Partial<Pick<Save, "bonusTrainingPoints">>) {
  const earned = TRAINING_PER_LEVEL * levelForXp(save.xp) + (save.bonusTrainingPoints ?? 0),
    spent = TRAINING.reduce((sum, t) => sum + save.trainingPaid[t.id].points, 0);
  return { earned, spent, left: Math.max(0, earned - spent) };
}

/** Whether training points can be spent now: some row that shows can
 * take a rank they pay for (the Upgrades and Training tabs' dot). */
export function trainingWaiting(save: Save) {
  const left = trainingPoints(save).left;
  return left > 0 && TRAINING.some((t) => t.cost <= left && trainingOpen(t, save) && !trainingFull(save, t.id));
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

/** The chance each of the hero's strikes is critical, in percent, before
 * research: none without Critical. */
export const critChance = (save: Pick<Save, "upgrades" | "training">) =>
  save.upgrades.critical ? critChanceAt(save.training.critChance) / 100 : 0;
const critChanceAt = (ranks: number) => CRIT_CHANCE_RANK * ranks;
/** What a critical strike multiplies the hero's ATK by, before research:
 * ×1.2 with Critical, and ×0.1 more a Crit x rank. */
export const critFactor = (save: Pick<Save, "upgrades" | "training">) =>
  save.upgrades.critical ? critFactorAt(save.training.critFactor) / 100 : 1;
const critFactorAt = (ranks: number) => CRIT_FACTOR_BASE + CRIT_FACTOR_RANK * ranks;
/** A hero's critical strikes: what `save` gives (research included), or none. */
export function critRule(save: Pick<Save, "upgrades" | "training" | "archives">): CritRule | undefined {
  const chance = snap(critChance(save) * researched(save.archives, "critChancePercent", 100) / 100);
  if (chance <= 0) return undefined;
  return { chance, factor: snap(critFactor(save) * researched(save.archives, "critFactorPercent", 100) / 100) };
}

/** The Archer's reach, in hundredths of a tile (Attack Range), and its
 * rate of fire, in twentieths of a shot every 10 turns (Attack Speed),
 * from the ranks `save` holds (a run's `trainingNow`). */
export const attackRange = (save: Pick<Save, "training">) => attackRangeAt(save.training.attackRange);
const attackRangeAt = (ranks: number) => ATTACK_RANGE_BASE + ATTACK_RANGE_RANK * ranks;
export const attackSpeed = (save: Pick<Save, "training">) => attackSpeedAt(save.training.attackSpeed);
const attackSpeedAt = (ranks: number) => ATTACK_SPEED_BASE + ATTACK_SPEED_RANK * ranks;
/** What ATK / Tile adds to an arrow's ATK multiplier for each tile to its
 * target, in hundred-thousandths, from the ranks `save` holds (a run's
 * `trainingNow`): 0.01 for the first rank, each later one 0.00004 less. */
export const attackPerTile = (save: Pick<Save, "training">) => attackPerTileAt(save.training.attackPerTile);
const attackPerTileAt = (ranks: number) => ATK_PER_TILE_FIRST * ranks - (ATK_PER_TILE_FALL * ranks * (ranks - 1)) / 2;
/** The chance each of the Archer's shots is a multishot, in hundredths of
 * a percent (Multishot Chance), and how many enemies a multishot fires at
 * (Multishot Targets), from the ranks `save` holds (a run's `trainingNow`). */
export const multishotChance = (save: Pick<Save, "training">) => multishotChanceAt(save.training.multishotChance);
const multishotChanceAt = (ranks: number) => MULTISHOT_CHANCE_RANK * ranks;
export const multishotTargets = (save: Pick<Save, "training">) => multishotTargetsAt(save.training.multishotTargets);
const multishotTargetsAt = (ranks: number) => MULTISHOT_TARGETS_BASE + MULTISHOT_TARGETS_RANK * ranks;

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
/** Gold Bonus training's multiplier on the Gold a kill, or an item picked up
 * or door opened in a run, pays, in percent:
 * 100 without Loot. */
export const goldBonus = (save: Pick<Save, "upgrades" | "training">) =>
  bonusAt(save.upgrades.loot ? save.training.goldBonus : 0, GOLD_BONUS_RANK);
const bonusAt = (ranks: number, rank: number) => 100 + rank * ranks;
/** The Free Upgrade row training each group's free levels. */
export const FREE_TRAINING_ROWS = { offense: "freeOffense", defense: "freeDefense", utility: "freeUtility" } as const satisfies Record<keyof typeof TRAINING_GROUPS, TrainingId>;
const FREE_ROWS: ReadonlySet<TrainingId> = new Set(Object.values(FREE_TRAINING_ROWS));
/** The chance each floor passed in a run trains a stat of `group` a level
 * for free, in hundredths of a percent: none without Free Training. */
export const freeTrainingChance = (save: Pick<Save, "upgrades" | "training">, group: keyof typeof TRAINING_GROUPS) =>
  save.upgrades.freeTraining ? freeTrainingAt(save.training[FREE_TRAINING_ROWS[group]]) : 0;
const freeTrainingAt = (ranks: number) => FREE_TRAINING_RANK * ranks;
/** The training rows shown as a multiplier (×1.30), their value in percent,
 * and what a rank adds. */
const MULTIPLIER_ROWS: ReadonlyMap<TrainingId, number> = new Map([["silverBonus", SILVER_BONUS_RANK], ["goldBonus", GOLD_BONUS_RANK]]);

/** How a Training row's value reads: a multiplier as ×1.30, Attack Range
 * as 3.00 tiles, Attack Speed as 1.00/10 turns, ATK / Tile as
 * +0.010×/tile, Multishot Targets as 2 targets, the others with their unit
 * after. `bare` leaves out the units of Attack Range, Attack Speed, ATK /
 * Tile and Multishot Targets (3.00, 1.00, +0.010, 2), for the run's
 * training cards, whose tooltips say what they count. */
export const trainingText = (value: number, unit: string, bare = false) =>
  unit === "×" ? `×${value.toFixed(2)}` : unit === "tiles" ? `${value.toFixed(2)}${bare ? "" : " tiles"}` : unit === "shots" ? `${value.toFixed(2)}${bare ? "" : "/10 turns"}`
    : unit === "perTile" ? `+${value.toFixed(3)}${bare ? "" : "×/tile"}` : unit === "targets" ? `${value}${bare ? "" : " targets"}` : `${value}${unit}`;

/** Whether `id` has as many ranks as it can take. */
/** How much faster trainers train than at first (Faster Trainers research:
 * 0.02 a level); a rank takes its time / (1 + this). */
export const trainingSpeed = (save: Pick<Save, "archives">) => researched(save.archives, "trainingSpeed", 0);
/** What Training Discount takes off a trainer's Gold, in tenths of a percent. */
export const trainingDiscount = (save: Pick<Save, "archives">) => researched(save.archives, "trainingDiscount", 0);

/** Whether `id` can take no more ranks: at its most, counting a rank a
 * trainer is training. */
export const trainingMaxed = (save: Pick<Save, "training" | "upgrades"> & Partial<Pick<Save, "trainingJobs">>, id: TrainingId) => {
  const row = TRAINING.find((t) => t.id === id)!;
  return save.training[id] + ranksInTraining(save.trainingJobs, id) >= trainingCap(row, save.upgrades);
};

/** Whether `id` can take no more ranks bought with training points: at its
 * most by the ranks it has. A rank a trainer is training doesn't count, since
 * points bought past it take its room and the trainer trains fewer
 * (`TrainingDesk.train`). */
export const trainingFull = (save: Pick<Save, "training" | "upgrades">, id: TrainingId) => save.training[id] >= trainingCap(TRAINING.find((t) => t.id === id)!, save.upgrades);

/** The research multiplying what each Training row's value does (the
 * stats `loadout` multiplies itself, `statFactor`, aside): Regen's HP a
 * step, the crits, the Gold and Silver a floor pays, and the Gold and
 * Silver Bonus. A global Gold multiplier (the tower's, the Shop's, themes,
 * Gold found) is no row's: it shows only in the HUD's Gold bonus total. */
const ROW_RESEARCH: Partial<Record<TrainingId, ResearchTarget>> = {
  regen: "regenPercent", critChance: "critChancePercent", critFactor: "critFactorPercent",
  floorGold: "floorGold", floorSilver: "floorSilver", silverBonus: "silverBonus", goldBonus: "goldBonus",
};
/** What row `id`'s value is multiplied by in play: its research's percent
 * (1 without), which the Training tab and the run's cards show it with. */
export const rowResearchFactor = (save: Pick<Save, "archives">, id: TrainingId) => {
  const target = ROW_RESEARCH[id];
  return target ? researched(save.archives, target, 100) / 100 : 1;
};
/** A Gold or Silver amount as the Training rows show it: to the hundredth. */
export const shownAmount = (value: number) => Math.round(value * 100) / 100;

/** Where a Training row's value is read: the mode whose hero's equipment
 * counts, and a run inside, if any, whose hero's stats, ranks bought with
 * Silver and boons count too. */
export type TrainingView = { mode: Mode; run?: Pick<RunCore, "training" | "player"> };

/** What one more rank of `id` costs (in training points, or a trainer's
 * Gold) and does: its value now and with `count` more ranks (`rowValue`),
 * what a rank adds, and its prices. A row at its most ranks
 * (`trainingFull`) has no next rank to buy; one whose rank in training
 * reaches it has none for a trainer. */
export function trainingStep(save: Save, id: TrainingId, count = 1, view: TrainingView = { mode: "tower" }) {
  const row = TRAINING.find((t) => t.id === id)!, maxed = trainingFull(save, id);
  const buy = trainingPrices(save, row, maxed, trainingMaxed(save, id));
  const now = rowValue(save, id, 0, view), next = rowValue(save, id, maxed ? 0 : count, view);
  return { row, unit: now.unit, now: now.value, next: next.value, worth: rowWorth(row, save.training[id]), ...buy };
}

/** What one press of `id`'s training-points button buys at Buy Quantity
 * `q`: the ranks (up to its most, a rank in training not counted) and the
 * points they take, and whether the points held pay for them. */
export function trainingBulk(save: Save, id: TrainingId, q: BuyQuantity) {
  const row = TRAINING.find((t) => t.id === id)!;
  const room = trainingCap(row, save.upgrades) - save.training[id];
  return bulkBuy(q, Math.max(0, room), () => row.cost, save.settings.freePurchases ? Infinity : trainingPoints(save).left);
}

/** Whether the next rank of `row` can be bought now with training points
 * (`affordable`) or Gold (`goldAffordable`), whether there is one, and a
 * trainer's Gold price for it. */
function trainingPrices(save: Save, row: TrainingRow, maxed: boolean, trainerMaxed: boolean) {
  const free = save.settings.freePurchases, gold = trainingGold(row, save.trainerRanks[row.id], trainingDiscount(save));
  return {
    affordable: !maxed && (free || trainingPoints(save).left >= row.cost),
    maxed,
    gold,
    goldAffordable: !trainerMaxed && (free || save.gold >= gold),
  };
}

/** What row `id` stands at with `extra` more ranks of the hero's own, as
 * the Training tab and the run's cards show it, everything that changes it
 * directly counted: for a stat, the loadout of `view.mode` (equipment,
 * provisions and research) or, inside a run, the run's hero (what it
 * found, its boons and badges) moved by what the ranks change; for any
 * other row, its ranks (a run's bought with Silver too) times its research
 * (`rowResearchFactor`) and the run's boons and the equipment that
 * multiply it (Silver / Floor counting Silver Bonus). */
export function rowValue(save: Save, id: TrainingId, extra: number, view: TrainingView): { unit: string; value: number } {
  const row = TRAINING.find((t) => t.id === id)!, f = rowResearchFactor(save, id), run = view.run;
  const more = (ranks: number) => ({ ...save, training: { ...save.training, [id]: save.training[id] + ranks } });
  if (isStatRow(row)) {
    const stat = row.stat, base = loadout(save, view.mode)[stat], gain = extra ? loadout(more(extra), view.mode)[stat] - base : 0;
    const value = run ? (run.player[stat] ?? 0) + gain * boonFactor(run, stat) : base + gain;
    return { unit: statUnit(stat), value: shownStat(stat, snap(value * f)) };
  }
  const ranks = save.training[id] + (run?.training?.[id] ?? 0) + extra, boons = run ? runBoons(run, save) : null;
  if (id === "floorGold") return { unit: "", value: shownAmount(floorGoldAt(ranks) * f) };
  if (id === "floorSilver" || id === "silverBonus") {
    // Silver / Floor is raised by Silver Bonus, once Wealthy opens it.
    const bonusRanks = id === "silverBonus" ? ranks : save.training.silverBonus + (run?.training?.silverBonus ?? 0);
    const bonus = id === "silverBonus" || save.upgrades.wealthy ? bonusAt(bonusRanks, SILVER_BONUS_RANK) : 100;
    const found = raised((bonus / 100) * rowResearchFactor(save, "silverBonus") * (boons?.silverFound ?? 1), wornEffects(save, view.mode).silverFind);
    if (id === "silverBonus") return { unit: "×", value: snap(found) };
    return { unit: "", value: shownAmount(floorSilverAt(ranks) * f * (boons?.floorSilver ?? 1) * found) };
  }
  const step = valueAt(id, ranks);
  if (FREE_ROWS.has(id) && boons) return { unit: step.unit, value: snap(step.value + boons.freeUp / 100) };
  return { unit: step.unit, value: snap(step.value * f) };
}

/** What one more rank of `row` adds, past `ranks`, in its own terms. */
function rowWorth(row: TrainingRow, ranks: number) {
  if (isStatRow(row)) return trainingWorth(row, ranks);
  const id = row.id;
  if (id === "critChance") return CRIT_CHANCE_RANK / 100;
  if (id === "critFactor") return CRIT_FACTOR_RANK;
  if (id === "attackRange") return ATTACK_RANGE_RANK / 100;
  if (id === "attackSpeed") return ATTACK_SPEED_RANK / 20;
  if (id === "attackPerTile") return (ATK_PER_TILE_FIRST - ATK_PER_TILE_FALL * ranks) / 100_000;
  if (id === "multishotTargets") return MULTISHOT_TARGETS_RANK;
  if (id === "floorGold") return FLOOR_GOLD_RANK;
  if (id === "floorSilver") return FLOOR_SILVER_RANK;
  const bonus = MULTIPLIER_ROWS.get(id);
  if (bonus !== undefined) return bonus;
  return percentRow(id)[1] / 100;
}

/** The stats kept in percent: Lifesteal, Thorn Damage and the parry rows. */
const PERCENT_STATS: ReadonlySet<Stat> = new Set(["lifesteal", "thorns", "parry"]);
/** The unit a stat row's value shows with. */
export const statUnit = (stat: Stat) => (PERCENT_STATS.has(stat) ? "%" : "");
/** A stat as the Training rows show it: whole, but Regen, a fraction of an
 * HP a step, to the hundredth (rounded down, like `whole`), and Parry %, in
 * half percents, to the tenth. */
export const shownStat = (stat: StatTrainingRow["stat"], value: number) =>
  stat === "regen" ? Math.floor(Math.round(value * 1e6) / 1e4) / 100
    : stat === "parry" ? Math.floor(Math.round(value * 1e6) / 1e5) / 10
    : stat === "lifesteal" ? Math.floor(Math.round(value * 1e6) / 1e3) / 1000 : whole(value);

/** Any other row's value at `ranks`, before research and boons: a
 * multiplier (unit "×"), Attack Range in tiles, Attack Speed in shots,
 * ATK / Tile, Multishot Targets, or a percentage. */
function valueAt(id: TrainingId, ranks: number): { unit: string; value: number } {
  if (id === "critChance") return { unit: "%", value: critChanceAt(ranks) / 100 };
  if (id === "critFactor") return { unit: "×", value: critFactorAt(ranks) / 100 };
  if (id === "attackRange") return { unit: "tiles", value: attackRangeAt(ranks) / 100 };
  if (id === "attackSpeed") return { unit: "shots", value: attackSpeedAt(ranks) / 20 };
  if (id === "attackPerTile") return { unit: "perTile", value: attackPerTileAt(ranks) / 100_000 };
  if (id === "multishotTargets") return { unit: "targets", value: multishotTargetsAt(ranks) };
  const bonus = MULTIPLIER_ROWS.get(id);
  if (bonus !== undefined) return { unit: "×", value: bonusAt(ranks, bonus) / 100 };
  return { unit: "%", value: percentRow(id)[0](ranks) / 100 };
}

/** A percentage row's value at a number of ranks, and what a rank adds. */
function percentRow(id: TrainingId): [(ranks: number) => number, number] {
  if (id === "findPotion") return [findPotionChance, FIND_POTION_RANK];
  if (id === "revive") return [reviveChanceAt, REVIVE_RANK];
  if (id === "multishotChance") return [multishotChanceAt, MULTISHOT_CHANCE_RANK];
  if (FREE_ROWS.has(id)) return [freeTrainingAt, FREE_TRAINING_RANK];
  return [(r: number) => POTION_PERCENT_BASE + POTION_PERCENT_RANK * r, POTION_PERCENT_RANK];
}
