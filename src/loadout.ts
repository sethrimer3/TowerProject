import { whole } from "./whole.ts";
import { bulkBuy, type BuyQuantity } from "./buy-quantity.ts";
import { snap } from "./exact.ts";
import { PARRY_CAP, type CritRule } from "./combat.ts";
import type { Mode } from "./entities.ts";
import type { RunCore } from "./runs.ts";
import type { Save } from "./save-shape.ts";
import { boonFactor, runBoons } from "./shrines.ts";
import { badgeFactor } from "./badges.ts";
import { treeHeroFactor } from "./card-trees.ts";
import { TRAINING_GROUPS, GOLD_SHOP, schedulePrice, TRAINING, TRAINING_PER_LEVEL, UPGRADES, trainingCap, isStatRow, levelForXp, trained, trainingWorth, amountAt, trainedAmount, trainingDef, type GoldItemId, type StatTrainingRow, type TrainingDef, type TrainingId, type TrainingRow, type UpgradeId } from "./config.ts";
import { wornEffects } from "./equipment/effects.ts";
import { silverFound } from "./gold-multipliers.ts";
import { PIERCE_CAP } from "./equipment/balance.ts";
import { RESEARCH, researched } from "./archives.ts";
import { ranksInTraining, trainingGold } from "./training-jobs.ts";
import { goalUnlocked, type GoalUnlock } from "./goals.ts";
import type { CardId } from "./cards.ts";

/** Whether `row` can be seen and trained: its upgrade owned, or the Goals
 * checkpoint that unlocks it claimed (Attack Range, Attack Speed). */
export const trainingOpen = (row: TrainingRow, save: Pick<Save, "upgrades" | "goals">) =>
  ("requires" in row ? save.upgrades[row.requires] > 0 : true) && ("goal" in row ? goalUnlocked(save, row.goal) : true);

/** The Goals whose Training rows only the Archer's arrows read. */
const SHOT_GOALS: ReadonlySet<GoalUnlock> = new Set(["attackRange", "attackSpeed", "attackPerTile", "multishot", "rapidFire"]);
/** Whether `row` is one only the Archer's arrows read (Attack Range,
 * Attack Speed, ATK / m, Multishot, Rapid Fire). */
export const shotRow = (row: TrainingRow) => "goal" in row && SHOT_GOALS.has(row.goal);
/** Whether `row` can be raised inside a run whose hand is `hand` (Silver,
 * Free Training): open (`trainingOpen`), and a shot row only while the
 * hand holds ARCHER. Outside a run every open row trains, ARCHER or not. */
export const runTrainingOpen = (row: TrainingRow, save: Pick<Save, "upgrades" | "goals">, hand: readonly CardId[]) =>
  trainingOpen(row, save) && (!shotRow(row) || hand.includes("archer"));

/** What one rank of an upgrade adds to a character. */
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
  blue: "starting blue key",
  red: "starting red key",
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
 * so each change to it mid-run (hero-stats.ts): its research's percent (1 without). */
export const statFactor = (save: Pick<Save, "archives">, stat: Stat) =>
  stat in STAT_RESEARCH ? researched(save.archives, STAT_RESEARCH[stat as keyof typeof STAT_RESEARCH]) / 100 : 1;

/** The character a run in `mode` would start with now: the baseline,
 * permanent upgrades and training, then the equipment that mode's hero
 * wears (flat bonuses, then percentages of the total, fractions kept),
 * the whole of ATK, DEF, max HP and shroud then multiplied by their
 * research (`statFactor`). Provisions add nothing here: each is a use the
 * run carries (`Game.useProvision`). */
export function loadout(save: Save, mode: Mode = "tower"): Loadout {
  const own = { ...BASE, yellow: 0, blue: 0, red: 0 };
  add(own, UPGRADES, save.upgrades);
  for (const row of TRAINING) if (isStatRow(row)) own[row.stat] += trained(row, save.training[row.id]);
  const eq = wornEffects(save, mode);
  // A drawback (Bloodprice Blade's max HP) never takes a stat below zero, or max HP below 1.
  const percent = (base: number, pct: number) => (pct ? snap(Math.max(0, (base * (100 + pct)) / 100)) : base);
  const plus = (base: number, more: number) => (more ? snap(base + more) : base);
  const researchedStat = (stat: Stat, value: number) => {
    const factor = statFactor(save, stat);
    return factor === 1 ? value : snap(value * factor);
  };
  return {
    attack: researchedStat("attack", percent(plus(own.attack, eq.attack), eq.attackPct)),
    defense: researchedStat("defense", percent(plus(own.defense, eq.defense), eq.defensePct)),
    maxHp: Math.max(1, researchedStat("maxHp", percent(plus(own.maxHp, eq.maxHp), eq.maxHpPct))),
    shroud: researchedStat("shroud", plus(own.shroud, eq.shroud)),
    regen: plus(own.regen, eq.regen),
    lifesteal: own.lifesteal,
    thorns: own.thorns,
    // Parry % research is kept in tenths of a percent.
    parry: Math.min(PARRY_CAP, snap(own.parry + researched(save.archives, "parryPercent") / 10)),
    bossAttack: eq.bossAttack,
    pierce: Math.min(eq.pierce, PIERCE_CAP),
    keys: { yellow: own.yellow, blue: own.blue, red: own.red },
    startKeys: { yellow: eq.yellowKeys, blue: eq.blueKeys },
    // Undo needs Rehearsed steps (its first undo) or Echoes of time: Undo
    // Count research, which either opens, stores the rest.
    undoCapacity: save.upgrades.inspirationUndos || save.upgrades.undos ? researched(save.archives, "undoCapacity", own.undos) : 0,
  };
}

/** What stat row `row` standing at `to` ranks rather than `from` moves
 * `mode`'s loadout by: the ranks' worth on its curve, raised as the loadout
 * raises them (equipment's percent, then the stat's research). */
export function rankShift(save: Save, mode: Mode, row: StatTrainingRow, from: number, to: number) {
  const at = (ranks: number) => loadout({ ...save, training: { ...save.training, [row.id]: ranks } }, mode)[row.stat];
  return snap(at(to) - at(from));
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

/** A provision's description. */
export const provisionText = (id: GoldItemId) => GOLD_SHOP.find((g) => g.id === id)!.description;

/** Whether provision `id` shows and sells: its upgrade, if it names one, is owned. */
export function provisionOpen(save: Pick<Save, "upgrades">, id: GoldItemId) {
  const item = GOLD_SHOP.find((g) => g.id === id)!;
  return !("requires" in item) || save.upgrades[item.requires] > 0;
}
/** The Gold the next `id` provision costs, after those already bought. */
export const provisionPrice = (save: Pick<Save, "provisions">, id: GoldItemId) =>
  schedulePrice(GOLD_SHOP.find((g) => g.id === id)!.price, save.provisions[id]);

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

/** A hero's critical strikes: what `save` gives (research included), or none:
 * Crit %'s chance, in percent, and Crit x's factor on the hero's ATK, each
 * raised by the card trees' percents (`cards`, ENEMY's), a factor of their own. */
export function critRule(save: Pick<Save, "upgrades" | "training" | "archives">, cards?: { chance: number; factor: number }): CritRule | undefined {
  const chance = snap(trainedAmount(save, "critChance") / 100 * researched(save.archives, "critChancePercent") / 100 * (100 + (cards?.chance ?? 0)) / 100);
  if (chance <= 0) return undefined;
  const factor = snap(trainedAmount(save, "critFactor") / 100 * researched(save.archives, "critFactorPercent") / 100 * (100 + (cards?.factor ?? 0)) / 100);
  // The card percents ride along, so an enemy card's own add to them (`critAgainst`).
  return cards?.chance || cards?.factor ? { chance, factor, cards: { chance: cards.chance, factor: cards.factor } } : { chance, factor };
}

/** The Free Upgrade row training each group's free levels. */
export const FREE_TRAINING_ROWS = { offense: "freeOffense", defense: "freeDefense", utility: "freeUtility" } as const satisfies Record<keyof typeof TRAINING_GROUPS, TrainingId>;
const FREE_ROWS: ReadonlySet<TrainingId> = new Set(Object.values(FREE_TRAINING_ROWS));

/** How a Training row's value reads: a multiplier as ×1.30, Attack Range
 * as 3.00 m (a tile is a meter), Attack Speed as 1.00/10 turns, ATK / m
 * as the multiplier it gives an arrow for each meter, ×1.010/m, Multishot
 * Targets as a bare 2, Rapid Fire Duration as 1.00 turns, the others with
 * their unit after. `bare` leaves out the units of Attack Range, Attack
 * Speed, ATK / m and Rapid Fire Duration (3.00, 1.00, ×1.010, 1.00),
 * for the run's training cards, whose tooltips say what they count. */
export const trainingText = (value: number, unit: string, bare = false) =>
  unit === "×" ? `×${value.toFixed(2)}` : unit === "m" ? `${value.toFixed(2)}${bare ? "" : " m"}` : unit === "shots" ? `${value.toFixed(2)}${bare ? "" : "/10 turns"}`
    : unit === "perMeter" ? `×${(1 + value).toFixed(3)}${bare ? "" : "/m"}` : unit === "count" ? String(value)
    : unit === "turns" ? `${value.toFixed(2)}${bare ? "" : " turns"}` : `${value}${unit}`;

/** How much faster trainers train than at first (Faster Trainers research:
 * 0.02 a level); a rank takes its time / (1 + this). */
export const trainingSpeed = (save: Pick<Save, "archives">) => researched(save.archives, "trainingSpeed");
/** What Training Discount takes off a trainer's Gold, in tenths of a percent. */
export const trainingDiscount = (save: Pick<Save, "archives">) => researched(save.archives, "trainingDiscount");

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
/** How many open rows are at their most (each in a gold box), which makes
 * finishing a rank cheaper (`finishGems`). A reset or a Limit Break can
 * take one out again. */
export const trainingRowsFull = (save: Pick<Save, "training" | "upgrades" | "goals">) =>
  TRAINING.filter((t) => trainingOpen(t, save) && trainingFull(save, t.id)).length;

/** What row `id`'s value is multiplied by in play: its `research`'s percent
 * (1 without), which the Training tab and the run's cards show it with.
 * The stats `loadout` multiplies itself (`statFactor`) aside. A global Gold
 * multiplier (the tower's, the Shop's, themes, Gold found) is no row's: it
 * shows only in the HUD's Gold bonus total. */
export const rowResearchFactor = (save: Pick<Save, "archives">, id: TrainingId) => {
  const target = trainingDef(id).research;
  return target ? researched(save.archives, target) / 100 : 1;
};
/** A Gold or Silver amount as the Training rows show it: to the hundredth. */
export const shownAmount = (value: number) => Math.round(value * 100) / 100;

/** Where a Training row's value is read: the mode whose hero's equipment
 * counts, and a run inside, if any, whose hero's stats, ranks bought with
 * Silver and boons count too. */
export type TrainingView = { mode: Mode; run?: Pick<RunCore, "training" | "player" | "maxHpBoost" | "cardTrees"> };

/** What one more rank of `id` costs (in training points, or a trainer's
 * Gold) and does: its value now and with `count` more ranks (`rowValue`),
 * what the next rank adds before research and boons (`rowWorth`), and its
 * prices. A row at its most ranks
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
  if (isStatRow(row)) {
    // What `extra` ranks change, from the ranks the hero has (a run's own
    // too), as a run would gain them (`rankShift`).
    const stat = row.stat, ranks = save.training[id] + (run?.training?.[id] ?? 0);
    const gain = extra ? rankShift(save, view.mode, row, ranks, ranks + extra) : 0;
    const value = run ? (run.player[stat] ?? 0) + gain * boonFactor(run, stat) * badgeFactor(run, stat) * treeHeroFactor(run, stat) : loadout(save, view.mode)[stat] + gain;
    return { unit: statUnit(stat), value: shownStat(stat, snap(value * f)) };
  }
  const ranks = save.training[id] + (run?.training?.[id] ?? 0) + extra, boons = run ? runBoons(run, save) : null;
  const def = trainingDef(id), unit = def.unit ?? "";
  if (id === "floorSilver" || id === "silverBonus") {
    // Silver / Floor is raised by Silver found, as the run pays it.
    const bonusRanks = id === "silverBonus" ? ranks : save.training.silverBonus + (run?.training?.silverBonus ?? 0);
    const found = silverFound(save, view.mode, bonusRanks, boons?.silverFound);
    if (id === "silverBonus") return { unit, value: snap(found) };
    return { unit, value: shownAmount(amountAt(def, ranks) * f * (boons?.floorSilver ?? 1) * found) };
  }
  const value = amountAt(def, ranks) / (def.scale ?? 1);
  if (FREE_ROWS.has(id) && boons) return { unit, value: snap(value + boons.freeUp / 100) };
  return { unit, value: unit === "" ? shownAmount(value * f) : snap(value * f) };
}

/** What the rank after `ranks` adds to `row`: to its stat, or to its
 * amount in the units it shows. */
const rowWorth = (row: TrainingRow, ranks: number) => {
  if (isStatRow(row)) return trainingWorth(row, ranks);
  const def: TrainingDef = row;
  return (amountAt(def, ranks + 1) - amountAt(def, ranks)) / (def.scale ?? 1);
};

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
