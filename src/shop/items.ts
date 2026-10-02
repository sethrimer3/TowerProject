import type { Save } from "../entities.ts";
import { CURRENCIES, type CurrencyId } from "./currency.ts";
import { ENTITLEMENTS, owns, type EntitlementId } from "./entitlements.ts";

// What an offer grants. Granting hands the item to the system that owns it
// (a currency's balance, the save's entitlements); the Shop keeps no copy.
// More kinds (materials, consumables, generated equipment) are one more
// case here each.

export type ShopItem =
  | { kind: "currency"; currency: CurrencyId; amount: number }
  | { kind: "entitlement"; id: EntitlementId };

/** Why `item` can't be granted to `save` now, or null when it can. Checked
 * before anything is paid, so a grant that follows never fails. */
export function grantRefusal(save: Save, item: ShopItem): "owned" | null {
  return item.kind === "entitlement" && owns(save, item.id) ? "owned" : null;
}

/** Hands `quantity` of `item` to its owner. */
export function grant(save: Save, item: ShopItem, quantity: number) {
  if (item.kind === "currency") CURRENCIES[item.currency].credit(save, item.amount * quantity);
  else save.entitlements.push(item.id);
}

/** The item in a few words, for confirmations and the history. */
export function itemName(item: ShopItem): string {
  return item.kind === "currency" ? `${item.amount.toLocaleString("en-US")} ${CURRENCIES[item.currency].name}` : ENTITLEMENTS[item.id].name;
}
