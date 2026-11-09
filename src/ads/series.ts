import { DAY_MS } from "../shop/clock.ts";
import { isRecord, time, wholeIn } from "../save/decode.ts";

// The ad series: every ad watched (with ads still on) moves a bar on, and
// each `ADS_PER_PRIZE` reach a prize the player claims by pressing it.
// The bar never resets while prizes are left on it; once every prize is
// claimed it stays full until the week turns (Monday, 00:00 GMT on the
// Shop's server clock), then starts again from nothing.

/** Ads watched between one prize and the next. */
export const ADS_PER_PRIZE = 5;

/** A prize on the bar: a Gold boost (every Gold banked ×`factor` for
 * `hours`), Gems, free card buys, or a discount on Permanent Ad-Disable
 * (`percent` off for `hours`). */
export type AdPrize =
  | { kind: "gold"; factor: number; hours: number }
  | { kind: "gems"; amount: number }
  | { kind: "cards"; count: number }
  | { kind: "discount"; percent: number; hours: number };

/** The prizes in order, one every `ADS_PER_PRIZE` ads. */
export const AD_PRIZES: readonly AdPrize[] = [
  { kind: "gold", factor: 2, hours: 1 },
  { kind: "gems", amount: 30 },
  { kind: "gold", factor: 3, hours: 1 },
  { kind: "gems", amount: 40 },
  { kind: "gold", factor: 3, hours: 2 },
  { kind: "gems", amount: 50 },
  { kind: "cards", count: 3 },
  { kind: "discount", percent: 50, hours: 24 },
];

/** The ads that fill the bar. */
export const AD_SERIES_LENGTH = AD_PRIZES.length * ADS_PER_PRIZE;
const ALL_CLAIMED = (1 << AD_PRIZES.length) - 1;

/** A stretch of the ad prizes' Gold boost: Gold banked ×`factor` from
 * `from` until `until` (wall clock, ms). */
export type AdGoldSpan = { factor: number; from: number; until: number };

/** The ad series' state: ads watched on the bar, the prizes claimed (bit
 * `i` for prize `i`), when the last of them was (server time, ms; 0 while
 * any is left), when the Ad-Disable discount ends (server time, ms), and
 * the Gold boost's stretches still to run. */
export type AdsSave = { watched: number; claimed: number; doneAt: number; discountUntil: number; gold: AdGoldSpan[] };
export const defaultAds = (): AdsSave => ({ watched: 0, claimed: 0, doneAt: 0, discountUntil: 0, gold: [] });

/** How many prizes the ads watched have reached. */
export const prizesReached = (s: AdsSave) => Math.min(AD_PRIZES.length, Math.floor(s.watched / ADS_PER_PRIZE));
/** Whether prize `i` has been claimed. */
export const claimed = (s: AdsSave, i: number) => (s.claimed & (1 << i)) !== 0;
/** Whether prize `i` is reached and waiting to be claimed. */
export const prizeWaiting = (s: AdsSave, i: number) => i < prizesReached(s) && !claimed(s, i);
/** Whether any prize waits to be claimed. */
export const anyPrizeWaiting = (s: AdsSave) => AD_PRIZES.some((_, i) => prizeWaiting(s, i));
/** Whether every prize on the bar is claimed. */
export const allClaimed = (s: AdsSave) => s.claimed === ALL_CLAIMED;

/** The start of the week after the one `t` falls in: the next Monday,
 * 00:00 GMT (1 January 1970 was a Thursday, three days after a Monday). */
export function weekEnd(t: number) {
  const day = Math.floor(t / DAY_MS), monday = day - ((day + 3) % 7);
  return (monday + 7) * DAY_MS;
}

/** When the full bar starts again, once every prize is claimed; null while not. */
export const resetAt = (s: AdsSave) => (allClaimed(s) ? weekEnd(s.doneAt) : null);

/** Starts the bar again at `now` (server time) once its week is over. */
export function refreshAds(s: AdsSave, now: number) {
  const at = resetAt(s);
  if (at === null || now < at) return;
  s.watched = 0;
  s.claimed = 0;
  s.doneAt = 0;
}

/** Counts an ad watched at `now` (server time): the bar moves on, unless
 * it is full. Returns the prize it just reached, if it reached one. */
export function recordWatch(s: AdsSave, now: number): number | null {
  refreshAds(s, now);
  if (s.watched >= AD_SERIES_LENGTH) return null;
  s.watched++;
  return s.watched % ADS_PER_PRIZE === 0 ? s.watched / ADS_PER_PRIZE - 1 : null;
}

/** Claims prize `i` at `now` (server time): the prize, or null when it
 * isn't waiting. The last one claimed starts the week's wait. */
export function claimPrize(s: AdsSave, i: number, now: number): AdPrize | null {
  if (!prizeWaiting(s, i)) return null;
  s.claimed |= 1 << i;
  if (allClaimed(s)) s.doneAt = now;
  return AD_PRIZES[i]!;
}

/** The Gold boost's factor at `now` (wall clock): the stretch running, or 1. */
export const adGoldFactor = (spans: readonly AdGoldSpan[], now: number) => spans.find((g) => g.from <= now && now < g.until)?.factor ?? 1;

/** The time each factor has left to run at `now`, by factor. */
function adGoldLeft(spans: readonly AdGoldSpan[], now: number) {
  const left = new Map<number, number>();
  for (const g of spans) if (g.until > now) left.set(g.factor, (left.get(g.factor) ?? 0) + g.until - Math.max(g.from, now));
  return left;
}

/** The stretch running at `now` and its time left, or null with none. */
export function adGoldNow(spans: readonly AdGoldSpan[], now: number) {
  const g = spans.find((s) => s.from <= now && now < s.until);
  return g ? { factor: g.factor, left: g.until - now } : null;
}

/** The Gold boost's stretches after `ms` more at ×`factor` from `now`
 * (wall clock): every factor's time left laid end to end from now, the
 * greatest first, so a stronger boost never waits behind a weaker one and
 * no time runs out unused beneath another. */
export function addAdGold(spans: readonly AdGoldSpan[], factor: number, ms: number, now: number): AdGoldSpan[] {
  const left = adGoldLeft(spans, now);
  left.set(factor, (left.get(factor) ?? 0) + ms);
  let at = now;
  return [...left.entries()].sort(([a], [b]) => b - a).map(([f, t]) => ({ factor: f, from: at, until: (at += t) }));
}

/** A saved ad series: the counts whole and in range, the prizes claimed
 * only among those reached, and the Gold stretches well formed. */
export function decodeAds(raw: unknown): AdsSave {
  const s = defaultAds();
  if (!isRecord(raw)) return s;
  if (wholeIn(raw.watched, 0, AD_SERIES_LENGTH)) s.watched = raw.watched;
  if (wholeIn(raw.claimed, 0, ALL_CLAIMED)) s.claimed = raw.claimed & ((1 << prizesReached(s)) - 1);
  s.doneAt = allClaimed(s) ? time(raw.doneAt) : 0;
  s.discountUntil = time(raw.discountUntil);
  if (Array.isArray(raw.gold))
    s.gold = raw.gold.filter((g): g is AdGoldSpan => isRecord(g) && typeof g.factor === "number" && g.factor > 1 && g.factor <= 10 && time(g.from) === g.from && time(g.until) === g.until && g.from < g.until).slice(0, AD_PRIZES.length)
      .map(({ factor, from, until }) => ({ factor, from, until }));
  return s;
}
