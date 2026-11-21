import type { RelicDef } from "../economy/relics.ts";
import { relicText } from "../economy/relic-effects.ts";
import { relicIcon } from "./dom.ts";

/** How a relic is raised: by a resting mouse (`hover`, which lets presses
 * through), just `obtained` (golden rays and sparkles behind it, kept for a
 * relic the player has only now won), and a `note` line under its bonus. */
export type RelicShown = { hover?: boolean; reduceMotion?: boolean; obtained?: boolean; note?: string };

/** Raises `relic` to the middle of the screen at full size, its name and
 * its bonus under it (the Relics screen, the Events screen's relic track, a
 * relic Goal). One shown by a resting mouse (`hover`) lets presses through
 * and goes with `hideHoveredRelic`; one pressed stays until the next press. */
export function showRelic(relic: RelicDef, { hover = false, reduceMotion = false, obtained = false, note = "" }: RelicShown = {}) {
  document.querySelector(".relic-pop")?.remove();
  const layer = document.createElement("div");
  layer.className = `relic-pop ${relic.rarity}${hover ? " hover" : ""}${reduceMotion ? " still" : ""}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", `${relic.name}: ${relicText(relic)}`);
  const sparkles = Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}"></i>`).join("");
  const celebration = obtained ? `<div class="relic-pop-rays" aria-hidden="true"></div><div class="relic-pop-sparkles" aria-hidden="true">${sparkles}</div>` : "";
  layer.innerHTML = `<div class="relic-pop-stage">${celebration}${relicIcon(relic, "relic-icon relic-pop-icon")}</div>` +
    `<div class="card-reveal-text"><b>${relic.name}</b><p>${relicText(relic)}</p>${note}</div>`;
  (document.querySelector("#app") ?? document.body).append(layer);
  if (!hover) layer.onclick = () => layer.remove();
}

/** Takes away a relic shown by a resting mouse. */
export const hideHoveredRelic = () => document.querySelector(".relic-pop.hover")?.remove();

/** Makes `button` show `relic` when pressed, and while a mouse rests on it
 * unless `hover` is false (the Events screen shows its relics only when
 * pressed); `note` is the line under its bonus, read at each press. */
export function relicButton(button: HTMLElement, relic: RelicDef, reduceMotion: boolean, { hover = true, note }: { hover?: boolean; note?: () => string } = {}) {
  button.onclick = () => showRelic(relic, { reduceMotion, note: note?.() });
  if (!hover) return;
  button.onpointerenter = (e) => e.pointerType === "mouse" && showRelic(relic, { hover: true, reduceMotion, note: note?.() });
  button.onpointerleave = (e) => e.pointerType === "mouse" && hideHoveredRelic();
}
