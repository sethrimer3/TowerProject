import { kitIcon } from "../sprites/kit.ts";
import { askForGems, showHelp } from "./dialogs.ts";
import { CARDS, cardBonusText, deckCards, linkedToNext, moveCard, placeCard, type CardId, type HandKind } from "../cards/cards.ts";
import type { AppContext } from "./app.ts";
import { cardArt, el, escapeHtml, gemIcon, POINTER_SVG } from "./dom.ts";
import { DRAW_GEMS, type DrawCount } from "../game/badge-desk.ts";
import { cardWith, fitsCard, BADGE_IDS, BADGES, badgeLevel, badgeValue, type BadgeId } from "../cards/badges.ts";
import { RARITIES } from "../shop/rarity.ts";
import { revealDraws } from "./badge-reveal.ts";
import { revealBuys } from "./card-buy-reveal.ts";
import { CARD_BUY_GEMS, type CardBuyCount } from "../cards/buys.ts";
import { showCard, type CardAction, type CardDetails } from "./card-reveal.ts";
import { CardTreePanel } from "./card-tree-panel.ts";
import { CARD_TREES, hasPointsToSpend } from "../cards/trees.ts";
import { cardLevelHtml, cardXpBarHtml } from "./card-level-marks.ts";
import { badgeLevelsHtml, cardBadgeHtml, badgeText, progressText, tokenHtml } from "./badge-token.ts";

/** Where a hand card dropped on the deck goes: back to the deck. */
const TO_DECK = -1;
/** How far a press must travel before it lifts the card. */
const DRAG_START_PX = 4;

/** A card being dragged along the hand row: the slot it left, the slot it
 * would drop into (`TO_DECK` while it is over the deck, to return it), and
 * the ghost that follows the pointer. */
type Drag = { from: number; to: number; pointer: number; x: number; y: number; lifted: boolean; ghost: HTMLElement | null };
/** A deck card being dragged to the hand: the hand slot it would drop on
 * (null while it is away from the hand, or over STAIRS in a full hand). */
type DeckDrag = { card: CardId; to: number | null; pointer: number; x: number; y: number; lifted: boolean; ghost: HTMLElement | null };
/** A badge token being dragged to a card: the card it would attach to
 * (null while it is over none). */
type BadgeDrag = { badge: BadgeId; card: CardId | null; pointer: number; x: number; y: number; lifted: boolean; ghost: HTMLElement | null };

const X_SVG = kitIcon("close", `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`, "deck-control-icon");
/** The switch on a hand card that moves it to the other hand (Manual Hand). */
const SWITCH_SVG = `<svg viewBox="0 0 10 10" aria-hidden="true" class="deck-control-icon"><path d="M1.8 3.2H7.8M6.2 1.5L8 3.2L6.2 4.9M8.2 6.8H2.2M3.8 5.1L2 6.8L3.8 8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/** The two hands' names on the Deck page. */
const HAND_NAMES: Record<HandKind, string> = { auto: "Auto hand", manual: "Manual hand" };
const CHECK_SVG = kitIcon("check", `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.4L4.2 7.6L8.2 2.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`, "deck-control-icon");

/** The rising arrow on a card with card points to spend. */
const POINTS_ARROW_SVG = `<svg viewBox="0 0 10 12" aria-hidden="true"><path d="M5 1L9 6H6.4V11H3.6V6H1Z" fill="currentColor" stroke="#2a1c06" stroke-width="0.8" stroke-linejoin="round"/></svg>`;

/** The chevron beside the Hand heading: pointing up while the hand shows (to collapse it), down while it is collapsed. */
const CHEVRON_SVG = `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 6.5L5 3.5L8 6.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ARROW_STEPS = new Map([["ArrowLeft", -1], ["ArrowRight", 1]]);

/** Whether a drag's pointer is the one pressed and, until it lifts, has
 * travelled far enough to lift the card. */
const travelled = (d: Drag | DeckDrag | BadgeDrag, e: PointerEvent) =>
  e.pointerId === d.pointer && (d.lifted || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= DRAG_START_PX);

/** The enabled button matching `selector` that the primary button pressed. */
function pressed(e: PointerEvent, selector: string) {
  if (e.button > 0) return null;
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>(selector);
  return button && !button.disabled ? button : null;
}

/** A ghost of `card`, its size, laid over the page to follow the pointer. */
function ghostOf(card: HTMLElement) {
  const box = card.getBoundingClientRect(), ghost = document.createElement("div");
  ghost.className = "deck-ghost";
  ghost.style.width = `${box.width}px`;
  ghost.style.height = `${box.height}px`;
  ghost.innerHTML = card.innerHTML;
  document.body.append(ghost);
  return ghost;
}

const follow = (ghost: HTMLElement, e: PointerEvent) => {
  ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
};

/** Whether (x, y) is within a slot's height of `box`. */
function near(box: DOMRect, x: number, y: number) {
  const reach = box.height;
  return x >= box.left - reach && x <= box.right + reach && y >= box.top - reach && y <= box.bottom + reach;
}

/** Which Deck tutorial step waits on the player: `order`, dragging STAIRS
 * (Combat Stance); `remove`, taking a card out of the hand with its X (Buildout);
 * `points`, spending a card point on a card's tree (`Game.cardPointsLesson`);
 * and `add`, the note on adding cards from the deck (Buildout). */
type Lesson = "order" | "remove" | "points" | "add" | null;

/** The Deck page: the hand's slots along the top (with Larger Hand, the
 * next one to buy with Gems after them; with Manual Hand, a slider over
 * them shows the Auto hand's or the Manual hand's, each card wearing a
 * switch to the other beside its X), whose cards Hand
 * Ordering lets the player drag into a new order before a run, and the
 * deck's cards below, which Buildout lets the player add to the hand
 * or take out of it (STAIRS always stays). Each skill's first visit
 * teaches it; while a step waits on the player, the page points at what to
 * do and nothing else on it or the tab row can be used. */
export class DeckPage {
  private drag: Drag | null = null;
  private deckDrag: DeckDrag | null = null;
  private badgeDrag: BadgeDrag | null = null;
  private showing = false;
  private tree: CardTreePanel | null = null;
  /** Whether the hand is collapsed under its heading, making room for the
   * deck and badges; until the page is left. */
  private handCollapsed = false;
  /** Which hand the slots show (Manual Hand): the Auto hand until the
   * slider picks the Manual hand; until the page is left. */
  private kind: HandKind = "auto";

  constructor(private ctx: AppContext) {}

  private get lesson(): Lesson {
    const { tutorials, upgrades } = this.ctx.game.save;
    if (!tutorials.deck) return "order";
    if (upgrades.buildout && !tutorials.removeCard) return "remove";
    if (this.pointsTarget) return "points";
    return upgrades.buildout && !tutorials.addCard ? "add" : null;
  }

  /** The card the card points lesson points at, while it waits. */
  private get pointsTarget() {
    return this.ctx.game.cardPointsLesson;
  }

  /** Whether a Deck tutorial is waiting on the player's action, which keeps
   * them on this page. */
  get teaching() {
    return this.showing && this.waitsOnPlayer;
  }

  /** Whether the lesson shown waits on the player's action. */
  private get waitsOnPlayer() {
    const lesson = this.lesson;
    return lesson === "order" || lesson === "remove" || lesson === "points";
  }

  /** Called whenever the tab changes, so `teaching` knows the page is open. */
  shown(open: boolean) {
    this.showing = open;
    if (open) return;
    this.cancelDrag();
    this.handCollapsed = false;
    this.kind = "auto";
    // Leaving the page puts a card's tree away: the Deck shows again next time.
    this.tree?.close(true);
    this.tree = null;
  }

  /** Opens `id`'s upgrade tree in place of the page, until its Back: for
   * the card the card points lesson points at, its last step, which keeps
   * the tree open until a point is spent there. */
  private openTree(id: CardId) {
    this.tree?.close(true);
    const teach = this.lesson === "points" && id === this.pointsTarget ? () => this.taughtPoints() : undefined;
    this.tree = new CardTreePanel(this.ctx, id, el("deck"), () => {
      this.tree = null;
      if (this.showing) this.render();
    }, teach);
  }

  /** The first card point spent: the card points lesson is done. */
  private taughtPoints() {
    this.ctx.game.save.tutorials.cardPoints = true;
    this.ctx.save();
    this.ctx.update();
    this.praise("CARD LEVELS", "Well spent!", "Keep levelling up your cards to unlock more bonuses on their upgrade trees. Soon you will be able to spend Gems to unlock stronger rare and special card powers, and Gems can respec a card, returning all its points to spend again.");
  }

  /** Records that the player met card `id` here, taking its NEW away. */
  private meet(id: CardId) {
    if (!this.ctx.game.notices.met(id)) return false;
    this.ctx.save();
    return true;
  }

  /** The card the remove tutorial points at: MONSTER, or the last card
   * besides STAIRS if the hand has no MONSTER. */
  private get removeTarget(): CardId | undefined {
    const hand = this.ctx.game.save.hand;
    return hand.includes("monster") ? "monster" : hand.filter((c) => c !== "stairs").at(-1);
  }

  /** The cards of the hand the slots show. */
  private get hand() {
    return this.ctx.game.deck.cards(this.kind);
  }

  /** How many cards the hand shown holds. */
  private get slots() {
    return this.ctx.game.deck.slots(this.kind);
  }

  /** Whether the slider between the two hands shows: Manual Hand owned,
   * and no lesson waiting on the player. */
  private get showsKinds() {
    return !!this.ctx.game.save.upgrades.manualHand && !this.waitsOnPlayer;
  }

  /** The Auto | Manual slider over the hand's slots. */
  private kindsHtml() {
    if (!this.showsKinds) return "";
    const option = (kind: HandKind, name: string, title: string) =>
      `<button type="button" role="radio" data-hand-kind="${kind}" aria-checked="${this.kind === kind}" title="${title}">${name}</button>`;
    return `<div class="hand-kinds${this.kind === "manual" ? " manual" : ""}" role="radiogroup" aria-label="Which hand to show">${option("auto", "Auto", "The Auto hand: its cards play by themselves, in order")}${option("manual", "Manual", "The Manual hand: its cards act only when you press them in a run")}<span class="hand-kinds-thumb" aria-hidden="true"></span></div>`;
  }

  render() {
    // A card's tree stands in for the page while it is open.
    if (this.tree) return;
    const save = this.ctx.game.save;
    if (!this.showsKinds) this.kind = "auto";
    // With nothing to take out of the hand, the remove step has nothing to teach.
    if (this.lesson === "remove" && !this.removeTarget) {
      save.tutorials.removeCard = true;
      this.ctx.save();
    }
    const lesson = this.lesson;
    const tip = lesson === "order"
      ? `<div class="deck-tip" role="status"><b>Order your hand</b><p>Inside a run your hand tries its cards from left to right, and the first that can act moves you. Drag STAIRS to another slot to change the order.</p></div>`
      : lesson === "remove"
        ? `<div class="deck-tip" role="status"><b>Choose your cards</b><p>You can take cards out of your hand, and your runs will stop heading for their targets. Press the X on ${CARDS[this.removeTarget!].name.toUpperCase()} to return it to your deck.</p></div>`
        : lesson === "points"
          ? `<div class="deck-tip" role="status"><b>Spend card points</b><p>Select ${CARDS[this.pointsTarget!].name.toUpperCase()} and spend its card points on its upgrade tree to unlock bonuses.</p></div>`
          : "";
    // A lesson waiting on the player needs the hand in view.
    const collapsed = this.handCollapsed && !this.waitsOnPlayer;
    const toggle = this.waitsOnPlayer ? "" : `<button type="button" class="deck-hand-toggle" id="deck-hand-toggle" aria-expanded="${!collapsed}" aria-controls="deck-hand" title="${collapsed ? "Show" : "Hide"} the hand" aria-label="${collapsed ? "Show" : "Hide"} the hand">${CHEVRON_SVG}</button>`;
    el("deck").innerHTML = `<div class="deck-page${this.showsBadges ? " with-badges" : ""}">
      <section class="deck-hand-area${collapsed ? " collapsed" : ""}" aria-labelledby="deck-hand-label">
        <div class="deck-hand-head"><h3 id="deck-hand-label" class="deck-label">Hand</h3>${this.kindsHtml()}${toggle}</div>
        <div class="deck-hand${this.showsLinks ? " with-links" : ""}" id="deck-hand" role="list" aria-label="${this.kind === "manual" ? "Manual hand, its cards acting only when pressed" : "Hand, in the order its cards are tried"}">${this.slotsHtml(this.hand)}</div>
        ${tip}
      </section>
      ${this.columnsHtml()}
    </div>`;
    this.bindHand();
    this.bindDeck();
    this.bindBadges();
  }

  /** Whether the hand shows its Card Groups links: the Goal claimed, no
   * lesson waiting on the player, and the Auto hand shown (the Manual
   * hand's cards are never linked). */
  private get showsLinks() {
    return this.ctx.game.deck.canLink && !this.waitsOnPlayer && this.kind === "auto";
  }

  /** Whether the Badges box shows: Badges owned, and no lesson
   * waiting on the player. */
  private get showsBadges() {
    return !!this.ctx.game.save.upgrades.cardBadges && !this.waitsOnPlayer;
  }

  /** The deck, and beside it (with Badges) the Badges box, each
   * in its own column. */
  private columnsHtml() {
    const save = this.ctx.game.save, lesson = this.lesson;
    const deck = `<div class="deck-stack">${this.cardBuysHtml()}${save.upgrades.buildout && lesson !== "remove" ? this.deckHtml(lesson === "add") : this.lockedDeckHtml(!!save.upgrades.buildout)}</div>`;
    return this.showsBadges ? `<div class="deck-columns">${deck}${this.badgesHtml()}</div>` : deck;
  }

  /** The card buy buttons over the Deck section (none while a lesson
   * waits on the player). */
  private cardBuysHtml() {
    if (this.waitsOnPlayer) return "";
    return `<div class="card-buys" role="group" aria-label="Buy cards">${this.cardBuyButton(1)}${this.cardBuyButton(10)}</div>`;
  }

  /** The button that buys `count` cards: red-priced when short of Gems,
   * and unavailable only once the deck's trees have too few levels left
   * to open. */
  private cardBuyButton(count: CardBuyCount) {
    const { game } = this.ctx, price = CARD_BUY_GEMS[count], refusal = game.cardBuys.refusal(count);
    const title = refusal === "full" ? (game.cardBuys.left ? `Only ${game.cardBuys.left} upgrade${game.cardBuys.left === 1 ? "" : "s"} left on your deck's cards` : "Every card in your deck is fully upgraded") : `Buy ${count === 1 ? "a card" : "10 cards"} for ${price} Gems: each raises a deck card's max level and opens an upgrade on its tree`;
    return `<button type="button" class="badge-draw card-buy${refusal === "short" ? " short" : ""}" data-buy-cards="${count}" ${refusal === "full" ? "disabled" : ""} title="${title}" aria-label="Buy ${count === 1 ? "a card" : "10 cards"} for ${price} Gems">Buy ×${count}<span>${gemIcon()}<b>${price}</b></span></button>`;
  }

  /** The draw buttons over the Badges box, which lists each badge
   * owned: its token (pressed for what it does, dragged onto a card to
   * attach it), its name, the copies toward its next level, and, once it
   * is on a card, the X that takes it off. */
  private badgesHtml() {
    const { save } = this.ctx.game, badges = save.badges;
    const owned = BADGE_IDS.filter((id) => badges.owned[id]);
    const entries = owned.map((id) => {
      const copies = badges.owned[id]!.copies, on = cardWith(badges, id), name = BADGES[id].name;
      const x = on ? `<button type="button" class="badge-detach" data-detach="${id}" title="Take ${name} off ${CARDS[on].name}" aria-label="Take ${name} off ${CARDS[on].name}">${X_SVG}</button>` : "";
      return `<div class="badge-entry${on ? " attached" : ""}" role="listitem"><button type="button" class="badge-pick" data-badge="${id}" title="${name}${on ? ` · on ${CARDS[on].name}` : ""}: press for details, or drag it onto a card" aria-label="${name}, level ${badgeLevel(copies)}${on ? `, on ${CARDS[on].name}` : ""}">${tokenHtml(id, badgeLevel(copies))}</button>${x}<span class="badge-name" aria-hidden="true">${name}</span><small class="badge-count">${progressText(copies)}</small></div>`;
    }).join("");
    return `<section class="deck-badges" aria-labelledby="badges-label">
        <div class="badge-draws">${this.drawButton(1)}${this.drawButton(10)}</div>
        <div class="badge-box">
          <h3 id="badges-label" class="deck-label">Badges</h3>
          ${owned.length ? `<div class="badge-grid" role="list" aria-label="Your badges">${entries}</div>` : `<p class="badge-empty">Buy badges with Gems, then drag one onto a card to change what it does.</p>`}
        </div>
      </section>`;
  }

  /** The button that draws `count` badges: red-priced when short of
   * Gems, and unavailable only once the pool has too few left. */
  private drawButton(count: DrawCount) {
    const { game } = this.ctx, price = DRAW_GEMS[count], short = !game.free && game.save.gems < price;
    const can = game.badges.canDraw(count);
    return `<button type="button" class="badge-draw${short ? " short" : ""}" data-draw="${count}" ${can ? "" : "disabled"} title="${can ? `Buy ${count === 1 ? "a badge" : "10 badges"} for ${price} Gems` : "Every badge is at its top level"}">Buy ×${count}<span>${gemIcon()}<b>${price}</b></span></button>`;
  }

  /** The deck's cards on a grid: those in a hand with a check that
   * returns them, the rest ready to add to the hand shown. */
  private deckHtml(note: boolean) {
    const { deck } = this.ctx.game, full = deck.full(this.kind), yours = this.kind === "manual" ? "your Manual hand" : "your hand";
    // The card points lesson leaves only the card it points at to press.
    const target = this.lesson === "points" ? this.pointsTarget : null;
    const cards = deckCards(this.ctx.game.save.upgrades, this.ctx.game.save.goals).map((id) => {
      const name = CARDS[id].name, fixed = target && id !== target ? " disabled" : "", held = deck.handOf(id);
      const pointer = id === target && !held ? this.pointer("at-card") : "";
      if (held) {
        const stays = id === "stairs", where = held === "manual" ? "your Manual hand" : "your hand";
        const check = (stays
          ? `disabled title="STAIRS always stays in your hand" aria-label="${name} is in your hand and always stays there"`
          : `title="Return ${name} to the deck" aria-label="${name} is in ${where}: return it to the deck"`) + (target && !stays ? " disabled" : "");
        return `<div class="deck-entry in-hand" role="listitem"${this.badgeTarget(id)}<button type="button" class="deck-entry-art" data-info="${id}"${fixed} title="${name}: in ${where}. Press for details" aria-label="${name}: in ${where}. Press for details">${cardArt(id, name)}${this.marksHtml(id)}</button><button type="button" class="deck-check" data-return="${id}" ${check}>${CHECK_SVG}</button></div>`;
      }
      // A full hand takes a card only by dragging it onto one to swap out.
      return `<div class="deck-entry" role="listitem"${this.badgeTarget(id)}<button type="button" class="deck-add${full ? " full" : ""}" data-add="${id}" title="${full ? `${name}: press for details. ${cap(yours)} is full: drag it onto a card to swap it` : `${name}: press for details, or drag it to a slot`}" aria-label="${full ? `${name}: press for details. ${cap(yours)} is full: drag it onto a card to swap it` : `${name}: press for details or to add it to ${yours}`}"${fixed}>${cardArt(id, name)}${this.marksHtml(id)}</button>${pointer}</div>`;
    }).join("");
    return `<section class="deck-reserve open" aria-labelledby="deck-label">
        <h3 id="deck-label" class="deck-label">Deck</h3>
        ${note ? `<button type="button" class="deck-tip deck-note" id="deck-add-note"><b>Add cards from your deck</b><p>Press a card to see what it does and add it to your hand, or drag it to a hand slot. Cards already in your hand wear a check: press it to return them to the deck.</p><small>Press to dismiss</small></button>` : ""}
        <div class="deck-grid" role="list" aria-label="Your deck">${cards}</div>
      </section>`;
  }

  private lockedDeckHtml(soon: boolean) {
    return `<section class="deck-reserve" aria-label="Deck (locked)">
        <h3 class="deck-label">Deck</h3>
        <div class="deck-reserve-slots" aria-hidden="true">${"<i></i>".repeat(14)}</div>
        <p class="deck-lock"><b>Locked</b>${soon ? "Take a card out of your hand first." : "Unlock Buildout in the Inspiration tree to choose your hand's cards from here."}</p>
      </section>`;
  }

  /** The hand's slots as `hand` fills them, the dragged card's slot left
   * showing where it will land, then the next slot for sale. */
  private slotsHtml(hand: readonly CardId[], held: number | null = null) {
    return this.cardSlotsHtml(hand, held) + this.slotForSaleHtml();
  }

  /** The next slot of the hand shown, offered for its Gems, once Larger
   * Hand (for the Auto hand) or Manual Hand (for the Manual hand) is owned. */
  private slotForSaleHtml() {
    const { save, free, deck } = this.ctx.game, price = deck.slotGems(this.kind);
    if (price === null || this.waitsOnPlayer) return "";
    const short = save.gems < price && !free, what = this.kind === "manual" ? "a Manual hand slot" : "a hand slot";
    return `<div class="deck-slot for-sale" role="listitem"><button type="button" class="deck-buy-slot${short ? " short" : ""}" data-buy-slot title="${short ? `Needs ${price} Gems` : `Buy ${what} for ${price} Gems`}" aria-label="Buy ${what} for ${price} Gems"><span>+</span>${gemIcon()}<b>${price}</b></button></div>`;
  }

  private cardSlotsHtml(hand: readonly CardId[], held: number | null) {
    const linked = linkedToNext(hand, this.ctx.game.save.cardLinks);
    return Array.from({ length: this.slots }, (_, i) => {
      const id = hand[i];
      return id ? this.cardSlotHtml(id, i, hand.length, i === held, this.linksHtml(hand, linked, i)) : `<div class="deck-slot empty" role="listitem" aria-label="Empty slot ${i + 1}"></div>`;
    }).join("");
  }

  /** Under hand card `i`, with Card Groups: each half of a link's bracket
   * it holds (from its middle back to the card before, and on to the card
   * after), and, but for the last card, the diamond after it that links it
   * to the next card or unlinks them. A link wrapping to the next row
   * shows a half under each card. */
  private linksHtml(hand: readonly CardId[], linked: readonly boolean[], i: number) {
    if (!this.showsLinks) return "";
    const next = hand[i + 1], on = !!linked[i];
    const halves = (linked[i - 1] ? `<span class="deck-link from-prev" aria-hidden="true"></span>` : "") + (on ? `<span class="deck-link to-next" aria-hidden="true"></span>` : "");
    if (!next) return halves;
    const names = `${CARDS[hand[i]!].name} and ${CARDS[next].name}`;
    return `${halves}<button type="button" class="deck-link-toggle${on ? " on" : ""}" data-link="${i}" aria-pressed="${on}" aria-label="${on ? "Unlink" : "Link"} ${names}" title="${on ? `${names} share one priority: press to unlink them` : `Link ${names}: they share one priority, the closest target of either taken first`}"></button>`;
  }

  /** Hand slot `i` holding card `id`: the card (fixed in place while a
   * lesson points elsewhere), its X, its switch to the other hand, and the
   * lesson's pointing hand. */
  private cardSlotHtml(id: CardId, i: number, count: number, held: boolean, links = "") {
    const lesson = this.lesson, card = CARDS[id];
    const fixed = lesson === "remove" || (lesson === "order" && id !== "stairs") || (lesson === "points" && id !== this.pointsTarget);
    const pointed = lesson === "remove" && id === this.removeTarget;
    const x = this.removable(id) ? `<button type="button" class="deck-remove${pointed ? " shown" : ""}" data-remove="${id}" title="Return ${card.name} to the deck" aria-label="Return ${card.name} to the deck">${X_SVG}</button>` + this.switchHtml(id) : "";
    const lessonPointer = (lesson === "order" && id === "stairs") || (lesson === "points" && id === this.pointsTarget) ? this.pointer("at-card") : pointed ? this.pointer("at-x") : "";
    return `<div class="deck-slot${held ? " held" : ""}" role="listitem"${this.badgeTarget(id)}<button type="button" class="deck-card" data-slot="${i}" ${fixed ? "disabled" : ""} aria-label="${card.name}, slot ${i + 1} of ${count}. Drag, or press the left and right arrow keys, to move it." title="${card.name}: ${this.ctx.game.cardText(id)}${cardBonusText(id) ? ` · ${cardBonusText(id)}` : ""}">${cardArt(id, card.name)}${this.marksHtml(id)}</button>${x}${lessonPointer}${links}</div>`;
  }

  /** The switch beside a hand card's X that moves it to the other hand,
   * with the slider showing (never on STAIRS, which wears no X); greyed
   * while the other hand is full. */
  private switchHtml(id: CardId) {
    if (!this.showsKinds) return "";
    const other = HAND_NAMES[this.kind === "auto" ? "manual" : "auto"], can = this.ctx.game.deck.canSwitch(id), name = CARDS[id].name;
    const title = can ? `Move ${name} to the ${other}` : `The ${other} is full`;
    return `<button type="button" class="deck-switch" data-switch="${id}" ${can ? "" : "disabled"} title="${title}" aria-label="${can ? title : `${name} can't move: the ${other} is full`}">${SWITCH_SVG}</button>`;
  }

  /** What card `id` wears over its art: its XP toward its next level on the
   * rule above its name, its rarity's frame and level, a rising arrow at its
   * top left while it has card points to spend on its tree, and NEW in gold
   * at its top right until the player meets it here. */
  private marksHtml(id: CardId) {
    const { save, notices } = this.ctx.game, still = save.settings.reduceMotion ? " still" : "";
    return cardXpBarHtml(save, id) + cardLevelHtml(save, id)
      + (hasPointsToSpend(save, id) ? `<span class="card-points-mark${still}" aria-hidden="true">${POINTS_ARROW_SVG}</span>` : "")
      + (notices.isNew(id) ? `<span class="card-new" aria-hidden="true">NEW</span>` : "");
  }

  /** The end of card `id`'s opening tag and what follows it, with the
   * Badges box showing: a mark that a token can be dropped on the card,
   * and the marks of the badges it holds, top slot first. */
  private badgeTarget(id: CardId) {
    if (!this.showsBadges) return ">";
    const badges = this.ctx.game.save.badges.cards[id] ?? [];
    return ` data-badge-card="${id}">${badges.length ? `<span class="badge-marks">${badges.map(cardBadgeHtml).join("")}</span>` : ""}`;
  }

  /** Whether a hand card wears an X: any but STAIRS once Buildout is owned,
   * outside the order lesson, and only the pointed-at one in the remove
   * lesson. */
  private removable(id: CardId) {
    const lesson = this.lesson;
    if (!this.ctx.game.save.upgrades.buildout || id === "stairs") return false;
    if (lesson === "order" || lesson === "points") return false;
    return lesson !== "remove" || id === this.removeTarget;
  }

  /** The tutorials' pointing hand, at the card or at its X. */
  private pointer(at: string) {
    return `<span class="deck-pointer ${at}${this.ctx.game.save.settings.reduceMotion ? " still" : ""}">${POINTER_SVG}</span>`;
  }

  private bindHand() {
    const toggle = document.getElementById("deck-hand-toggle");
    if (toggle) toggle.onclick = () => {
      this.handCollapsed = !this.handCollapsed;
      this.render();
    };
    document.querySelectorAll<HTMLButtonElement>("[data-hand-kind]").forEach((b) => (b.onclick = () => {
      const kind = b.dataset.handKind as HandKind;
      if (kind === this.kind) return;
      this.kind = kind;
      this.render();
    }));
    const row = el("deck-hand");
    row.onclick = (e) => {
      const x = (e.target as HTMLElement).closest<HTMLButtonElement>(".deck-remove");
      if (x) this.remove(x.dataset.remove as CardId);
      const swap = (e.target as HTMLElement).closest<HTMLButtonElement>(".deck-switch");
      if (swap && !swap.disabled) this.switch(swap.dataset.switch as CardId);
      if ((e.target as HTMLElement).closest(".deck-buy-slot")) this.buySlot();
      const link = (e.target as HTMLElement).closest<HTMLButtonElement>(".deck-link-toggle");
      if (link) this.change(this.ctx.game.deck.link(Number(link.dataset.link)));
      // From the keyboard (a pointer's press shows it on release).
      const card = (e.target as HTMLElement).closest<HTMLButtonElement>(".deck-card");
      if (card && e.detail === 0) this.showHandCard(this.hand[Number(card.dataset.slot)]);
    };
    row.onpointerdown = (e) => this.pressHandCard(row, e);
    row.onpointermove = (e) => this.dragHandCard(e);
    row.onpointerup = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointer) return;
      this.cancelDrag();
      if (!d.lifted) return this.showHandCard(this.hand[d.from]);
      if (d.to === TO_DECK) this.remove(this.hand[d.from]);
      else this.drop(d.from, d.to);
    };
    row.onpointercancel = () => {
      this.cancelDrag();
      this.render();
    };
    row.onkeydown = (e) => this.stepHandCard(e);
  }

  /** A press on a hand card that can move starts a drag (not yet lifted). */
  private pressHandCard(row: HTMLElement, e: PointerEvent) {
    const card = pressed(e, ".deck-card");
    if (!card || this.drag) return;
    e.preventDefault();
    row.setPointerCapture(e.pointerId);
    const from = Number(card.dataset.slot);
    this.drag = { from, to: from, pointer: e.pointerId, x: e.clientX, y: e.clientY, lifted: false, ghost: null };
  }

  /** The card lifts once the press has travelled far enough; its ghost
   * follows the pointer and the hand previews the slot it would drop in,
   * or, held over the deck, the hand without it. */
  private dragHandCard(e: PointerEvent) {
    const d = this.drag;
    // The card points lesson's card is pressed, never moved.
    if (!d || !travelled(d, e) || this.lesson === "points") return;
    if (!d.lifted) this.lift(d);
    follow(d.ghost!, e);
    const to = this.overDeck(d, e.clientX, e.clientY) ? TO_DECK : this.slotAt(e.clientX, e.clientY);
    if (to === d.to) return;
    d.to = to;
    this.preview(d);
  }

  /** The left and right arrow keys move the focused card one slot over. */
  private stepHandCard(e: KeyboardEvent) {
    const card = (e.target as HTMLElement).closest<HTMLButtonElement>(".deck-card");
    const step = ARROW_STEPS.get(e.key) ?? 0;
    if (!card || !step) return;
    e.preventDefault();
    const from = Number(card.dataset.slot), to = from + step;
    if (to < 0 || to >= this.hand.length) return;
    this.drop(from, to);
    el("deck-hand").querySelector<HTMLButtonElement>(`[data-slot="${to}"]`)?.focus();
  }

  private bindDeck() {
    document.querySelectorAll<HTMLButtonElement>("[data-buy-cards]").forEach((b) => (b.onclick = () => this.buyCards(Number(b.dataset.buyCards) as CardBuyCount)));
    // From the keyboard (a pointer's press shows it on release).
    document.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((b) => (b.onclick = (e) => {
      if (e.detail === 0) this.showDeckCard(b.dataset.add as CardId);
    }));
    document.querySelectorAll<HTMLButtonElement>("[data-info]").forEach((b) => (b.onclick = () => this.showHandCard(b.dataset.info as CardId)));
    this.bindDeckDrag();
    document.querySelectorAll<HTMLButtonElement>("[data-return]").forEach((b) => (b.onclick = () => this.change(this.ctx.game.deck.remove(b.dataset.return as CardId))));
    const note = document.getElementById("deck-add-note");
    if (note) note.onclick = () => {
      this.ctx.game.save.tutorials.addCard = true;
      this.change(true);
      this.ctx.update();
    };
  }

  /** The card leaves its slot and a ghost of it follows the pointer. */
  private lift(d: Drag) {
    d.lifted = true;
    el("deck-hand").classList.add("dragging");
    d.ghost = ghostOf(el("deck-hand").querySelector<HTMLElement>(`[data-slot="${d.from}"]`)!);
    this.preview(d);
  }

  /** Shows the hand as it would be with the card dropped in `d.to`, or
   * returned to the deck, which lights up as where it would go. */
  private preview(d: Drag) {
    const hand = this.hand, toDeck = d.to === TO_DECK;
    el("deck-hand").innerHTML = toDeck ? this.slotsHtml(hand.filter((_, i) => i !== d.from)) : this.slotsHtml(moveCard(hand, d.from, d.to), d.to);
    document.querySelector(".deck-reserve")?.classList.toggle("drop-target", toDeck);
  }

  /** Whether (x, y) is over the open deck, and the dragged card can go back
   * to it (as its X would return it). */
  private overDeck(d: Drag, x: number, y: number) {
    const deck = document.querySelector<HTMLElement>(".deck-reserve.open"), id = this.hand[d.from];
    if (!deck || !this.removable(id)) return false;
    const box = deck.getBoundingClientRect();
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  }

  /** The slot whose middle is nearest (x, y), among the slots holding
   * cards (a big hand wraps onto a second row). */
  private slotAt(x: number, y: number) {
    const slots = Array.from(el("deck-hand").querySelectorAll<HTMLElement>(".deck-slot")).slice(0, this.hand.length);
    let best = 0, bestGap = Infinity;
    slots.forEach((slot, i) => {
      const box = slot.getBoundingClientRect(), gap = Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2));
      if (gap < bestGap) [best, bestGap] = [i, gap];
    });
    return best;
  }

  private cancelDrag() {
    this.drag?.ghost?.remove();
    this.drag = null;
    this.badgeDrag?.ghost?.remove();
    this.badgeDrag = null;
    document.querySelectorAll(".badge-target").forEach((t) => t.classList.remove("badge-target"));
    this.deckDrag?.ghost?.remove();
    this.deckDrag = null;
    document.getElementById("deck-hand")?.classList.remove("dragging");
    document.querySelector(".deck-reserve")?.classList.remove("drop-target");
  }

  /** Dragging a deck card onto a hand slot puts it there (`placeInHand`);
   * a press that never lifts it shows its details, as its click does from
   * the keyboard (the captured pointer's click lands on the grid). */
  private bindDeckDrag() {
    const grid = document.querySelector<HTMLElement>(".deck-grid");
    if (!grid) return;
    grid.onpointerdown = (e) => this.pressDeckCard(grid, e);
    grid.onpointermove = (e) => this.dragDeckCard(grid, e);
    grid.onpointerup = (e) => {
      const d = this.deckDrag;
      if (!d || e.pointerId !== d.pointer) return;
      this.cancelDrag();
      if (!d.lifted) return this.showDeckCard(d.card);
      if (d.to === null) return this.render();
      const placed = this.ctx.game.deck.place(d.card, d.to, this.kind);
      if (placed) this.meet(d.card);
      this.change(placed);
    };
    grid.onpointercancel = () => {
      const lifted = this.deckDrag?.lifted;
      this.cancelDrag();
      if (lifted) this.render();
    };
  }

  /** A press on a deck card starts a drag (not yet lifted). */
  private pressDeckCard(grid: HTMLElement, e: PointerEvent) {
    const card = pressed(e, ".deck-add");
    if (!card || this.drag || this.deckDrag) return;
    e.preventDefault();
    grid.setPointerCapture(e.pointerId);
    this.deckDrag = { card: card.dataset.add as CardId, to: null, pointer: e.pointerId, x: e.clientX, y: e.clientY, lifted: false, ghost: null };
  }

  /** Once lifted, a ghost of the deck card follows the pointer toward the
   * hand, which previews the slot it would drop on. */
  private dragDeckCard(grid: HTMLElement, e: PointerEvent) {
    const d = this.deckDrag;
    if (!d || !travelled(d, e) || this.lesson === "points") return;
    if (!d.lifted) {
      d.lifted = true;
      el("deck-hand").classList.add("dragging");
      d.ghost = ghostOf(grid.querySelector<HTMLElement>(`[data-add="${d.card}"]`)!);
    }
    follow(d.ghost!, e);
    const to = this.deckSlotAt(d.card, e.clientX, e.clientY);
    if (to === d.to) return;
    d.to = to;
    this.previewPlace(d);
  }

  /** Shows the hand as it would be with the deck card dropped on `d.to`. */
  private previewPlace(d: DeckDrag) {
    const hand = this.hand, next = d.to === null ? null : placeCard(hand, d.card, d.to, this.slots);
    el("deck-hand").innerHTML = next ? this.slotsHtml(next, next.indexOf(d.card)) : this.slotsHtml(hand);
  }

  /** The hand slot a deck card held at (x, y) would drop on: the nearest
   * one, empty slots too, while the pointer is within a slot's height of
   * the hand; null elsewhere, or over STAIRS in a full hand. */
  private deckSlotAt(card: CardId, x: number, y: number) {
    const slots = this.slots;
    const boxes = Array.from(el("deck-hand").querySelectorAll<HTMLElement>(".deck-slot")).slice(0, slots).map((s) => s.getBoundingClientRect());
    let best: number | null = null, bestGap = Infinity;
    boxes.forEach((box, i) => {
      if (!near(box, x, y)) return;
      const gap = Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2));
      if (gap < bestGap) [best, bestGap] = [i, gap];
    });
    return best !== null && placeCard(this.hand, card, best, slots) ? best : null;
  }

  private bindBadges() {
    const section = document.querySelector<HTMLElement>(".deck-badges");
    if (!section) return;
    section.querySelectorAll<HTMLButtonElement>("[data-draw]").forEach((b) => (b.onclick = () => this.draw(Number(b.dataset.draw) as DrawCount)));
    section.querySelectorAll<HTMLButtonElement>("[data-detach]").forEach((b) => (b.onclick = () => this.change(this.ctx.game.badges.detach(b.dataset.detach as BadgeId))));
    const grid = section.querySelector<HTMLElement>(".badge-grid");
    if (!grid) return;
    grid.onpointerdown = (e) => this.pressToken(grid, e);
    grid.onpointermove = (e) => this.dragToken(e);
    grid.onpointerup = (e) => {
      const d = this.badgeDrag;
      if (!d || e.pointerId !== d.pointer) return;
      this.cancelDrag();
      if (!d.lifted) return this.showBadge(d.badge);
      if (d.card) this.attachToken(d.badge, d.card);
    };
    grid.onpointercancel = () => this.cancelDrag();
    // From the keyboard, Enter or Space on a token shows what it does.
    grid.onkeydown = (e) => {
      const token = (e.target as HTMLElement).closest<HTMLButtonElement>(".badge-pick");
      if (!token || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      this.showBadge(token.dataset.badge as BadgeId);
    };
  }

  /** Attaches badge `id` to `card`, or, when a badge there conflicts with
   * it, says which and why instead. */
  private attachToken(id: BadgeId, card: CardId) {
    const clash = this.ctx.game.badges.conflict(id, card);
    if (!clash) {
      const attached = this.ctx.game.badges.attach(id, card);
      if (attached) this.meet(card);
      return this.change(attached);
    }
    const name = (b: BadgeId) => `<b>${escapeHtml(BADGES[b].name)}</b>`;
    const why = BADGES[id].kind === "gate"
      ? "One lets its card act only while you hold fewer keys of that colour than it says, the other only while you hold at least as many as it says, so they can't work together."
      : "Effective makes its card's target stronger and Dampen makes it weaker, so they can't work together.";
    showHelp(this.ctx, "BADGES", "Badges in conflict", `<p>${name(id)} and ${name(clash)} on ${CARDS[card].name} can't be used together.</p><p class="hint">${why}</p>`);
  }

  /** A press on a token starts a drag (not yet lifted). */
  private pressToken(grid: HTMLElement, e: PointerEvent) {
    const token = pressed(e, ".badge-pick");
    if (!token || this.drag || this.deckDrag || this.badgeDrag) return;
    e.preventDefault();
    grid.setPointerCapture(e.pointerId);
    this.badgeDrag = { badge: token.dataset.badge as BadgeId, card: null, pointer: e.pointerId, x: e.clientX, y: e.clientY, lifted: false, ghost: null };
  }

  /** Once lifted, the token's ghost follows the pointer, and the card under
   * it (in the hand or the deck) lights up as where it would attach. */
  private dragToken(e: PointerEvent) {
    const d = this.badgeDrag;
    if (!d || !travelled(d, e)) return;
    if (!d.lifted) {
      d.lifted = true;
      d.ghost = ghostOf(document.querySelector<HTMLElement>(`.badge-pick[data-badge="${d.badge}"]`)!);
      d.ghost.classList.add("badge-ghost");
    }
    follow(d.ghost!, e);
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-badge-card]") ?? null;
    const under = (over?.dataset.badgeCard as CardId | undefined) ?? null;
    // Only a card the badge can sit on lights up (More Enemies: monster cards).
    const card = under && fitsCard(d.badge, under) ? under : null;
    if (card === d.card) return;
    d.card = card;
    document.querySelectorAll(".badge-target").forEach((t) => t.classList.remove("badge-target"));
    if (card) document.querySelectorAll(`[data-badge-card="${card}"]`).forEach((t) => t.classList.add("badge-target"));
  }

  /** Buys cards for their Gems (asking for Gems when short), then shows
   * what each bought. */
  private buyCards(count: CardBuyCount) {
    const { game } = this.ctx, buys = game.cardBuys.buy(count);
    if (buys === "short") return askForGems(this.ctx);
    if (buys === "full") return;
    this.ctx.save();
    this.ctx.update();
    this.render();
    // The same purchase once more, from the last screen (which asks for Gems when short).
    const again = game.cardBuys.left >= count ? { count, gems: CARD_BUY_GEMS[count], affordable: () => game.free || game.save.gems >= CARD_BUY_GEMS[count], buy: () => this.buyCards(count) } : undefined;
    revealBuys(buys, game.save.settings.reduceMotion, again);
  }

  /** Draws badges for their Gems (asking for Gems when short), then
   * shows what was drawn. */
  private draw(count: DrawCount) {
    const { game } = this.ctx;
    if (!game.free && game.save.gems < DRAW_GEMS[count]) return askForGems(this.ctx);
    const draws = game.badges.draw(count);
    if (!draws) return;
    this.ctx.save();
    this.ctx.update();
    this.render();
    // The same purchase once more, from the last screen (which asks for Gems when short).
    const again = { count, gems: DRAW_GEMS[count], affordable: () => game.free || game.save.gems >= DRAW_GEMS[count], buy: () => this.draw(count) };
    revealDraws(draws, game.save.settings.reduceMotion, (id) => game.save.badges.owned[id]?.pick ?? 0, again);
  }

  /** A badge's details: what it does at its level, its copies toward the
   * next, the card it is on, and for a gate the threshold it checks, chosen
   * on a slider among those its level opened (no slider while level 1
   * opens only one). */
  private showBadge(id: BadgeId) {
    const { game } = this.ctx, owned = game.save.badges.owned[id];
    if (!owned) return;
    const def = BADGES[id], level = badgeLevel(owned.copies), on = cardWith(game.save.badges, id);
    const rarity = RARITIES[def.rarity], progress = progressText(owned.copies);
    const gate = def.kind !== "gate" ? ""
      : level > 1
        ? `<label class="badge-slider">Threshold<input type="range" id="badge-pick" min="0" max="${level - 1}" step="1" value="${owned.pick}"><output id="badge-pick-value">${this.thresholdText(id, owned.pick)}</output></label><small class="badge-slider-note">Each level opens a tighter threshold.</small>`
        : `<small class="badge-slider-note">Level up to open tighter thresholds.</small>`;
    const modal = this.ctx.modal;
    modal.innerHTML = `<small><span style="color:${rarity.color}">${rarity.displayName.toUpperCase()}</span> · LEVEL ${level}</small><h2>${def.name}</h2><div class="badge-detail">${tokenHtml(id, level, "big")}</div><p id="badge-detail-text">${badgeText(id, level, owned.pick)}</p>${gate}<p id="badge-detail-levels">${badgeLevelsHtml(id, level, owned.pick)}</p><p class="badge-detail-meta">${progress === "MAX" ? "Top level reached." : `${progress} copies toward level ${level + 1}.`}${on ? ` On ${CARDS[on].name}.` : " On no card: drag it onto one."}</p><button class="wide" id="badge-detail-ok">Done</button>`;
    const slider = modal.querySelector<HTMLInputElement>("#badge-pick");
    if (slider) slider.oninput = () => {
      const pick = Number(slider.value);
      if (!game.badges.setPick(id, pick)) return;
      modal.querySelector("#badge-pick-value")!.textContent = this.thresholdText(id, pick);
      modal.querySelector("#badge-detail-text")!.textContent = badgeText(id, level, pick);
      modal.querySelector("#badge-detail-levels")!.innerHTML = badgeLevelsHtml(id, level, pick);
      this.ctx.save();
    };
    modal.querySelector<HTMLButtonElement>("#badge-detail-ok")!.onclick = () => modal.close();
    modal.addEventListener("close", () => {
      if (this.showing) this.render();
    }, { once: true });
    modal.showModal();
  }

  /** A gate's threshold as the slider shows it: "HP < 75%", "GK < 4", "GK ≥ 2". */
  private thresholdText(id: BadgeId, pick: number) {
    const v = badgeValue(id, BADGES[id].values.length, pick);
    return `${BADGES[id].name} ${v}${id === "hpGate" ? "%" : ""}`;
  }

  /** A hand card's details, with the offers to return it to the deck when
   * its X would, and to move it to the other hand when its switch would. */
  private showHandCard(id: CardId) {
    if (this.lesson === "points") return this.openLessonTree(id);
    if (this.meet(id)) this.render();
    const { save, deck } = this.ctx.game, manual = deck.handOf(id) === "manual";
    const actions = this.removable(id) ? [{ label: "Return to deck", run: () => this.remove(id) }] : [];
    if (this.showsKinds && deck.canSwitch(id)) actions.push({ label: `Move to ${manual ? "Auto" : "Manual"} hand`, run: () => this.switch(id) });
    showCard(id, this.ctx.game.cardText(id), save.settings.reduceMotion, manual ? "IN YOUR MANUAL HAND" : "IN YOUR HAND", { ...this.treeDetails(id, actions), note: id === "stairs" ? "STAIRS always stays in your hand." : undefined });
  }

  /** A card's level and rarity, and the offer to open the
   * tree (first) beside `actions`, for its details. */
  private treeDetails(id: CardId, actions: CardAction[]): CardDetails {
    const { save, cardTrees } = this.ctx.game, levels = save;
    if (!CARD_TREES[id]) return { levels, actions };
    const left = cardTrees.pointsLeft(id);
    const tree = { label: `Upgrade tree<small><b>${left}</b> point${left === 1 ? "" : "s"} available</small>`, run: () => this.openTree(id) };
    return { levels, actions: [tree, ...actions] };
  }

  /** A deck card's details, with the offer to add it to the hand while
   * there is room. */
  private showDeckCard(id: CardId) {
    if (this.lesson === "points") return this.openLessonTree(id);
    if (this.meet(id)) this.render();
    const { save, deck } = this.ctx.game, kind = this.kind, full = deck.full(kind), yours = kind === "manual" ? "Manual hand" : "hand";
    const actions = full ? [] : [{ label: `Add to ${yours}`, run: () => this.change(deck.add(id, kind)) }];
    showCard(id, this.ctx.game.cardText(id), save.settings.reduceMotion, "IN YOUR DECK", { ...this.treeDetails(id, actions), note: full ? `Your ${yours} is full: drag this card onto one in your ${yours} to swap it.` : undefined });
  }

  /** In the card points lesson, pressing the card it points at opens that
   * card's tree at once (any other card can't be pressed). */
  private openLessonTree(id: CardId) {
    if (id !== this.pointsTarget) return;
    this.meet(id);
    this.openTree(id);
  }

  /** Asks before spending Gems on the next slot of the hand shown. */
  private buySlot() {
    const { game } = this.ctx, kind = this.kind, price = game.deck.slotGems(kind);
    if (price === null) return;
    if (!game.free && game.save.gems < price) return askForGems(this.ctx);
    const manual = kind === "manual", slots = this.slots + 1;
    this.ctx.confirm(
      {
        title: manual ? "Buy a Manual hand slot?" : "Buy a hand slot?",
        body: `Spend ${gemIcon()} <b>${price}</b> on one more ${manual ? "Manual hand" : "hand"} slot: your ${manual ? "Manual hand" : "hand"} will hold ${slots} card${slots === 1 ? "" : "s"}.`,
        label: `Buy · ${gemIcon()} <b>${price}</b>`,
        cancel: "Cancel",
      },
      () => {
        this.change(game.deck.buySlot(kind));
        this.ctx.update();
      },
    );
  }

  /** Saves and redraws after a change to the hand or its badges. */
  private change(changed: boolean) {
    if (changed) this.ctx.save();
    this.render();
  }

  /** Commits a move; the first move of STAIRS finishes the order tutorial. */
  private drop(from: number, to: number) {
    const save = this.ctx.game.save;
    const moved = this.hand[from];
    if (from === to || !this.ctx.game.deck.arrange(from, to, this.kind)) return this.render();
    this.meet(moved);
    const taught = this.lesson === "order" && moved === "stairs";
    if (taught) save.tutorials.deck = true;
    this.change(true);
    if (!taught) return;
    this.ctx.update();
    this.praise("COMBAT STANCE", "Well arranged!", "Your hand will now try its cards in this order. Each run takes the hand as you leave it here, so try different orders and see which carries you farthest.");
  }

  /** Moves a hand card to the other hand. */
  private switch(id: CardId) {
    if (this.ctx.game.deck.switch(id)) this.meet(id);
    this.change(true);
  }

  /** Returns a hand card to the deck; the first one finishes the remove tutorial. */
  private remove(id: CardId) {
    const save = this.ctx.game.save;
    const taught = this.lesson === "remove";
    if (!this.ctx.game.deck.remove(id)) return;
    if (taught) save.tutorials.removeCard = true;
    this.change(true);
    if (!taught) return;
    this.ctx.update();
    this.praise("BUILDOUT", "Nicely done!", "With that card set aside, your runs will leave its targets alone. Try out different hands to find the one that suits each climb.");
  }

  /** A dialog praising what the player just did, closed by a press anywhere
   * on it; the page then shows the next step, if any. */
  private praise(small: string, title: string, text: string) {
    const modal = this.ctx.modal;
    modal.innerHTML = `<small>${small}</small><h2>${title}</h2><p>${text}</p><button class="wide" id="deck-praise-ok">Onward</button>`;
    modal.classList.add("dismiss-anywhere");
    modal.onclick = () => modal.close();
    modal.addEventListener("close", () => {
      modal.onclick = null;
      modal.classList.remove("dismiss-anywhere");
      if (this.showing) this.render();
    }, { once: true });
    modal.showModal();
  }
}

/** `text` with its first letter capitalised. */
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
