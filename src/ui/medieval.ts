import { batteryLight } from "../battery-light.ts";
import { soundEnabledBy, soundStyleBy, play, unlockAudio } from "../sound.ts";
import { applyLayout } from "./layout.ts";
import { flourishesEnabledBy, sparks } from "./flourish.ts";
import type { Save } from "../save/shape.ts";
import { uiLook, type UiLook } from "../theme-collection.ts";
import { usesUiSprites, usesGameSprites } from "../sprites/style.ts";
import { loadSpriteFont } from "../sprites/font.ts";

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

/** The Battery Saver UI theme, and Battery saver's page: Kuro's flat white
 * on black made pure black, with no animation, glow or colour (`battery.css`
 * dresses this class on the root, worn with `kuro`). */
export const BATTERY_LOOK_CLASS = "battery";
/** Battery saver itself (the setting): its compact centred layout, its own
 * stats and the white's brightness, over `battery` (`battery.css`). */
export const BATTERY_CLASS = "battery-saver";

/** Dresses the page in the UI theme worn (`uiLook`: Classic wears none of
 * their classes), or Battery saver's black and white over Kuro's plain
 * panels while it is on, and mirrors Reduce motion. */
export function applyUiTheme(save: Pick<Save, "themes" | "settings">) {
  const battery = save.settings.batterySaver;
  const root = document.documentElement.classList;
  const chosen = battery ? "battery" : uiLook(save), look = chosen === "battery" ? "kuro" : chosen;
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
  root.toggle(BATTERY_LOOK_CLASS, chosen === "battery");
  root.toggle(BATTERY_CLASS, battery);
  // Battery saver's white, from full down to barely lighter than black.
  // (The frame loop then follows the light a press gives, battery-light.ts.)
  document.documentElement.style?.setProperty("--battery-white", String(battery ? batteryLight(save.settings.batteryWhite / 100, performance.now()) : 1));
  root.toggle("reduce-motion", save.settings.reduceMotion || battery);
  root.toggle("legacy-borders", save.settings.legacyBorders);
  root.toggle("ui-sprites", !battery && usesUiSprites(save));
  root.toggle("game-sprites", !battery && usesGameSprites(save));
  if (battery || usesUiSprites(save) || usesGameSprites(save)) void loadSpriteFont();
  applyLayout(save);
}

/** What the page's presses sound and look like. Every UI theme hears the
 * game's sounds while `sound` is on (Sound effects), a theme's own
 * recordings where it has any (`look`, sound-files.ts's `STYLE_SOUNDS`): a
 * button knocks, a tab on the tab row is stone, and a dialog's confirming
 * button confirms. Sparks fly from a press only under the Medieval UI
 * theme (`medieval`), and not with Reduce motion on. */
export function bindFeedback({ sound, look, medieval, reduceMotion }: { sound: () => boolean; look: () => UiLook; medieval: () => boolean; reduceMotion: () => boolean }) {
  soundEnabledBy(sound);
  soundStyleBy(look);
  flourishesEnabledBy(() => medieval() && !reduceMotion());
  // Browsers start a page's sound only from a press.
  window.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("keydown", unlockAudio);
  document.addEventListener("click", (e) => {
    const target = (e.target as Element).closest?.("button, input[type=checkbox]");
    if (!target) return;
    play(target.closest("nav") ? "stone" : target.id === "confirm" ? "confirm" : "knock");
    if (medieval() && e.detail > 0) sparks(e.clientX, e.clientY, "embers");
  });
}
