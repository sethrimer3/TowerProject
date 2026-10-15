import type { ArchivistSlot, ResearchJob } from "./archives.ts";
import { finite, isRecord } from "./decode.ts";

/** How much faster a Speed Up makes an archivist research. */
export const SPEED_UP_FACTORS = [1.5, 2, 3, 4] as const;
export type SpeedUpFactor = (typeof SPEED_UP_FACTORS)[number];
/** How long a Speed Up lasts, in hours. */
export const SPEED_UP_HOURS = [1, 4, 8, 24] as const;
export type SpeedUpHours = (typeof SPEED_UP_HOURS)[number];
/** The Cells each factor costs an hour. */
export const CELLS_PER_HOUR: Record<SpeedUpFactor, number> = { 1.5: 15, 2: 75, 3: 450, 4: 3150 };

const HOUR = 3_600_000;

/** A Speed Up on one archivist: its research goes `factor` times as fast
 * until `endsAt` (wall clock, ms). The boost is carried into the job's
 * times up to `appliedUntil`, so a job's times always read as they would
 * with no boost from then on; while the archivist is idle it is paused,
 * `endsAt` moving on with the clock, so only time spent researching uses
 * it up. `queued` buys the same Speed Up again as it
 * ends, while the Cells are there, or `next`, another chosen meanwhile. */
export type SpeedUp = {
  factor: SpeedUpFactor; hours: SpeedUpHours; endsAt: number; appliedUntil: number; queued: boolean;
  next?: { factor: SpeedUpFactor; hours: SpeedUpHours };
};

/** The Cells a Speed Up of `factor` for `hours` costs. */
export const speedUpCells = (factor: SpeedUpFactor, hours: SpeedUpHours) => CELLS_PER_HOUR[factor] * hours;

/** What paying for a Speed Up reads: the Cells held and Dev free purchases. */
export type CellPurse = { cells: number; settings: { freePurchases: boolean } };

/** Pays for `speedUp`'s factor and hours from `o`; false, paying nothing,
 * when the Cells fall short. */
function pay(o: CellPurse, factor: SpeedUpFactor, hours: SpeedUpHours) {
  if (o.settings.freePurchases) return true;
  const cells = speedUpCells(factor, hours);
  if (o.cells < cells) return false;
  o.cells -= cells;
  return true;
}

/** Why `slot` can't take a Speed Up now, or null when it can (Cells aside). */
export function cannotSpeedUp(slot: ArchivistSlot | undefined) {
  if (!slot?.job) return "That archivist is idle.";
  if (slot.speedUp) return "A Speed Up is already in progress.";
  return null;
}

/** Starts a Speed Up on busy archivist `slot` at `now`, paying its Cells.
 * False when one is already in progress, the archivist is idle, or the
 * Cells fall short. The slot's boost must be carried to `now` first. */
export function startSpeedUp(o: CellPurse, slot: ArchivistSlot | undefined, factor: SpeedUpFactor, hours: SpeedUpHours, queued: boolean, now: number) {
  if (!slot || cannotSpeedUp(slot) || !pay(o, factor, hours)) return false;
  slot.speedUp = { factor, hours, endsAt: now + hours * HOUR, appliedUntil: now, queued };
  return true;
}

/** `job` hastened by `speedUp`'s boost from `from` to `to` (no further than
 * its end): both times move back by the time gained, so its share done and
 * time left read as research done and research still to do. */
function hastened(job: ResearchJob, speedUp: SpeedUp, from: number, to: number) {
  const until = Math.min(to, speedUp.endsAt);
  if (!(until > from)) return job;
  const gained = (speedUp.factor - 1) * (until - from);
  return { ...job, startedAt: job.startedAt - gained, completesAt: job.completesAt - gained };
}

/** Carries `slot`'s boost into its job up to `to`; an idle archivist's
 * Speed Up waits, its end moved on by the time idle. */
export function carrySpeedUp(slot: ArchivistSlot, to: number) {
  const s = slot.speedUp;
  if (!s || !(to > s.appliedUntil)) return;
  if (!slot.job) {
    s.endsAt += to - s.appliedUntil;
    s.appliedUntil = to;
    return;
  }
  slot.job = hastened(slot.job, s, s.appliedUntil, to);
  s.appliedUntil = Math.min(to, s.endsAt);
}

/** `slot`'s job as it reads at `now`, the boost carried that far, without
 * changing the save: what the page shows between settles. */
export function jobAt(slot: ArchivistSlot, now: number): ResearchJob | undefined {
  const s = slot.speedUp;
  return slot.job && s ? hastened(slot.job, s, s.appliedUntil, now) : slot.job;
}

/** When `slot`'s job completes on the wall clock, its boost counted. */
export function completionAt(slot: ArchivistSlot) {
  const job = slot.job!, s = slot.speedUp, done = job.completesAt;
  if (!s || done <= s.appliedUntil) return done;
  const boosted = s.appliedUntil + (done - s.appliedUntil) / s.factor;
  // Done within the boost, or the time it gained comes off what is left after.
  return boosted <= s.endsAt ? boosted : done - (s.factor - 1) * (s.endsAt - s.appliedUntil);
}

/** Sets the Speed Up `slot`'s queued one buys as it ends to `factor` for
 * `hours`, paying nothing until then. False unless one is in progress and
 * queued. */
export function queueNextSpeedUp(slot: ArchivistSlot | undefined, factor: SpeedUpFactor, hours: SpeedUpHours) {
  const s = slot?.speedUp;
  if (!s?.queued) return false;
  if (factor === s.factor && hours === s.hours) delete s.next;
  else s.next = { factor, hours };
  return true;
}

/** `slot`'s Speed Up ends at `at` (only ever while the archivist is busy):
 * a queued one buys its `next`, or itself again, from there while the
 * Cells are there; otherwise it is gone. */
export function endSpeedUp(o: CellPurse, slot: ArchivistSlot, at: number) {
  const s = slot.speedUp!, next = s.next ?? s;
  delete slot.speedUp;
  if (s.queued) startSpeedUp(o, slot, next.factor, next.hours, true, at);
}

/** A saved Speed Up, or undefined when it isn't one. */
export function decodeSpeedUp(raw: any): SpeedUp | undefined {
  if (!isRecord(raw)) return undefined;
  const { factor, hours, endsAt, appliedUntil, queued } = raw;
  if (!SPEED_UP_FACTORS.includes(factor) || !SPEED_UP_HOURS.includes(hours)) return undefined;
  if (!finite(endsAt, 1e15) || !finite(appliedUntil, 1e15) || appliedUntil > endsAt) return undefined;
  const speedUp: SpeedUp = { factor, hours, endsAt, appliedUntil, queued: queued === true };
  const next = raw.next;
  if (speedUp.queued && isRecord(next) && SPEED_UP_FACTORS.includes(next.factor as SpeedUpFactor) && SPEED_UP_HOURS.includes(next.hours as SpeedUpHours))
    speedUp.next = { factor: next.factor as SpeedUpFactor, hours: next.hours as SpeedUpHours };
  return speedUp;
}
