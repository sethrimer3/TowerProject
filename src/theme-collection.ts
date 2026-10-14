import type { Save } from "./entities.ts";
import { snap } from "./exact.ts";

// Themes the player collects (CONTEXT.md: UI theme, Game theme). A UI theme
// dresses the page around the board; a Game theme redraws the board itself
// (tiles, the hero, enemies, torches). Each kind has a free Classic look
// that is always there; every other theme is owned once earned
// (`save.themes`), and each owned pays Gold for good.

export type ThemeKind = "ui" | "game";
/** The looks of each kind, as the `uiTheme` and `gameTheme` settings hold
 * them. */
export type UiLook = "classic" | "medieval" | "neon" | "terminal" | "desktop" | "glyph" | "ember" | "yang" | "yin" | "shiro" | "kuro" | "arcade" | "system";
export type GameLook = "classic" | "neon" | "terminal" | "desktop" | "glyph" | "ember" | "yang" | "yin" | "shiro" | "kuro" | "arcade" | "system";
export type ThemeId =
  | "medievalUi" | "neonUi" | "terminalUi" | "desktopUi" | "glyphUi" | "emberUi" | "yangUi" | "yinUi" | "shiroUi" | "kuroUi" | "arcadeUi" | "systemUi"
  | "neonGame" | "terminalGame" | "desktopGame" | "glyphGame" | "emberGame" | "yangGame" | "yinGame" | "shiroGame" | "kuroGame" | "arcadeGame" | "systemGame";

export type ThemeDef = {
  kind: ThemeKind;
  look: UiLook | GameLook;
  name: string;
  /** How it is earned, in a few words; "Owned from the start" for one
   * every hero begins with. */
  unlock: string;
  /** Whether the save has earned it; omitted for one owned from the
   * start. */
  earned?: (save: Pick<Save, "tower" | "delve">) => boolean;
};

/** The highest a mode has reached in any of its tiers. */
const highest = (slice: Save["tower"] | Save["delve"]) =>
  Math.max(slice.reached, ...Object.values(slice.tierRecords).map((r) => r.reached));
/** The highest floor completed in Tower I (`floorsCompleted`). */
const towerOne = (save: Pick<Save, "tower">) =>
  save.tower.tier === 1 ? save.tower.reached : save.tower.tierRecords[1]?.reached ?? 0;

export const THEMES: Readonly<Record<ThemeId, ThemeDef>> = {
  medievalUi: { kind: "ui", look: "medieval", name: "Medieval", unlock: "Owned from the start" },
  neonUi: { kind: "ui", look: "neon", name: "Neon", unlock: "Complete floor 50 of Tower I", earned: (save) => towerOne(save) >= 50 },
  terminalUi: { kind: "ui", look: "terminal", name: "Terminal", unlock: "Complete floor 100 of Tower I", earned: (save) => towerOne(save) >= 100 },
  desktopUi: { kind: "ui", look: "desktop", name: "Desktop", unlock: "Reach depth 50 in the Delve", earned: (save) => highest(save.delve) >= 50 },
  glyphUi: { kind: "ui", look: "glyph", name: "Glyph", unlock: "Complete floor 200 of Tower I", earned: (save) => towerOne(save) >= 200 },
  emberUi: { kind: "ui", look: "ember", name: "Ember", unlock: "Reach depth 100 in the Delve", earned: (save) => highest(save.delve) >= 100 },
  yangUi: { kind: "ui", look: "yang", name: "Yang", unlock: "Complete floor 300 of Tower I", earned: (save) => towerOne(save) >= 300 },
  yinUi: { kind: "ui", look: "yin", name: "Yin", unlock: "Reach depth 150 in the Delve", earned: (save) => highest(save.delve) >= 150 },
  shiroUi: { kind: "ui", look: "shiro", name: "Shiro", unlock: "Complete floor 400 of Tower I", earned: (save) => towerOne(save) >= 400 },
  kuroUi: { kind: "ui", look: "kuro", name: "Kuro", unlock: "Reach depth 200 in the Delve", earned: (save) => highest(save.delve) >= 200 },
  arcadeUi: { kind: "ui", look: "arcade", name: "Arcade", unlock: "Complete floor 500 of Tower I", earned: (save) => towerOne(save) >= 500 },
  systemUi: { kind: "ui", look: "system", name: "System", unlock: "Complete floor 550 of Tower I", earned: (save) => towerOne(save) >= 550 },
  neonGame: { kind: "game", look: "neon", name: "Neon", unlock: "Reach depth 25 in the Delve", earned: (save) => highest(save.delve) >= 25 },
  terminalGame: { kind: "game", look: "terminal", name: "Terminal", unlock: "Complete floor 150 of Tower I", earned: (save) => towerOne(save) >= 150 },
  desktopGame: { kind: "game", look: "desktop", name: "Desktop", unlock: "Reach depth 75 in the Delve", earned: (save) => highest(save.delve) >= 75 },
  glyphGame: { kind: "game", look: "glyph", name: "Glyph", unlock: "Complete floor 250 of Tower I", earned: (save) => towerOne(save) >= 250 },
  emberGame: { kind: "game", look: "ember", name: "Ember", unlock: "Reach depth 125 in the Delve", earned: (save) => highest(save.delve) >= 125 },
  yangGame: { kind: "game", look: "yang", name: "Yang", unlock: "Complete floor 350 of Tower I", earned: (save) => towerOne(save) >= 350 },
  yinGame: { kind: "game", look: "yin", name: "Yin", unlock: "Reach depth 175 in the Delve", earned: (save) => highest(save.delve) >= 175 },
  shiroGame: { kind: "game", look: "shiro", name: "Shiro", unlock: "Complete floor 450 of Tower I", earned: (save) => towerOne(save) >= 450 },
  kuroGame: { kind: "game", look: "kuro", name: "Kuro", unlock: "Reach depth 225 in the Delve", earned: (save) => highest(save.delve) >= 225 },
  arcadeGame: { kind: "game", look: "arcade", name: "Arcade", unlock: "Reach depth 250 in the Delve", earned: (save) => highest(save.delve) >= 250 },
  systemGame: { kind: "game", look: "system", name: "System", unlock: "Reach depth 275 in the Delve", earned: (save) => highest(save.delve) >= 275 },
};
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];
/** The themes every hero owns from the start. */
const STARTING: readonly ThemeId[] = THEME_IDS.filter((id) => !THEMES[id].earned);

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
 * whose old setting chose a theme not yet earned shows Classic until it
 * is). */
export const uiLook = (save: Pick<Save, "themes" | "settings">): UiLook =>
  canWear(save, "ui", save.settings.uiTheme) ? save.settings.uiTheme : "classic";
export const gameLook = (save: Pick<Save, "themes" | "settings">): GameLook =>
  canWear(save, "game", save.settings.gameTheme) ? save.settings.gameTheme : "classic";

/** Adds every theme the save has earned and doesn't own yet; returns them,
 * in catalog order, for the player to hear about. */
export function claimThemes(save: Pick<Save, "themes" | "tower" | "delve">): ThemeId[] {
  const fresh = THEME_IDS.filter((id) => !ownsTheme(save, id) && THEMES[id].earned?.(save));
  save.themes = THEME_IDS.filter((id) => ownsTheme(save, id) || fresh.includes(id));
  return fresh;
}

/** The saved themes: known ids, each once, in catalog order, always with
 * those every hero starts with. */
export function decodeThemes(raw: unknown): ThemeId[] {
  const saved = Array.isArray(raw) ? raw : [];
  return THEME_IDS.filter((id) => STARTING.includes(id) || saved.includes(id));
}
export const defaultThemes = (): ThemeId[] => [...STARTING];
