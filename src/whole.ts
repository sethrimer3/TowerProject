/** How the fractional amounts the game keeps (Gold, HP, stats; see `snap`
 * in exact.ts) are shown: amounts held as whole numbers rounded down, so
 * the screen never shows more than there is; amounts gained or lost (a
 * strike, a heal, a reward) to the nearest whole; enemy stats to two
 * decimals when they aren't whole (one from 100, none from 1,000). */

/** A held amount (Gold, ATK, DEF, max HP, shroud), its fraction dropped. */
export const whole = (n: number) => (Number.isFinite(n) ? Math.floor(n + 1e-9) : n);
/** HP left: whole, but never 0 while the hero stands. */
export const wholeHp = (hp: number) => (hp > 0 ? Math.max(1, whole(hp)) : 0);
/** An amount gained or lost, to the nearest whole. */
export const wholeChange = (n: number) => (Number.isFinite(n) ? Math.round(n) : n);
/** Keys held or moved, which badges can make fractional: whole, or to two
 * decimals (rounded down) when they aren't. */
export const keyCount = (n: number) => (Number.isInteger(n) || !Number.isFinite(n) ? String(n) : (Math.floor(n * 100 + 1e-6) / 100).toFixed(2));
/** An enemy's stat: whole, or to two decimals below 100, one below 1,000,
 * and none from there. */
export function enemyStat(n: number) {
  if (Number.isInteger(n) || !Number.isFinite(n)) return String(n);
  const places = Math.abs(n) >= 1000 ? 1 : Math.abs(n) >= 100 ? 10 : 100;
  return String(Math.round(n * places) / places);
}
/** The units abbreviated amounts are shown in, each a thousand times the
 * last: thousands (K), millions, billions, trillions, quadrillions (q),
 * quintillions (Q), sextillions (s), septillions (S), octillions,
 * nonillions and decillions (D). Past 999D an amount reads as a power of ten. */
export const AMOUNT_UNITS = ["K", "M", "B", "T", "q", "Q", "s", "S", "O", "N", "D"];
/** The largest unit at or below `n` (from 1,000) as [its size, its
 * letter], or null past the last unit's 999. */
export function amountUnit(n: number): [size: number, unit: string] | null {
  let unit = 0, size = 1000;
  while (unit < AMOUNT_UNITS.length - 1 && n >= size * 1000) [unit, size] = [unit + 1, size * 1000];
  return n >= size * 1000 ? null : [size, AMOUNT_UNITS[unit]];
}
/** How many whole `step`s `n` holds, rounded down but forgiving the last
 * bit's error that large units carry (5e27 is 5 of 1e27, not 4.99…). */
export const stepsIn = (n: number, step: number) => Math.floor(n / step + 1e-9);
/** An amount short enough for a tile's corner, about four characters:
 * whole below 1,000, then 1.2K, 12K, 123K, 1.2M … (rounded down, so it
 * never shows more than there is), and past 999D as a power of ten, 1e36. */
export function compactAmount(n: number) {
  if (!Number.isFinite(n) || n < 1000) return String(n);
  const found = amountUnit(n);
  if (!found) return n.toExponential(0).replace("+", "");
  const [size, unit] = found, tenths = n < size * 10;
  return `${tenths ? stepsIn(n, size / 10) / 10 : stepsIn(n, size)}${unit}`;
}
/** An amount short enough for the HUD's narrow purse: in full below `from`
 * (10,000), then to three figures in thousands, millions … decillions
 * (12.3K, 456M, 7.89q; see `AMOUNT_UNITS`), and past 999D in scientific
 * notation. */
export function shortAmount(n: number, from = 10_000) {
  if (n < from) return String(n);
  const found = amountUnit(n);
  if (!found) return n.toExponential(2);
  const [size, unit] = found;
  // Whole steps of the last figure shown, so no rounding creeps in.
  const v = n / size, digits = v < 10 ? 2 : v < 100 ? 1 : 0, step = size / 10 ** digits;
  return `${stepsIn(n, step) / 10 ** digits}${unit}`;
}
/** A number rising over the board (a strike's damage, the shroud's share,
 * thorns, a heal): to the nearest whole, then from 100,000 shortened to
 * three figures as the purse is (123K, 4.56M). */
export const popupAmount = (n: number) => shortAmount(wholeChange(n), 100_000);
