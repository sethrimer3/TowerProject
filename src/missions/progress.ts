import { isRecord, whole, wholeIn } from "../decode.ts";
import { EQUIP_MATERIAL_IDS, type EquipMaterialId } from "../equipment/catalog.ts";
import { DAY_MS, gmtDay } from "../shop/clock.ts";
import { MISSION_CAPACITY, MISSION_EVERY_MS, MISSIONS, MISSION_TYPES, WEEKLY_MAX, WEEKLY_REWARDS, type MissionType } from "./catalog.ts";

// The missions' saved state (`save.missions`): the player's list, when
// missions were last given, the week's tally of missions claimed and its
// rewards claimed, and what has already counted, so undo can't count it twice.

export type Mission = {
  id: number;
  type: MissionType;
  /** Progress toward the type's target, never past it. */
  progress: number;
  /** The upgrade material it pays. */
  material: EquipMaterialId;
};

export type MissionsSave = {
  list: Mission[];
  /** The 8-hour period (`missionPeriod`) missions were last given in; null
   * before the first. */
  period: number | null;
  nextId: number;
  /** The saved stream mission types and materials are drawn from (seeded
   * once from `stream("missions")`), so reloading can't redraw them. */
  rng: number | null;
  /** The week (`missionWeek`) the tally belongs to, the daily missions
   * claimed in it, and the weekly rewards claimed (by index). */
  week: { id: number; missions: number; claimed: number[] };
  /** Kills and pickups already counted (`type:mode:loot key`), the latest
   * `COUNTED_KEPT`: undo brings the tile back but it never counts again. */
  counted: string[];
  /** The most counted so far in a run (`type:mode:seed`), for what undo
   * takes back (run training, Focus): only a rise past it counts. */
  marks: Record<string, number>;
};

/** The most kills and pickups remembered as counted: far more than a run's
 * undo can bring back. */
export const COUNTED_KEPT = 2000;
/** The most runs' marks kept. */
export const MARKS_KEPT = 20;

export const defaultMissions = (): MissionsSave => ({
  list: [], period: null, nextId: 1, rng: null, week: { id: 0, missions: 0, claimed: [] }, counted: [], marks: {},
});

/** The 8-hour period (since 1970, from 00:00 GMT) that `ms` falls in. */
export const missionPeriod = (ms: number) => Math.floor(ms / MISSION_EVERY_MS);
/** The week (since 1970) that `ms` falls in, each starting Monday 00:00
 * GMT (1 January 1970 was a Thursday). */
export const missionWeek = (ms: number) => Math.floor((gmtDay(ms) + 3) / 7);
/** When week `week` ends, Monday 00:00 GMT. */
export const weekEndsAt = (week: number) => ((week + 1) * 7 - 3) * DAY_MS;
/** When the period after `ms`'s starts. */
export const nextPeriodAt = (ms: number) => (missionPeriod(ms) + 1) * MISSION_EVERY_MS;

export const isComplete = (m: Mission) => m.progress >= MISSIONS[m.type].target;

/** A saved MissionsSave, field by field; anything malformed is dropped. */
export function decodeMissions(raw: unknown): MissionsSave {
  const d = defaultMissions();
  if (!isRecord(raw)) return d;
  const ids = new Set<number>(), open = new Set<MissionType>();
  for (const m of Array.isArray(raw.list) ? raw.list : []) {
    if (!isRecord(m) || !whole(m.id) || ids.has(m.id) || !MISSION_TYPES.includes(m.type) || !EQUIP_MATERIAL_IDS.includes(m.material)) continue;
    const target = MISSIONS[m.type as MissionType].target;
    if (!wholeIn(m.progress, 0, target)) continue;
    // Never two incomplete missions of one type, nor more than the list holds.
    if ((m.progress < target && open.has(m.type)) || d.list.length >= MISSION_CAPACITY) continue;
    if (m.progress < target) open.add(m.type);
    ids.add(m.id);
    d.list.push({ id: m.id, type: m.type, progress: m.progress, material: m.material });
  }
  d.period = whole(raw.period) ? raw.period : null;
  d.nextId = Math.max(whole(raw.nextId) ? raw.nextId : 1, ...[...ids].map((i) => i + 1));
  d.rng = wholeIn(raw.rng, 0, 4294967295) ? raw.rng : null;
  const w = isRecord(raw.week) ? raw.week : {};
  if (whole(w.id)) {
    const claimed = Array.isArray(w.claimed) ? w.claimed : [];
    d.week = {
      id: w.id,
      missions: wholeIn(w.missions, 0, 1e6) ? w.missions : 0,
      claimed: [...new Set(claimed.filter((i: unknown) => wholeIn(i, 0, WEEKLY_REWARDS.length - 1)) as number[])].sort((a, b) => a - b),
    };
    // A reward claimed is one the tally reached.
    d.week.claimed = d.week.claimed.filter((i) => WEEKLY_REWARDS[i]!.missions <= Math.min(d.week.missions, WEEKLY_MAX));
  }
  d.counted = Array.isArray(raw.counted) ? raw.counted.filter((k: unknown) => typeof k === "string" && k.length < 120).slice(-COUNTED_KEPT) : [];
  if (isRecord(raw.marks))
    d.marks = Object.fromEntries(Object.entries(raw.marks).filter(([k, v]) => k.length < 120 && whole(v)).slice(-MARKS_KEPT));
  return d;
}
