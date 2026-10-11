/** How often the purse's rates take a sample of the run's tallies (ms). */
export const RATE_SAMPLE_MS = 3000;
/** How far back a rate looks (ms): the last minute. */
export const RATE_WINDOW_MS = 60_000;

/** A running tally's rise per minute of real time over the last minute: a
 * sample every `RATE_SAMPLE_MS`, the rate the rise from the sample a minute
 * ago (or the oldest, before a minute has passed) to the latest. Samples
 * older than that one are dropped. */
export class RateTally {
  private samples: { at: number; value: number }[] = [];

  /** Takes a sample of `value` at `now` (ms) once `RATE_SAMPLE_MS` has
   * passed since the last; true when it took one. */
  sample(value: number, now: number) {
    const last = this.samples.at(-1);
    if (last && now - last.at < RATE_SAMPLE_MS) return false;
    this.samples.push({ at: now, value });
    // Keep the newest sample at least a minute old: the window's start.
    while (this.samples.length > 1 && this.samples[1].at <= now - RATE_WINDOW_MS) this.samples.shift();
    return true;
  }

  /** Forgets every sample (a new run). */
  reset() {
    this.samples = [];
  }

  /** The rise per minute, never below 0 (undo can take back what was
   * found), or null before there are two samples. */
  get perMinute() {
    const first = this.samples[0], last = this.samples.at(-1);
    if (!first || !last || last === first) return null;
    return Math.max(0, ((last.value - first.value) * 60_000) / (last.at - first.at));
  }
}
