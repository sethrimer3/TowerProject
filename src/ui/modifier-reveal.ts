import { levelProgress, modifierDef, modifierLevel, type ModifierDraw, type ModifierId } from "../modifiers.ts";
import { RARITIES } from "../shop/rarity.ts";
import { modifierStyle, modifierText, tokenHtml } from "./modifier-token.ts";

/** When a repeat draw's coin lands on its token, and when a level reached
 * flashes onto the star (ms). */
const COIN_LANDS_MS = 650;
const LEVEL_UP_MS = 1250;

/** Shows the modifiers a purchase drew, one at a time. A modifier drawn
 * for the first time rises with rays behind it; a repeat drops a coin onto
 * its token, its copies bouncing up and the copies the next level takes
 * appearing after a slash, and a level reached sparkles onto the star. Ten
 * drawn at once show which of the ten is up, with a Skip button, and end on
 * all ten together, each one that levelled up (or is new) marked. A press
 * anywhere goes on. With Reduce motion on, everything appears still. A
 * gate's text names the threshold the player picked (`pickOf`). */
export function revealDraws(draws: readonly ModifierDraw[], reduceMotion: boolean, pickOf: (id: ModifierId) => number = () => 0) {
  if (!draws.length) return;
  const layer = document.createElement("div");
  layer.className = `mod-reveal${reduceMotion ? " still" : ""}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", draws.length > 1 ? `${draws.length} modifiers drawn` : "Modifier drawn");
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
    if (draw.before) playRepeat(layer, draw, pickOf(draw.id), later);
    focusContinue();
  };
  const showSummary = () => {
    summary = true;
    layer.innerHTML = summaryHtml(draws) + continueHtml(false);
    focusContinue();
  };
  const focusContinue = () => layer.querySelector<HTMLButtonElement>(".mod-reveal-go")?.focus({ preventScroll: true });
  layer.onclick = (e) => {
    if ((e.target as HTMLElement).closest(".mod-reveal-skip")) return showSummary();
    next();
  };
  next();
}

/** "3 / 10" and the Skip button, over each of ten draws. */
const header = (n: number, of: number) =>
  `<div class="mod-reveal-head"><span class="mod-reveal-count">${n} / ${of}</span><button type="button" class="mod-reveal-skip">Skip</button></div>`;

const continueHtml = (more: boolean) =>
  `<button type="button" class="mod-reveal-go">${more ? "Next" : "Continue"}</button>`;

/** A modifier's name and rarity, over what it does. */
function caption(draw: ModifierDraw, small: string, pick: number) {
  const def = modifierDef(draw.id), level = modifierLevel(draw.after);
  return `<div class="mod-reveal-text"><small>${small} · <span style="color:${RARITIES[def.rarity].color}">${RARITIES[def.rarity].displayName.toUpperCase()}</span></small><b>${def.name}</b><p>${modifierText(draw.id, level, pick)}</p></div>`;
}

/** A modifier drawn for the first time: it rises, rays turning behind it. */
const firstHtml = (draw: ModifierDraw, pick: number) =>
  `<div class="mod-reveal-show first"><div class="mod-reveal-stage" style="${modifierStyle(draw.id)}"><div class="mod-reveal-rays" aria-hidden="true"></div>${tokenHtml(draw.id, 1, "big")}</div>${caption(draw, "NEW MODIFIER", pick)}</div>`;

/** A repeat: the token as it was, the coin above it, and the copies so far. */
function repeatHtml(draw: ModifierDraw, pick: number) {
  const level = modifierLevel(draw.before), had = levelProgress(draw.before)!;
  return `<div class="mod-reveal-show repeat"><div class="mod-reveal-stage" style="${modifierStyle(draw.id)}"><span class="mod-coin" aria-hidden="true" style="${modifierStyle(draw.id)}"></span>${tokenHtml(draw.id, level, "big")}</div>` +
    `<div class="mod-tally" aria-live="polite"><b class="mod-have">${had.have}</b><span class="mod-need">/${had.need}</span></div>${caption(draw, `LEVEL ${level}`, pick)}</div>`;
}

/** A repeat plays out: the coin lands and the copies bounce up to their new
 * count, the slash and the copies needed following; on a level reached, the
 * star sparkles and bounces to the new level and the tally starts again
 * toward the next (or reads MAX). */
function playRepeat(layer: HTMLElement, draw: ModifierDraw, pick: number, later: (ms: number, then: () => void) => void) {
  const have = layer.querySelector<HTMLElement>(".mod-have")!, tally = layer.querySelector<HTMLElement>(".mod-tally")!;
  const before = modifierLevel(draw.before), after = modifierLevel(draw.after);
  later(COIN_LANDS_MS, () => {
    have.textContent = String(levelProgress(draw.before)!.have + 1);
    tally.classList.add("counted");
  });
  if (after === before) return;
  later(LEVEL_UP_MS, () => {
    const token = layer.querySelector<HTMLElement>(".mod-token")!, star = token.querySelector<HTMLElement>(".mod-level b")!;
    star.textContent = String(after);
    token.classList.add("leveled");
    const p = levelProgress(draw.after);
    tally.classList.remove("counted");
    tally.classList.add("reset");
    tally.innerHTML = p ? `<b class="mod-have">${p.have}</b><span class="mod-need">/${p.need}</span>` : `<b class="mod-have">MAX</b>`;
    const small = layer.querySelector<HTMLElement>(".mod-reveal-text small");
    if (small) small.firstChild!.textContent = `LEVEL ${after} · `;
    layer.querySelector<HTMLElement>(".mod-reveal-text p")!.textContent = modifierText(draw.id, after, pick);
  });
}

/** Every draw of the ten at once, each at the level it reached, the new ones
 * and the ones that levelled up marked. */
function summaryHtml(draws: readonly ModifierDraw[]) {
  const items = draws.map((d, i) => {
    const before = modifierLevel(d.before), after = modifierLevel(d.after);
    const tag = !d.before ? `<span class="mod-sum-tag new">NEW</span>` : after > before ? `<span class="mod-sum-tag up"><i aria-hidden="true">▲</i>LVL UP</span>` : "";
    return `<div class="mod-sum" style="--i:${i}" title="${modifierDef(d.id).name}">${tokenHtml(d.id, after)}${tag}<small>${modifierDef(d.id).name}</small></div>`;
  }).join("");
  return `<div class="mod-reveal-summary"><small class="mod-reveal-kicker">${draws.length} MODIFIERS DRAWN</small><div class="mod-sum-grid">${items}</div></div>`;
}
