import type { Save } from "../save/shape.ts";
import type { Price, ShopOffer } from "./offers.ts";

// Discounts: an offer sold for less for a while. Today only one: the ad
// series' last prize (ads/series.ts), Permanent Ad-Disable at half price
// for a day. A real-money discount is its own store product (`sku`).

/** A discount running on an offer: how much off, until when (server
 * time, ms), and the price meanwhile. */
export type Discount = { percent: number; until: number; price: Price };

/** Permanent Ad-Disable's price while the ad series' discount runs. */
const AD_FREE_HALF: Price = { kind: "money", sku: "ad_free_half", label: "$4.95" };

/** The discount on `o` at `now` (server time), or null with none. */
export function discountOn(save: Pick<Save, "ads">, o: ShopOffer, now: number): Discount | null {
  if (o.id === "adFree" && now < save.ads.discountUntil) return { percent: 50, until: save.ads.discountUntil, price: AD_FREE_HALF };
  return null;
}

/** What `o` costs at `now`: its discounted price while a discount runs. */
export const priceOf = (save: Pick<Save, "ads">, o: ShopOffer, now: number): Price => discountOn(save, o, now)?.price ?? o.price;
