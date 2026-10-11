import type { Game } from "../state.ts";
import { el } from "./dom.ts";

/** The HUD's menu: the hamburger at the top of the actions column. Pressed,
 * a thin white frame appears round it (and, inside a run, the Shop under
 * it) and slides left over the stats, settling with a bounce, as the
 * buttons it holds fade in. Inside a run they fill two rows: Settings
 * beside the hamburger with Research under it, then the Tournament's (once
 * entered), Missions and Events, End Run filling both rows at the far left,
 * each new column widening it leftward (`.run-menu-items` lays them out
 * right to left). In the forest they fill one row: Settings, Missions,
 * Relics (once Events are open) and Mail (while there is mail), with the
 * Tournament's and Events' buttons standing in the column under the
 * hamburger. Pressed again, they fade out, the frame slides back in and
 * goes (the timing is all in the CSS). */

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

/** Shows what the menu holds where it is: inside a run Research and End
 * Run, both red only while no card can act (End Run shown at the foot of
 * the height column then too), and the Tournament's and Events' buttons
 * folded into it; in the forest those two stand in the column, under the
 * hamburger, so they are always in sight. */
export function renderRunMenu(game: Game) {
  const inside = !game.run.outside, stuck = inside && game.handStuck;
  // The forest's menu has no Shop under the hamburger: one row of cells.
  el("run-menu").classList.toggle("forest", !inside);
  el("run-research").hidden = el("end-run").hidden = !inside;
  const tournament = el("tournament-button"), events = el("events-button");
  if (inside) {
    if (tournament.nextElementSibling !== el("missions-button")) el("missions-button").before(tournament);
    if (events.nextElementSibling !== el("relics-button")) el("relics-button").before(events);
  } else {
    if (el("run-menu").nextElementSibling !== tournament) el("run-menu").after(tournament);
    if (tournament.nextElementSibling !== events) tournament.after(events);
  }
  el("end-run").classList.toggle("deadlocked", stuck);
  el("stuck-end-run").classList.toggle("deadlocked", stuck);
  el("stuck-end-run").hidden = !stuck;
}
