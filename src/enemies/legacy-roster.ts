import type { EnemyProfile as TowerEnemyProfile } from "../entities.ts";

// Retained identities for old saves and the Legacy Enemies presentation.
export type TowerEnemyDefinition = {
  name: string;
  profile: TowerEnemyProfile;
};

/** How many floors each Tower zone (one roster) spans. */
export const TOWER_ZONE_FLOORS = 10;

/** Ten-room Tower zones: who stands on a floor, by profile. Their stats come
 * from the Tower's enemy curve (enemies/curves.ts); the roster repeats every
 * `TOWER_CYCLE_FLOORS` rooms, each tower starting one zone further along
 * (`towerZoneIndex`). */
export const TOWER_ZONE_ENEMIES: readonly (readonly TowerEnemyDefinition[])[] = [
  [
    { name: "Goblin", profile: "attackHeavy" },
    { name: "Thief", profile: "balanced" },
    { name: "Iron Knight", profile: "defenseHeavy" },
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


export const DELVE_ENEMY_NAMES = ["Cinder slime", "Bone sentinel", "Dusk wing", "Ash warden"];
export const LEGACY_ENEMY_NAMES: ReadonlySet<string> = new Set([...TOWER_ZONE_ENEMIES.flatMap(zone => zone.map(e => e.name)), ...DELVE_ENEMY_NAMES]);
