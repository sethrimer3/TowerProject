import type { RelicRarity } from "../events/catalog.ts";

// Relics (docs/EVENTS.md): unique keepsakes from Events, each giving a
// permanent bonus, each owned at most once (`save.relics`).

export type RelicDef = { name: string; rarity: RelicRarity; /** Its permanent bonus, in a few words. */ effect: string };

/** Every relic there is, by id.
 * TODO: none is defined yet; relics, their bonuses and their sprites come in
 * a later task, with the event server naming which event gives each. */
export const RELICS: Readonly<Record<string, RelicDef>> = {};

/** Placeholder relics shown only in Dev mode, so the Relics screen and its
 * pop-up can be seen before any relic exists. Never saved. */
export const PREVIEW_RELICS: Readonly<Record<string, RelicDef>> = {
  previewRare: { name: "Rare Relic", rarity: "rare", effect: "A permanent bonus, to be announced" },
  previewEpic: { name: "Epic Relic", rarity: "epic", effect: "A permanent bonus, to be announced" },
};

/** The saved relics: known ids, each once, in the order acquired. */
export const decodeRelics = (raw: unknown): string[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => typeof id === "string" && id in RELICS))] : [];
