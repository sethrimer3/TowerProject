import { deckCards, handSlots, keptLinks, manualSlots, moveCard, nextHandSlotGems, nextManualSlotGems, placeCard, toggleLink, type CardId, type HandKind } from "../cards/cards.ts";
import type { Run } from "../runs.ts";
import { goalUnlocked } from "../goals.ts";
import { affordsGems, type DeskHost } from "./desk.ts";

/** What the Deck's commands read beyond the desk's: the live run, since
 * the hand is chosen only in the forest. */
export interface DeckHost extends DeskHost {
  readonly run: Run;
}

/** The Deck page's commands over the saved hands, the ones the next run
 * takes in: the hand (the Auto hand) and, with Manual Hand, the Manual
 * hand. Reordering (Combat Stance), choosing cards (Buildout), switching a
 * card to the other hand, linking the hand's cards into groups (Card
 * Groups) and buying slots with Gems. A run already inside keeps its own
 * hands. Every change to the hand breaks the links of the cards it moves
 * out of place. */
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

  /** The saved cards of hand `kind`. */
  cards(kind: HandKind): readonly CardId[] {
    return kind === "auto" ? this.save.hand : this.save.manualHand;
  }

  /** How many cards hand `kind` holds (none in the Manual hand before
   * Manual Hand). */
  slots(kind: HandKind) {
    return kind === "auto" ? handSlots(this.save) : manualSlots(this.save);
  }

  /** Whether hand `kind` has no room for another card. */
  full(kind: HandKind) {
    return this.cards(kind).length >= this.slots(kind);
  }

  /** The hand holding `id`, if either does. */
  handOf(id: CardId): HandKind | null {
    return this.save.hand.includes(id) ? "auto" : this.save.manualHand.includes(id) ? "manual" : null;
  }

  /** Whether `id` is a deck card in neither hand, free to be placed in hand
   * `kind` (the Manual hand only once Manual Hand is owned). */
  private canPlace(id: CardId, kind: HandKind) {
    return this.canChoose && deckCards(this.save.upgrades, this.save.goals).includes(id) && !this.handOf(id) && this.slots(kind) > 0;
  }

  /** Moves the card in slot `from` of hand `kind` to slot `to`, the cards
   * between shifting over one (Combat Stance, in the forest only). */
  arrange(from: number, to: number, kind: HandKind = "auto") {
    if (!this.canArrange(from, to, kind)) return false;
    return this.setCards(kind, moveCard(this.cards(kind), from, to));
  }

  /** Sets the hand, keeping only the links still joining cards side by side. */
  private setHand(hand: CardId[]) {
    this.save.hand = hand;
    this.save.cardLinks = keptLinks(hand, this.save.cardLinks);
    return true;
  }

  /** Sets hand `kind`'s cards. */
  private setCards(kind: HandKind, cards: CardId[]) {
    if (kind === "auto") return this.setHand(cards);
    this.save.manualHand = cards;
    return true;
  }

  /** Whether cards can be linked into groups: the Card Groups Goal claimed,
   * in the forest. */
  get canLink() {
    return goalUnlocked(this.save, "cardGroups") && this.inForest;
  }

  /** Links the hand's cards in slots `i` and `i + 1`, or unlinks them
   * (Card Groups, in the forest only). */
  link(i: number) {
    if (!this.canLink || !inRange(i, this.save.hand.length - 1)) return false;
    this.save.cardLinks = toggleLink(this.save.hand, this.save.cardLinks, i);
    return true;
  }

  /** Whether hand `kind` can be reordered (Combat Stance, in the forest)
   * and both slots hold cards. */
  private canArrange(from: number, to: number, kind: HandKind) {
    const n = this.cards(kind).length;
    return !!this.save.upgrades.combatStance && this.inForest && inRange(from, n) && inRange(to, n);
  }

  /** Puts a deck card into the first empty slot of hand `kind` (Buildout,
   * in the forest only). */
  add(id: CardId, kind: HandKind = "auto") {
    if (!this.canPlace(id, kind) || this.full(kind)) return false;
    return this.setCards(kind, [...this.cards(kind), id]);
  }

  /** Drops a deck card on slot `slot` of hand `kind` (Buildout, in the
   * forest only): into the slot with room in the hand, or in a full one in
   * place of the card there, which goes back to the deck (`placeCard`). */
  place(id: CardId, slot: number, kind: HandKind = "auto") {
    const slots = this.slots(kind);
    if (!this.canPlace(id, kind) || !inRange(slot, slots)) return false;
    const next = placeCard(this.cards(kind), id, slot, slots);
    if (!next) return false;
    return this.setCards(kind, next);
  }

  /** Takes a card out of its hand, back to the deck; STAIRS always stays. */
  remove(id: CardId) {
    const kind = this.handOf(id);
    if (!kind || !this.canRemove(id)) return false;
    return this.setCards(kind, this.cards(kind).filter((c) => c !== id));
  }

  /** Whether `id` can leave its hand: any card in one but STAIRS. */
  private canRemove(id: CardId) {
    return this.canChoose && id !== "stairs" && !!this.handOf(id);
  }

  /** Whether `id` can move to the other hand: in one, not STAIRS, Manual
   * Hand owned and the other hand with room. */
  canSwitch(id: CardId) {
    const kind = this.handOf(id);
    if (!kind || !this.canRemove(id) || !this.save.upgrades.manualHand) return false;
    return !this.full(kind === "auto" ? "manual" : "auto");
  }

  /** Moves `id` from its hand to the end of the other. */
  switch(id: CardId) {
    if (!this.canSwitch(id)) return false;
    const from = this.handOf(id)!, to: HandKind = from === "auto" ? "manual" : "auto";
    this.setCards(from, this.cards(from).filter((c) => c !== id));
    return this.setCards(to, [...this.cards(to), id]);
  }

  /** The Gems hand `kind`'s next slot costs, or null with none to buy. */
  slotGems(kind: HandKind) {
    return kind === "auto" ? nextHandSlotGems(this.save) : nextManualSlotGems(this.save);
  }

  /** Buys hand `kind`'s next slot with Gems (Larger Hand opens the hand's,
   * Manual Hand the Manual hand's); the next run's hand can hold one more
   * card. */
  buySlot(kind: HandKind = "auto") {
    const price = this.slotGems(kind);
    if (price === null || !affordsGems(this.host, price)) return false;
    if (!this.host.free) this.save.gems -= price;
    if (kind === "auto") this.save.handSlots++;
    else this.save.manualSlots++;
    return true;
  }
}

const inRange = (i: number, n: number) => i >= 0 && i < n;
