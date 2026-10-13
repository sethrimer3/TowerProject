import { isRecord, whole, wholeIn } from "../decode.ts";
import type { Save } from "../entities.ts";
import { earn } from "../profile.ts";
import { RELICS } from "../relics.ts";
import { EVENT_MISSION_COUNT, EVENT_MISSION_TYPES, EVENT_MISSIONS, TIERS, stubEvent, tierMedals, type EventMissionType, type RelicMilestone } from "./catalog.ts";

// The Events' saved state (`save.events`): the running event's missions and
// what has counted toward them, the events whose booster was bought, and
// the streaks the run is on.

export type EventMission = {
  id: number;
  type: EventMissionType;
  /** Progress toward the last tier's target, never past it. */
  progress: number;
  /** The tiers whose Medals have been claimed, never more than are done. */
  claimed: number;
};

/** A run's streaks: floors climbed without fight damage (and whether the
 * floor the hero stands on has cost some), and floors paying the most
 * Interest, each in a row. */
export type EventStreaks = { run: string; floors: number; hurt: boolean; interest: number };

export type EventsSave = {
  /** The event the missions belong to (`eventAt`); null before the first. */
  id: number | null;
  missions: EventMission[];
  nextId: number;
  /** The saved stream the stand-in draws missions from (seeded once from
   * `stream("events")`), so reloading can't redraw them. */
  rng: number | null;
  /** The events whose Event Booster was bought, the latest few; kept by
   * Erase All, since they were paid for. */
  boosted: number[];
  /** The missions the Events page has seen (new ones wear the button's
   * dot), and the completed ones it has moved under the rest. */
  seen: number[];
  moved: number[];
  /** The GMT day a login last counted. */
  loginDay: number | null;
  /** What has already counted (`type:key`), the latest `COUNTED_KEPT`:
   * undo brings a tile back but it never counts again. */
  counted: string[];
  streaks: EventStreaks;
};

export const COUNTED_KEPT = 2000;
/** The most boosted events remembered. */
const BOOSTED_KEPT = 8;

export const noStreaks = (run = ""): EventStreaks => ({ run, floors: 0, hurt: false, interest: 0 });
export const defaultEvents = (): EventsSave => ({
  id: null, missions: [], nextId: 1, rng: null, boosted: [], seen: [], moved: [], loginDay: null, counted: [], streaks: noStreaks(),
});

/** How many of a mission's tiers are done. */
export const tiersDone = (m: EventMission) => EVENT_MISSIONS[m.type].targets.filter((t) => m.progress >= t).length;
export const isComplete = (m: EventMission) => tiersDone(m) === TIERS;
/** The tiers done whose Medals wait to be claimed. */
export const unclaimedTiers = (m: EventMission) => tiersDone(m) - m.claimed;
/** Whether every tier's Medals have been claimed. */
export const isFinished = (m: EventMission) => m.claimed === TIERS;

/** Whether the running event's booster is owned. */
export const isBoosted = (e: EventsSave) => e.id !== null && e.boosted.includes(e.id);
/** The Medals the event's missions have paid (the tiers claimed), before
 * the booster doubles them. */
export const baseMedals = (e: EventsSave) => e.missions.reduce((sum, m) => sum + tierMedals(m.claimed), 0);
/** The Medals the event's tiers done and not yet claimed hold, doubled once
 * boosted. */
export const unclaimedMedals = (e: EventsSave) =>
  e.missions.reduce((sum, m) => sum + tierMedals(tiersDone(m)) - tierMedals(m.claimed), 0) * (isBoosted(e) ? 2 : 1);
/** The Medals toward the event's relics: its own, doubled once boosted
 * (Medals carried over or from the weekly missions never count). */
export const relicMedals = (e: EventsSave) => baseMedals(e) * (isBoosted(e) ? 2 : 1);
/** Whether a milestone of the running event is reached: its Medals earned,
 * and for a premium one the booster owned. */
export const milestoneReached = (e: EventsSave, m: RelicMilestone) => relicMedals(e) >= m.medals && (!m.premium || isBoosted(e));

/** Gives the player every relic the running event's reached milestones
 * hold that they lack (a stand-in's, null, gives none). */
export function grantRelics(save: Save) {
  const e = save.events;
  if (e.id === null) return;
  for (const m of stubEvent(e.id).milestones)
    if (m.relic && RELICS[m.relic] && milestoneReached(e, m) && !save.relics.includes(m.relic)) save.relics.push(m.relic);
}

/** Why the running event's booster can't be bought: none running, or
 * already bought. */
export const boostRefusal = (save: Save): "locked" | "owned" | null =>
  save.events.id === null ? "locked" : isBoosted(save.events) ? "owned" : null;

/** The Event Booster bought: the running event's Medals double, those its
 * missions have paid (claimed) already too, and its premium relics open. */
export function boostEvent(save: Save) {
  const e = save.events;
  if (boostRefusal(save)) return;
  e.boosted = [...e.boosted, e.id!].slice(-BOOSTED_KEPT);
  save.medals += baseMedals(e);
  earn(save, "medals", baseMedals(e));
  grantRelics(save);
}

/** A saved EventsSave, field by field; anything malformed is dropped. */
export function decodeEvents(raw: unknown): EventsSave {
  const d = defaultEvents();
  if (!isRecord(raw)) return d;
  d.id = whole(raw.id) ? raw.id : null;
  const ids = new Set<number>(), types = new Set<EventMissionType>();
  for (const m of d.id !== null && Array.isArray(raw.missions) ? raw.missions : []) {
    if (!isRecord(m) || !whole(m.id) || ids.has(m.id) || !EVENT_MISSION_TYPES.includes(m.type) || types.has(m.type)) continue;
    if (!wholeIn(m.progress, 0, EVENT_MISSIONS[m.type as EventMissionType].targets[TIERS - 1]) || d.missions.length >= EVENT_MISSION_COUNT) continue;
    ids.add(m.id);
    types.add(m.type);
    const mission: EventMission = { id: m.id, type: m.type, progress: m.progress, claimed: 0 };
    // TODO: drop the `undefined` case once saves from before claiming (whose tiers paid at once) are gone.
    mission.claimed = m.claimed === undefined ? tiersDone(mission) : wholeIn(m.claimed, 0, tiersDone(mission)) ? m.claimed : 0;
    d.missions.push(mission);
  }
  d.nextId = Math.max(whole(raw.nextId) ? raw.nextId : 1, ...[...ids].map((i) => i + 1));
  d.rng = wholeIn(raw.rng, 0, 4294967295) ? raw.rng : null;
  d.boosted = Array.isArray(raw.boosted) ? [...new Set(raw.boosted.filter(whole) as number[])].slice(-BOOSTED_KEPT) : [];
  const known = (list: unknown) => Array.isArray(list) ? [...new Set(list.filter((i): i is number => whole(i) && ids.has(i)))] : [];
  d.seen = known(raw.seen);
  d.moved = known(raw.moved);
  d.loginDay = whole(raw.loginDay) ? raw.loginDay : null;
  d.counted = Array.isArray(raw.counted) ? raw.counted.filter((k: unknown) => typeof k === "string" && k.length < 120).slice(-COUNTED_KEPT) : [];
  const s = isRecord(raw.streaks) ? raw.streaks : {};
  if (typeof s.run === "string" && s.run.length < 120)
    d.streaks = { run: s.run, floors: whole(s.floors) ? s.floors : 0, hurt: s.hurt === true, interest: whole(s.interest) ? s.interest : 0 };
  return d;
}
