import { CARD_IDS, type CardId } from "./cards.ts";
import { count, isRecord } from "../save/decode.ts";

/** The XP each card level costs, from level 1 to 60: five levels at each
 * step of the schedule to level 20, then each level's step 250 XP more
 * than the one before. */
export const CARD_LEVEL_XP: readonly number[] = (() => {
  const xp = [
    100, 200, 300, 400, 500,
    700, 900, 1100, 1300, 1500,
    1800, 2100, 2400, 2700, 3000,
    3500, 4000, 4500, 5000, 5500,
    6250, 7250, 8500, 10000, 11750,
  ];
  for (let step = xp[24] - xp[23]; xp.length < 60;) xp.push(xp[xp.length - 1] + (step += 250));
  return xp;
})();
/** The highest level any card can reach: a legendary card's whole tree
 * opened by card buys. */
export const MAX_CARD_LEVEL = CARD_LEVEL_XP.length;
/** The level a card can reach before any card buy raises it. */
export const BASE_MAX_LEVEL = 10;
/** The XP that reaches level 60: a card gains no more past it. */
export const MAX_CARD_XP = CARD_LEVEL_XP.reduce((a, b) => a + b, 0);
/** Card points each level gives. */
export const POINTS_PER_CARD_LEVEL = 1;

/** The cards that never activate: each gains its XP from the floors
 * completed while the run's hand holds it, one a floor (a floor Skip climbs
 * past too). */
export const PASSIVE_CARDS: ReadonlySet<CardId> = new Set<CardId>(["archer"]);

/** Where a card with `xp` stands under its max level `cap` (cards/trees.ts'
 * `cardMaxLevel`): its level, no higher than the cap; the XP gathered
 * toward the next (`into`, which past the cap keeps gathering, so a cap
 * raised later turns it into levels at once) and what that level costs
 * (`needed`, 0 at level 60); and whether the cap holds it back (`capped`). */
export function cardLevel(xp: number, cap = MAX_CARD_LEVEL) {
  const top = Math.min(cap, MAX_CARD_LEVEL);
  let level = 0, left = Math.min(Math.max(0, xp), MAX_CARD_XP);
  while (level < top && left >= CARD_LEVEL_XP[level]) left -= CARD_LEVEL_XP[level++];
  return { level, into: level < MAX_CARD_LEVEL ? left : 0, needed: CARD_LEVEL_XP[level] ?? 0, capped: level === top };
}
export type CardLevel = ReturnType<typeof cardLevel>;
/** Every card's level summed, each under its cap (`capOf`): it rises with
 * each level-up. */
export const cardLevelTotal = (cardXp: Partial<Record<CardId, number>>, capOf: (id: CardId) => number) =>
  CARD_IDS.reduce((sum, id) => sum + cardLevel(cardXp[id] ?? 0, capOf(id)).level, 0);

/** A card's points under its max level `cap`: one a level, spent on its
 * tree (cards/trees.ts, `pointsLeft` counting those not yet spent). */
export const cardPoints = (xp: number, cap = MAX_CARD_LEVEL) => cardLevel(xp, cap).level * POINTS_PER_CARD_LEVEL;

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

/** `xp` more for card `id` in `cardXp`, up to level 60's: the levels it
 * crossed under its max level `cap`, lowest first (none at the cap, though
 * the XP still counts toward the levels a raised cap opens). */
export function addCardXp(cardXp: Partial<Record<CardId, number>>, id: CardId, xp: number, cap = MAX_CARD_LEVEL): number[] {
  const before = cardXp[id] ?? 0, after = Math.min(MAX_CARD_XP, before + xp);
  if (after === before) return [];
  cardXp[id] = after;
  const from = cardLevel(before, cap).level, to = cardLevel(after, cap).level, levels: number[] = [];
  for (let l = from + 1; l <= to; l++) levels.push(l);
  return levels;
}
