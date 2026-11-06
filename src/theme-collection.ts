import type { Save } from "./save/shape.ts";
import { snap } from "./exact.ts";

// Themes the player collects (CONTEXT.md: UI theme, Game theme). A UI theme
// dresses the page around the board; a Game theme redraws the board itself
// (tiles, the hero, enemies, torches). Each kind has a free Classic look
// that is always there; every other theme is owned once bought in an
// event's Store for Medals (events/store.ts; `save.themes`, all of them in
// Dev mode), and each owned pays Gold for good (`collectionGoldFactor`).

export type ThemeKind = "ui" | "game";
/** The looks of each kind, as the `uiTheme` and `gameTheme` settings hold
 * them. */
export type UiLook = "classic" | "medieval" | "neon" | "terminal" | "desktop" | "glyph" | "ember" | "yang" | "yin" | "shiro" | "kuro" | "arcade" | "system" | "orbit" | "pixel" | "doodle" | "murk";
export type GameLook = "classic" | "neon" | "terminal" | "desktop" | "glyph" | "ember" | "yang" | "yin" | "shiro" | "kuro" | "arcade" | "system" | "kroz" | "orbit" | "pixel" | "doodle" | "murk";
export type ThemeId =
  | "medievalUi" | "neonUi" | "terminalUi" | "desktopUi" | "glyphUi" | "emberUi" | "yangUi" | "yinUi" | "shiroUi" | "kuroUi" | "arcadeUi" | "systemUi" | "orbitUi" | "pixelUi" | "doodleUi" | "murkUi"
  | "neonGame" | "terminalGame" | "desktopGame" | "glyphGame" | "emberGame" | "yangGame" | "yinGame" | "shiroGame" | "kuroGame" | "arcadeGame" | "systemGame" | "krozGame" | "orbitGame" | "pixelGame" | "doodleGame" | "murkGame";

export type ThemeDef = {
  kind: ThemeKind;
  look: UiLook | GameLook;
  name: string;
  /** The GMT day (`YYYY-MM-DD`) a theme added after the Event Stores
   * opened joins their rotation, from the event running then on
   * (events/store.ts); without it, from the first. */
  since?: string;
};

export const THEMES: Readonly<Record<ThemeId, ThemeDef>> = {
  medievalUi: { kind: "ui", look: "medieval", name: "Medieval" },
  neonUi: { kind: "ui", look: "neon", name: "Neon" },
  terminalUi: { kind: "ui", look: "terminal", name: "Terminal" },
  desktopUi: { kind: "ui", look: "desktop", name: "Desktop" },
  glyphUi: { kind: "ui", look: "glyph", name: "Glyph" },
  emberUi: { kind: "ui", look: "ember", name: "Ember" },
  yangUi: { kind: "ui", look: "yang", name: "Yang" },
  yinUi: { kind: "ui", look: "yin", name: "Yin" },
  shiroUi: { kind: "ui", look: "shiro", name: "Shiro" },
  kuroUi: { kind: "ui", look: "kuro", name: "Kuro" },
  arcadeUi: { kind: "ui", look: "arcade", name: "Arcade" },
  systemUi: { kind: "ui", look: "system", name: "System" },
  orbitUi: { kind: "ui", look: "orbit", name: "Orbit" },
  pixelUi: { kind: "ui", look: "pixel", name: "Pixel" },
  doodleUi: { kind: "ui", look: "doodle", name: "Doodle" },
  murkUi: { kind: "ui", look: "murk", name: "Murk" },
  neonGame: { kind: "game", look: "neon", name: "Neon" },
  terminalGame: { kind: "game", look: "terminal", name: "Terminal" },
  desktopGame: { kind: "game", look: "desktop", name: "Desktop" },
  glyphGame: { kind: "game", look: "glyph", name: "Glyph" },
  emberGame: { kind: "game", look: "ember", name: "Ember" },
  yangGame: { kind: "game", look: "yang", name: "Yang" },
  yinGame: { kind: "game", look: "yin", name: "Yin" },
  shiroGame: { kind: "game", look: "shiro", name: "Shiro" },
  kuroGame: { kind: "game", look: "kuro", name: "Kuro" },
  arcadeGame: { kind: "game", look: "arcade", name: "Arcade" },
  systemGame: { kind: "game", look: "system", name: "System" },
  krozGame: { kind: "game", look: "kroz", name: "Kroz" },
  orbitGame: { kind: "game", look: "orbit", name: "Orbit" },
  pixelGame: { kind: "game", look: "pixel", name: "Pixel" },
  doodleGame: { kind: "game", look: "doodle", name: "Doodle" },
  murkGame: { kind: "game", look: "murk", name: "Murk" },
};
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** The free look of each kind, never owned and paying nothing. */
export const CLASSIC_NAME = "Classic";

/** Each kind's choices in the order its menu shows them: Classic first,
 * then its themes. */
export const themesOf = (kind: ThemeKind) => THEME_IDS.filter((id) => THEMES[id].kind === kind);

/** Gold banked rises by this share, in thousandths, for each theme owned,
 * by its kind. */
export const THEME_GOLD_PER_MILLE: Readonly<Record<ThemeKind, number>> = { ui: 10, game: 20 };
/** And by this for each bonus track owned (events/music.ts). */
export const TRACK_GOLD_PER_MILLE = 8;
/** A share in thousandths as the player sees it: "+0.8%". */
export const perMilleText = (perMille: number) => `+${perMille / 10}%`;

/** What every Gold banked is multiplied by for the Event Collection: the
 * themes and bonus tracks owned, their shares added (a separate factor
 * from relics' Gold Bonus). */
export const collectionGoldFactor = (save: Pick<Save, "themes" | "music">) =>
  snap((1000 + save.themes.reduce((sum, id) => sum + THEME_GOLD_PER_MILLE[THEMES[id].kind], 0) + TRACK_GOLD_PER_MILLE * save.music.length) / 1000);

export const ownsTheme = (save: Pick<Save, "themes">, id: ThemeId) => save.themes.includes(id);

/** The owned theme behind a kind's look, or null for Classic. */
const themeFor = (kind: ThemeKind, look: string) => THEME_IDS.find((id) => THEMES[id].kind === kind && THEMES[id].look === look) ?? null;

/** Whether the save may wear `look`: Classic always, a theme once owned. */
export function canWear(save: Pick<Save, "themes">, kind: ThemeKind, look: string) {
  if (look === "classic") return true;
  const id = themeFor(kind, look);
  return !!id && ownsTheme(save, id);
}

/** The look worn: the chosen one while it is owned, else Classic (a save
 * whose old setting chose a theme not yet owned shows Classic until it
 * is). */
export const uiLook = (save: Pick<Save, "themes" | "settings">): UiLook =>
  canWear(save, "ui", save.settings.uiTheme) ? save.settings.uiTheme : "classic";
export const gameLook = (save: Pick<Save, "themes" | "settings">): GameLook =>
  canWear(save, "game", save.settings.gameTheme) ? save.settings.gameTheme : "classic";

/** Gives the save theme `id` (bought in an event's Store). */
export function grantTheme(save: Pick<Save, "themes">, id: ThemeId) {
  if (!ownsTheme(save, id)) save.themes = THEME_IDS.filter((t) => ownsTheme(save, t) || t === id);
}

/** Gives the save every theme it doesn't own yet (Dev mode); returns them,
 * in catalog order, for the player to hear about. */
export function grantAllThemes(save: Pick<Save, "themes">): ThemeId[] {
  const fresh = THEME_IDS.filter((id) => !ownsTheme(save, id));
  save.themes = [...THEME_IDS];
  return fresh;
}

/** The saved themes: known ids, each once, in catalog order. */
export function decodeThemes(raw: unknown): ThemeId[] {
  const saved = Array.isArray(raw) ? raw : [];
  return THEME_IDS.filter((id) => saved.includes(id));
}
/** A new hero owns no theme: Classic is always there. */
export const defaultThemes = (): ThemeId[] => [];
