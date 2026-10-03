import type { Save } from "../entities.ts";
import { CURRENCIES } from "./currency.ts";
import { gmtDay } from "./clock.ts";
import { grant, grantRefusal, itemName } from "./items.ts";
import { HISTORY_KEPT, type Transaction } from "./ledger.ts";
import { CATEGORIES, unmet, type Price, type ShopOffer } from "./offers.ts";

// A purchase is one transaction: every check is made before anything
// changes, then the price is paid, the item granted, the transaction
// recorded and the offer's count raised, all or nothing. Every time here
// is a server time (ms) confirmed for the purchase.

/** How an offer is paid for, beyond its own price: a real-money offer only
 * once the store confirms it was paid (`store`); Dev mode's free purchases
 * (`free`) pay nothing at all. */
export type Payment = "price" | "store" | "free";

/** Why an offer can't be bought. */
export type Refusal = "locked" | "notStarted" | "expired" | "storeLink" | "limit" | "owned" | "unpaid" | "short";

/** Times `offer` has been bought this period: ever, or today for a daily one. */
export function timesBought(save: Save, offer: ShopOffer, now: number) {
  const c = save.shop.counts[offer.id];
  return !c || (offer.daily && c.day !== gmtDay(now)) ? 0 : c.n;
}

/** Whether `offer` has been bought as often as it can be this period. */
export const soldOut = (save: Save, offer: ShopOffer, now: number) =>
  offer.purchaseLimit !== null && timesBought(save, offer, now) >= offer.purchaseLimit;

/** Why `offer` can't be bought at `now` paid by `payment`, or null when it can. */
export function refusal(save: Save, offer: ShopOffer, now: number, payment: Payment = "price"): Refusal | null {
  return unavailable(save, offer, now) ?? unpaid(save, offer, payment);
}

/** Why `offer` isn't for sale at `now`: locked, outside its dates, a store
 * link, sold out, or its item already owned; null when it is. */
function unavailable(save: Save, offer: ShopOffer, now: number): Refusal | null {
  if (unmet(save, CATEGORIES[offer.category].requires) || unmet(save, offer.requires)) return "locked";
  if (now < (offer.startTime ?? -Infinity)) return "notStarted";
  if (now >= (offer.endTime ?? Infinity)) return "expired";
  if (!offer.item) return "storeLink";
  if (soldOut(save, offer, now)) return "limit";
  return grantRefusal(save, offer.item) ? "owned" : null;
}

/** Why `payment` doesn't pay for `offer`: real money the store hasn't
 * confirmed, or a currency short; null when it pays (always, free). */
function unpaid(save: Save, { price }: ShopOffer, payment: Payment): Refusal | null {
  if (payment === "free") return null;
  if (price.kind === "money") return payment === "store" ? null : "unpaid";
  return price.kind === "currency" && CURRENCIES[price.currency].balance(save) < price.amount ? "short" : null;
}

/** What `price` costs, as the page and the history write it. */
export function priceText(price: Price): string {
  switch (price.kind) {
    case "currency": return `${price.amount.toLocaleString("en-US")} ${CURRENCIES[price.currency].name}`;
    case "free": return "Free";
    case "money": return price.label;
    case "store": return "Store";
  }
}

/** Buys `offer` at `now`: its refusal, or the transaction made. */
export function purchase(save: Save, offer: ShopOffer, now: number, payment: Payment = "price"): Refusal | Transaction {
  const refused = refusal(save, offer, now, payment);
  if (refused) return refused;
  const item = offer.item!, price = offer.price;
  if (payment === "price" && price.kind === "currency") CURRENCIES[price.currency].spend(save, price.amount);
  grant(save, item, offer.quantity);
  const t: Transaction = { at: now, offer: offer.id, item: itemName(item), price: payment === "free" ? "Dev: free" : priceText(price) };
  save.shop.history.push(t);
  save.shop.history.splice(0, Math.max(0, save.shop.history.length - HISTORY_KEPT));
  save.shop.counts[offer.id] = { n: timesBought(save, offer, now) + 1, day: gmtDay(now) };
  return t;
}
