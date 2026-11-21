import { ARCANUM_IDS, isArcanum, type ArcanumId } from "../arcana/arcana.ts";
import { itemDef } from "../equipment/catalog.ts";
import type { EquipmentSave } from "../equipment/inventory.ts";
import type { ArcanaSave } from "../arcana/arcana.ts";
import { isRecord } from "../save/decode.ts";

/** What the Codex remembers the player has come across that the rest of
 * the save forgets: every arcanum ever offered, owned or lent for a climb,
 * and every Unique piece of equipment ever owned (a merged or salvaged one
 * leaves the inventory). Kept between runs; Erase All clears it. */
export type CodexSave = { arcana: ArcanumId[]; uniques: string[] };
export const defaultCodex = (): CodexSave => ({ arcana: [], uniques: [] });

/** The arcana and Uniques the player can see now: those owned, the
 * arcana on offer, and the arcana the climb holds (`held`, lent ones too). */
export function noteDiscoveries(
  codex: CodexSave,
  save: { arcana: Pick<ArcanaSave, "owned" | "offer">; equipment: Pick<EquipmentSave, "items" | "maxed"> },
  held: readonly ArcanumId[] = [],
) {
  let changed = false;
  const seen = new Set(codex.arcana);
  for (const id of [...ARCANUM_IDS.filter((a) => save.arcana.owned[a]), ...save.arcana.offer, ...held])
    if (!seen.has(id)) {
      seen.add(id);
      changed = true;
    }
  if (changed) codex.arcana = ARCANUM_IDS.filter((id) => seen.has(id));
  const found = new Set(codex.uniques);
  for (const def of [...save.equipment.items.map((i) => i.def), ...save.equipment.maxed])
    if (itemDef(def)?.class === "unique" && !found.has(def)) {
      found.add(def);
      codex.uniques.push(def);
      changed = true;
    }
  return changed;
}

/** Reads the save's Codex: known arcana in catalog order and known Uniques, each once. */
export function decodeCodex(raw: unknown): CodexSave {
  if (!isRecord(raw)) return defaultCodex();
  const arcana = Array.isArray(raw.arcana) ? raw.arcana.filter(isArcanum) : [];
  const uniques = Array.isArray(raw.uniques) ? raw.uniques.filter((d): d is string => typeof d === "string" && itemDef(d)?.class === "unique") : [];
  return { arcana: ARCANUM_IDS.filter((id) => arcana.includes(id)), uniques: [...new Set(uniques)] };
}
