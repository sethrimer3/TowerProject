import { halfPow, intPow } from "../exact.ts";
/** A price that rises with each purchase (a Training row's Silver inside a
 * run, a provision's Gold): the first costs `base`, and each one after
 * costs more than the last by `step` plus the number already bought, the
 * `step` growing by `growth` every five (see `schedulePrice`). Base 5: +1+N
 * for the next five, then +4+N, +7+N … With `compound`, that price is
 * then multiplied by `compound` for each one already bought, rounded up.
 * Or, with `ratio`, each costs `ratio` times the one before (with `rise`,
 * that ratio itself `rise` times the last one's: `risingPrice`); or, with
 * `power`, the n-th costs `base` × n × (1 + ((n − 1) / `growth`)^`power`); or,
 * with `cubic`, it costs what a trainer's Gold curve of that shape asks
 * (`curvePrice`); or, with `prices`, each costs the next in that list. The
 * `power` may be a whole number or a half (`halfPow`). */
export type PriceSchedule = { base: number; step: number; growth: number; compound?: number } | { base: number; ratio: number; rise?: number } | { base: number; growth: number; power: number } | { base: number; growth: number; cubic: number } | { prices: readonly number[] };
/** The purchase after `bought` when the first costs `base` and each costs
 * `ratio` times the one before, that ratio `rise` times the last one's,
 * rounded up: base × ratio^bought × rise^(bought × (bought − 1) / 2),
 * multiplied out in order so every engine agrees. */
export function risingPrice(base: number, ratio: number, rise: number, bought: number) {
  let price = base, step = ratio;
  for (let k = 0; k < bought; k++) {
    price *= step;
    step *= rise;
  }
  return Math.ceil(price);
}
/** The n-th rank (after `ranks`) on a linear-and-cubic curve from `start`:
 * start × n × (1 + ranks / `growth`), rounded up, plus start × n × (ranks /
 * `cubic`)³, rounded down. A trainer's Gold (`trainingGold`) and a
 * `cubic` Silver schedule both price by it. */
export function curvePrice(start: number, ranks: number, growth: number, cubic?: number) {
  const base = start * (ranks + 1);
  return Math.ceil((base * (growth + ranks)) / growth) + (cubic ? Math.floor(base * intPow(ranks / cubic, 3)) : 0);
}
/** What the purchase after `bought` costs on `schedule`: its base, and for
 * the k-th after it `step + k` more than the one before, `step` rising by
 * `growth` every five, summed here at once, then compounded (or `ratio`
 * times the one before). */
export function schedulePrice(schedule: PriceSchedule, bought: number) {
  if ("prices" in schedule) return schedule.prices[Math.min(bought, schedule.prices.length - 1)]!;
  if ("ratio" in schedule) return schedule.rise ? risingPrice(schedule.base, schedule.ratio, schedule.rise, bought) : schedule.base * intPow(schedule.ratio, bought);
  // The n-th rank (bought + 1) costs base × n × (1 + ((n − 1) / growth)^power), as a trainer's Gold does.
  if ("power" in schedule) return Math.ceil(schedule.base * (bought + 1) * (1 + halfPow(bought / schedule.growth, schedule.power)));
  if ("cubic" in schedule) return curvePrice(schedule.base, bought, schedule.growth, schedule.cubic);
  const { base, step, growth, compound } = schedule;
  const fives = Math.floor(bought / 5), rest = bought % 5;
  const price = base + bought * step + bought * (bought + 1) / 2 + growth * (5 * fives * (fives - 1) / 2 + rest * fives);
  return compound ? Math.ceil(price * intPow(compound, bought)) : price;
}
