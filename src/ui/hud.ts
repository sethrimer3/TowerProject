import type { Game } from "../state.ts";
import type { Renderer } from "../rendering.ts";
import { levelForXp } from "../config.ts";
import { CONSUMABLES } from "../crafting.ts";
import { outsideWeather } from "../outside.ts";
import { displayedProgress, el, text } from "./dom.ts";
import type { BoardOverlay } from "./board-overlay.ts";

/** The stats cluster, action buttons and status line around the board. */

export const devAmount = (game: Game, value: number) => game.save.settings.devMode ? "∞" : String(value);

/** Refreshes every HUD readout from game state. */
export function renderHud(game: Game, renderer: Renderer, overlay: BoardOverlay) {
  overlay.clearIfAt(game.run.player);
  renderVitals(game);
  renderConsumables(game);
  renderProgress(game);
  renderModeActions(game);
  text("essence", devAmount(game, game.save.delve.essence));
  text("shards", devAmount(game, game.save.tower.shards));
  text("level", `LV ${levelForXp(game.save.xp)}`);
  renderStatus(game, overlay);
  el("health").style.width = `${(100 * game.run.player.hp) / game.run.player.maxHp}%`;
  text("auto-state", game.save.upgrades.auto ? (game.auto ? "ON" : "OFF") : "LOCKED");
  el("auto").classList.toggle("enabled", game.auto);
  text("density-label", `${renderer.density} × ${renderer.density}`);
  renderUndo(game);
  (document.querySelector(".dpad") as HTMLElement).hidden = !game.save.settings.showArrows;
  renderLockedTab("delve", !!game.save.upgrades.delve, "Delve", "Unlock Into the depths in the Inspiration tree");
  renderLockedTab("defend", !!game.save.upgrades.legacy, "Defend", "Unlock An enduring legacy in the Courage tree");
}

/** The board's title, subtitle and caption: the forest clearing outside, or
 * the Tower/Delve name inside. */
export function renderBoardHeading(game: Game, overlay: BoardOverlay) {
  el("board").dataset.outside = String(!!game.run.outside);
  el("board").classList.toggle("mode-tower", game.mode === "tower");
  const tower = game.mode === "tower";
  if (game.run.outside) {
    text("board-title", tower ? "THE TOWER APPROACH" : "THE MOUNTAIN HOLLOW");
    text("height-zone", tower ? "THE TOWER APPROACH" : "THE MOUNTAIN HOLLOW");
    const labels = { cloudy: "CLOUDY", sunny: "SUNNY", rain: "RAINING", storm: "THUNDERSTORM" };
    text("board-subtitle", `FOREST CLEARING · ${labels[outsideWeather(game.run.seed)]}`);
    el("inspect").textContent = "Follow the forest path and step onto the entrance at the top to begin again.";
  } else {
    text("board-title", tower ? "THE ASCENT TRIALS" : "THE HOLLOW SPIRE");
    text("height-zone", tower ? "THE ASCENT TRIALS" : "THE HOLLOW SPIRE");
    text("board-subtitle", tower ? "ONE CHAMBER AT A TIME" : "HIGHER DANGERS · GREATER REWARDS");
    el("inspect").textContent = "";
  }
  overlay.hide();
}

/** True when the heading still shows the other side of the forest entrance. */
export const boardHeadingStale = (game: Game) => el("board").dataset.outside !== String(!!game.run.outside);

function renderVitals(game: Game) {
  const p = game.run.player;
  text("hp", `${p.hp} / ${p.maxHp}`);
  text("attack", p.attack);
  text("defense", p.defense);
  for (const k of ["yellow", "blue", "red"] as const) text(k, p.keys[k]);
  const skeletonKeys = p.skeletonKeys ?? 0;
  text("skeleton", skeletonKeys);
  el("skeleton-key").hidden = skeletonKeys < 1;
}

function renderConsumables(game: Game) {
  for (const c of CONSUMABLES) {
    const count = game.save.consumables[c.id] ?? 0;
    const countEl = document.querySelector<HTMLElement>(`[data-consumable-count="${c.id}"]`)!;
    const button = countEl.closest("button") as HTMLButtonElement;
    countEl.textContent = String(count);
    button.disabled = count < 1 || game.run.outside || !!game.summary;
  }
}

/** Current height/depth, the run and all-time bests, and the reward a new
 * best would pay. */
function renderProgress(game: Game) {
  const outside = !!game.run.outside,
    delve = game.mode === "delve";
  text("height-label", delve ? "DEPTH" : "HEIGHT");
  const rawRunBest = game.run.maxHeight ?? game.run.height;
  const rawAllBest = game.save[game.mode].best;
  text("height", displayedProgress(game.run.height, outside));
  text("best-run", displayedProgress(rawRunBest, outside));
  text("best-all", displayedProgress(rawAllBest));
  const rewardEl = el("best-reward");
  rewardEl.hidden = rawRunBest <= rawAllBest;
  if (rewardEl.hidden) return;
  const divisor = delve ? 10 : 1;
  text("best-reward-val", Math.floor(rawRunBest / divisor) - Math.floor(rawAllBest / divisor));
  text("best-reward-type", delve ? "COURAGE" : "INSPIRATION");
}

/** Log and Floors act on the Tower; in the Delve they are placeholders. */
function renderModeActions(game: Game) {
  const tower = game.mode === "tower";
  const logButton = el("log") as HTMLButtonElement;
  const floorsButton = el("section-pick") as HTMLButtonElement;
  logButton.textContent = tower ? "Log" : "Button 1";
  logButton.setAttribute("aria-label", tower ? "Adventure log" : "Future Delve action 1");
  floorsButton.textContent = tower ? "Floors" : "Button 2";
  floorsButton.setAttribute("aria-label", tower ? "Choose starting floor" : "Future Delve action 2");
  floorsButton.title = tower ? "Choose starting floor" : "Future Delve action 2";
  logButton.classList.toggle("placeholder-action", !tower);
  floorsButton.classList.toggle("placeholder-action", !tower);
}

function renderStatus(game: Game, overlay: BoardOverlay) {
  el("status-row").hidden = (game.save.settings.infoDisplay ?? "both") === "popup";
  text("message", game.paused ? "Paused · take a breath." : overlay.statusLine() ?? game.message);
}

/** The undo button doubles as Revive while a revival is pending. */
function renderUndo(game: Game) {
  const slice = game.save[game.mode],
    undo = el("undo") as HTMLButtonElement,
    count = `${slice.history.length}/${game.undoCapacity}`;
  text("undo-state", slice.revival ? "REVIVE" : count);
  undo.classList.toggle("enabled", !!slice.revival);
  undo.setAttribute("aria-label", slice.revival ? "Revive" : `Undo (${count})`);
  undo.disabled = !slice.revival && !slice.history.length;
}

function renderLockedTab(id: string, unlocked: boolean, name: string, hint: string) {
  const tab = document.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`);
  if (!tab) return;
  tab.hidden = !unlocked;
  tab.title = unlocked ? name : hint;
  tab.setAttribute("aria-label", unlocked ? name : `${name} (locked)`);
}
