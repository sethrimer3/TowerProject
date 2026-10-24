import type { Save } from "../save/shape.ts";
import { enemyFirstFloor } from "../enemies/schedule.ts";
import { reached } from "../missions/catalog.ts";
import { DAY_MS, gmtDay } from "../shop/clock.ts";

// Events (docs/EVENTS.md): fortnightly sets of missions, each with three
// tiers paying Medals, which count toward the event's relics. All data;
// the desk (game/event-desk.ts) runs them.

export type EventMissionType =
  | "login" | "freeGems" | "tournaments" | "badges"
  | "basic" | "strong" | "elite" | "bosses" | "floor" | "floatingGems" | "training" | "noDamage"
  | "equipment" | "merges" | "adGems" | "potions" | "chests"
  | "crits" | "freeUpgrades" | "maxInterest";

export type EventMissionDef = {
  /** What the mission asks at a tier's target. */
  text(target: number): string;
  /** Each tier's target, rising. */
  targets: readonly [number, number, number];
  /** A `best` mission keeps the most reached at once (a floor, a streak)
   * rather than adding up. */
  best?: true;
  /** Whether the stand-in draws it for the player now: never before what it
   * asks for is unlocked. */
  offered(save: Save): boolean;
};

const always = () => true;
/** `n` in full, with thousands separators. */
const n = (target: number) => target.toLocaleString("en-US");
const plural = (target: number, one: string, many: string) => `${n(target)} ${target === 1 ? one : many}`;

export const EVENT_MISSIONS: Record<EventMissionType, EventMissionDef> = {
  login: { text: (t) => `Log in on ${plural(t, "day", "days")}`, targets: [7, 10, 13], offered: always },
  freeGems: { text: (t) => `Claim the Shop's free Gems ${plural(t, "time", "times")}`, targets: [7, 10, 13], offered: always },
  tournaments: { text: (t) => `Take part in ${plural(t, "tournament", "tournaments")}`, targets: [1, 2, 3], offered: always },
  // Completes outright once every badge is owned and maxed (the desk sees to it).
  badges: { text: (t) => `Buy ${plural(t, "badge", "badges")}`, targets: [20, 40, 80], offered: always },
  basic: { text: (t) => `Defeat ${n(t)} base enemies`, targets: [5_000, 20_000, 90_000], offered: always },
  strong: { text: (t) => `Defeat ${n(t)} strong enemies`, targets: [1_000, 5_000, 20_000], offered: (s) => reached(s, (tier) => enemyFirstFloor("strong", tier)) },
  elite: { text: (t) => `Defeat ${n(t)} elite enemies`, targets: [500, 2_500, 10_000], offered: (s) => reached(s, (tier) => enemyFirstFloor("elite", tier)) },
  bosses: { text: (t) => `Defeat ${n(t)} bosses`, targets: [150, 500, 2_500], offered: always },
  floor: { text: (t) => `Reach floor ${n(t)} in any tower`, targets: [500, 1_000, 1_500], best: true, offered: always },
  floatingGems: { text: (t) => `Tap ${n(t)} floating Gems`, targets: [12, 24, 50], offered: always },
  training: { text: (t) => `Complete ${n(t)} Training upgrades`, targets: [50, 150, 400], offered: always },
  noDamage: { text: (t) => `Take no damage for ${n(t)} floors in a row`, targets: [100, 250, 500], best: true, offered: always },
  equipment: { text: (t) => `Obtain ${n(t)} Equipment pieces`, targets: [40, 80, 150], offered: (s) => s.equipment.unlocked },
  merges: { text: (t) => `Obtain ${n(t)} Equipment by merging`, targets: [10, 20, 40], offered: (s) => s.equipment.unlocked },
  adGems: { text: (t) => `Claim ad Gems ${plural(t, "time", "times")}`, targets: [10, 25, 60], offered: always },
  potions: { text: (t) => `Obtain ${n(t)} potions`, targets: [2_000, 10_000, 30_000], offered: always },
  chests: { text: (t) => `Obtain ${n(t)} chests`, targets: [200, 1_000, 3_000], offered: always },
  // Training-based: each asks for what a skill opens.
  crits: { text: (t) => `Land ${n(t)} critical hits`, targets: [2_000, 40_000, 3_000_000], offered: (s) => !!s.upgrades.critical },
  freeUpgrades: { text: (t) => `Get ${n(t)} free upgrades`, targets: [3_000, 6_000, 15_000], offered: (s) => !!s.upgrades.freeTraining },
  maxInterest: { text: (t) => `Earn max Interest ${n(t)} floors in a row`, targets: [60, 300, 500], best: true, offered: (s) => !!s.upgrades.interest },
};
export const EVENT_MISSION_TYPES = Object.keys(EVENT_MISSIONS) as EventMissionType[];
/** The missions every event opens with, in this order. */
export const FIXED_MISSIONS: readonly EventMissionType[] = ["login", "freeGems", "tournaments", "badges"];
/** The missions the stand-in draws among for the rest. */
export const DRAWN_MISSIONS = EVENT_MISSION_TYPES.filter((t) => !FIXED_MISSIONS.includes(t));

/** Medals each tier of a mission pays (doubled by the Event Booster). */
export const TIER_MEDALS = [10, 15, 20] as const;
export const TIERS = TIER_MEDALS.length;

/** An event lasts `EVENT_DAYS` GMT days, the next beginning as it ends:
 * `FIRST_DAY_MISSIONS` on its first day, `MISSIONS_PER_DAY` more on each
 * of the next `RELEASE_DAYS - 1`, then none for the rest. */
export const EVENT_DAYS = 14;
export const RELEASE_DAYS = 8;
export const FIRST_DAY_MISSIONS = 7;
export const MISSIONS_PER_DAY = 2;
export const EVENT_MISSION_COUNT = FIRST_DAY_MISSIONS + MISSIONS_PER_DAY * (RELEASE_DAYS - 1);

/** The event (numbered since 1970) that server time `ms` falls in: each
 * begins on a Monday 00:00 GMT (1 January 1970 was a Thursday). */
export const eventAt = (ms: number) => Math.floor((gmtDay(ms) + 3) / EVENT_DAYS);
/** The GMT day event `id` begins on. */
const firstDay = (id: number) => id * EVENT_DAYS - 3;
export const eventStartsAt = (id: number) => firstDay(id) * DAY_MS;
export const eventEndsAt = (id: number) => eventStartsAt(id + 1);
/** The day of event `id` that `ms` falls on, from 0. */
export const eventDay = (id: number, ms: number) => gmtDay(ms) - firstDay(id);
/** How many missions event `id` has released by `ms`. */
export const releasedBy = (id: number, ms: number) =>
  FIRST_DAY_MISSIONS + MISSIONS_PER_DAY * Math.min(RELEASE_DAYS - 1, Math.max(0, eventDay(id, ms)));
/** When event `id` releases its next missions after `ms`; null once all are out. */
export function nextReleaseAt(id: number, ms: number) {
  const day = eventDay(id, ms);
  return day < RELEASE_DAYS - 1 ? (firstDay(id) + Math.max(0, day) + 1) * DAY_MS : null;
}

export type RelicRarity = "rare" | "epic";
/** A medal milestone on an event's relic track: the Medals it takes (the
 * event's own, doubled once boosted), whether only the Event Booster opens
 * it, and the relic it gives (null for a stand-in, which joins no one's relics). */
export type RelicMilestone = { medals: number; premium: boolean; rarity: RelicRarity; relic: string | null };

/** What the server says about an event: its name, when it runs, and the
 * relics its milestones give. */
export type EventInfo = { id: number; name: string; startsAt: number; endsAt: number; milestones: readonly RelicMilestone[] };

/** The stand-in's milestones: a rare and an epic relic for all, and a
 * premium one of each for the boosted. */
export const STUB_MILESTONES: readonly RelicMilestone[] = [
  { medals: 350, premium: false, rarity: "rare", relic: null },
  { medals: 550, premium: true, rarity: "rare", relic: null },
  { medals: 700, premium: false, rarity: "epic", relic: null },
  { medals: 1100, premium: true, rarity: "epic", relic: null },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Event `id` as the stand-in knows it: named by its first day (GMT), with
 * placeholder relics.
 * TODO(server): the event server will give each event's name, banner, missions and the day each
 * is released, and the relics its milestones give; until then the desk draws the missions at
 * random from `EVENT_MISSIONS`. */
export function stubEvent(id: number): EventInfo {
  const start = new Date(eventStartsAt(id));
  return {
    id,
    name: `Event of ${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`,
    startsAt: eventStartsAt(id),
    endsAt: eventEndsAt(id),
    milestones: STUB_MILESTONES,
  };
}

/** The Medals a mission has paid with `tiers` tiers done, before any boost. */
export const tierMedals = (tiers: number) => TIER_MEDALS.slice(0, tiers).reduce((a, b) => a + b, 0);
