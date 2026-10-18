import type { Enemy, Player } from "./entities.ts";
import { snap } from "./exact.ts";

/** The enemy cards beyond ENEMY, each with the enemies it covers: the
 * ones it gives its bonus against while the run's hand holds it (cards.ts
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
} as const satisfies Record<keyof NonNullable<Player["foeAttack"]>, (e: Enemy) => boolean>;
export type FoeCard = keyof typeof FOE_CARDS;
export const isFoeCard = (id: string): id is FoeCard => Object.hasOwn(FOE_CARDS, id);

/** The percent more ATK an enemy card gives against the enemies it covers. */
export const FOE_ATTACK = 5;
/** The percent more Gold an enemy card makes each enemy it covers drop,
 * multiplying every other Gold bonus; the cards covering one enemy add
 * their percents into one factor. */
export const FOE_GOLD = 5;

/** The enemy cards of `hand` that cover `enemy`. */
export const foeCardsFor = (hand: Iterable<string>, enemy: Enemy) => [...new Set(hand)].filter((id) => isFoeCard(id) && FOE_CARDS[id](enemy)) as FoeCard[];

/** The percent more ATK the hero strikes `enemy` with from `foes`, the
 * enemy cards' ATK percents the hero carries (`Player.foeAttack`), added up. */
export function foeAttack(foes: Partial<Record<FoeCard, number>> | undefined, enemy: Enemy) {
  let percent = 0;
  if (foes) for (const id of Object.keys(foes) as FoeCard[]) if (FOE_CARDS[id]?.(enemy)) percent += foes[id]!;
  return percent;
}

/** What `enemy`'s kill Gold is multiplied by for the enemy cards of `hand`
 * covering it: their percents added, 5% each, as one factor (×1.1 for two). */
export const foeGold = (hand: Iterable<string>, enemy: Enemy) =>
  snap((100 + FOE_GOLD * foeCardsFor(hand, enemy).length) / 100);
