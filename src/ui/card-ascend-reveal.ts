import { CARDS, type CardId } from "../cards/cards.ts";
import { powersOf } from "../cards/powers.ts";
import { CARD_RARITY_NAMES, type CardRarity } from "../cards/rarity.ts";
import { rarityFrameHtml, rarityStarsHtml } from "./card-level-marks.ts";
import { powerStepHtml } from "./card-power-view.ts";
import { cardArt } from "./dom.ts";

/** The stars a mythic ascension sends flying out from behind its card. */
const MYTHIC_STARS = 14;

/** Celebrates card `card` ascending to `rarity`: the card in its new frame,
 * glowing for the rarity (green round the edge for uncommon, silver for
 * rare, gold with golden rays shooting out behind it for epic, a rainbow
 * turning round the edge with rainbow rays for legendary, and for mythic
 * the screen darkening behind it as stars shoot out), "Card ascended!",
 * and the new power with what each level of it adds. A press anywhere
 * closes it; with Reduce motion on, everything appears still. `onDone`
 * runs once it is pressed away. */
export function revealAscension(card: CardId, rarity: CardRarity, reduceMotion: boolean, onDone?: () => void) {
  const layer = document.createElement("div");
  layer.className = `badge-reveal card-buy-reveal card-ascend-reveal${reduceMotion ? " still" : ""}${rarity === "mythic" ? " dark" : ""}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", `${CARDS[card].name} ascended to ${CARD_RARITY_NAMES[rarity]}`);
  layer.innerHTML = ascendHtml(card, rarity) + `<button type="button" class="badge-reveal-go">Continue</button>`;
  (document.querySelector("#app") ?? document.body).append(layer);
  layer.onclick = () => {
    layer.remove();
    onDone?.();
  };
  layer.querySelector<HTMLButtonElement>(".badge-reveal-go")?.focus({ preventScroll: true });
}

/** The card as its new rarity shows it: its art in its new frame, and
 * behind it the rarity's glow, rays or stars. */
function cardStage(card: CardId, rarity: CardRarity) {
  const stars = rarity === "mythic"
    ? `<span class="cb-stars" aria-hidden="true">${Array.from({ length: MYTHIC_STARS }, (_, i) => `<i style="--a:${Math.round((i * 360) / MYTHIC_STARS + (i % 3) * 9)}deg;--d:${((i * 7) % MYTHIC_STARS) / 10}s">★</i>`).join("")}</span>`
    : "";
  const rays = rarity === "epic" || rarity === "legendary" ? `<span class="cb-rays" aria-hidden="true"></span>` : "";
  return `<div class="cb-stage big r-${rarity}">${rays}${stars}<span class="cb-glow" aria-hidden="true"></span><span class="cb-card">${cardArt(card, CARDS[card].name)}${rarityFrameHtml(rarity)}</span></div>`;
}

/** The ascension: the card glowing for its rarity, its rarity and name,
 * "Card ascended!", and its new power, a line a power of the rarity. */
function ascendHtml(card: CardId, rarity: CardRarity) {
  const powers = powersOf(card).filter((p) => p.rarity === rarity);
  const lines = powers.length
    ? powers.map((p) => `<p class="ca-power"><span class="ca-power-label">New Power:</span> <b>${p.name}</b> ${powerStepHtml(p)}</p>`).join("")
    : `<p class="ca-power">Ten more levels to climb.</p>`;
  return `<div class="badge-reveal-show cb-show r-${rarity}">${cardStage(card, rarity)}`
    + `<div class="badge-reveal-text"><small><span class="cb-rarity r-${rarity}">${rarityStarsHtml(rarity)}${CARD_RARITY_NAMES[rarity].toUpperCase()}</span></small>`
    + `<b class="ca-title">Card ascended!</b><b>${CARDS[card].name}</b>${lines}</div></div>`;
}
