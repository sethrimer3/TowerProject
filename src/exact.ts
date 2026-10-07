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

/** `n` on a grid of millionths. Gold, HP and the hero's and enemies' stats
 * keep their fractions (a 2% bonus on 1 ATK strikes for 1.02), and each sum
 * or difference of them is snapped back onto the grid, so 0.1 + 0.2 is 0.3
 * and a fight's forecast and the fight played out agree to the last strike. */
export const snap = (n: number) => Math.round(n * 1e6) / 1e6;
