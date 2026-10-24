import { CARDS, cardBonusLines, cardText, type CardId } from "../cards/cards.ts";
import type { UpgradeId } from "../config.ts";
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
function cardLayer(id: CardId, upgrades: Record<UpgradeId, number>, classes: string, words: Words, extra = "", levels?: CardLevels) {
  const card = CARDS[id];
  // Rays celebrate a card just obtained; its details, reviewed later, show none.
  const rays = classes.includes(" details") ? "" : `<div class="card-reveal-rays" aria-hidden="true"></div>`;
  const layer = document.createElement("div");
  layer.className = `card-reveal${classes}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", words.label);
  layer.innerHTML = `<div class="card-reveal-stage">${rays}<button type="button" class="card-reveal-card" id="card-reveal-card" aria-label="${card.name}: ${words.hint.toLowerCase()}">${cardArt(id, card.name)}${levels ? cardXpBarHtml(levels, id) + cardLevelHtml(levels, id) : ""}</button></div><div class="card-reveal-text"><small>${words.kicker}</small><b>${card.name}</b>${levels ? cardLevelLines(levels, id) : ""}<p>${cardText(id, upgrades)}</p>${bonusHtml(id)}${extra}<span>${words.hint}</span></div>`;
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
export function revealCard(id: CardId, upgrades: Record<UpgradeId, number>, reduceMotion: boolean) {
  cardLayer(id, upgrades, reduceMotion ? " still" : "", { kicker: "NEW CARD FOR YOUR DECK", hint: "Press the card to continue", label: `New card: ${CARDS[id].name}` });
}

/** What a card's details offer to do with it, such as adding it to the hand. */
export type CardAction = { label: string; run: () => void };

/** What the card's level and rarity are read from: each card's XP and the
 * levels card buys opened on its tree. */
type CardLevels = Pick<TreeSave, "cardXp" | "cardBuys">;
/** What a card's details show besides the card: a `note`, the `actions`
 * on offer, and its level and rarity (`levels`). */
export type CardDetails = { note?: string; actions?: CardAction[]; levels?: CardLevels };

/** A card's details, as its reveal showed them, for the Deck page: the
 * card pops up over the rays (still with Reduce motion), with where it is
 * (`kicker`), its level, what it does, a note, and the actions on offer.
 * Pressing the card, outside it or Escape closes it, as an action does
 * once run. */
export function showCard(id: CardId, upgrades: Record<UpgradeId, number>, reduceMotion: boolean, kicker: string, { note, actions = [], levels }: CardDetails = {}) {
  const extra = (note ? `<em class="card-reveal-note">${note}</em>` : "")
    + (actions.length ? `<div class="card-reveal-actions">${actions.map((a, i) => `<button type="button" class="card-reveal-action" data-card-action="${i}">${a.label}</button>`).join("")}</div>` : "");
  const back = document.activeElement as HTMLElement | null;
  const layer = cardLayer(id, upgrades, ` details${reduceMotion ? " still" : ""}`, { kicker, hint: "Press anywhere to close", label: CARDS[id].name }, extra, levels);
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
    const pressed = (e.target as HTMLElement).closest<HTMLElement>("[data-card-action]");
    close();
    if (pressed) actions[Number(pressed.dataset.cardAction)]!.run();
  };
}
