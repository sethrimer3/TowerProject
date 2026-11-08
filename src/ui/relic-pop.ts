import type { RelicDef } from "../economy/relics.ts";
import { bonusText } from "../economy/relic-effects.ts";
import { relicIcon } from "./dom.ts";

/** Raises `relic` to the middle of the screen at full size, with golden
 * rays and sparkles, its name and its bonus under it (the Relics screen,
 * the Events screen's relic track, a relic Goal). One shown by a resting
 * mouse (`hover`) lets presses through and goes with `hideHoveredRelic`;
 * one pressed stays until the next press. */
export function showRelic(relic: RelicDef, { hover = false, reduceMotion = false } = {}) {
  document.querySelector(".relic-pop")?.remove();
  const layer = document.createElement("div");
  layer.className = `relic-pop ${relic.rarity}${hover ? " hover" : ""}${reduceMotion ? " still" : ""}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", `${relic.name}: ${bonusText(relic.bonus)}`);
  const sparkles = Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}"></i>`).join("");
  layer.innerHTML = `<div class="relic-pop-stage"><div class="relic-pop-rays" aria-hidden="true"></div><div class="relic-pop-sparkles" aria-hidden="true">${sparkles}</div>${relicIcon(relic, "relic-icon relic-pop-icon")}</div>` +
    `<div class="card-reveal-text"><b>${relic.name}</b><p>${bonusText(relic.bonus)}</p></div>`;
  (document.querySelector("#app") ?? document.body).append(layer);
  if (!hover) layer.onclick = () => layer.remove();
}

/** Takes away a relic shown by a resting mouse. */
export const hideHoveredRelic = () => document.querySelector(".relic-pop.hover")?.remove();

/** Makes `button` show `relic`: pressed, or while a mouse rests on it. */
export function relicButton(button: HTMLElement, relic: RelicDef, reduceMotion: boolean) {
  button.onclick = () => showRelic(relic, { reduceMotion });
  button.onpointerenter = (e) => e.pointerType === "mouse" && showRelic(relic, { hover: true, reduceMotion });
  button.onpointerleave = (e) => e.pointerType === "mouse" && hideHoveredRelic();
}
