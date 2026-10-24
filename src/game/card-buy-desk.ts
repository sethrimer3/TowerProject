import { deckCards } from "../cards/cards.ts";
import { buyCards, buysLeft, CARD_BUY_GEMS, type CardBuy, type CardBuyCount } from "../cards/buys.ts";
import { stream } from "../random.ts";
import { affordsGems, type DeskHost } from "./desk.ts";

/** Why a card buy was refused: the deck's trees have fewer levels left to
 * open than it would buy (`full`), or the Gems held fall short (`short`,
 * which asks for Gems). */
export type CardBuyRefusal = "full" | "short";

/** The Deck page's card buys (cards/buys.ts): one or ten bought with Gems,
 * each opening a level on a deck card's tree. Bought anywhere, inside a
 * run too: a run keeps the trees it went in with, and the levels opened
 * wait in the forest. */
export class CardBuyDesk {
  constructor(private readonly host: DeskHost) {}

  private get save() {
    return this.host.save;
  }

  /** The card buys the deck's cards can still take. */
  get left() {
    return buysLeft(this.save.cardBuys.opened, deckCards(this.save.upgrades, this.save.goals));
  }

  /** Why `count` cards can't be bought now, or null when they can. */
  refusal(count: CardBuyCount): CardBuyRefusal | null {
    if (this.left < count) return "full";
    return affordsGems(this.host, CARD_BUY_GEMS[count]) ? null : "short";
  }

  /** Buys `count` cards for their Gems (none with Dev free purchases),
   * carrying on the profile's stream: the buys made, or why not. */
  buy(count: CardBuyCount): CardBuy[] | CardBuyRefusal {
    const refusal = this.refusal(count);
    if (refusal) return refusal;
    if (!this.host.free) this.save.gems -= CARD_BUY_GEMS[count];
    return buyCards(this.save.cardBuys, deckCards(this.save.upgrades, this.save.goals), count, stream("cardBuys"));
  }
}
