import type { Save } from "../entities.ts";
import { CURRENCIES, type CurrencyId } from "./currency.ts";
import { ENTITLEMENTS, owns, type EntitlementId } from "./entitlements.ts";

// What an offer grants. Granting hands the item to the system that owns it
// (a currency's balance, the save's entitlements); the Shop keeps no copy.
// More kinds (materials, consumables, generated equipment) are one more
// case here each.

export type ShopItem =
  | { kind: "currency"; currency: CurrencyId; amount: number }
  | { kind: "entitlement"; id: EntitlementId }
  /** Several currencies at once, such as a pack of Ascension Shards and Gems. */
  | { kind: "bundle"; amounts: Partial<Record<CurrencyId, number>> };

/** A bundle's currencies and amounts, in its order. */
export const bundleAmounts = (amounts: Partial<Record<CurrencyId, number>>) => Object.entries(amounts) as [CurrencyId, number][];

/** Why `item` can't be granted to `save` now, or null when it can. Checked
 * before anything is paid, so a grant that follows never fails. */
export function grantRefusal(save: Save, item: ShopItem): "owned" | null {
  return item.kind === "entitlement" && owns(save, item.id) ? "owned" : null;
}

/** Hands `quantity` of `item` to its owner. */
export function grant(save: Save, item: ShopItem, quantity: number) {
  if (item.kind === "currency") CURRENCIES[item.currency].credit(save, item.amount * quantity);
  else if (item.kind === "bundle") for (const [c, n] of bundleAmounts(item.amounts)) CURRENCIES[c].credit(save, n * quantity);
  else save.entitlements.push(item.id);
}

/** The item in a few words, for confirmations and the history. */
export function itemName(item: ShopItem): string {
  const amount = (c: CurrencyId, n: number) => `${n.toLocaleString("en-US")} ${CURRENCIES[c].name}`;
  if (item.kind === "currency") return amount(item.currency, item.amount);
  if (item.kind === "bundle") return bundleAmounts(item.amounts).map(([c, n]) => amount(c, n)).join(" + ");
  return ENTITLEMENTS[item.id].name;
}
