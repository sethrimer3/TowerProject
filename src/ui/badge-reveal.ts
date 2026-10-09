import { levelProgress, badgeDef, badgeLevel, type BadgeDraw, type BadgeId } from "../badges.ts";
import { RARITIES } from "../shop/rarity.ts";
import { gemIcon } from "./dom.ts";
import { badgeLevelsHtml, badgeStyle, badgeText, tokenHtml } from "./badge-token.ts";

/** When a repeat draw's coin lands on its token, and when a level reached
 * flashes onto the star (ms). */
const COIN_LANDS_MS = 650;
const LEVEL_UP_MS = 1250;

/** The same purchase again, offered at the top of the last screen: its
 * count (x1 or x10), its Gem price, whether the Gems held pay for it now,
 * and what buying it does (it shows its own draws). */
export type DrawAgain = { count: number; gems: number; affordable: () => boolean; buy: () => void };

/** Shows the badges a purchase drew, one at a time. A badge drawn
 * for the first time rises with rays behind it; a repeat drops a coin onto
 * its token, its copies bouncing up and the copies the next level takes
 * appearing after a slash, and a level reached sparkles onto the star. Ten
 * drawn at once show which of the ten is up, with a Skip button, and end on
 * all ten together, each one that levelled up (or is new) marked. A press
 * anywhere goes on. With Reduce motion on, everything appears still. A
 * gate's text names the threshold the player picked (`pickOf`). The last
 * screen offers `again`, the same purchase once more. */
export function revealDraws(draws: readonly BadgeDraw[], reduceMotion: boolean, pickOf: (id: BadgeId) => number = () => 0, again?: DrawAgain) {
  if (!draws.length) return;
  const layer = document.createElement("div");
  layer.className = `badge-reveal${reduceMotion ? " still" : ""}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", draws.length > 1 ? `${draws.length} badges drawn` : "Badge drawn");
  (document.querySelector("#app") ?? document.body).append(layer);
  const timers: number[] = [];
  const later = (ms: number, then: () => void) => timers.push(window.setTimeout(then, reduceMotion ? 0 : ms));
  let shown = 0, summary = false;
  const close = () => {
    timers.forEach(clearTimeout);
    layer.remove();
  };
  const next = () => {
    timers.forEach(clearTimeout);
    timers.length = 0;
    if (summary || (draws.length === 1 && shown >= 1)) return close();
    if (shown >= draws.length) return showSummary();
    const draw = draws[shown++];
    layer.innerHTML = (draws.length > 1 ? header(shown, draws.length) : "") + (draw.before ? repeatHtml(draw, pickOf(draw.id)) : firstHtml(draw, pickOf(draw.id))) + continueHtml(shown < draws.length);
    if (draws.length === 1) layer.prepend(againEl());
    if (draw.before) playRepeat(layer, draw, pickOf(draw.id), later);
    focusContinue();
  };
  const showSummary = () => {
    summary = true;
    layer.innerHTML = summaryHtml(draws) + continueHtml(false);
    layer.prepend(againEl());
    focusContinue();
  };
  /** The "x1 more" button: nothing without an offer; greyed out while the Gems held fall short. */
  const againEl = () => {
    const holder = document.createElement("div");
    if (!again) return holder;
    holder.className = "badge-reveal-again";
    holder.innerHTML = `<button type="button" class="badge-reveal-more" ${again.affordable() ? "" : "disabled"} aria-label="Draw x${again.count} more for ${again.gems} Gems">x${again.count} more · ${gemIcon()} <b>${again.gems}</b></button>`;
    return holder;
  };
  const focusContinue = () => layer.querySelector<HTMLButtonElement>(".badge-reveal-go")?.focus({ preventScroll: true });
  layer.onclick = (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".badge-reveal-more")) {
      if (!again || !again.affordable()) return;
      close();
      return again.buy();
    }
    if (target.closest(".badge-reveal-skip")) return showSummary();
    next();
  };
  next();
}

/** "3 / 10" and the Skip button, over each of ten draws. */
const header = (n: number, of: number) =>
  `<div class="badge-reveal-head"><span class="badge-reveal-count">${n} / ${of}</span><button type="button" class="badge-reveal-skip">Skip</button></div>`;

const continueHtml = (more: boolean) =>
  `<button type="button" class="badge-reveal-go">${more ? "Next" : "Continue"}</button>`;

/** A badge's name and rarity, over what it does. */
function caption(draw: BadgeDraw, small: string, pick: number) {
  const def = badgeDef(draw.id), level = badgeLevel(draw.after);
  return `<div class="badge-reveal-text"><small>${small} · <span style="color:${RARITIES[def.rarity].color}">${RARITIES[def.rarity].displayName.toUpperCase()}</span></small><b>${def.name}</b><p>${badgeText(draw.id, level, pick)}</p><p class="badge-reveal-levels">${badgeLevelsHtml(draw.id, level, pick)}</p></div>`;
}

/** A badge drawn for the first time: it rises, rays turning behind it. */
const firstHtml = (draw: BadgeDraw, pick: number) =>
  `<div class="badge-reveal-show first"><div class="badge-reveal-stage" style="${badgeStyle(draw.id)}"><div class="badge-reveal-rays" aria-hidden="true"></div>${tokenHtml(draw.id, 1, "big")}</div>${caption(draw, "NEW BADGE", pick)}</div>`;

/** A repeat: the token as it was, the coin above it, and the copies so far. */
function repeatHtml(draw: BadgeDraw, pick: number) {
  const level = badgeLevel(draw.before), had = levelProgress(draw.before)!;
  return `<div class="badge-reveal-show repeat"><div class="badge-reveal-stage" style="${badgeStyle(draw.id)}"><span class="badge-coin" aria-hidden="true" style="${badgeStyle(draw.id)}"></span>${tokenHtml(draw.id, level, "big")}</div>` +
    `<div class="badge-tally" aria-live="polite"><b class="badge-have">${had.have}</b><span class="badge-need">/${had.need}</span></div>${caption(draw, `LEVEL ${level}`, pick)}</div>`;
}

/** A repeat plays out: the coin lands and the copies bounce up to their new
 * count, the slash and the copies needed following; on a level reached, the
 * star sparkles and bounces to the new level and the tally starts again
 * toward the next (or reads MAX). */
function playRepeat(layer: HTMLElement, draw: BadgeDraw, pick: number, later: (ms: number, then: () => void) => void) {
  const have = layer.querySelector<HTMLElement>(".badge-have")!, tally = layer.querySelector<HTMLElement>(".badge-tally")!;
  const before = badgeLevel(draw.before), after = badgeLevel(draw.after);
  later(COIN_LANDS_MS, () => {
    have.textContent = String(levelProgress(draw.before)!.have + 1);
    tally.classList.add("counted");
  });
  if (after === before) return;
  later(LEVEL_UP_MS, () => {
    const token = layer.querySelector<HTMLElement>(".badge-token")!, star = token.querySelector<HTMLElement>(".badge-level b")!;
    star.textContent = String(after);
    token.classList.add("leveled");
    const p = levelProgress(draw.after);
    tally.classList.remove("counted");
    tally.classList.add("reset");
    tally.innerHTML = p ? `<b class="badge-have">${p.have}</b><span class="badge-need">/${p.need}</span>` : `<b class="badge-have">MAX</b>`;
    const small = layer.querySelector<HTMLElement>(".badge-reveal-text small");
    if (small) small.firstChild!.textContent = `LEVEL ${after} · `;
    layer.querySelector<HTMLElement>(".badge-reveal-text p")!.textContent = badgeText(draw.id, after, pick);
    layer.querySelector<HTMLElement>(".badge-reveal-levels")!.innerHTML = badgeLevelsHtml(draw.id, after, pick);
  });
}

/** Every draw of the ten at once, each at the level it reached, the new ones
 * and the ones that levelled up marked. */
function summaryHtml(draws: readonly BadgeDraw[]) {
  const items = draws.map((d, i) => {
    const before = badgeLevel(d.before), after = badgeLevel(d.after);
    const tag = !d.before ? `<span class="badge-sum-tag new">NEW</span>` : after > before ? `<span class="badge-sum-tag up"><i aria-hidden="true">▲</i>LVL UP</span>` : "";
    return `<div class="badge-sum" style="--i:${i}" title="${badgeDef(d.id).name}">${tokenHtml(d.id, after)}${tag}<small>${badgeDef(d.id).name}</small></div>`;
  }).join("");
  return `<div class="badge-reveal-summary"><small class="badge-reveal-kicker">${draws.length} BADGES DRAWN</small><div class="badge-sum-grid">${items}</div></div>`;
}
