import { DAY_MS } from "../shop/clock.ts";
import { eventAt, eventStartsAt } from "./catalog.ts";

// Event themes (docs/EVENTS.md): every event wears one, by the calendar.
// Each year's cycle starts with the event holding 1 January (New Year) and
// runs through the themes in order, one an event; a year holding a 27th
// event (about one in seven, as the fortnights drift against the calendar)
// ends with the rare Blue Moon. The rule holds for any date, so events
// before the first public New Year (28 December 2026) wear the cycle's
// themes counted backward.

export type EventThemeId =
  | "newYear" | "blizzard" | "lunarNewYear" | "heartbloom" | "aurora" | "springRain" | "jestersRevel"
  | "dragonsHatchery" | "cherryBlossom" | "honeycomb" | "fairyRing" | "sunkenKingdom" | "midsummer"
  | "ember" | "sandstorm" | "neon" | "orbit" | "tempest" | "crystalCaverns" | "autumnWood"
  | "spidersLair" | "hauntedKeep" | "arcade" | "harvestFeast" | "wizardsTower" | "longestNight"
  | "blueMoon";

/** The yearly cycle, in order from New Year. A theme sharing its name with
 * a UI or Game theme features that theme in its store (events/store.ts). */
export const EVENT_CYCLE: readonly { id: EventThemeId; name: string }[] = [
  { id: "newYear", name: "New Year" },
  { id: "blizzard", name: "Blizzard" },
  { id: "lunarNewYear", name: "Lunar New Year" },
  { id: "heartbloom", name: "Heartbloom" },
  { id: "aurora", name: "Aurora" },
  { id: "springRain", name: "Spring Rain" },
  { id: "jestersRevel", name: "Jester's Revel" },
  { id: "dragonsHatchery", name: "Dragon's Hatchery" },
  { id: "cherryBlossom", name: "Cherry Blossom" },
  { id: "honeycomb", name: "Honeycomb" },
  { id: "fairyRing", name: "Fairy Ring" },
  { id: "sunkenKingdom", name: "Sunken Kingdom" },
  { id: "midsummer", name: "Midsummer" },
  { id: "ember", name: "Ember" },
  { id: "sandstorm", name: "Sandstorm" },
  { id: "neon", name: "Neon" },
  { id: "orbit", name: "Orbit" },
  { id: "tempest", name: "Tempest" },
  { id: "crystalCaverns", name: "Crystal Caverns" },
  { id: "autumnWood", name: "Autumn Wood" },
  { id: "spidersLair", name: "Spider's Lair" },
  { id: "hauntedKeep", name: "Haunted Keep" },
  { id: "arcade", name: "Arcade" },
  { id: "harvestFeast", name: "Harvest Feast" },
  { id: "wizardsTower", name: "Wizard's Tower" },
  { id: "longestNight", name: "Longest Night" },
];
/** The rare 27th event of a year whose fortnights hold one more. */
export const BLUE_MOON = { id: "blueMoon", name: "Blue Moon" } as const;
export const EVENT_THEME_NAMES: Readonly<Record<EventThemeId, string>> =
  Object.fromEntries([...EVENT_CYCLE, BLUE_MOON].map((t) => [t.id, t.name])) as Record<EventThemeId, string>;

/** The event holding 1 January of `year` (GMT): that year's New Year. */
export const newYearEvent = (year: number) => eventAt(Date.UTC(year, 0, 1));

/** Event `id`'s theme, and the year whose cycle it belongs to. */
export function eventTheme(id: number): { theme: EventThemeId; year: number } {
  // The cycle's year is the one its last day falls in, or the year before
  // when the event comes before that year's New Year.
  const lastDay = new Date(eventStartsAt(id + 1) - DAY_MS).getUTCFullYear();
  const year = newYearEvent(lastDay) <= id ? lastDay : lastDay - 1;
  const slot = id - newYearEvent(year);
  return { theme: slot < EVENT_CYCLE.length ? EVENT_CYCLE[slot]!.id : BLUE_MOON.id, year };
}

/** The first public event: New Year 2027, from 28 December 2026. (A
 * function, as events/catalog.ts imports this module.) */
export const originEvent = () => newYearEvent(2027);
