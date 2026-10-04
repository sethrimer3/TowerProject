import { deckCards, type CardId } from "../cards.ts";
import { attachModifier, copiesLeft, detachModifier, drawModifiers, MODIFIERS, ownedLevel, type ModifierDraw, type ModifierId } from "../modifiers.ts";
import { stream } from "../random.ts";
import { affordsGems } from "./desk.ts";
import type { DeckHost } from "./deck-editor.ts";

/** The Gems one draw costs, and ten drawn at once. */
export const DRAW_GEMS = { 1: 20, 10: 200 } as const;
export type DrawCount = keyof typeof DRAW_GEMS;

/** The Deck page's card modifier commands (Card Modifiers, a Courage
 * skill): drawing them with Gems, attaching them to cards and choosing a
 * gate's threshold. Attaching and choosing happen in the forest only, so a
 * run inside keeps the modifiers it went in with. */
export class ModifierDesk {
  constructor(private readonly host: DeckHost) {}

  private get save() {
    return this.host.save;
  }

  /** Whether the Card Modifiers skill is owned. */
  get open() {
    return !!this.save.upgrades.cardModifiers;
  }

  /** Whether `count` modifiers can be drawn: the skill owned and that many
   * copies left in the pool (Gems aside). */
  canDraw(count: DrawCount) {
    return this.open && copiesLeft(this.save.modifiers, this.save.upgrades) >= count;
  }

  /** Draws `count` modifiers for their Gems, carrying on the saved stream;
   * null when they can't be drawn or paid for. */
  draw(count: DrawCount): ModifierDraw[] | null {
    const price = DRAW_GEMS[count];
    if (!this.canDraw(count) || !affordsGems(this.host, price)) return null;
    if (!this.host.free) this.save.gems -= price;
    return drawModifiers(this.save.modifiers, this.save.upgrades, count, stream("modifiers"));
  }

  /** Whether tokens can move between cards now: the skill owned, in the forest. */
  private get canArrange() {
    return this.open && !!this.host.run.outside;
  }

  /** Attaches owned modifier `id` to deck card `card` (`attachModifier`). */
  attach(id: ModifierId, card: CardId) {
    if (!this.canArrange || !ownedLevel(this.save.modifiers, id) || !deckCards(this.save.upgrades).includes(card)) return false;
    attachModifier(this.save.modifiers, id, card);
    return true;
  }

  /** Takes modifier `id` off its card. */
  detach(id: ModifierId) {
    return this.canArrange && detachModifier(this.save.modifiers, id);
  }

  /** Chooses which of gate `id`'s opened thresholds it checks. */
  setPick(id: ModifierId, pick: number) {
    const owned = this.save.modifiers.owned[id];
    if (!this.canArrange || !owned || MODIFIERS[id].kind !== "gate" || !Number.isInteger(pick) || pick < 0 || pick >= ownedLevel(this.save.modifiers, id)) return false;
    owned.pick = pick;
    return true;
  }
}
