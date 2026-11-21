/** Card powers as a test wants them: each card given raises exactly the
 * stat amounts asked for, so a test can check what a stat does whichever
 * card's power gives it now (or whether any does). Each call stands in a
 * card of its own (a key no real card has) holding one base power at
 * level 1, so the real cards' powers are never touched and one test's
 * powers never reach another's. */
import { CARD_POWERS, type CardLevels, type CardPower, type PowerStat } from "../src/cards/powers.ts";
import type { CardId } from "../src/cards/cards.ts";
import { CARD_LEVEL_XP } from "../src/cards/levels.ts";

/** Stat amounts by card, as a test gives them. */
export type GivenPowers = Partial<Record<CardId, Partial<Record<PowerStat, number>>>>;

let given = 0;

/** The levels a run's hand holds `powers` at (`run.handLevels`): one
 * stand-in card for each card given stats. */
export function givePowers(powers: GivenPowers): CardLevels {
  const levels: Record<string, number> = {};
  for (const stats of Object.values(powers)) {
    if (!stats || !Object.keys(stats).length) continue;
    const id = `given${++given}`;
    (CARD_POWERS as Record<string, readonly CardPower[]>)[id] = [{ rarity: "base", name: "Given", stats }];
    levels[id] = 1;
  }
  return levels as CardLevels;
}

const originals = new Map<CardId, readonly CardPower[] | undefined>();

/** Makes card `card` in `save` raise exactly `stats` as a run deals its
 * hand: its powers replaced by one base power holding them, at level 1.
 * Its real powers stay replaced for the rest of the test file until
 * `realPowers` puts them back. */
export function holdPowers(save: { cardXp: Partial<Record<CardId, number>> }, card: CardId, stats: Partial<Record<PowerStat, number>>) {
  if (!originals.has(card)) originals.set(card, CARD_POWERS[card]);
  (CARD_POWERS as Record<string, readonly CardPower[]>)[card] = [{ rarity: "base", name: "Given", stats }];
  save.cardXp[card] = CARD_LEVEL_XP[0]!;
}

/** Puts back every card's real powers that `holdPowers` replaced. */
export function realPowers() {
  for (const [card, powers] of originals) (CARD_POWERS as Record<string, readonly CardPower[] | undefined>)[card] = powers;
  originals.clear();
}
