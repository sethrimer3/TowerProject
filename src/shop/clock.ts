// The Shop's day turns at 00:00 GMT, on the server's clock, never the
// device's: moving the device clock forward must not bring a new day's
// free Gems. What counts is only a server time confirmed at the moment of
// a purchase; between confirmations the time is estimated, for countdowns
// and the Shop button's dot, and never trusted.

export const DAY_MS = 86_400_000;

/** The GMT day (days since 1970) that `ms` falls in. */
export const gmtDay = (ms: number) => Math.floor(ms / DAY_MS);

/** The last server time confirmed, and the device's clock at that moment. */
export type ShopClock = { server: number; local: number };

/** Records a confirmed server time. It never moves back: an answer older
 * than one already confirmed is ignored. */
export function confirmServerTime(clock: ShopClock, server: number, local: number) {
  if (server < clock.server) return;
  clock.server = server;
  clock.local = local;
}

/** The server time now, estimated from the last confirmation and the
 * device time since (none, if the device clock went back); the device's
 * own time before any confirmation. For display only. */
export function estimatedServerTime(clock: ShopClock, local: number) {
  return clock.server ? clock.server + Math.max(0, local - clock.local) : local;
}

/** Milliseconds from `now` to the next 00:00 GMT. */
export const untilNextDay = (now: number) => (gmtDay(now) + 1) * DAY_MS - now;
