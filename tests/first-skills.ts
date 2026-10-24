import { dealCard, handSlots } from "../src/cards/cards.ts";
import { defaults } from "../src/save/save.ts";
import type { Save } from "../src/save/shape.ts";

/** `save` past a new game's first skills, as tests that play the hand
 * expect: Door & Key, Enemy and Auto-Climb owned, and DOOR, KEY and ENEMY
 * dealt into the hand after STAIRS, so the hand plays on by itself, and
 * the lessons on pressing STAIRS, then KEY and DOOR, done and the cards
 * met on the Deck page. */
export function withFirstSkills<S extends Save>(save: S): S {
  for (const id of ["cardDoorKey", "cardEnemy", "autoClimb"] as const) save.upgrades[id] = Math.max(1, save.upgrades[id]);
  for (const card of ["door", "key", "monster"] as const) {
    save.hand = dealCard(save.hand, card, handSlots(save));
    for (const seen of [save.seen.cards, save.seen.met]) if (!seen.includes(card)) seen.push(card);
  }
  save.tutorials.climb = save.tutorials.keys = true;
  return save;
}
/** A new profile past its first skills (`withFirstSkills`). */
export const playedSave = () => withFirstSkills(defaults());
