import { CARDS } from "../cards.ts";
import type { CardBuy } from "../card-buys.ts";
import { CARD_RARITY_NAMES } from "../card-rarity.ts";
import { treeNode } from "../card-trees.ts";
import type { DrawAgain } from "./badge-reveal.ts";
import { rarityFrameHtml, rarityStarsHtml } from "./card-level-marks.ts";
import { nodeName } from "./card-tree-view.ts";
import { cardArt, gemIcon } from "./dom.ts";

/** The stars a legendary buy sends flying out from behind its card. */
const LEGENDARY_STARS = 14;

/** Shows the cards a purchase bought, one at a time, each glowing for the
 * rarity it drew: green round the edge for common, silver for uncommon,
 * gold with golden rays shooting out behind it for rare, a rainbow turning
 * round the edge with rainbow rays for epic, and for legendary the screen
 * darkening behind it as stars shoot out. Under it, the card, the upgrade
 * the buy opened or raised and the card's max level before and after. Ten
 * bought at once show which of the ten is up, with a Skip button, and end
 * on all ten together. A press anywhere goes on; with Reduce motion on,
 * everything appears still. The last screen offers `again`, the same
 * purchase once more. */
export function revealBuys(buys: readonly CardBuy[], reduceMotion: boolean, again?: DrawAgain) {
  if (!buys.length) return;
  const layer = document.createElement("div");
  layer.className = `badge-reveal card-buy-reveal${reduceMotion ? " still" : ""}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", buys.length > 1 ? `${buys.length} cards bought` : "Card bought");
  (document.querySelector("#app") ?? document.body).append(layer);
  let shown = 0, summary = false;
  const close = () => layer.remove();
  const next = () => {
    if (summary || (buys.length === 1 && shown >= 1)) return close();
    if (shown >= buys.length) return showSummary();
    const buy = buys[shown++];
    layer.classList.toggle("dark", buy.rarity === "legendary");
    layer.innerHTML = (buys.length > 1 ? header(shown, buys.length) : "") + buyHtml(buy) + continueHtml(shown < buys.length);
    if (buys.length === 1) layer.prepend(againEl());
    focusContinue();
  };
  const showSummary = () => {
    summary = true;
    layer.classList.remove("dark");
    layer.innerHTML = summaryHtml(buys) + continueHtml(false);
    layer.prepend(againEl());
    focusContinue();
  };
  /** The "x10 more" button: nothing without an offer; its price turns red (`short`) while the Gems held fall short, and pressing it then asks for Gems. */
  const againEl = () => {
    const holder = document.createElement("div");
    if (!again) return holder;
    holder.className = "badge-reveal-again";
    holder.innerHTML = `<button type="button" class="badge-reveal-more${again.affordable() ? "" : " short"}" aria-label="Buy x${again.count} more for ${again.gems} Gems">x${again.count} more · ${gemIcon()} <b>${again.gems}</b></button>`;
    return holder;
  };
  const focusContinue = () => layer.querySelector<HTMLButtonElement>(".badge-reveal-go")?.focus({ preventScroll: true });
  layer.onclick = (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".badge-reveal-more")) {
      if (!again) return;
      close();
      return again.buy();
    }
    if (target.closest(".badge-reveal-skip")) return showSummary();
    next();
  };
  next();
}

/** "3 / 10" and the Skip button, over each of ten buys. */
const header = (n: number, of: number) =>
  `<div class="badge-reveal-head"><span class="badge-reveal-count">${n} / ${of}</span><button type="button" class="badge-reveal-skip">Skip</button></div>`;

const continueHtml = (more: boolean) =>
  `<button type="button" class="badge-reveal-go">${more ? "Next" : "Continue"}</button>`;

/** What a buy did to its card's tree, in words. */
function upgradeText(buy: CardBuy) {
  const node = treeNode(buy.card, buy.node)!, name = nodeName(buy.card, node);
  return buy.fresh ? `${name} unlocked: 1 level to buy` : `${name}: ${buy.cap} levels to buy`;
}

/** The card as a buy of its rarity shows it: its art in its new look,
 * and behind it the rarity's glow, rays or stars. */
function cardStage(buy: CardBuy, size: "big" | "small") {
  const stars = buy.rarity === "legendary" && size === "big"
    ? `<span class="cb-stars" aria-hidden="true">${Array.from({ length: LEGENDARY_STARS }, (_, i) => `<i style="--a:${Math.round((i * 360) / LEGENDARY_STARS + (i % 3) * 9)}deg;--d:${((i * 7) % LEGENDARY_STARS) / 10}s">★</i>`).join("")}</span>`
    : "";
  const rays = (buy.rarity === "rare" || buy.rarity === "epic") && size === "big" ? `<span class="cb-rays" aria-hidden="true"></span>` : "";
  return `<div class="cb-stage ${size} r-${buy.rarity}">${rays}${stars}<span class="cb-glow" aria-hidden="true"></span><span class="cb-card">${cardArt(buy.card, CARDS[buy.card].name)}${rarityFrameHtml(buy.look.after, buy.look.after === "common")}</span></div>`;
}

/** One buy: the card glowing for its rarity, its rarity and name, the
 * upgrade it opened or raised and its max level before and after. */
function buyHtml(buy: CardBuy) {
  const rarity = CARD_RARITY_NAMES[buy.rarity];
  return `<div class="badge-reveal-show cb-show r-${buy.rarity}">${cardStage(buy, "big")}`
    + `<div class="badge-reveal-text"><small><span class="cb-rarity r-${buy.rarity}">${rarityStarsHtml(buy.rarity, true)}${rarity.toUpperCase()}</span> · CARD BOUGHT</small><b>${CARDS[buy.card].name}</b>`
    + `<p>${upgradeText(buy)}</p><p class="cb-level">Max level ${buy.maxLevel.before} → <b>${buy.maxLevel.after}</b></p></div></div>`;
}

/** Every buy of the ten at once, each card glowing for its rarity, those
 * that unlocked an upgrade marked NEW. */
function summaryHtml(buys: readonly CardBuy[]) {
  const items = buys.map((b, i) => {
    const node = treeNode(b.card, b.node)!;
    return `<div class="badge-sum cb-sum" style="--i:${i}" title="${CARDS[b.card].name}: ${upgradeText(b)}">${cardStage(b, "small")}${b.fresh ? `<span class="badge-sum-tag new">NEW</span>` : ""}<small>${nodeName(b.card, node)}</small></div>`;
  }).join("");
  return `<div class="badge-reveal-summary"><small class="badge-reveal-kicker">${buys.length} CARDS BOUGHT</small><div class="badge-sum-grid">${items}</div></div>`;
}
