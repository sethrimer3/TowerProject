import type { BoardLesson, Game } from "../state.ts";
import { el, POINTER_SVG } from "./dom.ts";
import { DEATH_LOOP, drawLoopFrame } from "./death-loop.ts";

// The lessons on the board (`game.boardLesson`): a note over the top of the
// board. Inside a run the tutorials' pointing hand shows the card to press
// (STAIRS on the first run, then KEY and DOOR) and, while the hand is stuck,
// End Run flashes slowly; in the forest the hand shows the button to press
// next, the Upgrades tab, Enter, the Research tab (once the Archives skill is
// owned, and the first time training points wait to be spent), the Deck tab, the sign down the path to the
// Delve or, once a first provision is open, the Gear tab, and the Goals
// button while a Goal waits. On floor 4 before Auto-Climb is owned,
// `autoClimbHint` holds the hero and says ending the climb unlocks it.
// Back in the forest after the first climb, `story` tells the world's
// premise (`STORY`) a note at a time, each tap drawing more of the time
// loop's infinity trace in its header, before any other forest lesson.
// Only `story`, `enter`, `autoClimbHint` and `autoClimb` are dismissed by tapping their notes; the others wait
// on what they ask for (`cards` on the Deck page, which takes the lesson on).
// Each hand sits inside what it points at.

/** The provisions lesson's note, on the board and the Upgrades page alike. */
export const PROVISIONS_NOTE = { title: "Provisions unlocked.", text: "Press the Gear tab to buy provisions with Gold: limited-use items every climb carries, pressed beside the board when you need them." };

/** The `story` lesson's notes, tapped through one after the other. */
export const STORY = [
  "The weakest delver has discovered the divine Chronos Anchor and can move their soul backwards in time!",
  "Make the most of each tower climb to gain inspiration and resources.",
  "Use your gains to upgrade your abilities for future climbs.",
  "Unlock permanent powers and knowledge that stay with you across time in the world.",
];
/** How long each story note's share of the infinity trace takes to draw (ms). */
const STORY_TRACE_MS = 700;
/** The story note showing, kept while the board is left and come back to. */
let storyPage = 0;
/** The last frame of the infinity trace drawn by story note `page`: the
 * trace grows with each note, closing on the last. */
const storyFrame = (page: number) => Math.round(((page + 1) / STORY.length) * (DEATH_LOOP.frames - 1));

/** The story note's header, its text and its count. */
function storyHtml(page: number) {
  const last = page === STORY.length - 1;
  return `<canvas class="story-loop" width="${DEATH_LOOP.width}" height="${DEATH_LOOP.height}" aria-hidden="true"></canvas>` +
    `<p class="story-text">${STORY[page]}</p><small>${last ? "Tap to begin" : "Tap to continue"} · ${page + 1}/${STORY.length}</small>`;
}

/** Draws the trace in `note`'s header from the end of the note before's
 * share to the end of note `page`'s (at once with Reduce Motion). */
function traceStory(note: HTMLElement, page: number, reduceMotion: boolean) {
  const ctx = note.querySelector<HTMLCanvasElement>(".story-loop")?.getContext("2d");
  if (!ctx) return;
  const from = page ? storyFrame(page - 1) : 0, to = storyFrame(page);
  let begin = performance.now();
  const draw = (now: number) => {
    if (!note.isConnected || note.dataset.page !== String(page)) return;
    // The trace waits under a dialog (the death loop's black after the first climb).
    if (document.querySelector("dialog[open]")) begin = now;
    const t = reduceMotion ? 1 : Math.max(0, Math.min(1, (now - begin) / STORY_TRACE_MS));
    drawLoopFrame(ctx, Math.round(from + (to - from) * t));
    if (t < 1) requestAnimationFrame(draw);
  };
  draw(begin);
}

const NOTES: Record<Exclude<BoardLesson, "story">, { greeting?: string; title: string; text?: string }> = {
  climb: { greeting: "Welcome, adventurer!", title: "Press the Stairs card to climb.", text: "Each card in your hand sends the hero toward what it names. Climb the Tower to gain Inspiration, XP and resources." },
  keys: { title: "Press Key and Door to collect keys and open doors.", text: "Key heads for the closest key, and Door for a door your keys open, or a Wooden Door your HP can break down." },
  autoClimbHint: { title: "You can end the climb now to unlock Auto-Climb.", text: "End the climb from the menu, then spend its Inspiration on Auto-Climb on the Inspiration tree: the hand then plays by itself." },
  autoClimb: { title: "Auto-Climb moves the hero for you.", text: "The hero heads for the target of the first card in your hand with an open path to it. Press a card to go for its target first." },
  stuck: { title: "No card can take you further.", text: "The Inspiration this climb earned unlocks new abilities to climb higher. Press End Climb, then spend it on the Inspiration tree." },
  enemy: { title: "An enemy blocks the way.", text: "Unlock the Enemy card on the Inspiration tree to fight it. Press End Climb to go and spend your Inspiration." },
  upgrades: { title: "Spend your Inspiration.", text: "Open Upgrades: the Inspiration tree's skills give you new abilities." },
  enter: { title: "Click Enter to start climbing the tower." },
  research: { title: "Research unlocked.", text: "Press the Research tab to open the Research menu." },
  trainingPoints: { title: "Training points to spend.", text: "After levelling up, you can spend points to increase your stats. Press the Research tab to train." },
  delve: { title: "A tournament is open: follow the path down to the Delve and enter its cave." },
  goals: { title: "Tower Goals are ready to claim.", text: "Every ten floors climbed pays a Goal reward. Press Goals to claim yours." },
  provisions: PROVISIONS_NOTE,
  arcana: { title: "Spend Arcanite to obtain and upgrade Arcana - mighty spells that unlock new powers." },
};

/** What each lesson's pointing hands point at, and from where (the
 * pointer's class): the hand cards from above, Enter from below, the tabs
 * (the Tower tab's `back`, from the Upgrades page, and the Gear tab's
 * `provisions` there too) and the forest's sign from above. */
function targets(lesson: BoardLesson | "back"): HTMLElement[] {
  const card = (id: string) => document.querySelector<HTMLElement>(`#hand .hand-card[data-card="${id}"]`);
  const tab = (id: string) => document.querySelector<HTMLElement>(`nav [data-tab="${id}"]`);
  const found = {
    story: [], climb: [card("stairs")], keys: [card("key"), card("door")], autoClimbHint: [], autoClimb: [], stuck: [], enemy: [],
    upgrades: [tab("upgrades")], enter: [el("enter-run")], research: [tab("research")], trainingPoints: [tab("research")], cards: [tab("deck")], goals: [el("section-pick")], delve: [el("forest-sign")], provisions: [tab("gear")], arcana: [tab("gear")], back: [tab("board")],
  }[lesson] as (HTMLElement | null)[];
  return found.filter((t): t is HTMLElement => !!t);
}

/** Shows the waiting lesson's note (and its hands) while the board shows,
 * and removes them otherwise; on the Upgrades page (`onUpgrades`), once a
 * first skill is bought, a hand points at the Tower tab, back to the
 * entrance, and once a first provision is open, at the Gear tab (the page
 * writes the note). `dismissed` runs after a tap on a note that dismisses.
 * While the story's note shows, nothing else in the shell can be pressed. */
export function renderBoardLesson(game: Game, onBoard: boolean, dismissed: () => void, onUpgrades = false) {
  drawLesson(game, onBoard, dismissed, onUpgrades);
  holdAround(document.querySelector<HTMLElement>("#board-frame > .story-tip"));
}

/** What `holdAround` made inert, given back when the hold ends or moves. */
let held: HTMLElement[] = [];
/** Makes everything in the shell inert but `keep` and what holds it: each
 * sibling of `keep` and of each of its ancestors up to `.shell`, so only
 * `keep` takes presses and keys (the dialogs, outside the shell, still
 * do); null ends the hold. */
function holdAround(keep: HTMLElement | null) {
  for (const part of held) part.inert = false;
  held = [];
  for (let node: HTMLElement | null = keep; node?.parentElement && !node.classList.contains("shell"); node = node.parentElement)
    for (const sibling of node.parentElement.children)
      if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
        sibling.inert = true;
        held.push(sibling);
      }
}

function drawLesson(game: Game, onBoard: boolean, dismissed: () => void, onUpgrades: boolean) {
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
  if (!note && lesson === "story") {
    const reduceMotion = game.save.settings.reduceMotion;
    frame.insertAdjacentHTML("beforeend", `<button type="button" class="board-tip dismissable story-tip" data-lesson="story" data-page="${storyPage}" aria-live="polite">${storyHtml(storyPage)}</button>`);
    const story = frame.querySelector<HTMLElement>(".board-tip")!;
    // The only thing left to press: Enter and Space go on from the keyboard too.
    story.focus({ preventScroll: true });
    traceStory(story, storyPage, reduceMotion);
    story.onclick = () => {
      if (storyPage < STORY.length - 1) {
        story.dataset.page = String(++storyPage);
        story.innerHTML = storyHtml(storyPage);
        return traceStory(story, storyPage, reduceMotion);
      }
      if (game.dismissLesson()) dismissed();
    };
    return;
  }
  if (!note && lesson !== "story") {
    const { greeting, title, text } = NOTES[lesson], body = `${greeting ? `<b>${greeting}</b>` : ""}<b>${title}</b>${text ? `<p>${text}</p>` : ""}`;
    frame.insertAdjacentHTML("beforeend", lesson !== "enter" && lesson !== "autoClimb" && lesson !== "autoClimbHint"
      ? `<div class="board-tip" role="status" data-lesson="${lesson}">${body}</div>`
      : `<button type="button" class="board-tip dismissable" data-lesson="${lesson}">${body}<small>Tap to dismiss</small></button>`);
    note = frame.querySelector<HTMLElement>(".board-tip")!;
    note.onclick = () => {
      if (game.dismissLesson()) dismissed();
    };
  }
}
