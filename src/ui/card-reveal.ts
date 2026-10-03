import { CARDS, cardText, type CardId } from "../cards.ts";
import type { UpgradeId } from "../config.ts";
import { cardArt } from "./dom.ts";

/** Celebrates a card joining the deck: it rises from below the screen to
 * its middle, green rays turning behind it, with what it does written
 * underneath. Pressing the card dismisses it. With Reduce motion on, the
 * card and rays appear still. */
export function revealCard(id: CardId, upgrades: Record<UpgradeId, number>, reduceMotion: boolean) {
  const card = CARDS[id];
  const layer = document.createElement("div");
  layer.className = `card-reveal${reduceMotion ? " still" : ""}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", `New card: ${card.name}`);
  layer.innerHTML = `<div class="card-reveal-stage"><div class="card-reveal-rays" aria-hidden="true"></div><button type="button" class="card-reveal-card" id="card-reveal-card" aria-label="${card.name}: continue">${cardArt(id, card.name)}</button></div><div class="card-reveal-text"><small>NEW CARD FOR YOUR DECK</small><b>${card.name}</b><p>${cardText(id, upgrades)}</p><span>Press the card to continue</span></div>`;
  (document.querySelector("#app") ?? document.body).append(layer);
  const button = layer.querySelector<HTMLButtonElement>("#card-reveal-card")!;
  button.onclick = () => layer.remove();
  button.focus({ preventScroll: true });
}
