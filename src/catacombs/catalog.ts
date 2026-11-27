// The Catacombs' data (docs/CATACOMBS.md): the undead, their strengths, the
// deep halls' factors, the spawn odds, Spirit's rarities and the Ingots.
// Everything here decides play and is saved, so it uses only + - * / (no
// Math.pow, no **): the same bits in every engine.
import { snap } from "../exact.ts";
import { TIER_BONUS_TENTHS, tierGold, tierStats } from "../tiers.ts";

/** Spirit's seven rarities, lowest first: each undead drops its own. */
export const SPIRIT_RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "ancestral"] as const;
export type SpiritRarity = (typeof SPIRIT_RARITIES)[number];

/** The four Ingots, in the order their treasure rooms first appear. */
export const INGOTS = ["brass", "iron", "steel", "nickel"] as const;
export type IngotId = (typeof INGOTS)[number];
/** Every how many halls each Ingot's treasure room is built. */
export const INGOT_EVERY: Record<IngotId, number> = { brass: 5, iron: 10, steel: 15, nickel: 20 };

export const UNDEAD_IDS = ["wisp", "ghost", "skeleton", "ghoul", "vampire", "lich", "demon"] as const;
export type UndeadId = (typeof UNDEAD_IDS)[number];
/** An undead's base stats and rewards, and the first hall it can appear on
 * (null: not yet, future content). */
export type Undead = { name: string; rarity: SpiritRarity; mhp: number; matk: number; mdef: number; mxp: number; from: number | null };
export const UNDEAD: Record<UndeadId, Undead> = {
  wisp: { name: "Wisp", rarity: "common", mhp: 100, matk: 10, mdef: 0, mxp: 1, from: 1 },
  ghost: { name: "Ghost", rarity: "uncommon", mhp: 250, matk: 10, mdef: 5, mxp: 3, from: 1 },
  skeleton: { name: "Skeleton", rarity: "rare", mhp: 550, matk: 10, mdef: 12, mxp: 7, from: 11 },
  ghoul: { name: "Ghoul", rarity: "epic", mhp: 1150, matk: 10, mdef: 25, mxp: 20, from: 26 },
  vampire: { name: "Vampire", rarity: "legendary", mhp: 1950, matk: 10, mdef: 50, mxp: 70, from: 51 },
  lich: { name: "Lich", rarity: "mythic", mhp: 3500, matk: 10, mdef: 150, mxp: 150, from: 81 },
  demon: { name: "Demon", rarity: "ancestral", mhp: 25000, matk: 10, mdef: 300, mxp: 400, from: null },
};

/** How strong a hall's enemy stands: a hall's final enemy every 5th hall is
 * Strong, every 10th Elite, every 25th a Boss; every other enemy normal. */
export type CatacombStrength = "normal" | "strong" | "elite" | "boss";
/** Each strength's stat factors, and what it multiplies the MXP and Spirit
 * it drops by. A Boss has the Tower's boss shape: it outlasts rather than
 * outhits. */
export const STRENGTHS: Record<CatacombStrength, { mhp: number; matk: number; mdef: number; rewards: number }> = {
  normal: { mhp: 1, matk: 1, mdef: 1, rewards: 1 },
  strong: { mhp: 1.25, matk: 1.25, mdef: 1.25, rewards: 2 },
  elite: { mhp: 1.5, matk: 1.5, mdef: 1.5, rewards: 4 },
  boss: { mhp: 3.5, matk: 1.3, mdef: 1, rewards: 10 },
};
/** The strength of hall `hall`'s final enemy, which is always there, or
 * null for a hall with none: the Boss wins over Elite, Elite over Strong. */
export function hallStrength(hall: number): Exclude<CatacombStrength, "normal"> | null {
  return hall % 25 === 0 ? "boss" : hall % 10 === 0 ? "elite" : hall % 5 === 0 ? "strong" : null;
}

/** From the hall after each `after`, every enemy's MHP and MDef multiply
 * again by these, compounding. MXP and drops stay the same. */
export const DEEP_HALLS: readonly { after: number; mhp: number; mdef: number }[] = [
  { after: 400, mhp: 2, mdef: 1.5 },
  { after: 600, mhp: 2, mdef: 1 },
  { after: 800, mhp: 2, mdef: 1.5 },
  { after: 1000, mhp: 2, mdef: 1.5 },
  { after: 1200, mhp: 4, mdef: 2.25 },
  { after: 1400, mhp: 2, mdef: 1.5 },
  { after: 1600, mhp: 2, mdef: 1.5 },
  { after: 1800, mhp: 2, mdef: 1.5 },
  { after: 2000, mhp: 2, mdef: 1.5 },
];
/** The product of the deep halls' factors reached by hall `hall`. */
export function deepFactors(hall: number) {
  let mhp = 1, mdef = 1;
  for (const d of DEEP_HALLS) if (hall > d.after) { mhp *= d.mhp; mdef *= d.mdef; }
  return { mhp, mdef };
}

/** One type's chance, in percent, of standing on an enemy slot. */
export type SpawnOdds = { id: UndeadId; percent: number };
/** The odds of each type on each of a hall's enemy slots; the rest of the
 * hundred leaves the slot empty. A stand-in until the designer's table:
 * Wisp 30% and Ghost 15% on every hall. A type never stands before its
 * `from` hall, whatever the table gives it. */
const PLACEHOLDER_ODDS: readonly SpawnOdds[] = [{ id: "wisp", percent: 30 }, { id: "ghost", percent: 15 }];
export function spawnOdds(hall: number): SpawnOdds[] {
  return PLACEHOLDER_ODDS.filter(({ id }) => { const from = UNDEAD[id].from; return from !== null && hall >= from; });
}

/** An enemy's stats on hall `hall` of Catacomb `number`: its base, times the
 * number's stat factor (as the Tower's tiers), its strength and the deep
 * halls'. */
export function undeadStats(id: UndeadId, strength: CatacombStrength, hall: number, number: number) {
  const u = UNDEAD[id], s = STRENGTHS[strength], deep = deepFactors(hall), tier = tierStats(number);
  return { mhp: snap(u.mhp * tier * s.mhp * deep.mhp), matk: snap(u.matk * tier * s.matk), mdef: snap(u.mdef * tier * s.mdef * deep.mdef) };
}
/** What beating it pays: MXP and one Spirit of its rarity, each times its strength's factor. */
export function undeadRewards(id: UndeadId, strength: CatacombStrength) {
  const u = UNDEAD[id], n = STRENGTHS[strength].rewards;
  return { mxp: u.mxp * n, rarity: u.rarity, spirit: n };
}

/** Lore on a hall's Lore tile before the Lore bonus. */
export const LORE_PER_TILE = 1;
/** The Lore bonus: the number's Gold bonus (×1, ×2, ×3.1 …). */
export const loreBonus = (number: number) => TIER_BONUS_TENTHS[number - 1]! / 10;
/** The Lore a Lore tile holds in Catacomb `number`. */
export const loreOnTile = (number: number) => tierGold(number, LORE_PER_TILE);
