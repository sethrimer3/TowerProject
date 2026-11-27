// Plays the Catacombs on the wall clock (docs/CATACOMBS.md): each frame the
// host asks `step`, which runs the turns the clock says are due, no more
// often than turns can be drawn, and credits the Lore they found.
import { snap } from "../exact.ts";
import { earn } from "../save/profile.ts";
import type { Save } from "../save/shape.ts";
import { newCarry, tick, type Due } from "./clock.ts";
import { runTurns, type CatacombGains, type TurnEvent } from "./turn.ts";

/** The most times a second turns are taken and drawn; past it a step's
 * turns run together and only the last is drawn (`MAX_MOVE_RATE`). */
export const DRAWN_PER_SECOND = 15;

/** What one step did: the clock's verdict, what its turns earned, and the
 * last turn's event (the one drawn). */
export type CatacombStep = { due: Due; gains: CatacombGains; last: TurnEvent | null };

export class CatacombPlayer {
  private carry = newCarry();
  private lastStep = -Infinity;

  /** Runs the turns due by wall-clock `wallNow` (ms), at most
   * `DRAWN_PER_SECOND` times a second of frame time `frameNow`; null when
   * there is no run or it isn't time. Lore goes to `save.cells`. */
  step(save: Pick<Save, "catacombs" | "cells" | "profile">, wallNow: number, frameNow: number): CatacombStep | null {
    const c = save.catacombs;
    if (!c.run || frameNow - this.lastStep < 1000 / DRAWN_PER_SECOND) return null;
    this.lastStep = frameNow;
    const due = tick(c.clock, wallNow, this.carry);
    const { gains, last } = runTurns(c, due.real + due.hasted);
    if (gains.lore > 0) {
      save.cells = snap(save.cells + gains.lore);
      earn(save, "cells", gains.lore);
    }
    return { due, gains, last };
  }

  /** Forgets the haste owed: a new haste chosen starts counting afresh. */
  resetHaste() {
    this.carry.owed = 0;
  }
}
