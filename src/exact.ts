// Arithmetic that gives the same bits in every JavaScript engine.
//
// Only + - * / and Math.sqrt are correctly rounded by the spec. Math.pow
// (and **), exp, log, the trig functions and hypot may differ in the last bit
// between engines and platforms, and a last-bit difference can tip a
// comparison, a rounding or a weighted pick. Anything that is saved or
// decides play (terrain, enemy stats, prices) uses these instead; drawing
// may use Math freely.

/** `base` to the power `n` (a whole number ≥ 0), multiplied out in order. */
export function intPow(base: number, n: number) {
  let result = 1;
  for (let i = 0; i < n; i++) result *= base;
  return result;
}

/** `base` (≥ 0) to the power `p`, a whole number or a half: a half power
 * multiplies in one `Math.sqrt`, exact everywhere. */
export const halfPow = (base: number, p: number) => intPow(base, Math.floor(p)) * (p % 1 ? Math.sqrt(base) : 1);

/** The `n`-th root of `x` (> 0; `n` a whole number ≥ 1), halving the gap
 * between two bounds until they meet: the same bits everywhere. */
export function root(x: number, n: number) {
  if (n === 1 || x === 1) return x;
  // lo ** n ≤ x ≤ hi ** n: for x > 1, 1 and (Bernoulli) 1 + (x − 1) / n;
  // for x < 1, x and 1.
  let lo = x > 1 ? 1 : x, hi = x > 1 ? 1 + (x - 1) / n : 1;
  for (;;) {
    const mid = lo + (hi - lo) / 2;
    if (mid <= lo || mid >= hi) break;
    if (intPow(mid, n) > x) hi = mid;
    else lo = mid;
  }
  return x - intPow(lo, n) <= intPow(hi, n) - x ? lo : hi;
}

/** The arctangent of `z` (0 to 1), in radians: halved twice, to below 0.2,
 * then its series, to better than a trillionth of a radian. */
function arctangent(z: number) {
  const half = (t: number) => t / (1 + Math.sqrt(1 + t * t)), t = half(half(z)), t2 = t * t;
  let sum = 0;
  for (let k = 19; k >= 1; k -= 2) sum = 1 / k - t2 * sum;
  return 4 * t * sum;
}
const DEGREES_PER_RADIAN = 57.29577951308232;
/** The direction of (`dx`, `dy`), not both 0, in degrees clockwise from
 * (0, 1), 0 up to 360: `Math.atan2` in the same bits everywhere. */
export function bearing(dx: number, dy: number) {
  const a = Math.abs(dx), b = Math.abs(dy), off = (a <= b ? arctangent(a / b) : Math.PI / 2 - arctangent(b / a)) * DEGREES_PER_RADIAN;
  if (dy >= 0) return dx >= 0 ? off : 360 - off;
  return dx >= 0 ? 180 - off : 180 + off;
}

/** The unit vector `degrees` clockwise from (0, 1): the sine and cosine by
 * their series, within an eighth of a turn, in the same bits everywhere. */
export function pointing(degrees: number) {
  const whole = ((degrees % 360) + 360) % 360, quarter = Math.round(whole / 90), t = ((whole - quarter * 90) * Math.PI) / 180, t2 = t * t;
  let s = 1, c = 1;
  for (let k = 14; k >= 2; k -= 2) s = 1 - (t2 / (k * (k + 1))) * s;
  for (let k = 13; k >= 1; k -= 2) c = 1 - (t2 / (k * (k + 1))) * c;
  s *= t;
  if (quarter === 1) return { x: c, y: -s };
  if (quarter === 2) return { x: -s, y: -c };
  if (quarter === 3) return { x: -c, y: s };
  return { x: s, y: c };
}

/** `n` on a grid of millionths. Gold, HP and the hero's and enemies' stats
 * keep their fractions (a 2% bonus on 1 ATK strikes for 1.02), and each sum
 * or difference of them is snapped back onto the grid, so 0.1 + 0.2 is 0.3
 * and a fight's forecast and the fight played out agree to the last strike. */
export const snap = (n: number) => Math.round(n * 1e6) / 1e6;
