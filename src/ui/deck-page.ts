import { askForGems } from "./dialogs.ts";
import { CARDS, cardText, deckCards, handSlots, moveCard, nextHandSlotGems, placeCard, type CardId } from "../cards.ts";
import type { AppContext } from "./app.ts";
import { cardArt, el, gemIcon, POINTER_SVG } from "./dom.ts";

/** How far a press must travel before it lifts the card. */
const DRAG_START_PX = 4;

/** A card being dragged along the hand row: the slot it left, the slot it
 * would drop into, and the ghost that follows the pointer. */
type Drag = { from: number; to: number; pointer: number; x: number; y: number; lifted: boolean; ghost: HTMLElement | null };
/** A deck card being dragged to the hand: the hand slot it would drop on
 * (null while it is away from the hand, or over STAIRS in a full hand). */
type DeckDrag = { card: CardId; to: number | null; pointer: number; x: number; y: number; lifted: boolean; ghost: HTMLElement | null };

const X_SVG = `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const CHECK_SVG = `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.4L4.2 7.6L8.2 2.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ARROW_STEPS = new Map([["ArrowLeft", -1], ["ArrowRight", 1]]);

/** Whether a drag's pointer is the one pressed and, until it lifts, has
 * travelled far enough to lift the card. */
const travelled = (d: Drag | DeckDrag, e: PointerEvent) =>
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
 * (Combat Stance); `remove`, taking a card out of the hand with its X, and
 * `add`, the note on adding cards from the deck (both Buildout). */
type Lesson = "order" | "remove" | "add" | null;

/** The Deck page: the hand's slots along the top (with Larger Hand, the
 * next one to buy with Gems after them), whose cards Hand
 * Ordering lets the player drag into a new order before a run, and the
 * deck's cards below, which Buildout lets the player add to the hand
 * or take out of it (STAIRS always stays). Each skill's first visit
 * teaches it; while a step waits on the player, the page points at what to
 * do and nothing else on it or the tab row can be used. */
export class DeckPage {
  private drag: Drag | null = null;
  private deckDrag: DeckDrag | null = null;
  private showing = false;

  constructor(private ctx: AppContext) {}

  private get lesson(): Lesson {
    const { tutorials, upgrades } = this.ctx.game.save;
    if (!tutorials.deck) return "order";
    if (!upgrades.combatStance) return null;
    if (!tutorials.removeCard) return "remove";
    return tutorials.addCard ? null : "add";
  }

  /** Whether a Deck tutorial is waiting on the player's action, which keeps
   * them on this page. */
  get teaching() {
    return this.showing && this.waitsOnPlayer;
  }

  /** Whether the lesson shown waits on the player's action. */
  private get waitsOnPlayer() {
    return this.lesson === "order" || this.lesson === "remove";
  }

  /** Called whenever the tab changes, so `teaching` knows the page is open. */
  shown(open: boolean) {
    this.showing = open;
    if (!open) this.cancelDrag();
  }

  /** The card the remove tutorial points at: MONSTER, or the last card
   * besides STAIRS if the hand has no MONSTER. */
  private get removeTarget(): CardId | undefined {
    const hand = this.ctx.game.save.hand;
    return hand.includes("monster") ? "monster" : hand.filter((c) => c !== "stairs").at(-1);
  }

  render() {
    const save = this.ctx.game.save;
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
        : "";
    el("deck").innerHTML = `<div class="deck-page">
      <section class="deck-hand-area" aria-labelledby="deck-hand-label">
        <h3 id="deck-hand-label" class="deck-label">Hand</h3>
        <div class="deck-hand" id="deck-hand" role="list" aria-label="Hand, in the order its cards are tried">${this.slotsHtml(save.hand)}</div>
        ${tip}
      </section>
      ${save.upgrades.combatStance && lesson !== "remove" ? this.deckHtml(lesson === "add") : this.lockedDeckHtml(!!save.upgrades.combatStance)}
    </div>`;
    this.bindHand();
    this.bindDeck();
  }

  /** The deck's cards on a grid: those in the hand greyed with a check that
   * returns them, the rest ready to add. */
  private deckHtml(note: boolean) {
    const hand = this.ctx.game.save.hand, full = hand.length >= handSlots(this.ctx.game.save);
    const cards = deckCards(this.ctx.game.save.upgrades).map((id) => {
      const name = CARDS[id].name;
      if (hand.includes(id)) {
        const stays = id === "stairs";
        const check = stays
          ? `disabled title="STAIRS always stays in your hand" aria-label="${name} is in your hand and always stays there"`
          : `title="Return ${name} to the deck" aria-label="${name} is in your hand: return it to the deck"`;
        return `<div class="deck-entry in-hand" role="listitem"><div class="deck-entry-art" title="${name}: in your hand">${cardArt(id, name)}</div><button type="button" class="deck-check" data-return="${id}" ${check}>${CHECK_SVG}</button></div>`;
      }
      // A full hand takes a card only by dragging it onto one to swap out.
      return `<div class="deck-entry" role="listitem"><button type="button" class="deck-add${full ? " full" : ""}" data-add="${id}" title="${full ? `Your hand is full: drag ${name} onto a card to swap it` : `Add ${name} to your hand, or drag it to a slot`}" aria-label="${full ? `Your hand is full: drag ${name} onto a card to swap it` : `Add ${name} to your hand`}">${cardArt(id, name)}</button></div>`;
    }).join("");
    return `<section class="deck-reserve open" aria-labelledby="deck-label">
        <h3 id="deck-label" class="deck-label">Deck</h3>
        ${note ? `<button type="button" class="deck-tip deck-note" id="deck-add-note"><b>Add cards from your deck</b><p>Press a card to add it to your hand. Cards already in your hand are greyed out: press their check to return them to the deck.</p><small>Press to dismiss</small></button>` : ""}
        <div class="deck-grid" role="list" aria-label="Your deck">${cards}</div>
      </section>`;
  }

  private lockedDeckHtml(soon: boolean) {
    return `<section class="deck-reserve" aria-label="Deck (locked)">
        <h3 class="deck-label">Deck</h3>
        <div class="deck-reserve-slots" aria-hidden="true">${"<i></i>".repeat(10)}</div>
        <p class="deck-lock"><b>Locked</b>${soon ? "Take a card out of your hand first." : "Unlock Buildout in the Inspiration tree to choose your hand's cards from here."}</p>
      </section>`;
  }

  /** The hand's slots as `hand` fills them, the dragged card's slot left
   * showing where it will land, then the next slot for sale. */
  private slotsHtml(hand: readonly CardId[], held: number | null = null) {
    return this.cardSlotsHtml(hand, held) + this.slotForSaleHtml();
  }

  /** The next hand slot, offered for its Gems, once Larger Hand is owned. */
  private slotForSaleHtml() {
    const { save, free } = this.ctx.game, price = nextHandSlotGems(save);
    if (price === null || this.waitsOnPlayer) return "";
    const short = save.gems < price && !free;
    return `<div class="deck-slot for-sale" role="listitem"><button type="button" class="deck-buy-slot${short ? " short" : ""}" data-buy-slot title="${short ? `Needs ${price} Gems` : `Buy a hand slot for ${price} Gems`}" aria-label="Buy a hand slot for ${price} Gems"><span>+</span>${gemIcon()}<b>${price}</b></button></div>`;
  }

  private cardSlotsHtml(hand: readonly CardId[], held: number | null) {
    return Array.from({ length: handSlots(this.ctx.game.save) }, (_, i) => {
      const id = hand[i];
      return id ? this.cardSlotHtml(id, i, hand.length, i === held) : `<div class="deck-slot empty" role="listitem" aria-label="Empty slot ${i + 1}"></div>`;
    }).join("");
  }

  /** Hand slot `i` holding card `id`: the card (fixed in place while a
   * lesson points elsewhere), its X, and the lesson's pointing hand. */
  private cardSlotHtml(id: CardId, i: number, count: number, held: boolean) {
    const lesson = this.lesson, card = CARDS[id], upgrades = this.ctx.game.save.upgrades;
    const fixed = lesson === "remove" || (lesson === "order" && id !== "stairs");
    const pointed = lesson === "remove" && id === this.removeTarget;
    const x = this.removable(id) ? `<button type="button" class="deck-remove${pointed ? " shown" : ""}" data-remove="${id}" title="Return ${card.name} to the deck" aria-label="Return ${card.name} to the deck">${X_SVG}</button>` : "";
    const lessonPointer = lesson === "order" && id === "stairs" ? this.pointer("at-card") : pointed ? this.pointer("at-x") : "";
    return `<div class="deck-slot${held ? " held" : ""}" role="listitem"><button type="button" class="deck-card" data-slot="${i}" ${fixed ? "disabled" : ""} aria-label="${card.name}, slot ${i + 1} of ${count}. Drag, or press the left and right arrow keys, to move it." title="${card.name}: ${cardText(id, upgrades)}">${cardArt(id, card.name)}</button>${x}${lessonPointer}</div>`;
  }

  /** Whether a hand card wears an X: any but STAIRS once Buildout is owned,
   * outside the order lesson, and only the pointed-at one in the remove
   * lesson. */
  private removable(id: CardId) {
    const lesson = this.lesson;
    if (!this.ctx.game.save.upgrades.combatStance || id === "stairs") return false;
    if (lesson === "order") return false;
    return lesson !== "remove" || id === this.removeTarget;
  }

  /** The tutorials' pointing hand, at the card or at its X. */
  private pointer(at: string) {
    return `<span class="deck-pointer ${at}${this.ctx.game.save.settings.reduceMotion ? " still" : ""}">${POINTER_SVG}</span>`;
  }

  private bindHand() {
    const row = el("deck-hand");
    row.onclick = (e) => {
      const x = (e.target as HTMLElement).closest<HTMLButtonElement>(".deck-remove");
      if (x) this.remove(x.dataset.remove as CardId);
      if ((e.target as HTMLElement).closest(".deck-buy-slot")) this.buySlot();
    };
    row.onpointerdown = (e) => this.pressHandCard(row, e);
    row.onpointermove = (e) => this.dragHandCard(e);
    row.onpointerup = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointer) return;
      this.cancelDrag();
      if (d.lifted) this.drop(d.from, d.to);
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
   * follows the pointer and the hand previews the slot it would drop in. */
  private dragHandCard(e: PointerEvent) {
    const d = this.drag;
    if (!d || !travelled(d, e)) return;
    if (!d.lifted) this.lift(d);
    follow(d.ghost!, e);
    const to = this.slotAt(e.clientX, e.clientY);
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
    if (to < 0 || to >= this.ctx.game.save.hand.length) return;
    this.drop(from, to);
    el("deck-hand").querySelector<HTMLButtonElement>(`[data-slot="${to}"]`)?.focus();
  }

  private bindDeck() {
    document.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((b) => (b.onclick = () => this.change(this.ctx.game.deck.add(b.dataset.add as CardId))));
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

  /** Shows the hand as it would be with the card dropped in `d.to`. */
  private preview(d: Drag) {
    el("deck-hand").innerHTML = this.slotsHtml(moveCard(this.ctx.game.save.hand, d.from, d.to), d.to);
  }

  /** The slot whose middle is nearest (x, y), among the slots holding
   * cards (a big hand wraps onto a second row). */
  private slotAt(x: number, y: number) {
    const slots = Array.from(el("deck-hand").querySelectorAll<HTMLElement>(".deck-slot")).slice(0, this.ctx.game.save.hand.length);
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
    this.deckDrag?.ghost?.remove();
    this.deckDrag = null;
    document.getElementById("deck-hand")?.classList.remove("dragging");
  }

  /** Dragging a deck card onto a hand slot puts it there (`placeInHand`);
   * a press that never lifts it adds it, as its click does from the
   * keyboard (the captured pointer's click lands on the grid). */
  private bindDeckDrag() {
    const grid = document.querySelector<HTMLElement>(".deck-grid");
    if (!grid) return;
    grid.onpointerdown = (e) => this.pressDeckCard(grid, e);
    grid.onpointermove = (e) => this.dragDeckCard(grid, e);
    grid.onpointerup = (e) => {
      const d = this.deckDrag;
      if (!d || e.pointerId !== d.pointer) return;
      this.cancelDrag();
      if (!d.lifted) return this.change(this.ctx.game.deck.add(d.card));
      if (d.to === null) return this.render();
      this.change(this.ctx.game.deck.place(d.card, d.to));
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
    if (!d || !travelled(d, e)) return;
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
    const save = this.ctx.game.save, slots = handSlots(save);
    const next = d.to === null ? null : placeCard(save.hand, d.card, d.to, slots);
    el("deck-hand").innerHTML = next ? this.slotsHtml(next, next.indexOf(d.card)) : this.slotsHtml(save.hand);
  }

  /** The hand slot a deck card held at (x, y) would drop on: the nearest
   * one, empty slots too, while the pointer is within a slot's height of
   * the hand; null elsewhere, or over STAIRS in a full hand. */
  private deckSlotAt(card: CardId, x: number, y: number) {
    const save = this.ctx.game.save, slots = handSlots(save);
    const boxes = Array.from(el("deck-hand").querySelectorAll<HTMLElement>(".deck-slot")).slice(0, slots).map((s) => s.getBoundingClientRect());
    let best: number | null = null, bestGap = Infinity;
    boxes.forEach((box, i) => {
      if (!near(box, x, y)) return;
      const gap = Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2));
      if (gap < bestGap) [best, bestGap] = [i, gap];
    });
    return best !== null && placeCard(save.hand, card, best, slots) ? best : null;
  }

  /** Saves and redraws after a change to the hand. */
  /** Asks before spending Gems on the next hand slot. */
  private buySlot() {
    const { game } = this.ctx, price = nextHandSlotGems(game.save);
    if (price === null) return;
    if (!game.free && game.save.gems < price) return askForGems(this.ctx);
    this.ctx.confirm(
      {
        title: "Buy a hand slot?",
        body: `Spend ${price} Gems on one more hand slot: your hand will hold ${handSlots(game.save) + 1} cards.`,
        label: `Buy · ${price} Gems`,
        cancel: "Cancel",
      },
      () => {
        this.change(game.deck.buySlot());
        this.ctx.update();
      },
    );
  }

  private change(changed: boolean) {
    if (changed) this.ctx.save();
    this.render();
  }

  /** Commits a move; the first move of STAIRS finishes the order tutorial. */
  private drop(from: number, to: number) {
    const save = this.ctx.game.save;
    const moved = save.hand[from];
    if (from === to || !this.ctx.game.deck.arrange(from, to)) return this.render();
    const taught = this.lesson === "order" && moved === "stairs";
    if (taught) save.tutorials.deck = true;
    this.change(true);
    if (!taught) return;
    this.ctx.update();
    this.praise("COMBAT STANCE", "Well arranged!", "Your hand will now try its cards in this order. Each run takes the hand as you leave it here, so try different orders and see which carries you farthest.");
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
