import type { Save } from "../save/shape.ts";
import { CURRENCIES } from "../shop/currency.ts";
import { EQUIP_MATERIAL_IDS, type EquipMaterialId } from "../equipment/catalog.ts";
import { THEME_IDS, THEMES, grantTheme, ownsTheme, themesOf, type ThemeId, type ThemeKind } from "../theme-collection.ts";
import { eventAt } from "./catalog.ts";
import { EVENT_THEME_NAMES, eventTheme, originEvent } from "./themes.ts";
import { BONUS_TRACKS, TRACK_MEDALS } from "./music.ts";
import { STORE_RELICS } from "../economy/relic-catalog.ts";
import { relicId } from "../economy/relics.ts";

// The Event Store (docs/EVENTS.md): what an event sells for Medals. Its
// Currencies (Gems, Arcanite and each Equipment supply), each dearer by a
// step with every one bought that event; one UI and one Game theme, which
// the event features; the bonus tracks, sold in every event; and any
// relics the event's theme sells (`STORE_RELICS`, none yet).

export type CurrencyOffer = { id: string; reward: { kind: "currency"; currency: "gems" | "arcanite" } | { kind: "material"; material: EquipMaterialId }; amount: number; medals: number; step: number };

/** The Currencies section's offers, row by row. */
export const CURRENCY_ROWS: readonly (readonly CurrencyOffer[])[] = [
  [
    { id: "gems", reward: { kind: "currency", currency: "gems" }, amount: 150, medals: 40, step: 25 },
    { id: "arcanite", reward: { kind: "currency", currency: "arcanite" }, amount: 15, medals: 40, step: 25 },
  ],
  EQUIP_MATERIAL_IDS.map((material) => ({ id: `supply:${material}`, reward: { kind: "material", material }, amount: 250, medals: 30, step: 5 })),
];
const CURRENCY_OFFERS = CURRENCY_ROWS.flat();

/** What each kind of theme costs. */
export const THEME_MEDALS: Readonly<Record<ThemeKind, number>> = { ui: 250, game: 450 };

/** The Medals the next of currency offer `id` costs this event, after
 * those bought. */
export function offerMedals(save: Pick<Save, "events">, id: string) {
  const o = CURRENCY_OFFERS.find((x) => x.id === id)!;
  return o.medals + o.step * (save.events.bought[id] ?? 0);
}

// --- The themes each event features ---

const EVENT_NAMES = new Set(Object.values(EVENT_THEME_NAMES));
/** The theme of `kind` named as an event theme is, which that event
 * always features and no other. */
const namesake = (kind: ThemeKind, eventName: string) => themesOf(kind).find((id) => THEMES[id].name === eventName) ?? null;
/** Whether theme `id` belongs to the event sharing its name. */
const pinned = (id: ThemeId) => EVENT_NAMES.has(THEMES[id].name);

/** The event a theme joins the rotation from (the first, without `since`). */
const joins = (id: ThemeId) => {
  const since = THEMES[id].since;
  return since ? eventAt(Date.parse(`${since}T00:00:00Z`)) : originEvent();
};

/** The theme of `kind` event `id` features: its namesake, else the next
 * of the rotation. The rotation runs through the themes of the kind no
 * event is named after, in catalog order, one an event that features
 * none of its own. Each time a theme joins (`since`) a new round starts
 * with it in, from the event it joins on, so the events before keep what
 * they featured; events before the first count backward. */
export function featuredTheme(kind: ThemeKind, id: number): ThemeId | null {
  const own = namesake(kind, EVENT_THEME_NAMES[eventTheme(id).theme]);
  if (own) return own;
  const pool = themesOf(kind).filter((t) => !pinned(t));
  // The round `id` falls in: from the latest join at or before it.
  const starts = [...new Set(pool.map(joins))].sort((a, b) => a - b);
  const from = [...starts].reverse().find((s) => s <= id) ?? starts[0]!;
  const round = pool.filter((t) => joins(t) <= from);
  if (!round.length) return null;
  const features = (e: number) => !namesake(kind, EVENT_THEME_NAMES[eventTheme(e).theme]);
  let n = 0;
  if (id >= from) for (let e = from; e < id; e++) n += features(e) ? 1 : 0;
  else for (let e = id; e < from; e++) n -= features(e) ? 1 : 0;
  return round[((n % round.length) + round.length) % round.length]!;
}

/** The themes event `id` features, by kind. */
export const featuredThemes = (id: number) => ({ ui: featuredTheme("ui", id), game: featuredTheme("game", id) });

// --- Buying ---

export type StoreItem = { kind: "currency"; id: string } | { kind: "theme"; id: ThemeId } | { kind: "track"; id: string } | { kind: "relic"; id: string };

/** The relics event `id`'s Store sells: its theme's, from its cycle's
 * year or before, by relic id with their Medals. */
export function storeRelics(id: number) {
  const { theme, year } = eventTheme(id);
  return (STORE_RELICS[theme] ?? []).map((s, i) => ({ id: relicId(theme, s.year, `store${i + 1}`), year: s.year, relic: s.relic, medals: s.medals })).filter((s) => s.year <= year);
}

/** What `item` costs now in Medals, or null when it can't be bought at
 * all: a theme the running event doesn't feature or already owned, a
 * track owned or unknown. */
export function storePrice(save: Save, item: StoreItem): number | null {
  if (save.events.id === null) return null;
  if (item.kind === "currency") return CURRENCY_OFFERS.some((o) => o.id === item.id) ? offerMedals(save, item.id) : null;
  if (item.kind === "theme") {
    const f = featuredThemes(save.events.id);
    return THEME_IDS.includes(item.id) && (f.ui === item.id || f.game === item.id) && !ownsTheme(save, item.id) ? THEME_MEDALS[THEMES[item.id].kind] : null;
  }
  if (item.kind === "relic") {
    const r = storeRelics(save.events.id).find((x) => x.id === item.id);
    return r && !save.relics.includes(r.id) ? r.medals : null;
  }
  return BONUS_TRACKS.some((t) => t.id === item.id) && !save.music.includes(item.id) ? TRACK_MEDALS : null;
}

/** Buys `item` for Medals (free purchases pay none): false when it can't
 * be bought, or the Medals held fall short. */
export function buyStoreItem(save: Save, item: StoreItem) {
  const price = storePrice(save, item);
  if (price === null || (!save.settings.freePurchases && save.medals < price)) return false;
  if (!save.settings.freePurchases) save.medals -= price;
  if (item.kind === "currency") {
    const o = CURRENCY_OFFERS.find((x) => x.id === item.id)!;
    save.events.bought[o.id] = (save.events.bought[o.id] ?? 0) + 1;
    if (o.reward.kind === "currency") CURRENCIES[o.reward.currency].credit(save, o.amount);
    else save.equipment.materials[o.reward.material] += o.amount;
  } else if (item.kind === "theme") grantTheme(save, item.id);
  else if (item.kind === "relic") save.relics = [...save.relics, item.id];
  else save.music = BONUS_TRACKS.map((t) => t.id).filter((t) => save.music.includes(t) || t === item.id);
  return true;
}
