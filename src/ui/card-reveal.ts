import { CARDS, cardBonusLines, type CardId } from "../cards/cards.ts";
import { cardArt } from "./dom.ts";
import { cardLevelHtml, cardLevelLines, cardXpBarHtml } from "./card-level-marks.ts";
import type { TreeSave } from "../cards/trees.ts";

/** What a card's reveal says over and under it: the line above its name,
 * the hint at the foot, and the card button's label. */
type Words = { kicker: string; hint: string; label: string };

/** What card `id` gives while held, a line each under what it does: a
 * Supply Chest's chance light blue, an Equipment Chest's purple. */
function bonusHtml(id: CardId) {
  const lines = cardBonusLines(id);
  return lines.length ? `<p class="card-bonus">${lines.map((l) => `<i class="bonus-${l.tone}">${l.text}</i>`).join("")}</p>` : "";
}

/** The card over the screen, green rays turning behind it, with what it
 * does written underneath, and with `levels` given, the card's XP toward
 * its next level on the rule above its name, its rarity and level on it,
 * and its rarity, level and progress under its name. Pressing
 * the card closes it. */
function cardLayer(id: CardId, text: string, classes: string, words: Words, extra = "", levels?: CardLevels) {
  const card = CARDS[id];
  // Rays celebrate a card just obtained; its details, reviewed later, show none.
  const rays = classes.includes(" details") ? "" : `<div class="card-reveal-rays" aria-hidden="true"></div>`;
  const layer = document.createElement("div");
  layer.className = `card-reveal${classes}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", words.label);
  layer.innerHTML = `<div class="card-reveal-stage">${rays}<button type="button" class="card-reveal-card" id="card-reveal-card" aria-label="${card.name}: ${words.hint.toLowerCase()}">${cardArt(id, card.name)}${levels ? cardXpBarHtml(levels, id) + cardLevelHtml(levels, id) : ""}</button></div><div class="card-reveal-text"><small>${words.kicker}</small><b>${card.name}</b>${levels ? cardLevelLines(levels, id) : ""}<p>${text}</p>${bonusHtml(id)}${extra}<span>${words.hint}</span></div>`;
  (document.querySelector("#app") ?? document.body).append(layer);
  // A tap that opened the layer on its release still clicks after it, onto
  // the layer: only a press begun on the layer (or a key) closes it.
  let pressedHere = false;
  layer.addEventListener("pointerdown", () => (pressedHere = true), true);
  layer.addEventListener("click", (e) => {
    if (!pressedHere && e.detail !== 0) e.stopImmediatePropagation();
  }, true);
  const button = layer.querySelector<HTMLButtonElement>("#card-reveal-card")!;
  button.onclick = () => layer.remove();
  button.focus({ preventScroll: true });
  return layer;
}

/** Celebrates a card joining the deck: it rises from below the screen to
 * its middle, green rays turning behind it, with what it does written
 * underneath. Pressing the card dismisses it. With Reduce motion on, the
 * card and rays appear still. */
export function revealCard(id: CardId, text: string, reduceMotion: boolean) {
  cardLayer(id, text, reduceMotion ? " still" : "", { kicker: "NEW CARD FOR YOUR DECK", hint: "Press the card to continue", label: `New card: ${CARDS[id].name}` });
}

/** What a card's optional level marks read. */
type CardLevels = Pick<TreeSave, "cardXp" | "cardBuys">;
