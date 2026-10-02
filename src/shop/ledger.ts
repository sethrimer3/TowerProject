import { OFFERS, type OfferId } from "./offers.ts";
import type { ShopClock } from "./clock.ts";

// The Shop's own saved state (`save.shop`): how often each offer has been
// bought, the transactions made, and the last server time confirmed. What
// was bought lives with its owner, never here.

/** Purchases of one offer: how many, and the GMT day of the latest (a
 * daily offer's count starts again on a later day). */
export type PurchaseCount = { n: number; day: number };
/** One purchase, for debugging and player support. */
export type Transaction = { at: number; offer: OfferId; item: string; price: string };
export type ShopSave = {
  counts: Partial<Record<OfferId, PurchaseCount>>;
  history: Transaction[];
  clock: ShopClock;
};
/** How many transactions the history keeps, newest last. */
export const HISTORY_KEPT = 100;

export const defaultShop = (): ShopSave => ({ counts: {}, history: [], clock: { server: 0, local: 0 } });

const whole = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;
const time = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);

/** A saved ShopSave, field by field; anything malformed is dropped. */
export function decodeShop(raw: any): ShopSave {
  const d = defaultShop();
  if (!raw || typeof raw !== "object") return d;
  for (const o of OFFERS) {
    const c = raw.counts?.[o.id];
    if (c && whole(c.n) && c.n > 0 && whole(c.day)) d.counts[o.id] = { n: c.n, day: c.day };
  }
  if (Array.isArray(raw.history))
    d.history = raw.history
      .filter((t: any) => t && OFFERS.some((o) => o.id === t.offer) && time(t.at) && typeof t.item === "string" && typeof t.price === "string")
      .slice(-HISTORY_KEPT)
      .map((t: any) => ({ at: t.at, offer: t.offer, item: t.item, price: t.price }));
  d.clock = { server: time(raw.clock?.server), local: time(raw.clock?.local) };
  return d;
}
