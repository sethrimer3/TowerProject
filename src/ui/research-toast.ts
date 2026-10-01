import { RESEARCH, type ResearchRecord } from "../archives.ts";
import { TRAINING, type TrainingId } from "../config.ts";

/** One notification: its heading and the line under it. */
export type Toast = { title: string; text: string };
/** A research level completed. */
export const researchToast = (r: ResearchRecord): Toast => ({ title: "Research Complete!", text: `${RESEARCH[r.research].name} · Level ${r.level}` });
/** A rank a trainer finished. */
export const trainingToast = (t: { id: TrainingId; level: number }): Toast => ({ title: "Training Complete!", text: `${TRAINING.find((row) => row.id === t.id)!.name} · Level ${t.level}` });

/** How long each notification shows before it leaves, and how long it
 * takes to slide away (its transition in `style.css`). */
const SHOWN_MS = 4000, LEAVE_MS = 450;

/** Announces each research level completed and each rank a trainer
 * finished, one at a time: a box at the top of the screen over everything
 * else, "Research Complete!" (or "Training Complete!") over the project
 * or stat and its level, shown for four seconds and then sliding up out of
 * sight. Levels completed together (such as those finished while the game
 * was closed) wait their turn in order. With Reduce motion on, each box
 * leaves without sliding. */
export class ResearchToasts {
  private queue: Toast[] = [];
  private showing = false;

  constructor(private reduceMotion: () => boolean) {}

  add(done: readonly Toast[]) {
    this.queue.push(...done);
    if (!this.showing) this.next();
  }

  private next() {
    const record = this.queue.shift();
    this.showing = !!record;
    if (!record) return;
    const box = document.createElement("div");
    box.className = "research-toast";
    box.setAttribute("role", "status");
    box.innerHTML = `<b>${record.title}</b><span>${record.text}</span>`;
    // Outside #app, and in the browser's top layer where it has one, so it
    // shows over open dialogs too.
    box.setAttribute("popover", "manual");
    document.body.append(box);
    if ("showPopover" in box) box.showPopover();
    setTimeout(() => {
      box.classList.add("leaving");
      setTimeout(() => {
        box.remove();
        this.next();
      }, this.reduceMotion() ? 0 : LEAVE_MS);
    }, SHOWN_MS);
  }
}
