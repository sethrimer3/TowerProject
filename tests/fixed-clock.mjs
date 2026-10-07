/** The time the browser suites run at: a Monday noon GMT, as the UI golden's
 * pages start, so what depends on the date (the Tournament's phase and its
 * free Ticket's celebration, the Shop's day) is the same on every run.
 * Timers still run; only `Date` stands still. */
export const FIXED_TIME = new Date("2026-10-05T12:00:00Z");

/** Fixes `page`'s clock at `FIXED_TIME`; call it before the first `goto`. */
export const fixClock = (page) => page.clock.setFixedTime(FIXED_TIME);
