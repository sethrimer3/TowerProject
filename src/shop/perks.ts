import type { Save } from "../save/shape.ts";
import { ARCHIVISTS } from "../progression/archives.ts";
import { entitlementGifts, entitlementRelics, premiumArchivists } from "./entitlements.ts";
import { grantGifts } from "../economy/gifts.ts";

// What the entitlements give that lives in another system's save: a
// Premium Offer's relic (`save.relics`), archivist slot
// (`save.archives.slots`) and gifts (`save.gifts`, each offer's once). Trainers are read straight from the
// entitlements (`trainingSlots`), so they need nothing here.

/** Hands the entitlements' relics and archivists' slots to their owners,
 * where they are missing: on every load and after Erase All, which keep
 * the entitlements but not what they gave. A purchase adds its slot
 * itself (`grant`), so one bought with archivists already hired adds one.
 * An entitlement's gifts are rolled once (`save.gifts.perks`), so Erase
 * All, which clears the gifts, gives them anew. */
export function settlePerks(save: Pick<Save, "entitlements" | "relics" | "archives" | "gifts">) {
  for (const id of entitlementRelics(save)) if (!save.relics.includes(id)) save.relics.push(id);
  for (const [id, n] of entitlementGifts(save)) if (!save.gifts.perks.includes(id)) {
    save.gifts.perks = [...save.gifts.perks, id];
    grantGifts(save, n);
  }
  const least = ARCHIVISTS.start + premiumArchivists(save);
  while (save.archives.slots.length < least) save.archives.slots.push({ autoContinue: false });
}
