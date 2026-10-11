import { CLASSIC_NAME, THEME_GOLD_TEXT, THEMES, canWear, gameLook, themeGoldFactor, themesOf, uiLook, type ThemeId, type ThemeKind } from "../theme-collection.ts";
import { factorText } from "../gold-bonuses.ts";
import type { Toast } from "./research-toast.ts";
import type { PageGame } from "./app.ts";
import { UI_ASSET_BASE, el, goldIcon } from "./dom.ts";

/** Each kind's menu heading and the line over its heading. */
const HEADINGS: Record<ThemeKind, { title: string; kicker: string }> = {
  ui: { title: "UI Themes", kicker: "THE PAGE AROUND THE BOARD" },
  game: { title: "Game Themes", kicker: "TILES, HERO, ENEMIES AND TORCHES" },
};
export const themeMenuTitle = (kind: ThemeKind) => HEADINGS[kind].title;

/** The name of the look a kind wears now. */
export function wornName(save: PageGame["save"], kind: ThemeKind) {
  const look = kind === "ui" ? uiLook(save) : gameLook(save);
  return themesOf(kind).map((id) => THEMES[id]).find((t) => t.look === look)?.name ?? CLASSIC_NAME;
}

/** A theme earned, announced as research is. */
export const themeToast = (id: ThemeId): Toast => ({
  title: "Theme Unlocked!",
  text: `${THEMES[id].name} ${themeMenuTitle(THEMES[id].kind).replace(/s$/, "")} · ${THEME_GOLD_TEXT}`,
});

const preview = (kind: ThemeKind, look: string) => `${UI_ASSET_BASE}assets/themes/${kind}-${look}.png`;

/** One choice's card: its preview and name, and Equipped, Equip, or how it
 * is earned. */
function card(game: PageGame, kind: ThemeKind, look: string, name: string, id: ThemeId | null) {
  const worn = (kind === "ui" ? uiLook(game.save) : gameLook(game.save)) === look;
  const owned = canWear(game.save, kind, look);
  const status = worn ? `<span class="theme-worn">Equipped</span>`
    : owned ? `<button class="theme-wear" data-look="${look}">Equip</button>`
    : `<span class="theme-lock">🔒 ${THEMES[id!].unlock}</span>`;
  const perk = id ? `<small class="theme-perk">${owned ? goldIcon() + THEME_GOLD_TEXT : THEME_GOLD_TEXT + " once owned"}</small>` : `<small class="theme-perk">Always available</small>`;
  return `<article class="theme-card${worn ? " worn" : ""}${owned ? "" : " locked"}" data-theme="${kind}-${look}"><img class="theme-preview" src="${preview(kind, look)}" alt="${name} ${HEADINGS[kind].title.replace(/s$/, "")} preview"><h3>${name}</h3>${perk}${status}</article>`;
}

/** A kind's theme menu, drawn into `root`: Back, the Gold every owned theme
 * pays, and a card per choice (Classic, then each theme). Pressing Equip
 * wears that look; `changed` applies and saves it. */
export function renderThemeMenu(root: HTMLElement, game: PageGame, kind: ThemeKind, back: () => void, changed: () => void) {
  const owned = game.save.themes.length;
  const choices = [card(game, kind, "classic", CLASSIC_NAME, null), ...themesOf(kind).map((id) => card(game, kind, THEMES[id].look, THEMES[id].name, id))];
  root.innerHTML =
    `<button class="back" id="themes-back">← Settings</button><div class="page-title"><small>${HEADINGS[kind].kicker}</small><h2>${HEADINGS[kind].title}</h2></div>` +
    `<p class="hint theme-gold">Every theme owned, UI or Game, adds ${THEME_GOLD_TEXT} for good. Owned: <b>${owned}</b> · ${goldIcon()}<b>${factorText(themeGoldFactor(game.save))}</b></p>` +
    `<div class="theme-grid">${choices.join("")}</div>`;
  el("themes-back").onclick = back;
  root.querySelectorAll<HTMLButtonElement>(".theme-wear").forEach((b) => {
    b.onclick = () => {
      if (game.wearTheme(kind, b.dataset.look!)) changed();
    };
  });
}

