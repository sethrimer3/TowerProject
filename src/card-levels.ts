import { CARD_IDS, type CardId } from "./cards.ts";
import { count, isRecord } from "./decode.ts";

/** The XP each card level costs, from level 1 to the cap: five levels at
 * each step of the schedule. */
export const CARD_LEVEL_XP: readonly number[] = [
  200, 400, 600, 800, 1000,
  1400, 1800, 2200, 2600, 3000,
  3600, 4200, 4800, 5400, 6000,
  7000, 8000, 9000, 10000, 11000,
  12500, 14500, 17000, 20000, 23500,
];
/** The highest level a card reaches by default. */
export const MAX_CARD_LEVEL = CARD_LEVEL_XP.length;
/** The XP that reaches the cap: a card gains no more past it. */
export const MAX_CARD_XP = CARD_LEVEL_XP.reduce((a, b) => a + b, 0);
/** The level a card shines silver from, and gold at the cap. */
export const SILVER_CARD_LEVEL = 15;
/** Card points each level gives. */
export const POINTS_PER_CARD_LEVEL = 1;

/** The cards that never activate: each gains its XP from the floors
 * completed while the run's hand holds it, one a floor (a floor Skip climbs
 * past too). */
export const PASSIVE_CARDS: ReadonlySet<CardId> = new Set<CardId>(["archer"]);

/** Where a card with `xp` stands: its level, the XP gathered toward the
 * next (`into`) and what that level costs (`needed`, 0 at the cap). */
export function cardLevel(xp: number) {
  let level = 0, left = Math.min(Math.max(0, xp), MAX_CARD_XP);
  while (level < MAX_CARD_LEVEL && left >= CARD_LEVEL_XP[level]) left -= CARD_LEVEL_XP[level++];
  return { level, into: level < MAX_CARD_LEVEL ? left : 0, needed: CARD_LEVEL_XP[level] ?? 0 };
}
export type CardLevel = ReturnType<typeof cardLevel>;
/** Card `id`'s level and progress in the save. */
export const levelOf = (save: { cardXp: Partial<Record<CardId, number>> }, id: CardId) => cardLevel(save.cardXp[id] ?? 0);

/** A card's points: one a level, less those spent on its tree. Nothing
 * can spend them yet (`CARD_TREES`), so they are only shown. */
export const cardPoints = (xp: number) => cardLevel(xp).level * POINTS_PER_CARD_LEVEL;

/** The sheen a card's background wears for its level: silver from
 * `SILVER_CARD_LEVEL`, gold at the cap. */
export function cardSheen(level: number): "" | "silver" | "gold" {
  return level >= MAX_CARD_LEVEL ? "gold" : level >= SILVER_CARD_LEVEL ? "silver" : "";
}

/** One node of a card's upgrade tree: what a card point buys for it. */
export type CardTreeNode = {
  id: string;
  name: string;
  text: string;
  /** Card points it costs. */
  points: number;
  /** The nodes that must be bought first. */
  needs?: readonly string[];
};
/** Each card's upgrade tree, which its card points are spent on.
 * TODO: define each card's tree: nodes that strengthen its special effect
 * (a card bonus, an in-place card's trade) or add new ones, and for a card
 * with no special effect a node giving it its first. Until then no card
 * has nodes and its points can only be shown. */
export const CARD_TREES: Partial<Record<CardId, readonly CardTreeNode[]>> = {};

/** A saved `cardXp`: known cards only, each a whole XP (more
 * than the cap comes down to it), and none left out. */
export function decodeCardXp(raw: unknown): Partial<Record<CardId, number>> {
  const xp: Partial<Record<CardId, number>> = {};
  if (!isRecord(raw)) return xp;
  for (const id of CARD_IDS) {
    const n = Math.min(MAX_CARD_XP, count(raw[id], 0, Number.MAX_SAFE_INTEGER));
    if (n > 0) xp[id] = n;
  }
  return xp;
}

/** `xp` more for card `id` in `cardXp`, up to the cap: the levels it
 * crossed, lowest first (none at the cap). */
export function addCardXp(cardXp: Partial<Record<CardId, number>>, id: CardId, xp: number): number[] {
  const before = cardXp[id] ?? 0, after = Math.min(MAX_CARD_XP, before + xp);
  if (after === before) return [];
  cardXp[id] = after;
  const from = cardLevel(before).level, to = cardLevel(after).level, levels: number[] = [];
  for (let l = from + 1; l <= to; l++) levels.push(l);
  return levels;
}
