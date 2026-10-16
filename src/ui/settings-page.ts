import { applyUiTheme } from "./medieval.ts";
import { renderThemeMenu, themeMenuTitle, wornName } from "./theme-menu.ts";
import type { ThemeKind } from "../theme-collection.ts";
import { SETTINGS, type SettingKey, type Settings } from "../settings.ts";
import type { Save } from "../entities.ts";
import type { AppContext, PageGame } from "./app.ts";
import type { BoardOverlay } from "./board-overlay.ts";
import { capitalized, displayedProgress, el } from "./dom.ts";
import { MODES } from "../modes.ts";
import { goalUnlocked } from "../goals.ts";
import { showStats } from "./stats-dialog.ts";

/** The settings on the page, in order; each control comes from its row in
 * SETTINGS. */
const PAGE = [
  "transition", "fightAnimation", "brightness", "spritesOff", "decorOff", "batterySaver", "reduceMotion", "weatherSound",
  "infoDisplay", "cinematic", "cinematicIdle", "cinematicGems", "devMode", "freePurchases",
] as const satisfies readonly SettingKey[];
/** The settings on the Toggles menu, in order: the values the board shows
 * in a run. */
const TOGGLES = [
  "attackGains", "defenseGains", "hpGains", "keyGains", "doorGains", "goldGains", "silverGains", "damageVisual", "hitNumbers",
] as const satisfies readonly SettingKey[];
type PageKey = (typeof PAGE)[number] | (typeof TOGGLES)[number];

/** Settings that stay off the page until the upgrade (or the setting)
 * behind them is on. */
const SHOWN: Partial<Record<PageKey, (save: Save) => boolean>> = {
  fightAnimation: (save) => !!save.upgrades.instantCombat,
  damageVisual: (save) => goalUnlocked(save, "damageVisual"),
  cinematicIdle: (save) => save.settings.cinematic,
  cinematicGems: (save) => save.settings.cinematic,
};
const shownOf = (keys: readonly PageKey[], save: Save) => keys.filter((key) => SHOWN[key]?.(save) ?? true);

/** What a change does once written, beyond saving. */
const AFTER: Partial<Record<PageKey, (ctx: AppContext, overlay: BoardOverlay, s: Settings) => void>> = {
  reduceMotion: (ctx) => applyUiTheme(ctx.game.save),
  // The board silences the weather itself once sound is off.
  weatherSound: (ctx) => ctx.update(),
  infoDisplay: (ctx, overlay, s) => {
    if (s.infoDisplay === "status" || s.infoDisplay === "none") overlay.hideInspect();
    ctx.save();
    ctx.update();
  },
  // Its two options show only while it is on.
  cinematic: (ctx) => {
    ctx.save();
    ctx.renderPage();
  },
  // Turning it on also grants everything it unlocks.
  devMode: (ctx, _, s) => {
    ctx.game.setDevMode(s.devMode);
    ctx.save();
    ctx.update();
    ctx.renderPage();
  },
};

const options = (choices: readonly (readonly [string | number, string])[], selected: string | number) =>
  choices.map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");

/** One setting's control, showing its current value. */
function control(key: PageKey, game: PageGame): string {
  const row = SETTINGS[key], value = game.save.settings[key];
  switch (row.kind) {
    case "toggle": {
      const checked = "invert" in row.page ? !value : value;
      return `<label class="setting">${row.page.label}<input type="checkbox" id="${row.page.id}" ${checked ? "checked" : ""}></label>`;
    }
    case "choice":
      return `<label class="setting">${row.page.label}<select id="${row.page.id}">${options(row.choices, value as string | number)}</select></label>`;
    case "range":
      return `<label class="setting">${row.page.label}<span class="range-setting"><input type="range" id="${row.page.id}" min="${row.min}" max="${row.max}" step="${row.step}" value="${value}" aria-label="${row.page.aria}"><output id="${row.page.id}-value">${value}</output></span></label>`;
  }
}

/** The menu open over the Settings page, if any (a theme menu, or the
 * Toggles): kept while the page redraws, closed by its Back. */
let menu: ThemeKind | "toggles" | null = null;

/** The buttons that open each kind's theme menu, naming the look worn. */
const themeButtons = (game: PageGame) =>
  `<div class="theme-buttons">${(["ui", "game"] as const).map((kind) =>
    `<button class="setting theme-open" id="${kind}-themes" data-kind="${kind}">${themeMenuTitle(kind)}<b>${wornName(game.save, kind)} ›</b></button>`).join("")}</div>`;

/** The Settings page: a way back to the board, the Stats dialog, the theme
 * menus, display and control options, retire, and erase. */
export function renderSettingsPage(ctx: AppContext, overlay: BoardOverlay) {
  const { game } = ctx;
  if (menu === "toggles") {
    const keys = shownOf(TOGGLES, game.save);
    el("settings").innerHTML =
      `<button class="back" id="toggles-back">← Settings</button><div class="page-title"><small>WHAT THE BOARD SHOWS IN A RUN</small><h2>Toggles</h2></div>` +
      keys.map((key) => control(key, game)).join("");
    el("toggles-back").onclick = () => {
      menu = null;
      ctx.renderPage();
    };
    bindControls(ctx, overlay, keys);
    return;
  }
  if (menu) {
    renderThemeMenu(el("settings"), game, menu, () => {
      menu = null;
      ctx.renderPage();
    }, () => {
      applyUiTheme(game.save);
      ctx.save();
      ctx.update();
      ctx.renderPage();
    });
    return;
  }
  const words = MODES[game.mode].words;
  el("settings").innerHTML =
    `<button class="back" id="settings-back">← Back</button><div class="page-title"><small>MAKE THE ASCENT YOUR OWN</small><h2>Settings</h2></div><button class="wide" id="stats-open">Stats</button>` +
    themeButtons(game) +
    `<button class="setting menu-open" id="toggles-open">Toggles<b>›</b></button>` +
    shownOf(PAGE, game.save).map((key) => control(key, game)).join("") +
    `<p class="hint">Automation pauses outside the board tabs and while the browser is hidden. Progress saves after each action.</p><button class="wide" id="retire">Retire this ${words.run}</button><p class="hint">Keep your milestone rewards and enter a freshly generated ${words.fresh}.</p><button class="wide danger" id="erase">Erase all progress</button><p class="seed">RUN SEED · ${game.run.seed}</p>`;
  bindSettings(ctx, overlay);
}

function bindSettings(ctx: AppContext, overlay: BoardOverlay) {
  const { game } = ctx;
  el("settings-back").onclick = () => ctx.navigate(game.mode);
  el("stats-open").onclick = () => showStats(ctx);
  document.querySelectorAll<HTMLButtonElement>(".theme-open").forEach((b) => {
    b.onclick = () => {
      menu = b.dataset.kind as ThemeKind;
      ctx.renderPage();
    };
  });
  el("toggles-open").onclick = () => {
    menu = "toggles";
    ctx.renderPage();
  };
  bindControls(ctx, overlay, shownOf(PAGE, game.save));
  el("retire").onclick = () =>
    ctx.confirm(
      {
        title: "Leave your mark?",
        body: `Retire at ${MODES[game.mode].words.progress} ${displayedProgress(game.run.height, !!game.run.outside)}. Milestone rewards are already yours.`,
        label: `Retire ${MODES[game.mode].words.run}`,
        cancel: MODES[game.mode].words.keepGoing,
      },
      () => {
        game.finish(`${capitalized(MODES[game.mode].words.run)} retired`);
        ctx.navigate(game.mode);
      },
    );
  el("erase").onclick = () =>
    ctx.confirm(
      {
        title: "Erase your legacy?",
        body: "All currencies, upgrades, records, and both current runs will be permanently erased.",
        label: "Erase everything",
        cancel: "Keep everything",
      },
      () => {
        game.eraseAll();
        ctx.save();
        ctx.navigate("tower");
      },
    );
}

/** Writes each of `keys`' controls' changes to its setting. */
function bindControls(ctx: AppContext, overlay: BoardOverlay, keys: readonly PageKey[]) {
  const { game } = ctx;
  // Read live: erasing progress replaces the whole save.
  const s = () => game.save.settings;
  for (const key of keys) {
    const row = SETTINGS[key], input = el(row.page.id) as HTMLInputElement & HTMLSelectElement;
    const changed = () => (AFTER[key] ?? (() => ctx.save()))(ctx, overlay, s());
    const set = (value: unknown) => { (s() as Record<SettingKey, unknown>)[key] = value; };
    switch (row.kind) {
      case "toggle":
        input.onchange = () => {
          const on = "invert" in row.page ? !input.checked : input.checked;
          set(on);
          changed();
        };
        break;
      case "choice":
        input.onchange = () => {
          set(row.choices.find(([c]) => String(c) === input.value)?.[0]);
          changed();
        };
        break;
      case "range":
        // Live preview while dragging; the renderer reads the setting each frame.
        input.oninput = () => {
          set(Number(input.value));
          el(`${row.page.id}-value`).textContent = String(s()[key]);
        };
        input.onchange = changed;
        break;
    }
  }
}
