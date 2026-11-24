import type { RelicDef } from "../economy/relics.ts";
import { relicText } from "../economy/relic-effects.ts";
import { relicIcon } from "./dom.ts";
import { kitIcon } from "../sprites/kit.ts";
import { DIVINE_RELICS, type DivineRelicId } from "../divine.ts";

/** How a relic is raised: just `obtained` (golden rays and sparkles behind
 * it, kept for a relic the player has only now won), and a `note` line
 * under its bonus. */
export type RelicShown = { reduceMotion?: boolean; obtained?: boolean; note?: string };

/** Raises `relic` to the middle of the screen at full size, its name and
 * its bonus under it (the Relics screen, the Events screen's relic track, a
 * relic Goal), until the next press. */
export function showRelic(relic: RelicDef, { reduceMotion = false, obtained = false, note = "" }: RelicShown = {}) {
  document.querySelector(".relic-pop")?.remove();
  const layer = document.createElement("div");
  layer.className = `relic-pop ${relic.rarity}${reduceMotion ? " still" : ""}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", `${relic.name}: ${relicText(relic)}`);
  const sparkles = Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}"></i>`).join("");
  const celebration = obtained ? `<div class="relic-pop-rays" aria-hidden="true"></div><div class="relic-pop-sparkles" aria-hidden="true">${sparkles}</div>` : "";
  layer.innerHTML = `<div class="relic-pop-stage">${celebration}${relicIcon(relic, "relic-icon relic-pop-icon")}</div>` +
    `<div class="card-reveal-text"><b>${relic.name}</b><p>${relicText(relic)}</p>${note}</div>`;
  (document.querySelector("#app") ?? document.body).append(layer);
  layer.onclick = () => layer.remove();
}

/** Makes `button` show `relic` when pressed (never on a resting mouse);
 * `note` is the line under its bonus, read at each press. */
export function relicButton(button: HTMLElement, relic: RelicDef, reduceMotion: boolean, note?: () => string) {
  button.onclick = () => showRelic(relic, { reduceMotion, note: note?.() });
}

/** A Divine Relic's icon (its own art from the UI atlas). */
export const divineRelicIcon = (id: DivineRelicId, className = "relic-icon") => kitIcon(DIVINE_RELICS[id].icon, "", className);

/** Raises Divine Relic `id` to the middle of the screen, rising from below
 * into golden rays and sparkles, its name and what it does under it, and
 * how to dismiss it (`obtained`: just taken from the builders' chest; else
 * pressed on the Relics page). The next press anywhere dismisses it, then
 * `dismissed` runs. */
export function showDivineRelic(id: DivineRelicId, { reduceMotion = false, obtained = false, dismissed = () => {} }: { reduceMotion?: boolean; obtained?: boolean; dismissed?: () => void } = {}) {
  document.querySelector(".relic-pop")?.remove();
  const relic = DIVINE_RELICS[id], layer = document.createElement("div");
  layer.className = `relic-pop divine${obtained ? " obtained" : ""}${reduceMotion ? " still" : ""}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", `${relic.name}: ${relic.text}`);
  const sparkles = Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}"></i>`).join("");
  layer.innerHTML = `<div class="relic-pop-stage"><div class="relic-pop-rays" aria-hidden="true"></div><div class="relic-pop-sparkles" aria-hidden="true">${sparkles}</div>${divineRelicIcon(id, "relic-icon relic-pop-icon")}</div>` +
    `<div class="card-reveal-text">${obtained ? `<small class="divine-label">DIVINE RELIC</small>` : ""}<b>${relic.name}</b><p>${relic.text}</p><p class="hint divine-dismiss">Tap anywhere to dismiss.</p></div>`;
  (document.querySelector("#app") ?? document.body).append(layer);
  layer.onclick = () => {
    layer.remove();
    dismissed();
  };
}
