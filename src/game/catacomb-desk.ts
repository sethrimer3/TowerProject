import { catacombsOpen } from "../catacombs/open.ts";
import { enterCatacomb, type CatacombRun } from "../catacombs/state.ts";
import type { DeskHost } from "./desk.ts";

/** The Catacombs' commands (docs/CATACOMBS.md): entering one from the
 * forest's Mausoleum, and what the menu's Catacomb button shows. */
export class CatacombDesk {
  constructor(private readonly host: DeskHost) {}

  private get c() {
    return this.host.save.catacombs;
  }

  /** Whether the Catacombs are open (Reveal Catacombs owned, or Access to Everything). */
  get open() {
    return catacombsOpen(this.host.save);
  }

  /** The Catacomb run under way, or null before the first entry. */
  get run(): CatacombRun | null {
    return this.c.run;
  }

  /** The tower number the run under way belongs to. */
  get number() {
    return this.c.number;
  }

  /** What entering Catacomb `number` would leave behind: the hall of a run
   * of another number that is past Hall 1, which entering starts over; null
   * when nothing would be lost. */
  wouldLeave(number: number): { number: number; hall: number } | null {
    const run = this.c.run;
    return run && this.c.number !== number && run.hall > 1 ? { number: this.c.number, hall: run.hall } : null;
  }

  /** Enters Catacomb `number`: the same number keeps the run under way,
   * another starts one at Hall 1 there. Null while the Catacombs are shut. */
  enter(number: number): CatacombRun | null {
    if (!this.open) return null;
    return enterCatacomb(this.c, number);
  }
}
