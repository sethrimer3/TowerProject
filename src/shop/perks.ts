import type { Save } from "../save/shape.ts";
import { ARCHIVISTS } from "../progression/archives.ts";
import { entitlementRelics, premiumArchivists } from "./entitlements.ts";

// What the entitlements give that lives in another system's save: a
// Premium Offer's relic (`save.relics`) and archivist slot
// (`save.archives.slots`). Trainers are read straight from the
// entitlements (`trainingSlots`), so they need nothing here.

/** Hands the entitlements' relics and archivists' slots to their owners,
 * where they are missing: on every load and after Erase All, which keep
 * the entitlements but not what they gave. A purchase adds its slot
 * itself (`grant`), so one bought with archivists already hired adds one. */
export function settlePerks(save: Pick<Save, "entitlements" | "relics" | "archives">) {
  for (const id of entitlementRelics(save)) if (!save.relics.includes(id)) save.relics.push(id);
  const least = ARCHIVISTS.start + premiumArchivists(save);
  while (save.archives.slots.length < least) save.archives.slots.push({ autoContinue: false });
}
