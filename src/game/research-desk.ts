import { RESEARCH, cancelResearch, hastenResearch, hireArchivist, settleArchives, startResearch, switchResearch, type ResearchId, type ResearchRecord } from "../archives.ts";
import { finishGems } from "../training-jobs.ts";
import { readyForestRuns } from "./hero-sync.ts";
import { affordsGems, type DeskHost } from "./desk.ts";

/** The Archives' commands: research run by archivists on the wall clock.
 * Every level completed reaches a run still in the forest at once. */
export class ResearchDesk {
  /** Research completed and not yet announced, oldest first; the app takes
   * them for its notifications. */
  done: ResearchRecord[] = [];

  constructor(private readonly host: DeskHost) {}

  private get save() {
    return this.host.save;
  }

  /** Whether the Archives' commands are open: the skill owned, or every
   * page shown in Dev mode. */
  private get open() {
    return !!this.save.upgrades.archives || this.save.settings.devMode;
  }

  /** Sets archivist `slot` to research `id`'s next level, paying its Gold. */
  start(slot: number, id: ResearchId) {
    this.settle();
    const started = this.open && startResearch(this.save, slot, id, this.host.clock());
    // Free purchases' research takes no time: it completes now.
    if (started && this.host.free) this.settle();
    return started;
  }

  /** Switches busy archivist `slot` to research `id`'s next level: its
   * research stops as `cancel` does, and `id` starts, paying its Gold. */
  switchTo(slot: number, id: ResearchId) {
    this.settle();
    const switched = this.open && switchResearch(this.save, slot, id, this.host.clock());
    if (switched && this.host.free) this.settle();
    return switched;
  }

  /** Stops archivist `slot`'s research, refunding its Gold and keeping the
   * time already spent on it for when it starts again. */
  cancel(slot: number) {
    return cancelResearch(this.save, slot, this.host.clock());
  }

  /** Whether archivist `slot` starts the next level on its own. */
  setAutoContinue(slot: number, on: boolean) {
    const s = this.save.archives.slots[slot];
    if (s) s.autoContinue = on;
  }

  /** The Gems that rush archivist `slot`'s research to completion now: one
   * per ten minutes left, rounded up, as for a rank in training (none with
   * Dev free purchases, or when it has none). */
  rushGems(slot: number) {
    const job = this.save.archives.slots[slot]?.job;
    return !job || this.host.free ? 0 : finishGems(job.completesAt - this.host.clock());
  }

  /** Rushes archivist `slot`'s research: pays `rushGems` and completes it
   * now. Returns what completed. */
  rush(slot: number) {
    const job = this.save.archives.slots[slot]?.job, gems = this.rushGems(slot);
    if (!job || !affordsGems(this.host, gems)) return [];
    this.save.gems -= gems;
    hastenResearch(this.save.archives, slot, Math.max(0, job.completesAt - this.host.clock()));
    return this.settle();
  }

  /** Dev mode: finishes archivist `slot`'s research now. */
  finishNow(slot: number) {
    const job = this.save.archives.slots[slot]?.job;
    if (!this.save.settings.devMode || !job) return [];
    hastenResearch(this.save.archives, slot, Math.max(0, job.completesAt - this.host.clock()));
    return this.settle();
  }

  hire() {
    return this.open && hireArchivist(this.save);
  }

  /** Completes the research that the clock has reached, saying so in the
   * status line and queuing it in `done`. */
  settle(): ResearchRecord[] {
    const done = settleArchives(this.save, this.host.clock());
    if (done.length) readyForestRuns(this.save);
    this.done.push(...done);
    const last = done.at(-1);
    if (last) this.host.message = `Archives · ${RESEARCH[last.research].name} level ${last.level} complete.`;
    return done;
  }
}
