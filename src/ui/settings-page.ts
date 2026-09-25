import { defaults } from "../save.ts";
import type { Save } from "../entities.ts";
import type { AppContext } from "./app.ts";
import type { BoardOverlay } from "./board-overlay.ts";
import { displayedProgress, el } from "./dom.ts";

type Settings = Save["settings"];
/** A checkbox setting: how it reads and writes the save, and whether a change
 * only needs saving or also a HUD refresh (which saves too). */
type Toggle = {
  id: string;
  label: string;
  read(s: Settings): boolean;
  write(s: Settings, checked: boolean): void;
  refresh?: "hud";
};

const TOGGLES: Toggle[] = [
  { id: "sprites-off", label: "Turn off Sprites", read: s => !!s.spritesOff, write: (s, on) => { s.spritesOff = on; } },
  { id: "decor", label: "Environment decor", read: s => !s.decorOff, write: (s, on) => { s.decorOff = !on; } },
  { id: "battery-saver", label: "Battery saver (30 fps while idle)", read: s => !!s.batterySaver, write: (s, on) => { s.batterySaver = on; } },
  { id: "arrows", label: "Show directional buttons", read: s => !!s.showArrows, write: (s, on) => { s.showArrows = on; }, refresh: "hud" },
  { id: "motion", label: "Reduce motion", read: s => !!s.reduceMotion, write: (s, on) => { s.reduceMotion = on; } },
  { id: "weather-sound", label: "Weather sounds", read: s => s.weatherSound !== false, write: (s, on) => { s.weatherSound = on; }, refresh: "hud" },
];
const INFO_DISPLAYS = [["both", "Popup + status line"], ["popup", "Popup only"], ["status", "Status line only"], ["none", "Off"]] as const;
const TRANSITIONS = [["smooth", "Smooth"], ["fast", "Fast"], ["instant", "Off (instant)"]] as const;

const checkbox = (label: string, id: string, checked: boolean) =>
  `<label class="setting">${label}<input type="checkbox" id="${id}" ${checked ? "checked" : ""}></label>`;
const options = (choices: readonly (readonly [string, string])[], selected: string) =>
  choices.map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");

/** The Settings page: display and control options, retire, and erase. */
export function renderSettingsPage(ctx: AppContext, overlay: BoardOverlay) {
  const { game } = ctx, s = game.save.settings;
  const brightness = s.brightness ?? 100;
  const run = game.mode === "tower" ? "ascent" : "delve";
  el("settings").innerHTML =
    `<div class="page-title"><small>MAKE THE ASCENT YOUR OWN</small><h2>Settings</h2></div>` +
    `<label class="setting">Automove speed<select id="speed">${[1, 3, 6, 10].map((n) => `<option ${s.speed === n ? "selected" : ""} value="${n}">${n} steps / sec</option>`).join("")}</select></label>` +
    `<label class="setting">Movement transition<select id="transition">${options(TRANSITIONS, s.transition)}</select></label>` +
    `<label class="setting">Brightness<span class="range-setting"><input type="range" id="brightness" min="20" max="100" step="5" value="${brightness}" aria-label="Dungeon brightness"><output id="brightness-value">${brightness}</output></span></label>` +
    TOGGLES.map(t => checkbox(t.label, t.id, t.read(s))).join("") +
    `<label class="setting">Tile info display<select id="info-display">${options(INFO_DISPLAYS, s.infoDisplay ?? "both")}</select></label>` +
    checkbox("Move with one tap", "one-tap", !!s.oneTapMove) +
    checkbox("Dev mode (unlimited currency, all floors &amp; modes unlocked)", "dev-mode", !!s.devMode) +
    `<p class="hint">Automation pauses outside the board tabs and while the browser is hidden. Progress saves after each action.</p><button class="wide" id="retire">Retire this ${run}</button><p class="hint">Keep your milestone rewards and enter a freshly generated ${game.mode === "tower" ? "tower" : "descent"}.</p><button class="wide danger" id="erase">Erase all progress</button><p class="seed">RUN SEED · ${game.run.seed}</p>`;
  bindSettings(ctx, overlay);
}

function bindSettings(ctx: AppContext, overlay: BoardOverlay) {
  const { game } = ctx;
  // Read live: erasing progress replaces the whole save.
  const s = () => game.save.settings;
  const input = (id: string) => el(id) as HTMLInputElement;
  const select = (id: string) => el(id) as HTMLSelectElement;
  for (const t of TOGGLES)
    input(t.id).onchange = () => {
      t.write(s(), input(t.id).checked);
      if (t.id === "weather-sound" && !s().weatherSound) ctx.renderer.weather.silence();
      if (t.refresh === "hud") ctx.update();
      else ctx.save();
    };
  select("speed").onchange = () => {
    s().speed = Number(select("speed").value);
    ctx.save();
  };
  // Live preview while dragging; the renderer reads the setting each frame.
  input("brightness").oninput = () => {
    s().brightness = Number(input("brightness").value);
    el("brightness-value").textContent = String(s().brightness);
  };
  input("brightness").onchange = () => ctx.save();
  select("transition").onchange = () => {
    s().transition = select("transition").value as Settings["transition"];
    ctx.save();
  };
  select("info-display").onchange = () => {
    s().infoDisplay = select("info-display").value as Settings["infoDisplay"];
    if (s().infoDisplay === "status" || s().infoDisplay === "none") overlay.hideInspect();
    ctx.save();
    ctx.update();
  };
  input("one-tap").onchange = () => {
    s().oneTapMove = input("one-tap").checked;
    ctx.save();
  };
  input("dev-mode").onchange = () => {
    game.setDevMode(input("dev-mode").checked);
    ctx.save();
    ctx.update();
    ctx.renderPage();
  };
  el("retire").onclick = () =>
    ctx.confirm(
      "Leave your mark?",
      `Retire at ${game.mode === "tower" ? "height" : "depth"} ${displayedProgress(game.run.height, !!game.run.outside)}. Milestone rewards are already yours. Uncollected clear chests will be claimed.`,
      "Retire ascent",
      () => {
        game.finish("Ascent retired");
        ctx.update();
      },
    );
  el("erase").onclick = () =>
    ctx.confirm(
      "Erase your legacy?",
      "All currencies, upgrades, records, and both current runs will be permanently erased.",
      "Erase everything",
      () => {
        game.save = defaults();
        game.summary = null;
        game.mode = "tower";
        game.newRun(true);
        ctx.save();
        ctx.navigate("tower");
      },
    );
}
