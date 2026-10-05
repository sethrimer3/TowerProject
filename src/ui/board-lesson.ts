import type { BoardLesson, Game } from "../state.ts";
import { el, POINTER_SVG } from "./dom.ts";

// The lessons on the Tower's board (`game.boardLesson`): a note over the top
// of the board. The first run's (`climb`) and the forest's `enter` are
// dismissed by tapping the note; in the forest the tutorials' pointing hand
// shows the button to press next, Enter or the sign down the path to the
// Delve, and `delve` waits until the Delve is opened.

const NOTES: Record<BoardLesson, { title: string; text?: string }> = {
  climb: { title: "Climb the Tower to gain Inspiration, XP and resources." },
  enter: { title: "Enter the Tower to try again.", text: "Open Upgrades and check the Inspiration tree: the Inspiration this run earned unlocks new skills." },
  delve: { title: "Follow the path down to the Delve to gain Courage, XP and resources." },
};

/** Shows the waiting lesson's note (and, in the forest, its hand) while the
 * board shows, and removes them otherwise; `dismissed` runs after a tap on
 * a note that dismisses. */
export function renderBoardLesson(game: Game, onBoard: boolean, dismissed: () => void) {
  const lesson = onBoard ? game.boardLesson : null, frame = el("board-frame");
  let note = frame.querySelector<HTMLElement>(".board-tip");
  const pointer = document.querySelector<HTMLElement>(".forest-pointer");
  if (note && note.dataset.lesson !== lesson) {
    note.remove();
    note = null;
  }
  if (!lesson) {
    pointer?.remove();
    return;
  }
  if (!note) {
    const { title, text } = NOTES[lesson], body = `<b>${title}</b>${text ? `<p>${text}</p>` : ""}`;
    frame.insertAdjacentHTML("beforeend", lesson === "delve"
      ? `<div class="board-tip" role="status" data-lesson="${lesson}">${body}</div>`
      : `<button type="button" class="board-tip dismissable" data-lesson="${lesson}">${body}<small>Tap to dismiss</small></button>`);
    note = frame.querySelector<HTMLElement>(".board-tip")!;
    note.onclick = () => {
      if (game.dismissLesson()) dismissed();
    };
  }
  // In the forest the hand sits inside the button it points at: Enter,
  // from below, or the forest's sign, from above.
  const target = lesson === "climb" ? null : lesson === "enter" ? el("enter-run") : el("forest-sign");
  if (!target) pointer?.remove();
  else if (pointer?.parentElement !== target || pointer.dataset.lesson !== lesson) {
    pointer?.remove();
    target.insertAdjacentHTML("beforeend", `<span class="forest-pointer ${lesson}${game.save.settings.reduceMotion ? " still" : ""}" data-lesson="${lesson}">${POINTER_SVG}</span>`);
  }
}
