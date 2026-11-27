// The Magician's levels, magic skill points and stats (docs/CATACOMBS.md).
// Levels decide play and are saved, so the curve multiplies out in order
// (no Math.pow): the same bits in every engine.

/** 1.2^(level − 1), by level from 1, multiplied out in order. */
const powers: number[] = [1];
/** MXP from level `level` to the next: 200 × 1.2^(level − 1), rounded. */
export function mxpToNext(level: number) {
  if (level < 1) return 0;
  while (powers.length < level) powers.push(powers[powers.length - 1]! * 1.2);
  return Math.round(200 * powers[level - 1]!);
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

export type MagicStatId = "force" | "ward" | "vitality";
export const MAGIC_STAT_IDS: readonly MagicStatId[] = ["force", "ward", "vitality"];
export type HeroStat = "mhp" | "matk" | "mdef";
/** Each stat box: its name and what each point in it raises. */
export const MAGIC_STATS: Record<MagicStatId, { name: string; raises: readonly { stat: HeroStat; per: number }[] }> = {
  force: { name: "Force", raises: [{ stat: "matk", per: 2 }] },
  ward: { name: "Ward", raises: [{ stat: "mdef", per: 1 }] },
  vitality: { name: "Vitality", raises: [{ stat: "mhp", per: 100 }] },
};
/** The Magician's stats with no points spent. */
export const HERO_BASE: Readonly<Record<HeroStat, number>> = { mhp: 1000, matk: 10, mdef: 0 };

export type MagicPoints = Record<MagicStatId, number>;
export const noPoints = (): MagicPoints => ({ force: 0, ward: 0, vitality: 0 });
/** The points spent across every box. */
export const pointsSpent = (points: MagicPoints) => MAGIC_STAT_IDS.reduce((s, id) => s + points[id], 0);

/** The Magician's MHP, MAtk and MDef with `points` spent. */
export function heroStats(points: MagicPoints): Record<HeroStat, number> {
  const stats = { ...HERO_BASE };
  for (const id of MAGIC_STAT_IDS) for (const r of MAGIC_STATS[id].raises) stats[r.stat] += r.per * points[id];
  return stats;
}

/** Moves one point into (`delta` 1) or out of (−1) box `id`: never below 0
 * in a box, never past the points earned. Whether it moved. */
export function movePoint(state: { mxp: number; points: MagicPoints }, id: MagicStatId, delta: 1 | -1) {
  if (delta < 0 ? state.points[id] < 1 : pointsSpent(state.points) >= pointsEarned(state.mxp)) return false;
  state.points[id] += delta;
  return true;
}

/** Each Magician stat's short name, as the HUD and the Stats boxes write it. */
export const HERO_STAT_NAMES: Record<HeroStat, string> = { mhp: "MHP", matk: "MAtk", mdef: "MDef" };

/** What box `id` raises with `points` in it: each stat, a point's worth and the total. */
export const statLines = (id: MagicStatId, points: number) =>
  MAGIC_STATS[id].raises.map((r) => ({ stat: r.stat, name: HERO_STAT_NAMES[r.stat], per: r.per, total: r.per * points }));
