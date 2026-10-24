import type { Enemy, Player } from "../entities.ts";
import { snap } from "../exact.ts";

/** The enemy cards beyond ENEMY, each with the enemies it covers: the
 * ones it gives its bonus against while the run's hand holds it (cards/cards.ts
 * moves the hero toward the same strengths). */
export const FOE_CARDS = {
  weakEnemy: (e: Enemy) => e.strength === "weak",
  baseEnemy: (e: Enemy) => e.strength === "normal",
  strongEnemy: (e: Enemy) => e.strength === "strong",
  eliteEnemy: (e: Enemy) => e.strength === "elite",
  bossEnemy: (e: Enemy) => e.strength === "boss" || e.strength === "greaterBoss",
  nonBossEnemy: (e: Enemy) => e.strength !== "boss" && e.strength !== "greaterBoss",
  fastEnemy: (e: Enemy) => !!e.fast,
  flyingEnemy: (e: Enemy) => !!e.flying,
} as const satisfies Record<Exclude<FoeKey, TreeFoe>, (e: Enemy) => boolean>;
export type FoeCard = keyof typeof FOE_CARDS;
export const isFoeCard = (id: string): id is FoeCard => Object.hasOwn(FOE_CARDS, id);
/** The cards whose trees (cards/trees.ts) raise the hero against some
 * enemies, and the enemies each covers: ENEMY and ARCHER every one, TORCH
 * the Greater Boss. They give nothing of `FOE_CARDS`' own bonus. */
export const TREE_FOES = {
  monster: (_: Enemy) => true,
  torch: (e: Enemy) => e.strength === "greaterBoss",
  archer: (_: Enemy) => true,
} as const;
export type TreeFoe = keyof typeof TREE_FOES;
/** What the hero's per-enemy percents are keyed by (`Player.foeAttack`,
 * `foeDefense`, `foeShroud`): an enemy card, or a card tree covering enemies. */
export type FoeKey = NonNullable<keyof NonNullable<Player["foeAttack"]>>;
export const isFoeKey = (id: string): id is FoeKey => isFoeCard(id) || Object.hasOwn(TREE_FOES, id);
/** Whether enemy card or card tree `id` covers `enemy`. */
export const covers = (id: FoeKey, enemy: Enemy) => (isFoeCard(id) ? FOE_CARDS[id](enemy) : TREE_FOES[id as TreeFoe]?.(enemy) ?? false);

/** The percent more ATK an enemy card gives against the enemies it covers. */
export const FOE_ATTACK = 5;
/** The percent more Gold an enemy card makes each enemy it covers drop,
 * multiplying every other Gold bonus; the cards covering one enemy add
 * their percents into one factor. */
export const FOE_GOLD = 5;

/** The enemy cards of `hand` that cover `enemy`. */
export const foeCardsFor = (hand: Iterable<string>, enemy: Enemy) => [...new Set(hand)].filter((id) => isFoeCard(id) && FOE_CARDS[id](enemy)) as FoeCard[];

/** The percent more the hero has against `enemy` from `foes`, percents
 * the hero carries by card (`Player.foeAttack`, `foeDefense`, `foeShroud`):
 * those of the cards covering it, added up. */
export function foeAttack(foes: Partial<Record<FoeKey, number>> | undefined, enemy: Enemy) {
  let percent = 0;
  if (foes) for (const id of Object.keys(foes) as FoeKey[]) if (covers(id, enemy)) percent += foes[id]!;
  return percent;
}

/** What `enemy`'s kill Gold is multiplied by for the enemy cards of `hand`
 * covering it: their percents added, 5% each, with `more` percent (the card
 * trees') as one factor (×1.1 for two). */
export const foeGold = (hand: Iterable<string>, enemy: Enemy, more = 0) =>
  snap((100 + FOE_GOLD * foeCardsFor(hand, enemy).length + more) / 100);
