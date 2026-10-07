import type { Game } from "../state.ts";
import { el } from "./dom.ts";

/** Inside a run, the HUD's menu: the hamburger at the top of the actions
 * column, in Settings' place. Pressed, a thin white frame appears round it
 * and the Shop under it and slides left over the stats, settling with a
 * bounce, as the buttons it holds fade in, two rows of them: Settings
 * beside the hamburger with Research under it, End Run filling both rows at
 * the far left, and more to come, each new column widening it leftward
 * (`.run-menu-items` lays them out right to left). Pressed again, they fade
 * out, the frame slides back in and goes (the timing is all in the CSS).
 * In the forest Settings stands back in the column and the hamburger is
 * gone. */

/** Opens the menu, or closes it when open. */
export function toggleRunMenu(reduceMotion: boolean) {
  const menu = el("run-menu"), items = el("run-menu-items"), toggle = el("run-menu-toggle");
  if (menu.classList.contains("open")) return closeRunMenu(reduceMotion);
  // Each cell is as wide as the column's buttons; the frame opens to fit
  // every cell, the column's own and the gap between them included.
  menu.style.setProperty("--cell", `${toggle.offsetWidth}px`);
  menu.style.setProperty("--open-width", `${items.offsetWidth + menu.offsetWidth + 10}px`);
  menu.classList.toggle("instant", reduceMotion);
  menu.classList.add("open");
  items.inert = false;
  toggle.setAttribute("aria-expanded", "true");
}

/** Closes the menu: at once (leaving the board, ending the run), or
 * sliding back in unless motion is reduced. */
export function closeRunMenu(reduceMotion = true) {
  const menu = el("run-menu");
  if (!menu.classList.contains("open")) return;
  menu.classList.toggle("instant", reduceMotion);
  menu.classList.remove("open");
  el("run-menu-items").inert = true;
  el("run-menu-toggle").setAttribute("aria-expanded", "false");
}

/** Inside a run the hamburger stands in Settings' place and Settings moves
 * into the menu; End Run waits there too, shown at the foot of the height
 * column as well, and both red, only while no card can act. */
export function renderRunMenu(game: Game) {
  const inside = !game.run.outside, stuck = inside && game.handStuck;
  if (!inside) closeRunMenu();
  el("run-menu-toggle").hidden = !inside;
  const settings = el("auto-settings"), home = inside ? el("run-menu-items") : el("run-menu");
  if (settings.parentElement !== home) home.insertBefore(settings, inside ? home.firstChild : el("run-menu-toggle"));
  el("end-run").classList.toggle("deadlocked", stuck);
  el("stuck-end-run").classList.toggle("deadlocked", stuck);
  el("stuck-end-run").hidden = !stuck;
}
