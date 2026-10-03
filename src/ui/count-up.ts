/** How long a currency readout takes to count up to a new amount. */
export const COUNT_UP_MS = 500;

/** How far through its count a readout is, `t` from 0 to 1 of the time:
 * quick at first and slowing a little at the end (half the starting speed). */
export const countEase = (t: number) => t * (1.5 - 0.5 * t);

/** A currency readout that counts up to each rise over `COUNT_UP_MS`
 * instead of jumping, and drops at once to any fall. A rise during a count
 * starts a new count from the amount shown, so a steady income counts on
 * smoothly. */
export class CountUp {
  private from = 0;
  private to = 0;
  private start = -Infinity;
  private known = false;

  /** The amount to show at `now` (ms) for the amount held, `target`. The
   * first amount, and every amount when `instant`, shows at once. */
  show(target: number, now: number, instant = false) {
    if (!this.known || instant || target < this.to) {
      this.known = true;
      [this.from, this.to, this.start] = [target, target, -Infinity];
    } else if (target > this.to) {
      [this.from, this.to, this.start] = [this.at(now), target, now];
    }
    return this.at(now);
  }

  /** Whether a count is still running at `now`. */
  counting(now: number) {
    return now - this.start < COUNT_UP_MS;
  }

  private at(now: number) {
    const t = (now - this.start) / COUNT_UP_MS;
    return t >= 1 ? this.to : this.from + (this.to - this.from) * countEase(Math.max(0, t));
  }
}
