import { researched, type ArchivesSave } from "./progression/archives.ts";
import type { Enemy, Tile } from "./entities.ts";
import { snap } from "./exact.ts";
import { PARRY_CAP } from "./combat.ts";
import { drawAt } from "./random.ts";
import { isRecord, whole } from "./save/decode.ts";

// Shrines (docs/agents/shrines.md): once Unlock Shrines is researched, a
// Tower run earns a boon every so many floors, and the player picks each
// from a few offered. A boon lasts the rest of the run. Which boons a run
// has earned is worked out from the highest floor it has reached and what
// it picked, never counted as it climbs, so undo can't earn one twice and a
// boon that shortens the schedule earns, at once, every boon the floor has
// now passed. The Delve has no shrines.

/** A standard boon: picked up to `max` times a run, each copy adding
 * `value` (a multiplier's 0.15 is ×1.15) by `math`, all of them then
 * strengthened by Standard Boon Bonus research. */
type StandardBoon = { kind: "standard"; name: string; max: number; math: "multiply" | "add"; value: number; label: (total: number) => string };
/** A trade-off boon: once a run, a benefit (strengthened by Improve
 * Trade-off Boons research, unless `fixed`) at a cost. `label` reads the
 * benefit's strength, 1 before research. */
type TradeoffBoon = { kind: "tradeoff"; name: string; max: 1; label: (t: number) => string; fixed?: true };
export type BoonDef = StandardBoon | TradeoffBoon;

const times = (n: number) => `×${Number(n.toFixed(2))}`;
const plus = (n: number, unit = "") => `+${Number(n.toFixed(2))}${unit}`;
const minus = (n: number) => `−${Number((n * 100).toFixed(1))}%`;
const multiply = (name: string, max: number, value: number, label = (f: number) => `${times(f)} ${name}`): StandardBoon =>
  ({ kind: "standard", name, max, math: "multiply", value, label });
const add = (name: string, max: number, value: number, label: (total: number) => string): StandardBoon =>
  ({ kind: "standard", name, max, math: "add", value, label });
const tradeoff = (name: string, label: (t: number) => string, fixed?: true): TradeoffBoon =>
  ({ kind: "tradeoff", name, max: 1, label, ...(fixed ? { fixed } : {}) });

/** Every boon, standard first, in the order the Shrine Boons page lists
 * them. Spell boons, Bounce Shot, Orbs and the ranged enemies' trade-off
 * wait for what they act on. */
export const BOONS = {
  maxHp: multiply("Max HP", 5, 0.2),
  attack: multiply("ATK", 5, 0.15),
  gold: multiply("All Gold Bonuses", 5, 0.15),
  shroud: multiply("Shroud", 5, 0.15),
  silver: multiply("Silver Bonus", 5, 0.15),
  regen: multiply("Regen", 5, 0.75),
  interest: multiply("Interest", 5, 0.5, (f) => `Interest ${times(f)}`),
  freeUp: add("Free Up Chance for All", 5, 5, (n) => `Free Up Chance for All ${plus(n, "%")}`),
  parry: add("Parry %", 5, 4, (n) => `Parry % ${plus(n)}`),
  floorReq: add("Boon Floor Requirement", 3, 20, (n) => `Boon Floor Requirement −${Number(n.toFixed(2))}%`),
  playSpeed: add("Max Play Speed", 1, 1, (n) => `Increase Max Play Speed by ${plus(n)}`),
  attackBossHp: tradeoff("ATK, Bosses ×8 HP", (t) => `${times(1 + 0.5 * t)} ATK, but Bosses Have ×8 Health`),
  goldMaxHp: tradeoff("Gold, Max HP −70%", (t) => `${times(1 + 0.8 * t)} Gold, but Max HP −70%`),
  enemyHpRegen: tradeoff("Enemy HP, Regen and Lifesteal −90%", (t) => `Enemies Have ${minus(0.5 * t)} HP, but Regen and Lifesteal −90%`),
  enemyAttack: tradeoff("Enemy ATK, Player ATK −50%", (t) => `Enemy ATK ${minus(0.5 * t)}, but Player ATK −50%`),
  floorSilver: tradeoff("Silver / Floor, no Kill Silver", (t) => `${times(1 + 11 * t)} Silver Per Floor, but Enemy Kills Don't Give Silver`),
  regenMaxHp: tradeoff("Regen, Max HP −60%", (t) => `Regen ${times(1 + 7 * t)}, but Max HP −60%`),
  bossHp: tradeoff("Boss HP, Boss Strikes First", (t) => `Boss Health ${minus(0.7 * t)}, but Boss Strikes First`),
  lifesteal: tradeoff("Lifesteal, Parry % −70%", (t) => `Lifesteal ${times(1 + 1.5 * t)}, but Parry % −70%`),
  fastSecond: tradeoff("Fast Enemies Strike Second", () => `Fast Enemies Strike Second, but Their ATK ×2.5`, true),
} satisfies Record<string, BoonDef>;
export type BoonId = keyof typeof BOONS;
export const BOON_IDS = Object.keys(BOONS) as BoonId[];
export const boon = (id: BoonId): BoonDef => BOONS[id];
export const isBoon = (id: unknown): id is BoonId => typeof id === "string" && BOON_IDS.includes(id as BoonId);
export const STANDARD_BOONS = BOON_IDS.filter((id) => boon(id).kind === "standard");
/** Every boon a run can pick, all copies counted. */
const ALL_COPIES = BOON_IDS.reduce((n, id) => n + boon(id).max, 0);

/** What a run's enemies are changed by: their HP and ATK, a boss's HP on
 * top, whether a boss strikes first, and whether a Fast enemy strikes
 * second instead, with its ATK multiplied. */
export type FoeRule = { hp: number; attack: number; bossHp: number; bossFirst: boolean; fastSecond: boolean; fastAttack: number };
export const NO_FOES: FoeRule = { hp: 1, attack: 1, bossHp: 1, bossFirst: false, fastSecond: false, fastAttack: 1 };

/** The hero's stats boons multiply; they add to Parry % as well. */
export const HERO_FACTORS = ["attack", "maxHp", "shroud", "regen", "lifesteal", "parry"] as const;
export type HeroFactor = (typeof HERO_FACTORS)[number];

/** Everything a run's boons change. Factors multiply (1 is none);
 * `parryBonus` adds percent to Parry % (after its factor), `freeUp` hundredths of a percent to each group's Free
 * Upgrade chance, `floorReq` hundredths of a percent off each boon's floors,
 * `playSpeed` steps a second to the most the arrows reach. */
export type BoonEffects = Record<HeroFactor, number> & {
  parryBonus: number;
  gold: number;
  silverFound: number;
  floorSilver: number;
  killSilver: number;
  interest: number;
  freeUp: number;
  floorReq: number;
  playSpeed: number;
  foes: FoeRule;
};

/** What the boons read from the profile: the research done. */
export type ShrineOwner = { archives: ArchivesSave };

/** Whether Shrines are researched. */
export const shrinesOpen = (o: ShrineOwner) => researched(o.archives, "shrines") > 0;
/** Standard Boon Bonus, in percent. */
const standardBonus = (o: ShrineOwner) => researched(o.archives, "standardBoonBonus");
/** How strong a trade-off's benefit is: 1, and 1% more a level of Improve
 * Trade-off Boons. */
const tradeoffStrength = (o: ShrineOwner) => 1 + researched(o.archives, "tradeoffBonus") / 100;

/** How many of each boon `picked` holds. */
export function copies(picked: readonly BoonId[]) {
  const n: Partial<Record<BoonId, number>> = {};
  for (const id of picked) n[id] = (n[id] ?? 0) + 1;
  return n;
}

/** A standard boon's total with `count` copies: a multiplier's (1 + value
 * × count) × (1 + bonus), an addition's value × count × (1 + bonus); none
 * (1 or 0) without a copy. */
export function standardTotal(id: BoonId, count: number, o: ShrineOwner) {
  const def = boon(id);
  if (def.kind !== "standard") return 0;
  if (!count) return def.math === "multiply" ? 1 : 0;
  const bonus = 1 + standardBonus(o) / 100;
  return def.math === "multiply" ? (1 + def.value * count) * bonus : def.value * count * bonus;
}

/** What a boon offered reads as: a standard boon its one copy, with the
 * bonus; a trade-off its benefit with the research. */
export function boonLabel(id: BoonId, o: ShrineOwner) {
  const def = boon(id);
  return def.kind === "standard" ? def.label(standardTotal(id, 1, o)) : def.label(def.fixed ? 1 : tradeoffStrength(o));
}
/** What the boons a run picked come to, a line for each kind: a standard
 * boon its total and copies, a trade-off its text. */
export function pickedLines(picked: readonly BoonId[], o: ShrineOwner) {
  const n = copies(picked);
  return BOON_IDS.filter((id) => n[id]).map((id) => {
    const def = boon(id);
    return { id, count: n[id]!, text: def.kind === "standard" ? def.label(standardTotal(id, n[id]!, o)) : boonLabel(id, o) };
  });
}

/** What `picked` changes, with the research done now. */
export function boonEffects(picked: readonly BoonId[], o: ShrineOwner): BoonEffects {
  const n = copies(picked), total = (id: BoonId) => standardTotal(id, n[id] ?? 0, o), t = tradeoffStrength(o);
  const has = (id: BoonId) => !!n[id];
  const foes: FoeRule = { ...NO_FOES };
  const e: BoonEffects = {
    attack: total("attack"), maxHp: total("maxHp"), shroud: total("shroud"), regen: total("regen"), lifesteal: 1, parry: 1,
    parryBonus: total("parry"), gold: total("gold"), silverFound: total("silver"), floorSilver: 1, killSilver: 1, interest: total("interest"),
    freeUp: Math.round(total("freeUp") * 100), floorReq: Math.min(9500, Math.round(total("floorReq") * 100)), playSpeed: total("playSpeed"), foes,
  };
  if (has("attackBossHp")) { e.attack *= 1 + 0.5 * t; foes.bossHp *= 8; }
  if (has("goldMaxHp")) { e.gold *= 1 + 0.8 * t; e.maxHp *= 0.3; }
  if (has("enemyHpRegen")) { foes.hp *= Math.max(0.05, 1 - 0.5 * t); e.regen *= 0.1; e.lifesteal *= 0.1; }
  if (has("enemyAttack")) { foes.attack *= Math.max(0.05, 1 - 0.5 * t); e.attack *= 0.5; }
  if (has("floorSilver")) { e.floorSilver *= 1 + 11 * t; e.killSilver = 0; }
  if (has("regenMaxHp")) { e.regen *= 1 + 7 * t; e.maxHp *= 0.4; }
  if (has("bossHp")) { foes.bossHp *= Math.max(0.05, 1 - 0.7 * t); foes.bossFirst = true; }
  if (has("lifesteal")) { e.lifesteal *= 1 + 1.5 * t; e.parry *= 0.3; }
  if (has("fastSecond")) { foes.fastSecond = true; foes.fastAttack *= 2.5; }
  return e;
}

/** `foes` with every enemy's ATK cut by `cut` percent as well (ENEMY's
 * Weaken, its own factor); `foes` as it is without a cut. */
export const weakened = (foes: FoeRule | undefined, cut: number): FoeRule | undefined =>
  cut ? { ...(foes ?? NO_FOES), attack: (foes?.attack ?? 1) * (100 - Math.min(100, cut)) / 100 } : foes;

/** `foes` changes nothing. */
export const sameFoes = (a: FoeRule, b: FoeRule) =>
  a.hp === b.hp && a.attack === b.attack && a.bossHp === b.bossHp && a.bossFirst === b.bossFirst && a.fastSecond === b.fastSecond && a.fastAttack === b.fastAttack;

/** `tile` under `foes`: an enemy's HP and ATK multiplied (a boss's HP by
 * its own factor too, a Fast enemy's ATK by its), a boss striking first,
 * and a Fast enemy, with Fast Enemies Strike Second, striking second. */
export function foeTile(tile: Tile, foes: FoeRule | undefined): Tile {
  if (!foes || sameFoes(foes, NO_FOES)) return tile;
  // A Flying enemy over open floor takes the boons as one on the ground does.
  if (tile.flyer) return { ...tile, flyer: foeTile({ kind: "enemy", enemy: tile.flyer }, foes).enemy };
  if (tile.kind !== "enemy" || !tile.enemy) return tile;
  const e = tile.enemy, boss = e.strength === "boss" || e.strength === "greaterBoss";
  const enemy: Enemy = {
    ...e,
    hp: Math.max(1, snap(e.hp * foes.hp * (boss ? foes.bossHp : 1))),
    attack: snap(e.attack * foes.attack * (e.fast ? foes.fastAttack : 1)),
  };
  if (boss && foes.bossFirst) enemy.fast = true;
  else if (e.fast && foes.fastSecond) delete enemy.fast;
  return { ...tile, enemy };
}

/** What a Tower run's boons change now, or null for a run with none (and
 * every Delve run). */
export const runBoons = (run: object, o: ShrineOwner) => {
  const picked = shrineOf(run)?.picked;
  return picked?.length ? boonEffects(picked, o) : null;
};

// --- The schedule ---

/** The floors before a run's `k`th boon (from 1), before research: 200,
 * then 250 from the 21st, 300 from the 31st and 350 from the 41st. */
export const baseFloors = (k: number) => (k <= 20 ? 200 : k <= 30 ? 250 : k <= 40 ? 300 : 350);

/** The floors between the run's (k − 1)th and `k`th boon: the base less
 * Floors Required research, then less the Boon Floor Requirement boons'
 * share, rounded down; at least 1. Whole numbers throughout (`floorReq` in
 * hundredths of a percent), so the schedule is exact. */
export function floorsFor(k: number, o: ShrineOwner, floorReq: number) {
  const base = Math.max(1, baseFloors(k) + researched(o.archives, "shrineFloors"));
  return Math.max(1, Math.floor((base * (10_000 - floorReq)) / 10_000));
}

/** The boons a run that has reached floor `floor` (its number, from 1) and
 * picked `picked` has earned: every one whose floor it has reached, the
 * schedule worked out afresh, so a Boon Floor Requirement boon can earn
 * several at once. None without Shrines. */
export function boonsEarned(floor: number, picked: readonly BoonId[], o: ShrineOwner) {
  if (!shrinesOpen(o)) return 0;
  const req = boonEffects(picked, o).floorReq;
  let k = 0, at = 0;
  while (k < ALL_COPIES) {
    at += floorsFor(k + 1, o, req);
    if (at > floor) break;
    k++;
  }
  return k;
}

/** The floor (its number) the run's next boon is earned on, or null with
 * none left to earn or without Shrines. */
export function nextBoonFloor(floor: number, picked: readonly BoonId[], o: ShrineOwner) {
  if (!shrinesOpen(o)) return null;
  const req = boonEffects(picked, o).floorReq, earned = boonsEarned(floor, picked, o);
  if (earned >= ALL_COPIES) return null;
  let at = 0;
  for (let k = 1; k <= earned + 1; k++) at += floorsFor(k, o, req);
  return at;
}

/** The floor (its number) the run's latest boon was earned on: the sum of
 * the intervals of the boons earned so far, 0 before the first. */
export function lastBoonFloor(floor: number, picked: readonly BoonId[], o: ShrineOwner) {
  const req = boonEffects(picked, o).floorReq, earned = boonsEarned(floor, picked, o);
  let at = 0;
  for (let k = 1; k <= earned; k++) at += floorsFor(k, o, req);
  return at;
}

// --- Offers ---

/** What the Shrine Boons page keeps between runs: Auto Pick on or off,
 * the First Boon Choice, the boons banned and Auto Pick's ranking, best
 * first. */
export type ShrinesSave = { autoPick: boolean; firstChoice?: BoonId; banned: BoonId[]; ranking: BoonId[] };
export const defaultShrines = (): ShrinesSave => ({ autoPick: false, banned: [], ranking: [] });

/** What a Tower run keeps of its boons: those picked, in order; the draws
 * its offers have made; the offer waiting, if any; and the boons' effects
 * last applied to the hero and the enemies (`syncBoons`). */
export type ShrineRun = { picked: BoonId[]; rolls: number; offer?: BoonId[]; applied?: Pick<BoonEffects, HeroFactor | "parryBonus" | "foes"> };

/** The profile as offers read it. */
export type OfferOwner = ShrineOwner & { shrines: ShrinesSave };

/** The boons banned now: the first as many as Ban Boons research allows. */
export const bans = (o: OfferOwner) => o.shrines.banned.slice(0, researched(o.archives, "boonBans"));
/** The boons Auto Pick ranks now, best first: as many as Auto Pick Ranking
 * research allows, banned ones left out. */
export function ranked(o: OfferOwner) {
  const banned = bans(o);
  return o.shrines.ranking.filter((id) => !banned.includes(id)).slice(0, researched(o.archives, "boonRanks"));
}
/** The First Boon Choice now: researched, chosen and not banned. */
export function firstChoice(o: OfferOwner) {
  const id = o.shrines.firstChoice;
  return id && researched(o.archives, "firstBoonChoice") && !bans(o).includes(id) && boon(id).kind === "standard" ? id : undefined;
}
/** How many boons an offer gives: 2, and one more a level of Boon Option
 * Quantity. */
export const offerSize = (o: OfferOwner) => researched(o.archives, "boonOptions");
/** Whether Auto Pick can be turned on. */
export const autoPickOpen = (o: ShrineOwner) => researched(o.archives, "autoPickBoons") > 0;

/** Mixed into the run seed to start the offers' stream. */
const SHRINE_SALT = 0x5a1e7;
/** The chance in 80 an offer's slot is a trade-off: 15 against the
 * standard boons' 65 (Spell boons' 20 waits for spells). */
const TRADEOFF_WEIGHT = 15, STANDARD_WEIGHT = 65;

/** Rolls the run's next offer: the First Boon Choice first on the run's
 * first, then each slot a trade-off (15 in 80) or a standard boon, drawn
 * from those with copies left, not banned and not already offered; a kind
 * with none left gives way to the other. The draws come from the run's own
 * stream (`run.rolls` counts them), so undo and a replay offer the same. */
export function rollOffer(seed: number, run: ShrineRun, o: OfferOwner): BoonId[] {
  const n = copies(run.picked), banned = bans(o), offer: BoonId[] = [];
  const open = (id: BoonId) => (n[id] ?? 0) < boon(id).max && !banned.includes(id) && !offer.includes(id);
  const draw = () => drawAt((seed ^ SHRINE_SALT) >>> 0, run.rolls++);
  const first = run.picked.length === 0 ? firstChoice(o) : undefined;
  if (first && open(first)) offer.push(first);
  while (offer.length < offerSize(o)) {
    const standard = BOON_IDS.filter((id) => boon(id).kind === "standard" && open(id));
    const tradeoffs = BOON_IDS.filter((id) => boon(id).kind === "tradeoff" && open(id));
    if (!standard.length && !tradeoffs.length) break;
    const wantsTradeoff = draw() * (TRADEOFF_WEIGHT + STANDARD_WEIGHT) < TRADEOFF_WEIGHT;
    const pool = (wantsTradeoff && tradeoffs.length) || !standard.length ? tradeoffs : standard;
    offer.push(pool[Math.floor(draw() * pool.length)]!);
  }
  return offer;
}

/** The boon Auto Pick takes from `offer`: the best ranked in it, or else
 * its top one. */
export function autoChoice(offer: readonly BoonId[], o: OfferOwner) {
  return ranked(o).find((id) => offer.includes(id)) ?? offer[0];
}

// --- The hero ---

/** The stats a run's hero keeps that boons change. */
type HeroStats = { hp?: number; attack: number; maxHp: number; shroud?: number; regen?: number; lifesteal?: number; parry?: number };

/** What `effects` applies to the hero and the enemies, as `applied` keeps it. */
export const appliedOf = (e: BoonEffects): NonNullable<ShrineRun["applied"]> => ({
  attack: e.attack, maxHp: e.maxHp, shroud: e.shroud, regen: e.regen, lifesteal: e.lifesteal, parry: e.parry, parryBonus: e.parryBonus, foes: e.foes,
});
const NOTHING_APPLIED = appliedOf(boonEffects([], { archives: { slots: [], levels: {}, progress: {}, history: [] } }));
/** What a run's boons applied last: nothing before its first. */
export const appliedNow = (run: object) => shrineOf(run)?.applied ?? NOTHING_APPLIED;
/** A run's boons: a Tower run's, once it has any; never a Delve run's. */
const shrineOf = (run: object) => (run as { shrine?: ShrineRun }).shrine;

/** What a run's boons multiply `stat` by now: 1 for a stat they leave
 * alone. Whatever the hero gains or loses mid-run (training, a shard, a
 * siphon, gear) is multiplied by it, as the hero's stats already were. */
export const boonFactor = (run: object, stat: string) =>
  (HERO_FACTORS as readonly string[]).includes(stat) ? appliedNow(run)[stat as HeroFactor] : 1;

/** Moves `stats` from the boons `before` applied to those `after` does:
 * each multiplied stat by the ratio of its factors (HP with max HP, so its
 * share holds), Parry % its own share by its factor plus its bonus, up to
 * its cap. */
export function rescaleHero(stats: HeroStats, before: ShrineRun["applied"] & object, after: ShrineRun["applied"] & object) {
  for (const stat of HERO_FACTORS) {
    const from = before[stat], to = after[stat];
    if (stat === "parry" || from === to || stats[stat] === undefined) continue;
    const was = stats[stat]!;
    stats[stat] = snap((was * to) / from);
    // HP Overheal holds above max keeps its share too.
    if (stat === "maxHp" && stats.hp !== undefined && stats.hp > 0) {
      const hp = snap((stats.hp * to) / from);
      stats.hp = Math.max(1, stats.hp > was ? hp : Math.min(stats.maxHp, hp));
    }
  }
  if (after.parry !== before.parry || after.parryBonus !== before.parryBonus) {
    const own = Math.max(0, (stats.parry ?? 0) - before.parryBonus) / before.parry, parry = Math.min(PARRY_CAP, snap(own * after.parry + after.parryBonus));
    if (parry || stats.parry !== undefined) stats.parry = parry;
  }
}

// --- Saves ---

const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const validFoes = (f: any): f is FoeRule => isRecord(f) && [f.hp, f.attack, f.bossHp, f.fastAttack].every(positive)
  && typeof f.bossFirst === "boolean" && typeof f.fastSecond === "boolean";
const validApplied = (a: any) => isRecord(a) && HERO_FACTORS.every((k) => positive(a[k])) && Number.isFinite(a.parryBonus) && a.parryBonus >= 0 && validFoes(a.foes);
/** Boons that a run could have picked: known, none more often than it may be. */
const validPicks = (p: unknown): p is BoonId[] => Array.isArray(p) && p.every(isBoon) && Object.entries(copies(p)).every(([id, n]) => n! <= boon(id as BoonId).max);

/** A run's saved boons, whole or not at all: a part left out would leave
 * the hero's stats scaled by boons it no longer has. */
export function validShrineRun(r: any): r is ShrineRun {
  return isRecord(r) && validPicks(r.picked) && whole(r.rolls)
    && (r.offer === undefined || (Array.isArray(r.offer) && r.offer.every(isBoon)))
    && (r.applied === undefined || validApplied(r.applied));
}

/** The saved Shrine Boons page: known boons, each once; the First Boon
 * Choice a standard boon. */
export function decodeShrines(raw: any): ShrinesSave {
  const s = defaultShrines();
  if (!isRecord(raw)) return s;
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter(isBoon))] : []);
  s.autoPick = raw.autoPick === true;
  if (isBoon(raw.firstChoice) && boon(raw.firstChoice).kind === "standard") s.firstChoice = raw.firstChoice;
  s.banned = list(raw.banned);
  s.ranking = list(raw.ranking);
  return s;
}
