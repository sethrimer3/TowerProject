import type { CardId } from "../cards.ts";
import { CARD_TREES, nodeLevel, nodeOpen, pointsLeft, pointsSpent, raiseNode, raiseRefusal, RESPEC_GEMS, treeNode, type RaiseRefusal } from "../card-trees.ts";
import { affordsGems, type DeskHost } from "./desk.ts";

/** Why a card tree command was refused: one of `RaiseRefusal`'s, or
 * `inside` (a run is inside: trees change in the forest only, so a run
 * keeps the trees it went in with). */
export type TreeRefusal = RaiseRefusal | "inside";
/** Why a respec was refused: `inside`, nothing spent on the card's tree
 * (`none`), or too few Gems (`short`, which asks for Gems). */
export type RespecRefusal = "inside" | "none" | "short";

/** The card trees' commands (card-trees.ts): spending a card's points on
 * its tree's nodes, and a respec, which gives them all back for
 * `RESPEC_GEMS`. Both happen in the forest only. */
export class CardTreeDesk {
  constructor(private readonly host: DeskHost) {}

  private get save() {
    return this.host.save;
  }

  /** Whether the trees can change now: in the forest. */
  get canEdit() {
    return !!this.host.run.outside;
  }

  /** `card`'s tree, its nodes parents first (none for a card without one). */
  nodes(card: CardId) {
    return CARD_TREES[card] ?? [];
  }

  /** The levels spent on node `id` of `card`. */
  level(card: CardId, id: string) {
    return nodeLevel(this.save.cardTrees, card, id);
  }

  /** Whether node `id` of `card` takes levels yet: its parent is full. */
  open(card: CardId, id: string) {
    const node = treeNode(card, id);
    return !!node && nodeOpen(this.save.cardTrees, card, node);
  }

  /** The card points `card` has left to spend, and has spent. */
  pointsLeft(card: CardId) {
    return pointsLeft(this.save, card);
  }
  pointsSpent(card: CardId) {
    return pointsSpent(this.save.cardTrees, card);
  }

  /** Why a point can't go on node `id` of `card` now, or null when it can. */
  raiseRefusal(card: CardId, id: string): TreeRefusal | null {
    return this.canEdit ? raiseRefusal(this.save, card, id) : "inside";
  }

  /** Spends a point of `card` on node `id`, a level more: null once spent,
   * else why not. */
  raise(card: CardId, id: string): TreeRefusal | null {
    const refusal = this.raiseRefusal(card, id);
    if (refusal) return refusal;
    raiseNode(this.save, card, id);
    return null;
  }

  /** Why `card` can't be respecced now, or null when it can. */
  respecRefusal(card: CardId): RespecRefusal | null {
    if (!this.canEdit) return "inside";
    if (!this.pointsSpent(card)) return "none";
    return affordsGems(this.host, RESPEC_GEMS) ? null : "short";
  }

  /** Respecs `card` for `RESPEC_GEMS` (none with Dev free purchases):
   * every point spent on its tree comes back, to spend again. Null once
   * done, else why not. */
  respec(card: CardId): RespecRefusal | null {
    const refusal = this.respecRefusal(card);
    if (refusal) return refusal;
    if (!this.host.free) this.save.gems -= RESPEC_GEMS;
    delete this.save.cardTrees[card];
    return null;
  }
}
