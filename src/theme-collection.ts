import type { Save } from "./entities.ts";
import { snap } from "./exact.ts";
import { CURRENCIES, type CurrencyId } from "./shop/currency.ts";

// Themes the player collects (CONTEXT.md: UI theme, Game theme). A UI theme
// dresses the page around the board; a Game theme redraws the board itself
// (tiles, the hero, enemies, torches). Each kind has a free Classic look
// that is always there; every other theme is owned once bought
// (`save.themes`, all of them in Dev mode), and each owned pays Gold for good.

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
  /** Owned by every hero from the start, never bought. */
  starting?: true;
};

/** What every theme not owned from the start costs. One price for all, in
 * one currency, so moving themes to another currency is this line. */
export const THEME_PRICE: { currency: CurrencyId; amount: number } = { currency: "gold", amount: 1 };

export const THEMES: Readonly<Record<ThemeId, ThemeDef>> = {
  medievalUi: { kind: "ui", look: "medieval", name: "Medieval", starting: true },
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
/** The themes every hero owns from the start. */
const STARTING: readonly ThemeId[] = THEME_IDS.filter((id) => THEMES[id].starting);

/** The free look of each kind, never owned and paying nothing. */
export const CLASSIC_NAME = "Classic";

/** Each kind's choices in the order its menu shows them: Classic first,
 * then its themes. */
export const themesOf = (kind: ThemeKind) => THEME_IDS.filter((id) => THEMES[id].kind === kind);

/** Gold banked rises by this share, in thousandths, for each theme owned. */
export const THEME_GOLD_PER_MILLE = 25;
/** What every Gold banked is multiplied by for the themes owned: ×1.025 a
 * theme. */
export const themeGoldFactor = (save: Pick<Save, "themes">) => snap((1000 + THEME_GOLD_PER_MILLE * save.themes.length) / 1000);
/** One theme's Gold as the player sees it: "+2.5% Gold". */
export const THEME_GOLD_TEXT = `+${THEME_GOLD_PER_MILLE / 10}% Gold`;

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

/** Whether the save can pay for a theme it doesn't own (free purchases
 * pay nothing). */
export const canBuyTheme = (save: Save, id: ThemeId) =>
  !ownsTheme(save, id) && (save.settings.freePurchases || CURRENCIES[THEME_PRICE.currency].balance(save) >= THEME_PRICE.amount);

/** Buys a theme the save doesn't own; false when it can't. */
export function buyTheme(save: Save, id: ThemeId) {
  if (!canBuyTheme(save, id)) return false;
  if (!save.settings.freePurchases) CURRENCIES[THEME_PRICE.currency].spend(save, THEME_PRICE.amount);
  save.themes = THEME_IDS.filter((t) => ownsTheme(save, t) || t === id);
  return true;
}

/** Gives the save every theme it doesn't own yet (Dev mode); returns them,
 * in catalog order, for the player to hear about. */
export function grantAllThemes(save: Pick<Save, "themes">): ThemeId[] {
  const fresh = THEME_IDS.filter((id) => !ownsTheme(save, id));
  save.themes = [...THEME_IDS];
  return fresh;
}

/** The saved themes: known ids, each once, in catalog order, always with
 * those every hero starts with. */
export function decodeThemes(raw: unknown): ThemeId[] {
  const saved = Array.isArray(raw) ? raw : [];
  return THEME_IDS.filter((id) => STARTING.includes(id) || saved.includes(id));
}
export const defaultThemes = (): ThemeId[] => [...STARTING];
