import type { Game } from "../state.ts";
import { MODES } from "../modes.ts";
import { el } from "./dom.ts";
import { researchOpen } from "../progression/loadout.ts";

/** The HUD's menu: the hamburger at the top of the actions column. Pressed,
 * a thin white frame appears round it and the button under it (inside a run
 * the Shop, in the forest the Tournament's, on the Catacomb screen Switch
 * Back) and slides left over the stats, settling with a bounce, as the
 * buttons it holds fade in. They fill two rows, a column at a time: Settings
 * beside the hamburger with the Codex under it, then Research, the
 * Tournament's (inside a run, once entered; on the Catacomb screen), Missions,
 * Events, Relics, Mail and the rest, End Run filling both rows at the far
 * left, each new column widening it leftward (`.run-menu-items` lays them
 * out right to left). With nothing under the hamburger (the forest before
 * the Tournament opens) they fill one row. In the forest the Events' button
 * stands in the column under the frame, always in sight. Pressed again,
 * they fade out, the frame slides back in and goes (the timing is all in
 * the CSS). */

/** Opens the menu, or closes it when open. */
export function toggleRunMenu(reduceMotion: boolean) {
  const menu = el("run-menu"), items = el("run-menu-items"), toggle = el("run-menu-toggle");
  if (menu.classList.contains("open")) return closeRunMenu(reduceMotion);
  // Each cell is as wide as the column's buttons; the frame opens to fit
  // every cell, the column's own and the gap between them included.
  menu.style.setProperty("--cell", `${toggle.offsetWidth}px`);
  // One row only while the hamburger stands alone in the frame.
  const cells = [...menu.children].filter((e) => e.classList.contains("mini-action") && (e as HTMLElement).offsetParent !== null).length;
  menu.classList.toggle("single", cells < 2);
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
 * folded into it, as on the Catacomb screen; in the forest the Tournament's
 * stands under the hamburger, in its frame as a run's Shop does, and the
 * Events' in the column under it, so they are always in sight. */
export function renderRunMenu(game: Game) {
  // The first climb can't end until the Chrono Anchor is held (divine.ts): no End Climb shows.
  const inside = !game.run.outside, stuck = inside && game.handStuck, locked = game.endLocked;
  const folded = inside || document.documentElement.classList.contains("catacombs");
  el("end-run").hidden = !inside || locked;
  el("run-research").hidden = !inside || !researchOpen(game.save);
  // The Catacomb button, everywhere once a Catacomb run is under way (none in a trial).
  el("catacombs-button").hidden = !game.catacombs.open || !game.catacombs.run;
  const tournament = el("tournament-button"), events = el("events-button");
  if (folded) {
    if (tournament.nextElementSibling !== el("missions-button")) el("missions-button").before(tournament);
    if (events.nextElementSibling !== el("relics-button")) el("relics-button").before(events);
  } else {
    if (el("run-menu-toggle").nextElementSibling !== tournament) el("run-menu-toggle").after(tournament);
    if (el("run-menu").nextElementSibling !== events) el("run-menu").after(events);
  }
  setEndRunLabel(game);
  el("end-run").classList.toggle("deadlocked", stuck);
  el("stuck-end-run").classList.toggle("deadlocked", stuck);
  el("stuck-end-run").hidden = !stuck || locked;
}

/** Names the End Run buttons for the mode: End Climb in the Tower, End Run
 * in the Delve (and restores the menu's after a trial renamed it). */
export function setEndRunLabel(game: Game) {
  const words = MODES[game.mode].words, end = el("end-run"), html = `<small>${words.endRun.toUpperCase()}</small>`;
  if (end.innerHTML !== html) end.innerHTML = html;
  end.title = el("stuck-end-run").textContent = words.endRun;
  end.setAttribute("aria-label", `End current ${words.run}`);
  el("stuck-end-run").setAttribute("aria-label", `End current ${words.run}`);
}
