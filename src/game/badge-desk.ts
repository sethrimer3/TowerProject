import { deckCards, type CardId } from "../cards.ts";
import { attachBadge, copiesLeft, detachBadge, drawBadges, BADGES, ownedLevel, type BadgeDraw, type BadgeId } from "../badges.ts";
import { stream } from "../random.ts";
import { affordsGems } from "./desk.ts";
import type { DeckHost } from "./deck-editor.ts";

/** The Gems one draw costs, and ten drawn at once. */
export const DRAW_GEMS = { 1: 20, 10: 200 } as const;
export type DrawCount = keyof typeof DRAW_GEMS;

/** The Deck page's card badge commands (Badges, a Courage
 * skill): drawing them with Gems, attaching them to cards and choosing a
 * gate's threshold. Attaching and choosing happen in the forest only, so a
 * run inside keeps the badges it went in with. */
export class BadgeDesk {
  constructor(private readonly host: DeckHost) {}

  private get save() {
    return this.host.save;
  }

  /** Whether the Badges skill is owned. */
  get open() {
    return !!this.save.upgrades.cardBadges;
  }

  /** Whether `count` badges can be drawn: the skill owned and that many
   * copies left in the pool (Gems aside). */
  canDraw(count: DrawCount) {
    return this.open && copiesLeft(this.save.badges, this.save.upgrades) >= count;
  }

  /** Draws `count` badges for their Gems, carrying on the saved stream;
   * null when they can't be drawn or paid for. */
  draw(count: DrawCount): BadgeDraw[] | null {
    const price = DRAW_GEMS[count];
    if (!this.canDraw(count) || !affordsGems(this.host, price)) return null;
    if (!this.host.free) this.save.gems -= price;
    return drawBadges(this.save.badges, this.save.upgrades, count, stream("badges"));
  }

  /** Whether tokens can move between cards now: the skill owned, in the forest. */
  private get canArrange() {
    return this.open && !!this.host.run.outside;
  }

  /** Attaches owned badge `id` to deck card `card` (`attachBadge`). */
  attach(id: BadgeId, card: CardId) {
    if (!this.canArrange || !ownedLevel(this.save.badges, id) || !deckCards(this.save.upgrades).includes(card)) return false;
    attachBadge(this.save.badges, id, card);
    return true;
  }

  /** Takes badge `id` off its card. */
  detach(id: BadgeId) {
    return this.canArrange && detachBadge(this.save.badges, id);
  }

  /** Chooses which of gate `id`'s opened thresholds it checks. */
  setPick(id: BadgeId, pick: number) {
    const owned = this.save.badges.owned[id];
    if (!this.canArrange || !owned || BADGES[id].kind !== "gate" || !Number.isInteger(pick) || pick < 0 || pick >= ownedLevel(this.save.badges, id)) return false;
    owned.pick = pick;
    return true;
  }
}
