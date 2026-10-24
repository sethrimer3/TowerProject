import { controlIcon } from "./control-icon.ts";
import { CLASSIC_NAME, THEME_GOLD_TEXT, THEME_PRICE, THEMES, canBuyTheme, canWear, gameLook, themeGoldFactor, themesOf, uiLook, type ThemeId, type ThemeKind } from "../theme-collection.ts";
import { factorText } from "../economy/gold-multipliers.ts";
import type { Toast } from "./research-toast.ts";
import type { PageGame } from "./app.ts";
import { CURRENCIES, type CurrencyId } from "../shop/currency.ts";
import { UI_ASSET_BASE, el, gemIcon, goldIcon, medalIcon, shardIcon } from "./dom.ts";

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

const CURRENCY_ICONS: Record<CurrencyId, () => string> = { gems: () => gemIcon(), shards: () => shardIcon(), gold: goldIcon, medals: () => medalIcon() };

/** A theme granted (Dev mode gives them all), announced as research is. */
export const themeToast = (id: ThemeId): Toast => ({
  title: "Theme Unlocked!",
  text: `${THEMES[id].name} ${themeMenuTitle(THEMES[id].kind).replace(/s$/, "")} · ${THEME_GOLD_TEXT}`,
});

const preview = (kind: ThemeKind, look: string) => `${UI_ASSET_BASE}assets/themes/${kind}-${look}.png`;

/** A theme's Buy button, its price as the currency's icon and the amount. */
function buyButton(game: PageGame, id: ThemeId) {
  const { currency, amount } = THEME_PRICE;
  const label = `Buy ${THEMES[id].name} for ${amount} ${CURRENCIES[currency].name}`;
  return `<button class="theme-buy" data-id="${id}" aria-label="${label}" ${canBuyTheme(game.save, id) ? "" : "disabled"}>Buy · ${CURRENCY_ICONS[currency]()} <b>${amount}</b></button>`;
}

/** One choice's card: its preview and name, and Equipped, Equip, or Buy. */
function card(game: PageGame, kind: ThemeKind, look: string, name: string, id: ThemeId | null) {
  const worn = (kind === "ui" ? uiLook(game.save) : gameLook(game.save)) === look;
  const owned = canWear(game.save, kind, look);
  const status = worn ? `<span class="theme-worn">Equipped</span>`
    : owned ? `<button class="theme-wear" data-look="${look}">Equip</button>`
    : buyButton(game, id!);
  const perk = id ? `<small class="theme-perk">${owned ? goldIcon() + THEME_GOLD_TEXT : THEME_GOLD_TEXT + " once owned"}</small>` : `<small class="theme-perk">Always available</small>`;
  return `<article class="theme-card${worn ? " worn" : ""}${owned ? "" : " locked"}" data-theme="${kind}-${look}"><img class="theme-preview" src="${preview(kind, look)}" alt="${name} ${HEADINGS[kind].title.replace(/s$/, "")} preview"><h3>${name}</h3>${perk}${status}</article>`;
}

/** A kind's theme menu, drawn into `root`: Back, the Gold every owned theme
 * pays, and a card per choice (Classic, then each theme). Pressing Buy
 * buys that theme, and Equip wears its look; `changed` applies and saves
 * either. */
export function renderThemeMenu(root: HTMLElement, game: PageGame, kind: ThemeKind, back: () => void, changed: () => void) {
  const owned = game.save.themes.length;
  const choices = [card(game, kind, "classic", CLASSIC_NAME, null), ...themesOf(kind).map((id) => card(game, kind, THEMES[id].look, THEMES[id].name, id))];
  root.innerHTML =
    `<button class="back" id="themes-back">${controlIcon("back")} Settings</button><div class="page-title"><small>${HEADINGS[kind].kicker}</small><h2>${HEADINGS[kind].title}</h2></div>` +
    `<p class="hint theme-gold">Every theme owned, UI or Game, adds ${THEME_GOLD_TEXT} for good. Owned: <b>${owned}</b> · ${goldIcon()}<b>${factorText(themeGoldFactor(game.save))}</b></p>` +
    `<div class="theme-grid">${choices.join("")}</div>`;
  el("themes-back").onclick = back;
  root.querySelectorAll<HTMLButtonElement>(".theme-wear").forEach((b) => {
    b.onclick = () => {
      if (game.themes.wear(kind, b.dataset.look!)) changed();
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".theme-buy").forEach((b) => {
    b.onclick = () => {
      if (game.themes.buy(b.dataset.id as ThemeId)) changed();
    };
  });
}

