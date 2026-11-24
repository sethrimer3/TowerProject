/** How fast timed work (a rank in training, an Archives level) goes over
 * the wall clock: a steady `rate`, times each window's `factor` until that
 * window's `until` (wall clock ms). The training ad's boost, a Golden
 * Scarab's Training or Research Speed boost and the Shop's training rate
 * are each one of these, and they multiply where they overlap. Work is
 * measured in ms at the normal rate. */
export type RateWindow = { until: number; factor: number };
export type Pace = { rate: number; windows: readonly RateWindow[] };

/** The pace at wall-clock time `t`. */
export const rateAt = (t: number, pace: Pace) => pace.windows.reduce((r, w) => (t < w.until ? r * w.factor : r), pace.rate);

/** The windows' ends after `from`, soonest first. */
const endsAfter = (from: number, pace: Pace, to = Infinity) =>
  pace.windows.map((w) => w.until).filter((u) => u > from && u < to).sort((a, b) => a - b);

/** The work done between `from` and `to` at `pace` (0 when `to` isn't later). */
export function workBetween(from: number, to: number, pace: Pace) {
  if (!(to > from)) return 0;
  let work = 0, t = from;
  for (const end of [...endsAfter(from, pace, to), to]) {
    work += (end - t) * rateAt(t, pace);
    t = end;
  }
  return work;
}

/** When `work` started at `from` is done at `pace`. */
export function doneAfter(work: number, from: number, pace: Pace) {
  let t = from, left = Math.max(0, work);
  for (const end of endsAfter(from, pace)) {
    const r = rateAt(t, pace), span = (end - t) * r;
    if (span >= left) return t + left / r;
    left -= span;
    t = end;
  }
  return t + left / rateAt(t, pace);
}

/** A due time `completesAt`, worked out at pace `before`, moved to the pace
 * `after` from `now`, keeping the work it has left. */
export const repaced = (completesAt: number, now: number, before: Pace, after: Pace) =>
  Math.round(doneAfter(workBetween(now, completesAt, before), now, after));
