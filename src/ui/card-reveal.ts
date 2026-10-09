import { CARDS, cardText, type CardId } from "../cards.ts";
import type { UpgradeId } from "../config.ts";
import { cardArt } from "./dom.ts";

/** What a card's reveal says over and under it: the line above its name,
 * the hint at the foot, and the card button's label. */
type Words = { kicker: string; hint: string; label: string };

/** The card over the screen, green rays turning behind it, with what it
 * does written underneath. Pressing the card closes it. */
function cardLayer(id: CardId, upgrades: Record<UpgradeId, number>, classes: string, words: Words, extra = "") {
  const card = CARDS[id];
  // Rays celebrate a card just obtained; its details, reviewed later, show none.
  const rays = classes.includes(" details") ? "" : `<div class="card-reveal-rays" aria-hidden="true"></div>`;
  const layer = document.createElement("div");
  layer.className = `card-reveal${classes}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", words.label);
  layer.innerHTML = `<div class="card-reveal-stage">${rays}<button type="button" class="card-reveal-card" id="card-reveal-card" aria-label="${card.name}: ${words.hint.toLowerCase()}">${cardArt(id, card.name)}</button></div><div class="card-reveal-text"><small>${words.kicker}</small><b>${card.name}</b><p>${cardText(id, upgrades)}</p>${extra}<span>${words.hint}</span></div>`;
  (document.querySelector("#app") ?? document.body).append(layer);
  const button = layer.querySelector<HTMLButtonElement>("#card-reveal-card")!;
  button.onclick = () => layer.remove();
  button.focus({ preventScroll: true });
  return layer;
}

/** Celebrates a card joining the deck: it rises from below the screen to
 * its middle, green rays turning behind it, with what it does written
 * underneath. Pressing the card dismisses it. With Reduce motion on, the
 * card and rays appear still. */
export function revealCard(id: CardId, upgrades: Record<UpgradeId, number>, reduceMotion: boolean) {
  cardLayer(id, upgrades, reduceMotion ? " still" : "", { kicker: "NEW CARD FOR YOUR DECK", hint: "Press the card to continue", label: `New card: ${CARDS[id].name}` });
}

/** What a card's details offer to do with it, such as adding it to the hand. */
export type CardAction = { label: string; run: () => void };

/** A card's details, as its reveal showed them, for the Deck page: the
 * card pops up over the rays (still with Reduce motion), with where it is
 * (`kicker`), what it does, a `note`, and the `action` on offer. Pressing
 * the card, outside it or Escape closes it, as the action does once run. */
export function showCard(id: CardId, upgrades: Record<UpgradeId, number>, reduceMotion: boolean, kicker: string, action?: CardAction, note?: string) {
  const extra = (note ? `<em class="card-reveal-note">${note}</em>` : "")
    + (action ? `<button type="button" class="card-reveal-action" id="card-reveal-action">${action.label}</button>` : "");
  const back = document.activeElement as HTMLElement | null;
  const layer = cardLayer(id, upgrades, ` details${reduceMotion ? " still" : ""}`, { kicker, hint: "Press anywhere to close", label: CARDS[id].name }, extra);
  const close = () => {
    layer.remove();
    document.removeEventListener("keydown", onKey, true);
    if (back?.isConnected) back.focus({ preventScroll: true });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    close();
  };
  document.addEventListener("keydown", onKey, true);
  layer.onclick = (e) => {
    const pressed = (e.target as HTMLElement).closest("#card-reveal-action");
    close();
    if (pressed) action!.run();
  };
}
