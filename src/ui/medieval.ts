import { soundEnabledBy, play } from "../sound.ts";
import { flourishesEnabledBy, sparks } from "./flourish.ts";
import type { Save } from "../entities.ts";
import { uiLook } from "../theme-collection.ts";

/** Whether the page wears the keep's look: `medieval.css` is scoped to this
 * class on the root, and `reduce-motion` mirrors the Reduce motion setting
 * for its animations. */
export const MEDIEVAL_CLASS = "medieval";

/** The laser-line look: `neon.css` is scoped to this class on the root. */
export const NEON_CLASS = "neon";

/** Dresses the page in the UI theme worn (`uiLook`: Classic wears neither
 * class) and mirrors Reduce motion. */
export function applyUiTheme(save: Pick<Save, "themes" | "settings">) {
  const root = document.documentElement.classList, look = uiLook(save);
  root.toggle(MEDIEVAL_CLASS, look === "medieval");
  root.toggle(NEON_CLASS, look === "neon");
  root.toggle("reduce-motion", save.settings.reduceMotion);
}

/** Sounds, sparks and the button knock exist only while the Medieval UI
 * theme is worn. */
export function bindMedievalFeedback(isOn: () => boolean, reduceMotion: () => boolean) {
  soundEnabledBy(isOn);
  flourishesEnabledBy(() => isOn() && !reduceMotion());
  document.addEventListener("click", (e) => {
    if (!isOn()) return;
    const target = (e.target as Element).closest?.("button, input[type=checkbox]");
    if (!target) return;
    play(target.closest("nav") ? "stone" : "knock");
    if (e.detail > 0) sparks(e.clientX, e.clientY, "embers");
  });
}
