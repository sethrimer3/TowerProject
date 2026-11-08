import type { RelicRarity } from "../events/catalog.ts";
import type { EventThemeId } from "../events/themes.ts";
import { RELIC_SETS, STORE_RELICS, TOWER_RELICS, type RelicBonus, type RelicSet } from "./relic-catalog.ts";

// Relics (docs/EVENTS.md): unique keepsakes from Events and each tower's
// last Goal, each giving a
// permanent bonus, each owned at most once (`save.relics`). Their names
// and bonuses live in relic-catalog.ts, what the bonuses do in
// relic-effects.ts.

/** A relic: its name, rarity, whether a premium reward gives it, and the
 * event theme or the tower it comes from. */
export type RelicDef = { name: string; rarity: RelicRarity; premium: boolean; theme?: EventThemeId; tower?: number; bonus: RelicBonus };

/** The places in a set, in the order its track gives them. */
const PLACES = ["free1", "premium1", "free2", "premium2"] as const;
type Place = (typeof PLACES)[number];
const entryAt = (set: RelicSet, place: Place) => (place === "free1" ? set.free[0] : place === "free2" ? set.free[1] : place === "premium1" ? set.premium[0] : set.premium[1]);
/** The first relic of each pair is rare, the second epic. */
const rarityAt = (place: Place): RelicRarity => (place.endsWith("1") ? "rare" : "epic");

export const relicId = (theme: EventThemeId, year: number, place: string) => `${theme}.${year}.${place}`;
/** The id of the relic `tower`'s last Goal gives: its epic reward, or its legendary premium one. */
export const towerRelicId = (tower: number, rarity: "epic" | "legendary") => `tower.${tower}.${rarity}`;

/** The rarities, least first, as the Relics screen shows them. */
export const RARITIES: readonly RelicRarity[] = ["rare", "epic", "legendary"];
export const RARITY_NAMES: Readonly<Record<RelicRarity, string>> = { rare: "Rare", epic: "Epic", legendary: "Legendary" };

/** Every relic there is, by id. */
export const RELICS: Readonly<Record<string, RelicDef>> = Object.fromEntries([
  ...(Object.entries(RELIC_SETS) as [EventThemeId, readonly RelicSet[]][]).flatMap(([theme, sets]) =>
    sets.flatMap((set) => PLACES.map((place) => {
      const e = entryAt(set, place);
      return [relicId(theme, set.year, place), { name: e.name, rarity: rarityAt(place), premium: place.startsWith("premium"), theme, bonus: e.bonus }] as const;
    }))),
  ...(Object.entries(STORE_RELICS) as [EventThemeId, NonNullable<(typeof STORE_RELICS)[EventThemeId]>][]).flatMap(([theme, list]) =>
    list.map((s, i) => [relicId(theme, s.year, `store${i + 1}`), { name: s.relic.name, rarity: "epic" as const, premium: false, theme, bonus: s.relic.bonus }] as const)),
  ...Object.entries(TOWER_RELICS).flatMap(([tower, r]) => (["epic", "legendary"] as const).map((rarity) =>
    [towerRelicId(Number(tower), rarity), { name: r[rarity].name, rarity, premium: rarity === "legendary", tower: Number(tower), bonus: r[rarity].bonus }] as const)),
]);

/** The relic set an event of `theme` in the cycle of `year` gives: the
 * latest from that year or before (the first, for years before any). */
export function relicSetFor(theme: EventThemeId, year: number) {
  const sets = RELIC_SETS[theme];
  return [...sets].reverse().find((s) => s.year <= year) ?? sets[0]!;
}
/** The ids of that set's relics, by place on the track. */
export function trackRelics(theme: EventThemeId, year: number): Record<Place, string> {
  const set = relicSetFor(theme, year);
  return Object.fromEntries(PLACES.map((p) => [p, relicId(theme, set.year, p)])) as Record<Place, string>;
}

/** Placeholder relics shown only in Dev mode beside any owned (New Year's
 * and Tower I's, every rarity among them), so the Relics screen and its
 * pop-up can be seen before any relic is won. Never saved. */
export const PREVIEW_RELICS: Readonly<Record<string, RelicDef>> = Object.fromEntries(
  Object.entries(RELICS).filter(([id]) => id.startsWith("newYear.") || id.startsWith("tower.1.")).map(([id, def]) => [`preview:${id}`, def]));

/** The saved relics: known ids, each once, in the order acquired. */
export const decodeRelics = (raw: unknown): string[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => typeof id === "string" && id in RELICS))] : [];
