import type { Game } from "../state.ts";
import { batteryIconUrl, type BatteryIcon } from "../render/boards/battery-board.ts";

/** Battery saver's stats: in place of the HUD (hidden while Battery saver is
 * on), a short centred row of HP, ATK, DEF, the keys held and the floor, each
 * a small white pixel icon and its value, then the Gold, Silver (while the
 * HUD shows it) and Gems held, with Back first, which turns
 * Battery saver off (`onBatteryExit`; Settings never leaves it), then the
 * few buttons a run needs (play or pause and Settings inside, Enter in the
 * forest, and the ad's Gems while they can be claimed), which press the
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
/** What Back does: set by main.ts, which turns Battery saver off. */
let exit = () => {};
/** Sets what Battery saver's Back button does. */
export function onBatteryExit(fn: () => void) {
  exit = fn;
}
const back = () => `<button type="button" class="battery-press battery-back" data-exit aria-label="Back: leave Battery saver" title="Back: leave Battery saver">${icon("back")}</button>`;
const press = (target: string, name: BatteryIcon, label: string, extra = "", after = "") => `<button type="button" class="battery-press${extra}" data-press="${target}" aria-label="${label}" title="${label}">${icon(name)}${after}</button>`;

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
      const target = e.target as HTMLElement;
      if (target.closest("[data-exit]")) return exit();
      const id = target.closest<HTMLElement>("[data-press]")?.dataset.press;
      if (id) document.getElementById(id)?.click();
    });
    board.before(hud);
  }
  const outside = !!game.run.outside;
  const stats = [stat("heart", textOf("hp"), "HP"), stat("sword", textOf("attack"), "ATK"), stat("shield", textOf("defense"), "DEF")];
  for (const key of ["yellow", "blue", "red"] as const) if (shown(key)) stats.push(stat(key, textOf(key), `${key === "yellow" ? "Gold" : key === "blue" ? "Blue" : "Red"} keys`));
  if (!outside) stats.push(stat("stairs", textOf("height"), "Floor"));
  // The currencies wrap to a line of their own together, never one alone.
  const purse = [stat("gold", textOf("gold"), "Gold")];
  if (shown("run-silver")) purse.push(stat("silver", textOf("run-silver"), "Silver"));
  purse.push(stat("gem", textOf("gems"), "Gems"));
  stats.push(`<span class="battery-purse">${purse.join("")}</span>`);
  // Before Auto-Climb, waiting for a card to be tapped shows pause, not play.
  const playing = game.auto && !game.paused, waiting = !outside && game.awaitsPress;
  const presses = outside
    ? [back(), press("enter-run", "enter", "Enter"), press("auto-settings", "cog", "Settings")]
    : [back(), press("auto", playing || waiting ? "pause" : "play", waiting ? "Waiting: tap a card to move" : playing ? "Pause" : "Play"), press("auto-settings", "cog", "Settings")];
  // No card can act: the HUD's End Climb shows, and a red warning sign
  // stands first in the row and presses it.
  const end = document.getElementById("stuck-end-run");
  if (!outside && end && !end.hidden) presses.unshift(press("stuck-end-run", "caution", `No card can act: ${end.textContent?.trim() || "End Climb"}`, " battery-alert"));
  // The ad's Gems, beside play and Settings while they can be claimed,
  // pressing the HUD's Gem button; cinematic mode has its own.
  const gems = document.getElementById("gem-ad") as HTMLButtonElement | null;
  if (gems && !gems.disabled && game.gemFinder.adReady && !document.documentElement.classList.contains("cinematic"))
    presses.push(press("gem-ad", "gem", gems.title || "Claim Gems", " battery-gems", `<b>${game.gemFinder.adBank.gems || game.gemFinder.adBank.each}</b>`));
  const html = `<div class="battery-stats">${stats.join("")}</div><div class="battery-presses">${presses.join("")}</div>`;
  if (hud.innerHTML !== html) hud.innerHTML = html;
}
