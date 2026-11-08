import type { EnemyStrength, EnemyProfile } from "../entities.ts";
import { enemyStats, floorsAhead } from "./curves.ts";
import { enemyFirstFloor } from "./schedule.ts";
import { TOWER_ZONE_ENEMIES, TOWER_ZONE_FLOORS } from "./legacy-roster.ts";
import { rosterEntry, type RosterEnemy } from "./roster.ts";

export { GREATER_BOSS_OVER_BOSS } from "./curves.ts";
export type TowerEnemyProfile = EnemyProfile;

export { TOWER_ZONE_ENEMIES, TOWER_ZONE_FLOORS, DELVE_ENEMY_NAMES, type TowerEnemyDefinition } from "./legacy-roster.ts";

/** How many floors pass before the roster repeats: one of every zone. */
export const TOWER_CYCLE_FLOORS = TOWER_ZONE_FLOORS * TOWER_ZONE_ENEMIES.length;

/** The roster floor `room` of tower `tower` draws from: tower `t` starts its
 * cycle `t − 1` zones along, so each tower's first floors meet others. */
export function towerZoneIndex(room: number, tower = 1) {
  return (Math.floor(Math.max(0, room) / TOWER_ZONE_FLOORS) + tower - 1) % TOWER_ZONE_ENEMIES.length;
}

/** The name of floor `room`'s enemy of `profile` in tower `tower`. */
export const towerEnemyName = (room: number, profile: TowerEnemyProfile, tower = 1) =>
  TOWER_ZONE_ENEMIES[towerZoneIndex(room, tower)].find((enemy) => enemy.profile === profile)!.name;

/** How hard a Tower floor's generator asks an enemy to be. */
export type TowerEnemyStrength = EnemyStrength;

/** The tier each strength carries, which picks its art, in both modes. */
const STRENGTH_TIER: Record<EnemyStrength, number> = { weak: 1, normal: 1, strong: 2, elite: 3, boss: 4, greaterBoss: 4 };

/** The first floor (1-based, the Delve's equivalent floor) where the
 * generators place strong and elite enemies, in both modes. Below it, one
 * asked for stands one strength lower, or as a normal enemy. The first
 * tower's first floors from the enemy schedule (`enemyFirstFloor`). */
export const STRENGTH_FROM_FLOOR = { strong: enemyFirstFloor("strong", 1), elite: enemyFirstFloor("elite", 1) };
/** The strength an enemy asked as `asked` stands at on floor `floor`
 * (0-based) of tower `tower`: an elite below the tower's first elite floor
 * (`enemyFirstFloor`; `STRENGTH_FROM_FLOOR` in the first) is strong, and a
 * strong (or demoted elite) one below its first strong floor normal. */
export function strengthOnFloor(asked: EnemyStrength, floor: number, tower = 1): EnemyStrength {
  let strength = asked;
  if (strength === "elite" && floor + 1 < enemyFirstFloor("elite", tower)) strength = "strong";
  if (strength === "strong" && floor + 1 < enemyFirstFloor("strong", tower)) strength = "normal";
  return strength;
}

/** Weak, strong and elite enemies and bosses say so before their name. */
const RANK: Record<EnemyStrength, string> = { weak: "Weak ", normal: "", strong: "Strong ", elite: "Elite ", boss: "Boss ", greaterBoss: "Greater Boss " };
/** What the game calls an enemy: its name, after its strength unless it
 * is a normal one, and after "Stunned", "Necro", "Aggroed", "Flying", "Fast", "Ranged", "Shielded" and "Armored"
 * when it is. */
export const enemyTitle = (e: RosterEnemy & { stunned?: true; necro?: object }, legacy = false) =>
  (e.stunned ? "Stunned " : "") + (e.necro ? "Necro " : "") + (e.aggro && !legacy ? "Aggroed " : "") + (e.flying ? "Flying " : "") + (e.fast ? "Fast " : "") + (e.ranged ? "Ranged " : "") + (e.shielded ? "Shielded " : "") + (e.armored ? "Armored " : "") + (e.strength ? RANK[e.strength] : "") + (rosterEntry(e, legacy)?.name ?? e.name);

/** The tier an enemy of each strength carries, in both modes. */
export const enemyTier = (strength: EnemyStrength) => STRENGTH_TIER[strength];

/** A Tower enemy of the given strength and profile for floor `room` of
 * tower `tower`, from that tower's enemy curve, before its stat factor
 * (`tierTile`). An elite is named from the zone it visits from. */
export function getTowerGateEnemy(room: number, strength: TowerEnemyStrength, profile: TowerEnemyProfile, tower = 1) {
  return {
    name: towerEnemyName(room + floorsAhead("tower", tower, strength), profile, tower),
    ...enemyStats("tower", tower, room, strength, profile),
    tier: enemyTier(strength),
    strength,
    profile,
  };
}
