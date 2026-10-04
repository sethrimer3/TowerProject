/** Buy Quantity: how many Training ranks one press buys, with training
 * points on the Training tab or with Silver inside a run. The Inspiration
 * skill Buy Quantity shows the choice (x1 at first), and each level of its
 * research opens the next quantity: x5, x10, x100, then Max, as many as
 * what is held pays for. */

export const BUY_QUANTITIES = [1, 5, 10, 100, "max"] as const;
export type BuyQuantity = (typeof BUY_QUANTITIES)[number];

/** "x5", or "Max". */
export const quantityLabel = (q: BuyQuantity) => (q === "max" ? "Max" : `x${q}`);

/** The quantities open with `levels` levels of Buy Quantity research: x1,
 * and one more a level. */
export const openQuantities = (levels: number) => BUY_QUANTITIES.slice(0, 1 + Math.max(0, Math.floor(levels)));

/** The most ranks Max buys at once when nothing limits it (free purchases
 * on a row with no most). */
export const MAX_BULK = 1000;

/** What one press buys: `count` ranks for `cost` in all, and whether what
 * is held pays for them. */
export type Bulk = { count: number; cost: number; affordable: boolean };

/** The ranks quantity `q` buys of a row with `room` ranks left before its
 * most, the k-th of them (from 0) costing `price(k)`, out of `budget`
 * (Infinity with free purchases). A fixed quantity buys all of its ranks
 * (fewer only when the row's most comes first) or none; Max buys as many
 * as the budget covers, and with none affordable shows the next rank,
 * unaffordable. */
export function bulkBuy(q: BuyQuantity, room: number, price: (k: number) => number, budget: number): Bulk {
  const most = Math.min(room, q === "max" ? MAX_BULK : q);
  let count = 0, cost = 0;
  if (q === "max") {
    while (count < most && cost + price(count) <= budget) cost += price(count++);
    if (count) return { count, cost, affordable: true };
    return most > 0 ? { count: 1, cost: price(0), affordable: false } : { count: 0, cost: 0, affordable: false };
  }
  while (count < most) cost += price(count++);
  return { count, cost, affordable: count > 0 && cost <= budget };
}
