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
 * gone, unless the column would hold more than three buttons (Settings and
 * Missions, the Tournament's and Mail's): then the hamburger stays, holding
 * Settings and Mail (`forestMenu`). */

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

/** The most buttons the forest's actions column holds before the
 * hamburger folds some away. */
const FOREST_COLUMN = 3;
/** Whether the forest's column would hold more than it has room for
 * (Settings and Missions always, the Tournament's and Mail's when shown),
 * so the hamburger holds Settings and Mail. */
export const forestMenu = (game: Game) =>
  !!game.run.outside && 2 + Number(game.tournament.unlocked) + Number(game.mail.recent.length > 0) > FOREST_COLUMN;

/** Inside a run the hamburger stands in Settings' place and Settings moves
 * into the menu; End Run waits there too, shown at the foot of the height
 * column as well, and both red, only while no card can act. In a crowded
 * forest the hamburger holds Settings and Mail. */
export function renderRunMenu(game: Game) {
  const inside = !game.run.outside, stuck = inside && game.handStuck, forest = forestMenu(game), menu = inside || forest;
  if (!menu) closeRunMenu();
  el("run-menu-toggle").hidden = !menu;
  // The forest's menu has no Shop under the hamburger: one row of cells.
  el("run-menu").classList.toggle("forest", forest);
  el("run-research").hidden = el("end-run").hidden = !inside;
  const items = el("run-menu-items"), settings = el("auto-settings"), home = menu ? items : el("run-menu");
  if (settings.parentElement !== home) home.insertBefore(settings, menu ? home.firstChild : el("run-menu-toggle"));
  // Mail waits under Settings in a crowded forest's menu, else in the column under it.
  const mail = el("mail-button");
  if (forest && mail.previousElementSibling !== settings) items.insertBefore(mail, settings.nextElementSibling);
  else if (!forest && mail.previousElementSibling !== el("run-menu")) el("run-menu").after(mail);
  el("end-run").classList.toggle("deadlocked", stuck);
  el("stuck-end-run").classList.toggle("deadlocked", stuck);
  el("stuck-end-run").hidden = !stuck;
}
