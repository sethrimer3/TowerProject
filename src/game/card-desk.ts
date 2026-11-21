/** The Deck page's card ascensions: a card held at the last level of its
 * rarity, with the XP for the next already gathered, ascends to the next
 * rarity, paid in Rubies (cards/levels.ts), which raises its max level ten
 * and opens its next power (cards/powers.ts). */
import type { CardId } from "../cards/cards.ts";
import { ascendCard, nextAscension, readyToAscend } from "../cards/levels.ts";
import type { CardRarity } from "../cards/rarity.ts";
import type { Save } from "../save/shape.ts";

/** What the desk reads and calls on the game. */
export interface CardDeskHost {
  readonly save: Save;
  /** Dev mode's free purchases: an ascension costs nothing. */
  readonly free: boolean;
  /** Card `card` reached `levels` (lowest first): its powers count from now. */
  cardLevelled(card: CardId, levels: number[]): void;
}

/** Why a card can't ascend now: it isn't waiting to (`notReady`: short of
 * its max level or of the XP for the next, or mythic already), or the
 * Rubies held fall short (`short`). */
export type AscendRefusal = "notReady" | "short";

export class CardDesk {
  constructor(private readonly host: CardDeskHost) {}

  /** The rarity `card` ascends to next and its price in Rubies, if any. */
  next(card: CardId) {
    return nextAscension(this.host.save, card);
  }

  /** Whether `card` waits to ascend. */
  ready(card: CardId) {
    return readyToAscend(this.host.save, card);
  }

  /** Why `card` can't ascend now, or null when it can. */
  refusal(card: CardId): AscendRefusal | null {
    const next = this.next(card);
    if (!next || !this.ready(card)) return "notReady";
    return this.host.free || this.host.save.rubies >= next.rubies ? null : "short";
  }

  /** Ascends `card`, paying its Rubies: the rarity it reached, or why not. */
  ascend(card: CardId): { rarity: CardRarity } | { refused: AscendRefusal } {
    const refused = this.refusal(card), next = this.next(card);
    if (refused || !next) return { refused: refused ?? "notReady" };
    if (!this.host.free) this.host.save.rubies -= next.rubies;
    this.host.cardLevelled(card, ascendCard(this.host.save, card));
    return { rarity: next.rarity };
  }
}
