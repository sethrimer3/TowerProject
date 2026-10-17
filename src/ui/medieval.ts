import { soundEnabledBy, play } from "../sound.ts";
import { flourishesEnabledBy, sparks } from "./flourish.ts";
import type { Save } from "../save-shape.ts";
import { uiLook } from "../theme-collection.ts";

/** Whether the page wears the keep's look: `medieval.css` is scoped to this
 * class on the root, and `reduce-motion` mirrors the Reduce motion setting
 * for its animations. */
export const MEDIEVAL_CLASS = "medieval";

/** The laser-line look: `neon.css` is scoped to this class on the root. */
export const NEON_CLASS = "neon";

/** The old green-phosphor monitor: `terminal.css` is scoped to this class
 * on the root. */
export const TERMINAL_CLASS = "terminal";

/** The old windowed desktop computer: `desktop.css` is scoped to this class
 * on the root. */
export const DESKTOP_CLASS = "desktop";

/** Glowing many-coloured ASCII cards on purple: `glyph.css` is scoped to
 * this class on the root. */
export const GLYPH_CLASS = "glyph";

/** Warm glowing ASCII on a maroon field of letters: `ember.css` is scoped
 * to this class on the root. */
export const EMBER_CLASS = "ember";

/** Ink on pale rice paper, spare and still: `zen.css` dresses this class on
 * the root. */
export const YANG_CLASS = "yang";

/** Pale ink on a dark stone ground: `zen.css` dresses this class on the
 * root. */
export const YIN_CLASS = "yin";

/** Flat black on white, nothing more: `bare.css` dresses this class on the
 * root. */
export const SHIRO_CLASS = "shiro";

/** Flat white on black: `bare.css` dresses this class on the root. */
export const KURO_CLASS = "kuro";

/** An old arcade cabinet's screen: `arcade.css` dresses this class on the
 * root. */
export const ARCADE_CLASS = "arcade";

/** An old one-bit computer's black and white: `system.css` dresses this
 * class on the root. */
export const SYSTEM_CLASS = "system";

/** A space-age starship's console: `orbit.css` dresses this class on the
 * root. */
export const ORBIT_CLASS = "orbit";

/** Chunky pixel-art panels on a night of pixel stars: `pixel.css` dresses
 * this class on the root. */
export const PIXEL_CLASS = "pixel";

/** Wobbly brush outlines and flat bright fills on white paper, as drawn in
 * a simple paint program: `doodle.css` dresses this class on the root. */
export const DOODLE_CLASS = "doodle";

/** Doodle after dark: wobbly black outlines and muted fills on dusky
 * violet paper under a scribbled moon: `murk.css` dresses this class on the
 * root. */
export const MURK_CLASS = "murk";

/** Dresses the page in the UI theme worn (`uiLook`: Classic wears none of
 * their classes) and mirrors Reduce motion. */
export function applyUiTheme(save: Pick<Save, "themes" | "settings">) {
  const root = document.documentElement.classList, look = uiLook(save);
  root.toggle(MEDIEVAL_CLASS, look === "medieval");
  root.toggle(NEON_CLASS, look === "neon");
  root.toggle(TERMINAL_CLASS, look === "terminal");
  root.toggle(DESKTOP_CLASS, look === "desktop");
  root.toggle(GLYPH_CLASS, look === "glyph");
  root.toggle(EMBER_CLASS, look === "ember");
  root.toggle(YANG_CLASS, look === "yang");
  root.toggle(YIN_CLASS, look === "yin");
  root.toggle(SHIRO_CLASS, look === "shiro");
  root.toggle(KURO_CLASS, look === "kuro");
  root.toggle(ARCADE_CLASS, look === "arcade");
  root.toggle(SYSTEM_CLASS, look === "system");
  root.toggle(ORBIT_CLASS, look === "orbit");
  root.toggle(PIXEL_CLASS, look === "pixel");
  root.toggle(DOODLE_CLASS, look === "doodle");
  root.toggle(MURK_CLASS, look === "murk");
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
