import { levelForXp, type UpgradeId } from "../config.ts";
import type { NoticeTree } from "../save/shape.ts";
import { deckCards, type CardId } from "../cards/cards.ts";
import { hasPointsToSpend, totalCardLevels } from "../cards/trees.ts";
import { equipmentWaiting } from "../equipment/inventory.ts";
import { goalsWaiting } from "../goals.ts";
import { trainingWaiting } from "../progression/loadout.ts";
import { estimatedServerTime } from "../shop/clock.ts";
import { OFFERS } from "../shop/offers.ts";
import { refusal } from "../shop/transactions.ts";
import { TREES } from "../progression/skill-trees.ts";
import type { DeskHost } from "./desk.ts";
import type { EventDesk } from "./event-desk.ts";
import type { MailDesk } from "./mail-desk.ts";
import type { MissionDesk } from "./mission-desk.ts";
import type { ResearchDesk } from "./research-desk.ts";
import type { TournamentDesk } from "./tournament-desk.ts";

/** Where a Notice can show: the tabs (`upgrades`, `gear`, `research`,
 * `deck`, `shop`), the forest's Goals button, the run's Research button
 * and the hamburger (`run-menu`), and the tabs inside pages (the
 * Inspiration and Courage trees', the Research page's Training tab and the
 * Gear page's Equipment tab). */
export type NoticeSpot =
  | "upgrades" | "gear" | "research" | "deck" | "shop" | "goals" | "run-research" | "run-menu"
  | "inspiration" | "courage" | "training" | "equipment";

/** What the player can be shown, clearing the Notices it answers: a page
 * opened, or a tab inside one. */
export type NoticeView = "upgrades" | "gear" | "equipment" | "research" | "training" | "deck" | "inspiration" | "courage";

/** What the Notices read from the game besides the save: the desks that
 * keep their own Notices, the Archives, and whether a skill can be bought. */
export interface NoticeHost extends DeskHost {
  readonly research: Pick<ResearchDesk, "idle" | "events">;
  readonly missions: Pick<MissionDesk, "waiting">;
  readonly events: Pick<EventDesk, "waiting">;
  readonly tournament: Pick<TournamentDesk, "waiting">;
  readonly mail: Pick<MailDesk, "recent" | "unread">;
  canBuySkill(id: UpgradeId): boolean;
}

/** The Notices (the game's `notices`): whether each tab and button wears
 * its dot, and showing the player a page or tab, which clears the dots it
 * answers until the next thing new. The only writer of what has been seen
 * (`save.seen`, `treeNotices`, `equipment.seen`, and the Upgrades and Gear
 * tabs' first visits in `save.tutorials`). The Missions, Events, Mail and
 * Tournament desks keep their own (`waiting`), read here for the hamburger. */
export class NoticeDesk {
  constructor(private host: NoticeHost) {}

  private get save() {
    return this.host.save;
  }

  /** Whether `spot` wears its dot now. */
  waiting(spot: NoticeSpot): boolean {
    const save = this.save, host = this.host;
    switch (spot) {
      case "upgrades": return this.firstInspiration || this.tree("inspiration") || this.tree("courage");
      case "gear": return this.firstGear || equipmentWaiting(save);
      case "research": return trainingWaiting(save);
      case "deck": {
        // A new Deck lesson waits behind the tab until it is done, as does a
        // card not yet shown or a card level gained since the page last showed.
        const { deck, addCard } = save.tutorials;
        return !deck || (!!save.upgrades.buildout && !addCard) || this.newCard || this.cardLevelNews;
      }
      case "shop": {
        const now = estimatedServerTime(save.shop.clock, host.clock());
        return OFFERS.some((o) => o.period === 1 && !refusal(save, o, now));
      }
      case "goals": return goalsWaiting(save);
      case "run-research": return !host.run.outside && this.researchNews;
      // The hamburger wears the dots of the buttons folded away in its menu:
      // Missions always; inside a run Research, the Tournament's and Events';
      // in the forest Mail.
      case "run-menu": return host.missions.waiting || (host.run.outside
        ? host.mail.recent.length > 0 && host.mail.unread
        : this.waiting("run-research") || host.tournament.waiting || host.events.waiting);
      case "inspiration": case "courage": return this.tree(spot);
      case "training": return trainingWaiting(save) && levelForXp(save.xp) > save.seen.training;
      case "equipment": return equipmentWaiting(save);
    }
  }

  /** Records that the player was shown `view`, clearing the dots it
   * answers; whether that changed what has been seen. */
  shown(view: NoticeView): boolean {
    const save = this.save, seen = save.seen;
    switch (view) {
      case "upgrades": return this.firstInspiration && (save.tutorials.upgrades = true);
      case "gear": return this.firstGear && (save.tutorials.gear = true);
      case "equipment": return !save.equipment.seen && (save.equipment.seen = true);
      case "research": {
        const level = levelForXp(save.xp), archives = this.host.research.events;
        const changed = seen.level !== level || seen.archives !== archives;
        seen.level = level;
        seen.archives = archives;
        return changed;
      }
      case "training": {
        const level = levelForXp(save.xp), changed = seen.training !== level;
        seen.training = level;
        return changed;
      }
      case "deck": {
        const cards = deckCards(save.upgrades, save.goals), levels = totalCardLevels(save);
        const changed = cards.length !== seen.cards.length || cards.some((id) => !seen.cards.includes(id)) || levels !== seen.cardLevels;
        seen.cards = cards;
        seen.cardLevels = levels;
        return changed;
      }
      case "inspiration": case "courage": {
        const changed = save.treeNotices[view];
        save.treeNotices[view] = false;
        return changed;
      }
    }
  }

  /** The number the Deck tab's dot shows while it shows: the deck's cards
   * the Deck page hasn't shown since they were earned, and the cards with
   * card points left to spend on their trees. */
  deckCount(): number {
    const save = this.save, cards = deckCards(save.upgrades, save.goals);
    return cards.filter((id) => !save.seen.cards.includes(id)).length + cards.filter((id) => hasPointsToSpend(save, id)).length;
  }

  /** Whether card `id` wears NEW on the Deck page: in the deck, and not yet
   * met there. */
  isNew(id: CardId): boolean {
    return !this.save.seen.met.includes(id);
  }

  /** Records that the player met card `id` on the Deck page (pressed it
   * for its details, moved it, put it in the hand or gave it a badge),
   * taking its NEW away; whether that changed what has been seen. */
  met(id: CardId): boolean {
    if (!this.isNew(id)) return false;
    this.save.seen.met.push(id);
    return true;
  }

  /** A card has levelled up since the Deck page last showed. */
  private get cardLevelNews() {
    return !!this.save.upgrades.combatStance && totalCardLevels(this.save) > this.save.seen.cardLevels;
  }

  /** The first Inspiration has been earned (so the run that paid it has
   * ended by the time the tabs show) and the Upgrades page hasn't been
   * opened since. */
  private get firstInspiration() {
    return !this.save.tutorials.upgrades && this.save.tower.inspiration > 0;
  }

  /** The Gear skill is owned and the Gear page hasn't been opened since. */
  private get firstGear() {
    return !this.save.tutorials.gear && !!this.save.upgrades.gear;
  }

  /** In the forest, after a run that earned `tree`'s currency (Inspiration
   * from the Tower, Courage from the Delve), while a skill in it can be
   * bought (so never while the tree is locked), until that tree shows. */
  private tree(tree: NoticeTree) {
    return this.save.treeNotices[tree] && !!this.host.run.outside &&
      TREES.find((t) => t.id === tree)!.nodes.some((n) => this.host.canBuySkill(n.id));
  }

  /** The deck holds a card (from a skill, a Goal or anywhere else) the
   * Deck page hasn't shown since it was earned. */
  private get newCard() {
    return !!this.save.upgrades.combatStance && deckCards(this.save.upgrades, this.save.goals).some((id) => !this.save.seen.cards.includes(id));
  }

  /** Training points can be spent and the hero has levelled up since the
   * Research page was last shown, or an archivist stands idle and research
   * has completed (or an archivist been hired) since. */
  private get researchNews() {
    const save = this.save, seen = save.seen, research = this.host.research;
    return (trainingWaiting(save) && levelForXp(save.xp) > seen.level) || (research.idle && research.events > seen.archives);
  }
}
