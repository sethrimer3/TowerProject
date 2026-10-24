import { controlIcon } from "./control-icon.ts";
import { applyUiTheme } from "./medieval.ts";
import { renderThemeMenu, themeMenuTitle, wornName } from "./theme-menu.ts";
import type { ThemeKind } from "../theme-collection.ts";
import { SETTINGS, type SettingKey, type Settings } from "../save/settings.ts";
import type { Save } from "../save/shape.ts";
import type { AppContext, PageGame } from "./app.ts";
import type { BoardOverlay } from "./board-overlay.ts";
import { el } from "./dom.ts";
import { goalUnlocked } from "../goals.ts";
import { showStats } from "./stats-dialog.ts";
import { showHelp } from "./dialogs.ts";
import { exportProfile, importProfile } from "../profile-file.ts";

/** The settings on the page, in order; each control comes from its row in
 * SETTINGS. */
const PAGE = [
  "uiSprites", "spriteAnimations", "squareDoors", "transition", "fightAnimation", "brightness", "spritesOff", "decorOff", "batterySaver", "reduceMotion", "weatherSound",
  "infoDisplay", "cinematic", "cinematicIdle", "cinematicGems", "devMode", "freePurchases",
] as const satisfies readonly SettingKey[];
/** The settings on the Toggles menu, in order: the values the board shows
 * in a run. */
const TOGGLES = [
  "attackGains", "defenseGains", "hpGains", "keyGains", "doorGains", "goldGains", "silverGains", "xpGains", "comboGains",
  "damageVisual", "itemLabels", "hitNumbers", "enemyBars",
] as const satisfies readonly SettingKey[];
type PageKey = (typeof PAGE)[number] | (typeof TOGGLES)[number];

/** Settings that stay off the page until the upgrade (or the setting)
 * behind them is on. */
const SHOWN: Partial<Record<PageKey, (save: Save) => boolean>> = {
  spriteAnimations: (save) => save.settings.uiSprites,
  squareDoors: (save) => save.settings.uiSprites,
  fightAnimation: (save) => !!save.upgrades.instantCombat,
  damageVisual: (save) => goalUnlocked(save, "damageVisual"),
  itemLabels: (save) => goalUnlocked(save, "damageVisual"),
  cinematicIdle: (save) => save.settings.cinematic,
  cinematicGems: (save) => save.settings.cinematic,
};
const shownOf = (keys: readonly PageKey[], save: Save) => keys.filter((key) => SHOWN[key]?.(save) ?? true);

/** What a change does once written, beyond saving. */
const AFTER: Partial<Record<PageKey, (ctx: AppContext, overlay: BoardOverlay, s: Settings) => void>> = {
  uiSprites: (ctx) => {
    applyUiTheme(ctx.game.save);
    ctx.save();
    ctx.update();
    ctx.renderPage();
    el("ui-sprites")?.focus();
  },
  spritesOff: (ctx) => {
    applyUiTheme(ctx.game.save);
    ctx.save();
    ctx.update();
  },
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
      return `<label class="setting${key === "spriteAnimations" || key === "squareDoors" ? " sprite-option" : ""}">${row.page.label}<input type="checkbox" id="${row.page.id}" ${checked ? "checked" : ""}></label>`;
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
    `<button class="setting theme-open" id="${kind}-themes" data-kind="${kind}">${themeMenuTitle(kind)}<b>${wornName(game.save, kind)} ${controlIcon("forward")}</b></button>`).join("")}</div>`;

/** The Settings page: a way back to the board, the Stats dialog, the theme
 * menus, display and control options, and erase. */
export function renderSettingsPage(ctx: AppContext, overlay: BoardOverlay) {
  const { game } = ctx;
  if (menu === "toggles") {
    const keys = shownOf(TOGGLES, game.save);
    el("settings").innerHTML =
      `<button class="back" id="toggles-back">${controlIcon("back")} Settings</button><div class="page-title"><small>WHAT THE BOARD SHOWS IN A RUN</small><h2>Toggles</h2></div>` +
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
  el("settings").innerHTML =
    `<button class="back" id="settings-back">${controlIcon("back")} Back</button><div class="page-title"><h2>Settings</h2></div><button class="wide" id="stats-open">Stats</button>` +
    themeButtons(game) +
    `<button class="setting menu-open" id="toggles-open">Toggles<b>${controlIcon("forward")}</b></button>` +
    shownOf(PAGE, game.save).map((key) => control(key, game) + (key === (game.save.settings.uiSprites ? "squareDoors" : "uiSprites") ? `<p class="hint">Sprites apply to the default interface and board. Other UI and Game themes use their own art.</p>` : "")).join("") +
    `<p class="hint">Automation pauses outside the board tabs and while the browser is hidden. Progress saves after each action.</p>${game.save.settings.devMode ? profileButtons : ""}<button class="wide danger" id="erase">Erase all progress</button><p class="seed">RUN SEED · ${game.run.seed}</p>`;
  bindSettings(ctx, overlay);
}

/** Dev mode's profile file buttons: download everything kept between runs,
 * or load such a file over the whole save. */
const profileButtons =
  `<button class="wide" id="profile-export">Export profile</button><button class="wide" id="profile-import">Import profile</button><input type="file" id="profile-file" accept=".json,application/json,text/plain" hidden><p class="hint">A text file of everything kept between runs; a run in progress isn't in it. Importing replaces this profile and its runs.</p>`;

function bindProfileButtons(ctx: AppContext) {
  const { game } = ctx;
  el("profile-export").onclick = () => {
    const now = game.clock(), url = URL.createObjectURL(new Blob([exportProfile(game.save, now)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `tower-delve-profile-${new Date(now).toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoked once the download has taken the file.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const input = el("profile-file") as HTMLInputElement;
  el("profile-import").onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const read = importProfile(await file.text());
    if ("error" in read) return showHelp(ctx, "Import profile", "Can't import", `<p>${read.error}</p>`);
    ctx.confirm(
      {
        title: "Replace your profile?",
        body: `Everything here, both current runs included, is replaced by ${file.name}.`,
        label: "Import",
        cancel: "Keep this profile",
      },
      () => {
        game.replaceSave(read.save);
        applyUiTheme(game.save);
        ctx.save();
        ctx.navigate("tower");
      },
    );
  };
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
  if (game.save.settings.devMode) bindProfileButtons(ctx);
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
        applyUiTheme(game.save);
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
