import { deckCards, handSlots, moveCard, nextHandSlotGems, placeCard, type CardId } from "../cards.ts";
import type { Run } from "../entities.ts";
import { affordsGems, type DeskHost } from "./desk.ts";

/** What the Deck's commands read beyond the desk's: the live run, since
 * the hand is chosen only in the forest. */
export interface DeckHost extends DeskHost {
  readonly run: Run;
}

/** The Deck page's commands over the saved hand, the one the next run
 * takes in: reordering (Combat Stance), choosing cards (Buildout) and
 * buying slots with Gems. A run already inside keeps its own hand. */
export class DeckEditor {
  constructor(private readonly host: DeckHost) {}

  private get save() {
    return this.host.save;
  }

  private get inForest() {
    return !!this.host.run.outside;
  }

  /** Whether cards can go in and out of the hand: Buildout owned, in the
   * forest. */
  private get canChoose() {
    return !!this.save.upgrades.buildout && this.inForest;
  }

  /** Whether `id` is a deck card not yet in the hand, free to be placed. */
  private canPlace(id: CardId) {
    return this.canChoose && deckCards(this.save.upgrades).includes(id) && !this.save.hand.includes(id);
  }

  /** Moves the hand's card in slot `from` to slot `to`, the cards between
   * shifting over one (Combat Stance, in the forest only). */
  arrange(from: number, to: number) {
    if (!this.canArrange(from, to)) return false;
    this.save.hand = moveCard(this.save.hand, from, to);
    return true;
  }

  /** Whether the hand can be reordered (Combat Stance, in the forest) and
   * both slots hold cards. */
  private canArrange(from: number, to: number) {
    const n = this.save.hand.length;
    return !!this.save.upgrades.combatStance && this.inForest && inRange(from, n) && inRange(to, n);
  }

  /** Puts a deck card into the hand's first empty slot (Buildout, in the
   * forest only). */
  add(id: CardId) {
    if (!this.canPlace(id) || this.save.hand.length >= handSlots(this.save)) return false;
    this.save.hand.push(id);
    return true;
  }

  /** Drops a deck card on hand slot `slot` (Buildout, in the forest only):
   * into the slot with room in the hand, or in a full one in place of the
   * card there, which goes back to the deck (`placeCard`). */
  place(id: CardId, slot: number) {
    const slots = handSlots(this.save);
    if (!this.canPlace(id) || !inRange(slot, slots)) return false;
    const next = placeCard(this.save.hand, id, slot, slots);
    if (!next) return false;
    this.save.hand = next;
    return true;
  }

  /** Takes a card out of the hand, back to the deck; STAIRS always stays. */
  remove(id: CardId) {
    if (!this.canRemove(id)) return false;
    this.save.hand = this.save.hand.filter((c) => c !== id);
    return true;
  }

  /** Whether `id` can leave the hand: any card in it but STAIRS. */
  private canRemove(id: CardId) {
    return this.canChoose && id !== "stairs" && this.save.hand.includes(id);
  }

  /** Buys the next hand slot with Gems (Larger Hand opens them); the next
   * run's hand can hold one more card. */
  buySlot() {
    const price = nextHandSlotGems(this.save);
    if (price === null || !affordsGems(this.host, price)) return false;
    if (!this.host.free) this.save.gems -= price;
    this.save.handSlots++;
    return true;
  }
}

const inRange = (i: number, n: number) => i >= 0 && i < n;
