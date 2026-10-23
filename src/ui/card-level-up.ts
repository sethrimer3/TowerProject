import { CARDS, type CardId } from "../cards.ts";
import type { Game } from "../state.ts";
import { cardArt, el, pointsIcon } from "./dom.ts";

/** How long one card's level-up plays: the training point icon over the
 * card 1s, rising and fading 1s, then the glow (or the ghost card) fading
 * 1s; its keyframes are in `style.css` (`card-level-up`). */
export const CARD_LEVEL_UP_MS = 3000;

/** A card's level-up playing: the card, where it plays (over the card in
 * the hand, or as a ghost of it over the board's top left), its layer and
 * when it began. */
type Playing = { card: CardId; inHand: boolean; layer: HTMLElement; at: number };

/** The hand's card level-ups (`game.cardLevelUps`), one after another:
 * over a card in view in the hand, a golden glow with the training point
 * icon at its centre, which rises and fades; for a card out of view, a
 * ghost of it at 75% transparency, a golden glow behind it, floating over
 * the board's top left with the same icon. Run each board frame, so they
 * wait while a page covers the board. */
export class CardLevelUps {
  private playing: Playing | null = null;

  constructor(private game: Game) {}

  frame(now = performance.now()) {
    const p = this.playing;
    if (p && now - p.at >= CARD_LEVEL_UP_MS) {
      p.layer.remove();
      this.playing = null;
    }
    if (!this.playing) this.start(now);
    if (this.playing?.inHand) this.place(this.playing);
  }

  /** Begins the next level-up waiting, if any. */
  private start(now: number) {
    const next = this.game.cardLevelUps.shift();
    if (!next) return;
    const inHand = !!this.handCard(next.card);
    const layer = document.createElement("div");
    // Reduce motion (`html.reduce-motion`) keeps the icon from rising.
    layer.className = `card-level-up ${inHand ? "in-hand" : "ghost"}`;
    layer.setAttribute("aria-hidden", "true");
    const ghost = inHand ? "" : `<div class="card-level-up-ghost">${cardArt(next.card, CARDS[next.card].name)}</div>`;
    layer.innerHTML = `<div class="card-level-up-glow"></div>${ghost}<div class="card-level-up-icon">${pointsIcon()}</div>`;
    el("board").append(layer);
    this.playing = { card: next.card, inHand, layer, at: now };
    if (inHand) this.place(this.playing);
    else this.placeGhost(layer);
  }

  /** Card `id` in the hand, when the hand shows and the card lies wholly
   * inside its row (a hand wider than the screen scrolls sideways). */
  private handCard(id: CardId) {
    const row = document.getElementById("hand");
    const card = row?.querySelector<HTMLElement>(`.hand-card[data-card="${id}"]`);
    if (!row || !card || !row.offsetParent) return null;
    const r = row.getBoundingClientRect(), c = card.getBoundingClientRect();
    return c.width > 0 && c.left >= r.left - 1 && c.right <= r.right + 1 ? card : null;
  }

  /** Keeps a hand card's glow over the card, which the hand may redraw or
   * scroll while it plays. */
  private place(p: Playing) {
    const card = document.querySelector<HTMLElement>(`#hand .hand-card[data-card="${p.card}"]`);
    if (!card) return;
    const c = card.getBoundingClientRect(), s = p.layer.style;
    s.left = `${c.left}px`;
    s.top = `${c.top}px`;
    s.width = `${c.width}px`;
    s.height = `${c.height}px`;
  }

  /** A ghost card's place, just inside the board's top left. */
  private placeGhost(layer: HTMLElement) {
    const canvas = el("world").getBoundingClientRect(), width = Math.max(48, Math.min(84, canvas.width * 0.18));
    const s = layer.style;
    s.left = `${canvas.left + 10}px`;
    s.top = `${canvas.top + 10}px`;
    s.width = `${width}px`;
    s.height = `${(width * 4) / 3}px`;
  }
}
