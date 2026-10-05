import type { Game } from "../state.ts";
import { el, POINTER_SVG } from "./dom.ts";

// The forest's lessons (`game.forestLesson`), shown on the Tower's board: a
// note over the board and the tutorials' pointing hand at the button that
// finishes the lesson, Enter or the Delve tab. Pressing it is the only way
// to finish one: entering a run, or opening the Delve.

const NOTES = {
  enter: "Climb the Tower to gain Inspiration, XP and resources.",
  delve: "Switch to a Delve run to gain Courage, XP and resources.",
} as const;

/** Shows the waiting lesson's note and hand while the board shows, and
 * removes them otherwise. */
export function renderForestLesson(game: Game, onBoard: boolean) {
  const lesson = onBoard ? game.forestLesson : null, frame = el("board-frame");
  let note = frame.querySelector<HTMLElement>(".forest-tip"), pointer = document.querySelector<HTMLElement>(".forest-pointer");
  if (!lesson) {
    note?.remove();
    pointer?.remove();
    return;
  }
  if (!note) {
    frame.insertAdjacentHTML("beforeend", `<div class="forest-tip" role="status"></div>`);
    note = frame.querySelector<HTMLElement>(".forest-tip")!;
  }
  if (note.dataset.lesson !== lesson) {
    note.dataset.lesson = lesson;
    note.textContent = NOTES[lesson];
  }
  // The hand sits inside the button it points at: Enter, from below, or
  // the Delve tab, from above.
  const target = lesson === "enter" ? el("auto") : document.querySelector<HTMLElement>(`nav [data-tab="delve"]`)!;
  if (pointer?.parentElement !== target || pointer.dataset.lesson !== lesson) {
    pointer?.remove();
    target.insertAdjacentHTML("beforeend", `<span class="forest-pointer ${lesson}${game.save.settings.reduceMotion ? " still" : ""}" data-lesson="${lesson}">${POINTER_SVG}</span>`);
  }
}
