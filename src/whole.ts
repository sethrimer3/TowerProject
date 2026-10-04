/** How the fractional amounts the game keeps (Gold, HP, stats; see `snap`
 * in exact.ts) are shown: amounts held as whole numbers rounded down, so
 * the screen never shows more than there is; amounts gained or lost (a
 * strike, a heal, a reward) to the nearest whole; enemy stats to two
 * decimals when they aren't whole. */

/** A held amount (Gold, ATK, DEF, max HP, shroud), its fraction dropped. */
export const whole = (n: number) => (Number.isFinite(n) ? Math.floor(n + 1e-9) : n);
/** HP left: whole, but never 0 while the hero stands. */
export const wholeHp = (hp: number) => (hp > 0 ? Math.max(1, whole(hp)) : 0);
/** An amount gained or lost, to the nearest whole. */
export const wholeChange = (n: number) => (Number.isFinite(n) ? Math.round(n) : n);
/** Keys held or moved, which badges can make fractional: whole, or to two
 * decimals (rounded down) when they aren't. */
export const keyCount = (n: number) => (Number.isInteger(n) || !Number.isFinite(n) ? String(n) : (Math.floor(n * 100 + 1e-6) / 100).toFixed(2));
/** An enemy's stat: whole, or to two decimals. */
export const enemyStat = (n: number) => (Number.isInteger(n) || !Number.isFinite(n) ? String(n) : String(Math.round(n * 100) / 100));
