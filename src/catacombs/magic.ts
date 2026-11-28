// The Magician's levels, Magic skills and stats (docs/CATACOMBS.md).
// Levels decide play and are saved, so the curve multiplies out in order
// (no Math.pow): the same bits in every engine.
import { snap } from "../exact.ts";
import { DROP_IDS, type DropId } from "./catalog.ts";
import { SPIRIT_PER, type SpiritUpgradeId } from "./spirit-upgrades.ts";

/** 1.2^(level − 1), by level from 1, multiplied out in order. */
const powers: number[] = [1];
/** MXP from level `level` to the next: 240 × 1.2^(level − 1), rounded. */
export function mxpToNext(level: number) {
  if (level < 1) return 0;
  while (powers.length < level) powers.push(powers[powers.length - 1]! * 1.2);
  return Math.round(240 * powers[level - 1]!);
}

/** Total MXP that reaches level `level` (0 for level 1). */
const totals: number[] = [0, 0];
export function mxpForLevel(level: number) {
  if (level <= 1) return 0;
  while (totals.length <= level) totals.push(totals[totals.length - 1]! + mxpToNext(totals.length - 1));
  return totals[level]!;
}

/** The Magic level `mxp` reaches. */
export function magicLevel(mxp: number) {
  let level = 1;
  while (mxp >= mxpForLevel(level + 1)) level++;
  return level;
}

/** The magic skill points `mxp` has earned: one a level past the first. */
export const pointsEarned = (mxp: number) => magicLevel(mxp) - 1;

/** What a Magic skill's point can raise. Flat effects add their amount; the
 * rest are percent, and a chance adds percentage points. */
export type MagicEffect =
  | "matk" | "matkPercent" | "critFactor" | "mhp" | "critChance" | "speedDrop" | "spiritGain" | "lootDrop"
  | "armorPen" | "mxpGain" | "mxpDrop" | "armorPenPercent" | "allDrops" | "goldCrosshair";
/** Each effect's name, and whether its amount is a percent. */
export const EFFECT_NAMES: Record<MagicEffect, { name: string; percent: boolean }> = {
  matk: { name: "MAtk", percent: false },
  matkPercent: { name: "MAtk", percent: true },
  critFactor: { name: "MCrit factor", percent: true },
  mhp: { name: "Max MHP", percent: false },
  critChance: { name: "MCrit chance", percent: true },
  speedDrop: { name: "Speed Drop chance", percent: true },
  spiritGain: { name: "Spirit gain", percent: true },
  lootDrop: { name: "Loot Drop chance", percent: true },
  armorPen: { name: "Armor Penetration", percent: false },
  mxpGain: { name: "MXP gain", percent: true },
  mxpDrop: { name: "MXP Drop chance", percent: true },
  armorPenPercent: { name: "Armor Penetration", percent: true },
  allDrops: { name: "All Drop chances", percent: true },
  goldCrosshair: { name: "Gold Crosshair chance", percent: true },
};

/** The Magic skills (Skills, in the Catacombs), the order the Skills menu
 * shows them. Divination and Corruption come with Ascension (Later). */
export type MagicSkillId = "might" | "weaving" | "resonance" | "focus" | "fortune";
export const MAGIC_SKILL_IDS: readonly MagicSkillId[] = ["might", "weaving", "resonance", "focus", "fortune"];
/** Each skill: its name, the most points it takes, and what each point raises. */
export const MAGIC_SKILLS: Record<MagicSkillId, { name: string; cap: number; effects: readonly { effect: MagicEffect; per: number }[] }> = {
  might: { name: "Might", cap: 50, effects: [{ effect: "matk", per: 1 }, { effect: "matkPercent", per: 1 }, { effect: "critFactor", per: 3 }] },
  weaving: { name: "Weaving", cap: 50, effects: [{ effect: "mhp", per: 50 }, { effect: "critChance", per: 1 }, { effect: "speedDrop", per: 0.2 }] },
  resonance: { name: "Resonance", cap: 25, effects: [{ effect: "spiritGain", per: 4 }, { effect: "lootDrop", per: 0.3 }, { effect: "armorPen", per: 2 }] },
  focus: { name: "Focus", cap: 25, effects: [{ effect: "mxpGain", per: 5 }, { effect: "mxpDrop", per: 0.3 }, { effect: "armorPenPercent", per: 3 }] },
  fortune: { name: "Fortune", cap: 25, effects: [{ effect: "critChance", per: 2 }, { effect: "allDrops", per: 0.2 }, { effect: "goldCrosshair", per: 0.5 }] },
};

export type MagicPoints = Record<MagicSkillId, number>;
export const noPoints = (): MagicPoints => ({ might: 0, weaving: 0, resonance: 0, focus: 0, fortune: 0 });
/** The points spent across every skill. */
export const pointsSpent = (points: MagicPoints) => MAGIC_SKILL_IDS.reduce((s, id) => s + points[id], 0);

/** What every point spent adds to effect `effect`. */
export function effectTotal(points: MagicPoints, effect: MagicEffect) {
  let total = 0;
  for (const id of MAGIC_SKILL_IDS) for (const e of MAGIC_SKILLS[id].effects) if (e.effect === effect) total += e.per * points[id];
  return snap(total);
}

export type HeroStat = "mhp" | "matk" | "mdef";
/** The Magician with no points spent: MCrit factor ×1.5, no MCrit chance. */
export const HERO_BASE = { mhp: 1000, matk: 10, mdef: 0, critFactor: 1.5 } as const;

/** Everything the Magician fights with: MHP, MAtk and MDef; MCrit chance
 * (percent) and factor; Armor Penetration, flat and percent of the undead's
 * MDef; the Spirit and MXP factors; each drop's chance (percent); what Loot
 * Drop Gain adds to a Loot Drop's factor; and the chance a crosshair is
 * gold (percent). */
export type Magician = Record<HeroStat, number> & {
  critChance: number; critFactor: number; armorPen: number; armorPenPercent: number;
  spiritGain: number; mxpGain: number; drops: Record<DropId, number>; lootGain: number; goldCrosshair: number;
};
/** What raises the Magician besides points: the Spirit upgrades bought. */
export type MagicSource = { points: MagicPoints; upgrades: Record<SpiritUpgradeId, number> };

/** The Magician with `c`'s points and Spirit upgrades. MAtk is the base,
 * the flat points and Magic ATK +1 and +2, times Might's percent. Chances,
 * flat amounts and the MCrit factor add the upgrades to the points; MXP
 * Gain is its own kind of bonus, so it multiplies Focus's. */
export function magician(c: MagicSource): Magician {
  const t = (e: MagicEffect) => effectTotal(c.points, e), all = t("allDrops"), u = c.upgrades, per = SPIRIT_PER;
  const flat = { mxp: t("mxpDrop"), loot: t("lootDrop"), speed: t("speedDrop"), mhp: snap(per.mhpDrop * u.vitality) };
  return {
    mhp: HERO_BASE.mhp + t("mhp") + per.mhp * u.mhp + per.vitalityMhp * u.vitality,
    matk: snap(((HERO_BASE.matk + t("matk") + per.matk * u.matk + per.matk2 * u.matk2) * (100 + t("matkPercent"))) / 100),
    mdef: HERO_BASE.mdef,
    critChance: Math.min(100, snap(t("critChance") + per.critChance * u.crit)),
    critFactor: snap(HERO_BASE.critFactor + (t("critFactor") + per.critDamage * u.crit) / 100),
    armorPen: t("armorPen") + per.pierce * u.pierce,
    armorPenPercent: Math.min(100, t("armorPenPercent")),
    spiritGain: snap((100 + t("spiritGain")) / 100),
    mxpGain: snap((((100 + t("mxpGain")) / 100) * (100 + per.mxp * u.mxp)) / 100),
    drops: Object.fromEntries(DROP_IDS.map((d) => [d, snap(flat[d] + all)])) as Record<DropId, number>,
    lootGain: snap(per.loot * u.loot),
    goldCrosshair: Math.min(100, t("goldCrosshair")),
  };
}

/** Moves one point into (`delta` 1) or out of (−1) skill `id`: never below
 * 0 or past its cap, never past the points earned. Whether it moved. */
export function movePoint(state: { mxp: number; points: MagicPoints }, id: MagicSkillId, delta: 1 | -1) {
  if (delta < 0 ? state.points[id] < 1 : state.points[id] >= MAGIC_SKILLS[id].cap || pointsSpent(state.points) >= pointsEarned(state.mxp)) return false;
  state.points[id] += delta;
  return true;
}

/** Each Magician stat's short name, as the HUD writes it. */
export const HERO_STAT_NAMES: Record<HeroStat, string> = { mhp: "MHP", matk: "MAtk", mdef: "MDef" };

/** What skill `id` raises with `points` in it: each effect, a point's worth and the total. */
export const skillLines = (id: MagicSkillId, points: number) =>
  MAGIC_SKILLS[id].effects.map((e) => ({ effect: e.effect, ...EFFECT_NAMES[e.effect], per: e.per, total: snap(e.per * points) }));
