import type { Mode, Save } from "../entities.ts";
import { MODES } from "../modes.ts";
import { enemyFirstFloor } from "../enemy-schedule.ts";
import { keyFirstFloor } from "../key-schedule.ts";
import { copiesLeft } from "../badges.ts";
import { EQUIP_MATERIAL_IDS, type EquipMaterialId } from "../equipment/catalog.ts";

// The daily missions (docs/MISSIONS.md): what each asks, how much of it, what
// it takes to be offered one, and what completing them pays, daily and
// weekly. All data; the desk (game/mission-desk.ts) runs them.

export type MissionType =
  | "floors" | "bosses" | "train" | "basic" | "strong" | "elite" | "potions" | "badge"
  | "runTraining" | "blueKeys" | "redKeys" | "focus";

export type MissionDef = {
  /** What the mission asks, with the target in it. */
  text: string;
  target: number;
  /** Whether the player can work on it now: a mission is never offered
   * before what it asks for has been unlocked. */
  offered(save: Save): boolean;
};

/** Whether the hero has reached floor `first(tower)` (counting from 1) of
 * some open tower, or the Delve's equivalent floor in the delve of the same
 * number (each delve follows the tower of its number). */
function reached(save: Save, first: (tower: number) => number) {
  return (["tower", "delve"] as Mode[]).some((mode) => {
    const slice = save[mode];
    for (let tier = 1; tier <= slice.tiersOpen; tier++) {
      const best = tier === slice.tier ? slice.best : slice.tierRecords[tier]?.best ?? 0;
      if (MODES[mode].equivalentFloor(best) + 1 >= first(tier)) return true;
    }
    return false;
  });
}

const always = () => true;

export const MISSIONS: Record<MissionType, MissionDef> = {
  floors: { text: "Advance 10 floors", target: 10, offered: always },
  bosses: { text: "Defeat 3 bosses", target: 3, offered: always },
  train: { text: "Train 1 skill", target: 1, offered: always },
  basic: { text: "Defeat 50 basic enemies", target: 50, offered: always },
  // Strong and elite enemies stand only from their first floors.
  strong: { text: "Defeat 30 strong enemies", target: 30, offered: (s) => reached(s, (t) => enemyFirstFloor("strong", t)) },
  elite: { text: "Defeat 10 elite enemies", target: 10, offered: (s) => reached(s, (t) => enemyFirstFloor("elite", t)) },
  potions: { text: "Pick up 20 potions", target: 20, offered: always },
  // Badges are drawn once the Badges skill is owned, while copies are left.
  badge: { text: "Buy 1 badge", target: 1, offered: (s) => !!s.upgrades.cardBadges && copiesLeft(s.badges, s.upgrades) > 0 },
  runTraining: { text: "Buy 10 run training upgrades", target: 10, offered: (s) => !!s.upgrades.onTheJob },
  blueKeys: { text: "Pick up 10 blue keys", target: 10, offered: (s) => reached(s, (t) => keyFirstFloor("blue", t)) },
  redKeys: { text: "Pick up 5 red keys", target: 5, offered: (s) => reached(s, (t) => keyFirstFloor("red", t)) },
  focus: { text: "Focus on 2 cards", target: 2, offered: (s) => !!s.upgrades.focus },
};
export const MISSION_TYPES = Object.keys(MISSIONS) as MissionType[];

/** New daily missions come every `MISSION_EVERY_MS` (8 hours, from 00:00
 * GMT), `MISSIONS_PER_GRANT` at a time, while the list holds fewer than
 * `MISSION_CAPACITY`, complete ones waiting to be claimed counting too. */
export const MISSION_EVERY_MS = 8 * 3_600_000;
export const MISSIONS_PER_GRANT = 2;
export const MISSION_CAPACITY = 8;

/** Gems each completed mission pays. */
export const MISSION_GEMS = 3;
/** Gold each completed mission pays, by the highest tower open (1 to 9). */
export const MISSION_GOLD = [100, 1_000, 10_000, 30_000, 100_000, 300_000, 1_000_000, 3_000_000, 10_000_000] as const;
/** The equipment upgrade material each completed mission pays, of the
 * kind it was given with, by the highest tower open. */
export const MISSION_MATERIALS = [0, 3, 5, 8, 12, 15, 20, 25, 30] as const;

/** The highest tower open (1 to 9). */
export const highestTower = (save: Save) => Math.min(MISSION_GOLD.length, Math.max(1, save.tower.tiersOpen));

/** What a daily mission pays now, by the highest tower open. */
export function missionReward(save: Save, material: EquipMaterialId) {
  const tower = highestTower(save);
  return { gems: MISSION_GEMS, gold: MISSION_GOLD[tower - 1]!, material, materials: MISSION_MATERIALS[tower - 1]! };
}

/** The weekly rewards, one for every 5 daily missions completed in the
 * week (Monday 00:00 GMT to the next): `gold` multiplies a daily mission's
 * Gold. */
export const WEEKLY_REWARDS = [
  { missions: 5, gold: 3, gems: 10, medals: 0, shards: 0 },
  { missions: 10, gold: 4, gems: 15, medals: 10, shards: 0 },
  { missions: 15, gold: 5, gems: 20, medals: 15, shards: 0 },
  { missions: 20, gold: 7, gems: 25, medals: 20, shards: 0 },
  { missions: 25, gold: 10, gems: 30, medals: 25, shards: 10 },
  { missions: 30, gold: 15, gems: 35, medals: 30, shards: 15 },
  { missions: 35, gold: 20, gems: 50, medals: 35, shards: 20 },
] as const;
/** The daily missions completed that the last weekly reward needs. */
export const WEEKLY_MAX = WEEKLY_REWARDS.at(-1)!.missions;

/** What weekly reward `i` pays now, by the highest tower open. */
export function weeklyReward(save: Save, i: number) {
  const w = WEEKLY_REWARDS[i]!;
  return { gold: w.gold * MISSION_GOLD[highestTower(save) - 1]!, gems: w.gems, medals: w.medals, shards: w.shards };
}

/** A material drawn evenly from Equipment's upgrade materials. */
export const randomMaterial = (rng: () => number): EquipMaterialId =>
  EQUIP_MATERIAL_IDS[Math.min(EQUIP_MATERIAL_IDS.length - 1, Math.floor(rng() * EQUIP_MATERIAL_IDS.length))]!;
