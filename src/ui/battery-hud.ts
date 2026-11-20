import type { Game } from "../state.ts";
import { batteryIconUrl, type BatteryIcon } from "../render/boards/battery-board.ts";

/** Battery saver's stats: in place of the HUD (hidden while Battery saver is
 * on), a short centred row of HP, ATK, DEF, the keys held and the floor, each
 * a small white pixel icon and its value, with the few buttons a run needs
 * (play or pause and Settings inside, Enter in the forest), which press the
 * HUD's own, and a red warning sign while no card can act, which presses
 * End Climb. It reads the values the HUD has just written, so the two never
 * disagree. Made only while Battery saver is on, and removed with it. */

const ID = "battery-hud";

const icon = (name: BatteryIcon) => {
  const url = batteryIconUrl(name);
  return url ? `<img src="${url}" alt="">` : "";
};
const textOf = (id: string) => document.getElementById(id)?.textContent?.trim() ?? "";
/** Whether the HUD shows the stat whose value is `id` (its box not hidden). */
const shown = (id: string) => {
  const box = document.getElementById(id)?.parentElement;
  return !!box && !box.hidden;
};
const stat = (name: BatteryIcon, value: string, label: string) => `<span class="battery-stat" title="${label}">${icon(name)}<b>${value}</b></span>`;
const press = (target: string, name: BatteryIcon, label: string, extra = "") => `<button type="button" class="battery-press${extra}" data-press="${target}" aria-label="${label}" title="${label}">${icon(name)}</button>`;

export function renderBatteryHud(game: Game) {
  let hud = document.getElementById(ID);
  if (!game.save.settings.batterySaver) {
    hud?.remove();
    return;
  }
  const board = document.getElementById("board");
  if (!board) return;
  if (!hud) {
    hud = document.createElement("section");
    hud.id = ID;
    hud.className = "battery-hud";
    hud.setAttribute("aria-label", "Stats");
    hud.addEventListener("click", (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>("[data-press]")?.dataset.press;
      if (id) document.getElementById(id)?.click();
    });
    board.before(hud);
  }
  const outside = !!game.run.outside;
  const stats = [stat("heart", textOf("hp"), "HP"), stat("sword", textOf("attack"), "ATK"), stat("shield", textOf("defense"), "DEF")];
  for (const key of ["yellow", "blue", "red"] as const) if (shown(key)) stats.push(stat(key, textOf(key), `${key === "yellow" ? "Gold" : key === "blue" ? "Blue" : "Red"} keys`));
  if (!outside) stats.push(stat("stairs", textOf("height"), "Floor"));
  const playing = game.auto && !game.paused;
  const presses = outside
    ? [press("enter-run", "enter", "Enter"), press("auto-settings", "cog", "Settings")]
    : [press("auto", playing ? "pause" : "play", playing ? "Pause" : "Play"), press("auto-settings", "cog", "Settings")];
  // No card can act: the HUD's End Climb shows, and a red warning sign
  // stands first in the row and presses it.
  const end = document.getElementById("stuck-end-run");
  if (!outside && end && !end.hidden) presses.unshift(press("stuck-end-run", "caution", `No card can act: ${end.textContent?.trim() || "End Climb"}`, " battery-alert"));
  const html = `<div class="battery-stats">${stats.join("")}</div><div class="battery-presses">${presses.join("")}</div>`;
  if (hud.innerHTML !== html) hud.innerHTML = html;
}
