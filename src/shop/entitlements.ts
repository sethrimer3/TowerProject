import type { Save } from "../save/shape.ts";

// Entitlements: permanent perks bought once (today, with real money). The
// save owns them (`save.entitlements`); the Shop only grants them, and the
// game reads what they do through the functions here.
// TODO: once the store is connected, restore them from its receipts.

export type EntitlementId = "adFree" | "coins2" | "coins3" | "pass1" | "pass2" | "pass3" | "researcher" | "trainer" | "stellar";
export type Entitlement = {
  name: string;
  /** Multiplies every Gold the hero banks; all of them multiply together. */
  goldFactor: number;
  /** No ads: whatever an ad would pay for is given straight away (the
   * trainers' boost among them: see `permanentBoost`). */
  adsOff?: true;
  /** The trainers' ×2 boost, an ad's reward, runs for good. */
  permanentBoost?: true;
  /** Training goes this many times as fast for good, on top of the boost;
   * all of them multiply together. */
  trainingRate?: number;
  /** Archivists' slots it adds beyond those Gems hire (progression/archives.ts). */
  archivists?: number;
  /** Trainers it adds (progression/training-jobs.ts `trainingSlots`). */
  trainers?: number;
  /** The unique relic it gives (economy/relic-catalog.ts `SHOP_RELICS`). */
  relic?: string;
  /** The gifts it gives, once (economy/gifts.ts). */
  gifts?: number;
};

export const ENTITLEMENTS: Record<EntitlementId, Entitlement> = {
  adFree: { name: "Permanent Ad-Disable", goldFactor: 1.5, adsOff: true, permanentBoost: true },
  coins2: { name: "Special Gold Bundle", goldFactor: 2, trainingRate: 2 },
  // Champion Status (shop/champion.ts) and its Club.
  coins3: { name: "Champion's Bundle", goldFactor: 3, trainingRate: 3, relic: "shop.coins3", gifts: 10 },
  // The Premium Passes open the Goals screen's premium rewards (goals.ts),
  // each in its set of three towers.
  pass1: { name: "Premium Pass 1", goldFactor: 1 },
  pass2: { name: "Premium Pass 2", goldFactor: 1 },
  pass3: { name: "Premium Pass 3", goldFactor: 1 },
  // The Premium Offers (shop/offers.ts), each with its unique relic.
  researcher: { name: "Extra Researcher", goldFactor: 1, archivists: 1, relic: "shop.researcher" },
  trainer: { name: "Extra Trainer", goldFactor: 1, trainers: 1, relic: "shop.trainer" },
  stellar: { name: "Stellar Bundle", goldFactor: 1, relic: "shop.stellar" },
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
/** How many times as fast training goes for good, before the boost: ×2
 * with the Special Gold Bundle, ×3 with the Champion's Bundle, ×6 with both
 * (×12 with Ad-Disable's permanent boost too). */
export const trainingRate = (save: Owner) => owned(save).reduce((r, e) => r * (e.trainingRate ?? 1), 1);
/** Archivists' slots the entitlements add, beyond those Gems hire. */
export const premiumArchivists = (save: Owner) => owned(save).reduce((n, e) => n + (e.archivists ?? 0), 0);
/** Trainers the entitlements add. */
export const premiumTrainers = (save: Owner) => owned(save).reduce((n, e) => n + (e.trainers ?? 0), 0);
/** The relics the entitlements give. */
/** The gifts each owned entitlement gives once, by its id. */
export const entitlementGifts = (save: Owner) => save.entitlements.flatMap((id) => (ENTITLEMENTS[id]?.gifts ? [[id, ENTITLEMENTS[id]!.gifts!] as const] : []));
export const entitlementRelics = (save: Owner) => owned(save).flatMap((e) => (e.relic ? [e.relic] : []));
/** The boost's end while it runs for good: never. */
export const BOOST_FOREVER = Number.MAX_SAFE_INTEGER;

/** The saved entitlements: known ids, each once. */
export function decodeEntitlements(raw: unknown): EntitlementId[] {
  return Array.isArray(raw) ? ENTITLEMENT_IDS.filter((id) => raw.includes(id)) : [];
}
