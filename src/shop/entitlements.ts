import type { Save } from "../entities.ts";

// Entitlements: permanent perks bought once (today, with real money). The
// save owns them (`save.entitlements`); the Shop only grants them, and the
// game reads what they do through the functions here.
// TODO: once the store is connected, restore them from its receipts.

export type EntitlementId = "adFree" | "coins2" | "coins3";
export type Entitlement = {
  name: string;
  /** Multiplies every Gold the hero banks; all of them multiply together. */
  goldFactor: number;
  /** No ads: whatever an ad would pay for is given straight away. */
  adsOff?: true;
  /** The trainers' ×2 boost runs for good. */
  permanentBoost?: true;
};

export const ENTITLEMENTS: Record<EntitlementId, Entitlement> = {
  adFree: { name: "Permanent Ad-Disable", goldFactor: 1.5, adsOff: true, permanentBoost: true },
  coins2: { name: "Special Coin Pack", goldFactor: 2 },
  coins3: { name: "Premium Coin Pack", goldFactor: 3 },
};
export const ENTITLEMENT_IDS = Object.keys(ENTITLEMENTS) as EntitlementId[];

type Owner = Pick<Save, "entitlements">;
export const owns = (save: Owner, id: EntitlementId) => save.entitlements.includes(id);
const owned = (save: Owner) => save.entitlements.map((id) => ENTITLEMENTS[id]);

/** What every Gold banked is multiplied by: each pack owned, multiplied
 * together (×9 with all three). */
export const goldFactor = (save: Owner) => owned(save).reduce((f, e) => f * e.goldFactor, 1);
/** Whether ads are off for good. */
export const adsOff = (save: Owner) => owned(save).some((e) => e.adsOff);
/** Whether the trainers' ×2 boost runs for good. */
export const permanentBoost = (save: Owner) => owned(save).some((e) => e.permanentBoost);
/** The boost's end while it runs for good: never. */
export const BOOST_FOREVER = Number.MAX_SAFE_INTEGER;

/** The saved entitlements: known ids, each once. */
export function decodeEntitlements(raw: unknown): EntitlementId[] {
  return Array.isArray(raw) ? ENTITLEMENT_IDS.filter((id) => raw.includes(id)) : [];
}
