import { soundEnabledBy, play } from "../sound.ts";
import { flourishesEnabledBy, sparks } from "./flourish.ts";

/** Whether the page wears the keep's look: `medieval.css` is scoped to this
 * class on the root, and `reduce-motion` mirrors the Reduce motion setting
 * for its animations. */
export const MEDIEVAL_CLASS = "medieval";

export function applyMedievalTheme(settings: { medievalTheme: boolean; reduceMotion: boolean }) {
  const root = document.documentElement.classList;
  root.toggle(MEDIEVAL_CLASS, settings.medievalTheme);
  root.toggle("reduce-motion", settings.reduceMotion);
}

/** Sounds, sparks and the button knock exist only while the theme is on. */
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
