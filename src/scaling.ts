import type { EnemyStrength } from "./entities.ts";
import { enemyStats, floorsAhead, type EnemyProfile } from "./enemy-curves.ts";

export { GREATER_BOSS_OVER_BOSS } from "./enemy-curves.ts";
export type TowerEnemyProfile = EnemyProfile;

export type TowerEnemyDefinition = {
  name: string;
  profile: TowerEnemyProfile;
};

/** How many floors each Tower zone (one roster) spans. */
export const TOWER_ZONE_FLOORS = 10;

/** Ten-room Tower zones: who stands on a floor, by profile. Their stats come
 * from the Tower's enemy curve (enemy-curves.ts); the roster repeats every
 * `TOWER_CYCLE_FLOORS` rooms. */
export const TOWER_ZONE_ENEMIES: readonly (readonly TowerEnemyDefinition[])[] = [
  [
    { name: "Goblin", profile: "attackHeavy" },
    { name: "Thief", profile: "balanced" },
    { name: "Armored Knight", profile: "defenseHeavy" },
  ],
  [
    { name: "Bat", profile: "attackHeavy" },
    { name: "Slime", profile: "balanced" },
    { name: "Stone Warden", profile: "defenseHeavy" },
  ],
  [
    { name: "Assassin", profile: "attackHeavy" },
    { name: "Skeleton", profile: "balanced" },
    { name: "Golem", profile: "defenseHeavy" },
  ],
  [
    { name: "Mage", profile: "attackHeavy" },
    { name: "Orc", profile: "balanced" },
    { name: "Gargoyle", profile: "defenseHeavy" },
  ],
  [
    { name: "Berserker", profile: "attackHeavy" },
    { name: "Ogre", profile: "balanced" },
    { name: "Demon", profile: "defenseHeavy" },
  ],
  [
    { name: "Cultist", profile: "attackHeavy" },
    { name: "Crystal Savant", profile: "balanced" },
    { name: "Amethyst Golem", profile: "defenseHeavy" },
  ],
  [
    { name: "Drowned Marauder", profile: "attackHeavy" },
    { name: "Temple Wraith", profile: "balanced" },
    { name: "Coral Knight", profile: "defenseHeavy" },
  ],
  [
    { name: "Sporeling", profile: "attackHeavy" },
    { name: "Troll", profile: "balanced" },
    { name: "Spore Colossus", profile: "defenseHeavy" },
  ],
  [
    { name: "Shadow Stalker", profile: "attackHeavy" },
    { name: "Obsidian Revenant", profile: "balanced" },
    { name: "Blackstone Colossus", profile: "defenseHeavy" },
  ],
  [
    { name: "Starfire Adept", profile: "attackHeavy" },
    { name: "Dragon Whelp", profile: "balanced" },
    { name: "Celestial Guardian", profile: "defenseHeavy" },
  ],
] as const;

/** How many floors pass before the roster repeats: one of every zone. */
export const TOWER_CYCLE_FLOORS = TOWER_ZONE_FLOORS * TOWER_ZONE_ENEMIES.length;

export function towerZoneIndex(room: number) {
  return Math.floor(Math.max(0, room) / TOWER_ZONE_FLOORS) % TOWER_ZONE_ENEMIES.length;
}

/** The name of floor `room`'s enemy of `profile`. */
export const towerEnemyName = (room: number, profile: TowerEnemyProfile) =>
  TOWER_ZONE_ENEMIES[towerZoneIndex(room)].find((enemy) => enemy.profile === profile)!.name;

/** How hard a Tower floor's generator asks an enemy to be. */
export type TowerEnemyStrength = EnemyStrength;

/** The tier each strength carries, which picks its art, in both modes. */
const STRENGTH_TIER: Record<EnemyStrength, number> = { weak: 1, normal: 1, strong: 2, elite: 3, boss: 4, greaterBoss: 4 };

/** The first floor (1-based, the Delve's equivalent floor) where the
 * generators place strong and elite enemies, in both modes. Below it, one
 * asked for stands one strength lower, or as a normal enemy. */
export const STRENGTH_FROM_FLOOR = { strong: 11, elite: 41 };
/** The strength an enemy asked as `asked` stands at on floor `floor`
 * (0-based): an elite below `STRENGTH_FROM_FLOOR.elite` is strong, and a
 * strong (or demoted elite) one below `STRENGTH_FROM_FLOOR.strong` normal. */
export function strengthOnFloor(asked: EnemyStrength, floor: number): EnemyStrength {
  let strength = asked;
  if (strength === "elite" && floor + 1 < STRENGTH_FROM_FLOOR.elite) strength = "strong";
  if (strength === "strong" && floor + 1 < STRENGTH_FROM_FLOOR.strong) strength = "normal";
  return strength;
}

/** Weak, strong and elite enemies and bosses say so before their name. */
const RANK: Record<EnemyStrength, string> = { weak: "Weak ", normal: "", strong: "Strong ", elite: "Elite ", boss: "Boss ", greaterBoss: "Greater Boss " };
/** What the game calls an enemy: its name, after its strength unless it
 * is a normal one. */
export const enemyTitle = (e: { name: string; strength?: EnemyStrength }) => (e.strength ? RANK[e.strength] : "") + e.name;

/** The tier an enemy of each strength carries, in both modes. */
export const enemyTier = (strength: EnemyStrength) => STRENGTH_TIER[strength];

/** The Delve's enemy kinds, one per population an area can hold. Each has
 * its own procedural body (tile-painters.ts), since none has sprite art. */
export const DELVE_ENEMY_NAMES = ["Cinder slime", "Bone sentinel", "Dusk wing", "Ash warden"];

/** A Tower enemy of the given strength and profile for floor `room` of
 * tower `tower`, from that tower's enemy curve, before its stat factor
 * (`tierTile`). An elite is named from the zone it visits from. */
export function getTowerGateEnemy(room: number, strength: TowerEnemyStrength, profile: TowerEnemyProfile, tower = 1) {
  return {
    name: towerEnemyName(room + floorsAhead("tower", tower, strength), profile),
    ...enemyStats("tower", tower, room, strength, profile),
    tier: enemyTier(strength),
    strength,
  };
}
