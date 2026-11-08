import { atlasIcon } from "../sprites/ui-atlas.ts";
import { controlIcon } from "./control-icon.ts";
import { CLASSIC_NAME, THEME_GOLD_PER_MILLE, THEMES, collectionGoldFactor, gameLook, ownsTheme, perMilleText, themesOf, uiLook, type ThemeId, type ThemeKind } from "../theme-collection.ts";
import { factorText } from "../economy/gold-multipliers.ts";
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

/** A theme's Gold as the player sees it: "+1%" and the Gold icon. */
export const themeGoldHtml = (id: ThemeId) => `${perMilleText(THEME_GOLD_PER_MILLE[THEMES[id].kind])}${goldIcon()}`;

/** A theme granted (Dev mode gives them all), announced as research is. */
export const themeToast = (id: ThemeId): Toast => ({
  title: "Theme Unlocked!",
  text: `${THEMES[id].name} ${themeMenuTitle(THEMES[id].kind).replace(/s$/, "")} · ${perMilleText(THEME_GOLD_PER_MILLE[THEMES[id].kind])} Gold`,
});

const preview = (kind: ThemeKind, look: string) => `${UI_ASSET_BASE}assets/themes/${kind}-${look}.png`;
/** A look's preview picture. */
export const themePreview = (kind: ThemeKind, look: string, name: string) =>
  atlasIcon(`assets/themes/${kind}-${look}.png`, "theme-preview") ?? `<img class="theme-preview" src="${preview(kind, look)}" alt="${name} ${HEADINGS[kind].title.replace(/s$/, "")} preview">`;

/** One choice's card: its preview and name, and Equipped or Equip. */
function card(game: PageGame, kind: ThemeKind, look: string, name: string, id: ThemeId | null) {
  const worn = (kind === "ui" ? uiLook(game.save) : gameLook(game.save)) === look;
  const status = worn ? `<span class="theme-worn">Equipped</span>` : `<button class="theme-wear" data-look="${look}">Equip</button>`;
  const perk = id ? `<small class="theme-perk">${themeGoldHtml(id)}</small>` : `<small class="theme-perk">Always available</small>`;
  return `<article class="theme-card${worn ? " worn" : ""}" data-theme="${kind}-${look}">${themePreview(kind, look, name)}<h3>${name}</h3>${perk}${status}</article>`;
}

/** A kind's theme menu, drawn into `root`: Back, the Gold the themes
 * owned pay, a card per choice the player has (Classic, then each theme
 * owned), and where more come from. Pressing Equip wears its look;
 * `changed` applies and saves it. */
export function renderThemeMenu(root: HTMLElement, game: PageGame, kind: ThemeKind, back: () => void, changed: () => void) {
  const owned = game.save.themes.length;
  const choices = [card(game, kind, "classic", CLASSIC_NAME, null), ...themesOf(kind).filter((id) => ownsTheme(game.save, id)).map((id) => card(game, kind, THEMES[id].look, THEMES[id].name, id))];
  root.innerHTML =
    `<button class="back" id="themes-back">${controlIcon("back")} Settings</button><div class="page-title"><small>${HEADINGS[kind].kicker}</small><h2>${HEADINGS[kind].title}</h2></div>` +
    `<p class="hint theme-gold">Every UI theme owned adds ${perMilleText(THEME_GOLD_PER_MILLE.ui)}${goldIcon()} for good, every Game theme ${perMilleText(THEME_GOLD_PER_MILLE.game)}${goldIcon()}. Owned: <b>${owned}</b> · ${goldIcon()}<b>${factorText(collectionGoldFactor(game.save))}</b></p>` +
    `<div class="theme-grid">${choices.join("")}</div>` +
    `<p class="hint theme-more">More themes can be bought in the Store of limited-time Events, each featuring a UI theme and a Game theme.</p>`;
  el("themes-back").onclick = back;
  root.querySelectorAll<HTMLButtonElement>(".theme-wear").forEach((b) => {
    b.onclick = () => {
      if (game.themes.wear(kind, b.dataset.look!)) changed();
    };
  });
}

