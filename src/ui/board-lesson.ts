import type { BoardLesson, Game } from "../state.ts";
import { el, POINTER_SVG } from "./dom.ts";

// The lessons on the board (`game.boardLesson`): a note over the top of the
// board. Inside a run the tutorials' pointing hand shows the card to press
// (STAIRS on the first run, then KEY and DOOR) and, while the hand is stuck,
// End Run flashes slowly; in the forest the hand shows the button to press
// next, the Upgrades tab, Enter, the Deck tab, the sign down the path to
// the Delve or, once a first provision is open, the Gear tab. Only `enter` is dismissed by tapping its note; the others wait
// on what they ask for (`cards` on the Deck page, which takes the lesson on).
// Each hand sits inside what it points at.

/** The provisions lesson's note, on the board and the Upgrades page alike. */
export const PROVISIONS_NOTE = { title: "Provisions unlocked.", text: "Press the Gear tab to buy provisions with Gold: limited-use items every run carries, pressed beside the board when you need them." };

const NOTES: Record<BoardLesson, { title: string; text?: string }> = {
  climb: { title: "Press the Stairs card to climb.", text: "Each card in your hand sends the hero toward what it names. Climb the Tower to gain Inspiration, XP and resources." },
  keys: { title: "Press Key and Door to collect keys and open doors.", text: "Key heads for the closest key, and Door for a door your keys open, or a Wooden Door your HP can break down." },
  stuck: { title: "No card can take you further.", text: "The Inspiration this run earned unlocks new abilities to climb higher. Press End Run, then spend it on the Inspiration tree." },
  enemy: { title: "An enemy blocks the way.", text: "Unlock the Enemy card on the Inspiration tree to fight it. Press End Run to go and spend your Inspiration." },
  upgrades: { title: "Spend your Inspiration.", text: "Open Upgrades: the Inspiration tree's skills give you new abilities." },
  enter: { title: "Press Enter to try another run." },
  cards: { title: "Your cards gain levels as you use them.", text: "Each level grants a card point. Open your Deck to spend it." },
  delve: { title: "Follow the path down to the Delve to gain Courage, XP and resources." },
  provisions: PROVISIONS_NOTE,
};

/** What each lesson's pointing hands point at, and from where (the
 * pointer's class): the hand cards from above, Enter from below, the tabs
 * (the Tower tab's `back`, from the Upgrades page, and the Gear tab's
 * `provisions` there too) and the forest's sign from above. */
function targets(lesson: BoardLesson | "back"): HTMLElement[] {
  const card = (id: string) => document.querySelector<HTMLElement>(`#hand .hand-card[data-card="${id}"]`);
  const tab = (id: string) => document.querySelector<HTMLElement>(`nav [data-tab="${id}"]`);
  const found = {
    climb: [card("stairs")], keys: [card("key"), card("door")], stuck: [], enemy: [],
    upgrades: [tab("upgrades")], enter: [el("enter-run")], cards: [tab("deck")], delve: [el("forest-sign")], provisions: [tab("gear")], back: [tab("board")],
  }[lesson] as (HTMLElement | null)[];
  return found.filter((t): t is HTMLElement => !!t);
}

/** Shows the waiting lesson's note (and its hands) while the board shows,
 * and removes them otherwise; on the Upgrades page (`onUpgrades`), once a
 * first skill is bought, a hand points at the Tower tab, back to the
 * entrance, and once a first provision is open, at the Gear tab (the page
 * writes the note). `dismissed` runs after a tap on a note that dismisses. */
export function renderBoardLesson(game: Game, onBoard: boolean, dismissed: () => void, onUpgrades = false) {
  const lesson = onBoard ? game.boardLesson : null, frame = el("board-frame");
  let note = frame.querySelector<HTMLElement>(".board-tip");
  if (note && note.dataset.lesson !== lesson) {
    note.remove();
    note = null;
  }
  // While the hand is stuck, End Run flashes until it is pressed.
  el("stuck-end-run").classList.toggle("lesson-flash", lesson === "stuck" || lesson === "enemy");
  const back = !onUpgrades ? null : game.introBought ? "back" : game.provisionsLesson ? "provisions" : null, shown = lesson ?? back;
  const wanted = lesson ? targets(lesson) : back ? targets(back) : [];
  document.querySelectorAll<HTMLElement>(".forest-pointer").forEach((p) => {
    if (p.dataset.lesson !== shown || !wanted.includes(p.parentElement!)) p.remove();
  });
  for (const target of wanted) {
    if (target.querySelector(":scope > .forest-pointer")) continue;
    target.insertAdjacentHTML("beforeend", `<span class="forest-pointer ${shown}${game.save.settings.reduceMotion ? " still" : ""}" data-lesson="${shown}">${POINTER_SVG}</span>`);
  }
  if (!lesson) return;
  if (!note) {
    const { title, text } = NOTES[lesson], body = `<b>${title}</b>${text ? `<p>${text}</p>` : ""}`;
    frame.insertAdjacentHTML("beforeend", lesson !== "enter"
      ? `<div class="board-tip" role="status" data-lesson="${lesson}">${body}</div>`
      : `<button type="button" class="board-tip dismissable" data-lesson="${lesson}">${body}<small>Tap to dismiss</small></button>`);
    note = frame.querySelector<HTMLElement>(".board-tip")!;
    note.onclick = () => {
      if (game.dismissLesson()) dismissed();
    };
  }
}
