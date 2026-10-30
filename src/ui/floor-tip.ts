import type { Game } from "../state.ts";
import { MODES } from "../modes.ts";
import { capitalized, displayedProgress } from "./dom.ts";

/** How long a tap's tip stays, in milliseconds. */
const TAP_SHOWN_MS = 2500;

/** The highest floor (the Delve's depth) the selected tier has reached,
 * this run's climb included: what the floor tip and the run's summary say. */
export function tierHighest(game: Pick<Game, "save" | "mode" | "run">) {
  return Math.max(game.save[game.mode].best, game.run.maxHeight ?? game.run.height);
}

/** "Max Floor: 12": the tier's highest floor, `tierHighest`. */
export function floorTipText(game: Game) {
  return `Max ${capitalized(MODES[game.mode].words.progress)}: ${displayedProgress(tierHighest(game)).toLocaleString("en-US")}`;
}

/** Inside a run, a tip under the floor number, its label and tower saying
 * the tier's highest floor: a mouse resting on them shows it, and a tap
 * shows it a moment (`shows` says whether it may: not outside, nor while
 * the Proving Grounds borrow the floor number). */
export function bindFloorTip(game: Game, shows: () => boolean) {
  const height = document.querySelector<HTMLElement>(".height")!;
  const tip = document.createElement("div");
  tip.className = "floor-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.append(tip);
  let timer = 0;
  const floor = () => document.getElementById("height")!;
  const onFloor = (e: Event) => !!(e.target as Element).closest("#height, #height-label, #height-tier");
  const hide = () => {
    clearTimeout(timer);
    tip.hidden = true;
  };
  const show = () => {
    if (!shows() || game.run.outside) return hide();
    tip.textContent = floorTipText(game);
    tip.hidden = false;
    const box = floor().getBoundingClientRect(), width = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, box.left + box.width / 2 - width / 2))}px`;
    tip.style.top = `${box.bottom + 6}px`;
  };
  height.addEventListener("pointerover", (e) => {
    if (e.pointerType === "mouse" && onFloor(e)) show();
  });
  height.addEventListener("pointerout", (e) => {
    if (e.pointerType === "mouse" && onFloor(e) && !(e.relatedTarget as Element | null)?.closest("#height, #height-label, #height-tier")) hide();
  });
  height.addEventListener("click", (e) => {
    if (!onFloor(e)) return;
    show();
    clearTimeout(timer);
    // A mouse keeps it while resting there; a tap's goes after a moment.
    if ((e as PointerEvent).pointerType !== "mouse") timer = window.setTimeout(hide, TAP_SHOWN_MS);
  });
}
