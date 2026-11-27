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
/** An undead's base stats and rewards, and the first hall the spawn table
 * gives it odds on (null: none yet). */
export type Undead = { name: string; rarity: SpiritRarity; mhp: number; matk: number; mdef: number; mxp: number; from: number | null };
export const UNDEAD: Record<UndeadId, Undead> = {
  wisp: { name: "Wisp", rarity: "common", mhp: 100, matk: 10, mdef: 0, mxp: 1, from: 1 },
  ghost: { name: "Ghost", rarity: "uncommon", mhp: 250, matk: 10, mdef: 5, mxp: 3, from: 1 },
  skeleton: { name: "Skeleton", rarity: "rare", mhp: 550, matk: 10, mdef: 12, mxp: 7, from: 11 },
  ghoul: { name: "Ghoul", rarity: "epic", mhp: 1150, matk: 10, mdef: 25, mxp: 20, from: 25 },
  vampire: { name: "Vampire", rarity: "legendary", mhp: 1950, matk: 10, mdef: 50, mxp: 70, from: 49 },
  lich: { name: "Lich", rarity: "mythic", mhp: 3500, matk: 10, mdef: 150, mxp: 150, from: 80 },
  demon: { name: "Demon", rarity: "ancestral", mhp: 25000, matk: 10, mdef: 300, mxp: 400, from: 200 },
};
/** The undead of each rarity: one each. */
export const UNDEAD_OF: Record<SpiritRarity, UndeadId> = {
  common: "wisp", uncommon: "ghost", rare: "skeleton", epic: "ghoul", legendary: "vampire", mythic: "lich", ancestral: "demon",
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
/** The designer's spawn table: from each row's hall to the next row's, each
 * rarity's chance a slot, in percent; the rest of the hundred leaves the
 * slot empty. A type never stands before its `from` hall. */
export const SPAWN_TABLE: readonly { from: number; odds: Partial<Record<SpiritRarity, number>> }[] = [
  { from: 1, odds: { common: 28.57, uncommon: 14.29 } },
  { from: 11, odds: { common: 25.4, uncommon: 12.7, rare: 11.11 } },
  { from: 21, odds: { common: 25.52, uncommon: 10.94, rare: 12.5 } },
  { from: 25, odds: { common: 22.97, uncommon: 9.84, rare: 11.25, epic: 10 } },
  { from: 40, odds: { common: 23.41, uncommon: 8.78, rare: 9.88, epic: 11.11 } },
  { from: 49, odds: { common: 21.74, uncommon: 8.15, rare: 9.17, epic: 10.32, legendary: 7.14 } },
  { from: 60, odds: { common: 21.27, uncommon: 7.98, rare: 8.97, epic: 11.54, legendary: 7.69 } },
  { from: 80, odds: { common: 19.5, uncommon: 7.31, rare: 8.23, epic: 12.34, legendary: 8.64, mythic: 5 } },
  { from: 100, odds: { common: 18.47, uncommon: 7.92, rare: 9.05, epic: 12.06, legendary: 10.56, mythic: 5 } },
  { from: 120, odds: { common: 18.1, uncommon: 9.05, rare: 7.92, epic: 11.88, legendary: 11.88, mythic: 5 } },
  { from: 200, odds: { common: 16.53, uncommon: 8.26, rare: 9.64, epic: 13.5, legendary: 11.57, mythic: 5.44, ancestral: 2 } },
  { from: 240, odds: { common: 16.49, uncommon: 8.25, rare: 9.62, epic: 13.47, legendary: 11.54, mythic: 5.43, ancestral: 2.22 } },
  { from: 280, odds: { common: 16.39, uncommon: 9.83, rare: 9.83, epic: 11.47, legendary: 11.47, mythic: 5.74, ancestral: 2.5 } },
  { from: 400, odds: { common: 15.7, uncommon: 9.42, rare: 9.42, epic: 10.99, legendary: 12.82, mythic: 6.9, ancestral: 3.33 } },
  { from: 600, odds: { common: 13.5, uncommon: 8.1, rare: 9.72, epic: 11.67, legendary: 14, mythic: 9.33, ancestral: 6.67 } },
];
/** Hall `hall`'s odds a slot, lowest rarity first. */
export function spawnOdds(hall: number): SpawnOdds[] {
  let row = SPAWN_TABLE[0]!;
  for (const r of SPAWN_TABLE) if (hall >= r.from) row = r;
  return SPIRIT_RARITIES.flatMap((rarity): SpawnOdds[] => {
    const percent = row.odds[rarity], id = UNDEAD_OF[rarity], from = UNDEAD[id].from;
    return percent && from !== null && hall >= from ? [{ id, percent }] : [];
  });
}

/** Halls whose six undead are set, not rolled: how many of each rarity. */
export const FIXED_HALLS: Readonly<Record<number, Partial<Record<SpiritRarity, number>>>> = {
  45: { common: 6 }, 70: { uncommon: 6 }, 95: { common: 6 }, 100: { rare: 6 }, 115: { epic: 6 }, 125: { legendary: 6 },
  140: { uncommon: 5, legendary: 1 }, 145: { rare: 6 }, 165: { epic: 6 }, 180: { legendary: 6 },
  195: { common: 1, uncommon: 2, rare: 2, mythic: 1 }, 295: { uncommon: 5, ancestral: 1 }, 380: { uncommon: 6 },
  390: { mythic: 6 }, 395: { uncommon: 1, rare: 1, epic: 1, legendary: 1, mythic: 1, ancestral: 1 },
  440: { rare: 6 }, 500: { epic: 6 }, 540: { legendary: 6 }, 560: { mythic: 6 }, 595: { ancestral: 6 },
};
/** A fixed hall's six undead, E1 to E6, lowest rarity first (so the
 * strongest stands last); null for a hall that rolls its own. */
export function fixedHall(hall: number): UndeadId[] | null {
  const counts = FIXED_HALLS[hall];
  return counts ? SPIRIT_RARITIES.flatMap((r) => Array.from({ length: counts[r] ?? 0 }, () => UNDEAD_OF[r])) : null;
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

/** The drops an undead can roll as its hall is made, each shown as an icon
 * on it and paid as it is beaten: MXP ×3 to ×5, Spirit ×2 to ×5, 10 to 110
 * attacks at double speed, 15 to 50 MHP back (never past the maximum). Each
 * amount is a whole number, every one in its range as likely. */
export const DROP_IDS = ["mxp", "loot", "speed", "mhp"] as const;
export type DropId = (typeof DROP_IDS)[number];
export const DROPS: Record<DropId, { name: string; lo: number; hi: number; effect: string }> = {
  mxp: { name: "MXP Drop", lo: 3, hi: 5, effect: "×3 to ×5 MXP from this undead" },
  loot: { name: "Loot Drop", lo: 2, hi: 5, effect: "×2 to ×5 Spirit from this undead" },
  speed: { name: "Speed Drop", lo: 10, hi: 110, effect: "+10 to +110 attacks at ×2 attack speed" },
  mhp: { name: "MHP Drop", lo: 15, hi: 50, effect: "+15 to +50 MHP, never past the maximum" },
};
