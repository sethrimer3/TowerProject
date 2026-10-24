import type { Mode } from "./entities.ts";
import type { ModeSave, Save } from "./save-shape.ts";
import type { MoveSnapshot, Run } from "./runs.ts";
import { keepUndos } from "./progression/loadout.ts";
import { MODES } from "./modes.ts";

/** What undo can take a run back to, kept in the mode's slice of the save:
 * the run's undo history (a snapshot before each move, as many as the run
 * has undos left), and while its hero lies fallen, the run just before the
 * fight it fell in. The timeline is the only writer of both, so undo's
 * rules live here: it never leaves the floor the hero stands on (a snapshot
 * of another floor is never restored, and stepping onto another floor
 * forgets them), a run of quiet steps is taken back as one, and each undo
 * spent is gone for the run, as is each provision used. Live play (the board, the hand) is the
 * caller's: `undo` hands it the snapshot to restore. */
export class RunTimeline<R extends Run = Run> {
  constructor(
    private readonly save: Save,
    private readonly mode: Mode,
    /** The undos a run of this mode starts with (the loadout's). */
    private readonly capacity: () => number = () => 0,
  ) {}

  private get slice(): ModeSave<R> {
    return this.save[this.mode] as unknown as ModeSave<R>;
  }

  private get run(): R {
    return this.slice.run!;
  }

  /** Undos the run has left to spend. */
  get undosLeft() {
    return Math.max(0, this.capacity() - (this.run.undosUsed ?? 0));
  }

  /** Whether undo can take a move back: one is left and a move is held. */
  get canUndo() {
    return this.undosLeft > 0 && this.slice.history.length > 0;
  }

  /** The run as it stands now, for undo to come back to. */
  snapshot(): MoveSnapshot<R> {
    return { run: structuredClone(this.run), best: this.slice.best, xp: this.save.xp, silver: this.save.profile.earned.silver, cardXp: { ...this.save.cardXp } };
  }

  /** Keeps `snapshot`, taken before a move, as many held as undos are left. */
  remember(snapshot: MoveSnapshot<R>) {
    const slice = this.slice;
    slice.history.push(snapshot);
    slice.history = keepUndos(slice.history, this.undosLeft);
  }

  /** The last move did something after all (paid out, took an item): undo
   * stops there rather than going on back past it as a quiet step. */
  eventful() {
    delete this.slice.history.at(-1)?.quiet;
  }

  /** The hero stands where its run says: a history taken on another floor
   * than the hero's is forgotten. The history is all of one floor, so its
   * last snapshot speaks for it. */
  standOn() {
    const history = this.slice.history, last = history.at(-1), run = this.slice.run;
    if (!last || !run || run.outside) return;
    const floorOf = MODES[this.mode].floorOf as (run: Run) => number;
    if (floorOf(last.run) !== floorOf(run)) this.slice.history = [];
  }

  /** The hero fell in a fight against `by`: `before` is the run just
   * before it, which undo takes back to. */
  fall(before: MoveSnapshot<R>, by: string) {
    this.slice.fall = { snapshot: before, by };
  }

  /** Spends an undo, if one is left and a move is held on the hero's
   * floor: takes back the fight a `fallen` hero fell in, or else the last
   * move, going on back past a run of quiet steps. `restore` makes the
   * snapshot the live run (the slice's `run` once it returns). Returns
   * what was undone, or null. */
  undo(fallen: boolean, restore: (snapshot: MoveSnapshot<R>) => void): "fall" | "move" | null {
    if (!this.undosLeft) return null;
    this.standOn();
    const slice = this.slice, fall = fallen ? slice.fall : null;
    let snapshot = slice.history.pop();
    if (!snapshot) return null;
    // A step onto empty floor is seldom worth resuming at: undo goes on
    // back past a run of them to before the last turn that did something.
    while (!fall && snapshot.quiet && slice.history.length) snapshot = slice.history.pop()!;
    slice.fall = null;
    // An undo spent is gone for the run: the count rides onto the run
    // restored, and so do the provisions used and the boosts going on.
    const used = (this.run.undosUsed ?? 0) + 1, { provisionsUsed, boosts } = this.run;
    restore(fall?.snapshot ?? snapshot);
    this.run.undosUsed = used;
    carry(this.run, "provisionsUsed", provisionsUsed);
    carry(this.run, "boosts", boosts);
    slice.history = keepUndos(slice.history, this.undosLeft);
    return fall ? "fall" : "move";
  }

  /** The live run and every copy of it undo or a fall may restore, so a
   * change that undo must not take back (training bought, a boon taken)
   * reaches them all. None without a run. */
  runs(): R[] {
    const slice = this.slice;
    return slice.run ? [slice.run, ...slice.history.map((s) => s.run), ...(slice.fall ? [slice.fall.snapshot.run] : [])] : [];
  }

  /** Forgets everything undo could take back: a new run, or a run whose
   * board was reshaped under it. */
  reset() {
    this.slice.history = [];
    this.slice.fall = null;
  }
}

/** Sets `run`'s optional `key` to `value`, or drops it for none. */
function carry<K extends "provisionsUsed" | "boosts">(run: Run, key: K, value: Run[K]) {
  if (value) run[key] = structuredClone(value);
  else delete run[key];
}
