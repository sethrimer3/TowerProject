import type { MaterialId } from "./materials.ts";

export type TowerEnemyProfile = "attackHeavy" | "balanced" | "defenseHeavy";

export type TowerEnemyDefinition = {
  name: string;
  profile: TowerEnemyProfile;
  hp: number;
  attack: number;
  defense: number;
  drop?: MaterialId;
};

/** Ten-room Tower zones. The roster repeats every 100 rooms. Base stats are
 * deliberately hand-tuned whole numbers, increasing by roughly 50% between
 * adjacent zones instead of looking like raw formula output. */
export const TOWER_ZONE_ENEMIES: readonly (readonly TowerEnemyDefinition[])[] = [
  [
    { name: "Goblin", profile: "attackHeavy", hp: 18, attack: 9, defense: 1 },
    { name: "Thief", profile: "balanced", hp: 20, attack: 6, defense: 2, drop: "thievesTools" },
    { name: "Armored Knight", profile: "defenseHeavy", hp: 26, attack: 5, defense: 4, drop: "knightsCrest" },
  ],
  [
    { name: "Bat", profile: "attackHeavy", hp: 27, attack: 14, defense: 2 },
    { name: "Slime", profile: "balanced", hp: 30, attack: 9, defense: 3, drop: "slimeGel" },
    { name: "Stone Warden", profile: "defenseHeavy", hp: 39, attack: 7, defense: 6, drop: "wardenHeartstone" },
  ],
  [
    { name: "Assassin", profile: "attackHeavy", hp: 40, attack: 21, defense: 3 },
    { name: "Skeleton", profile: "balanced", hp: 45, attack: 14, defense: 5, drop: "skeletonBone" },
    { name: "Golem", profile: "defenseHeavy", hp: 60, attack: 11, defense: 10, drop: "golemCore" },
  ],
  [
    { name: "Mage", profile: "attackHeavy", hp: 63, attack: 32, defense: 4 },
    { name: "Orc", profile: "balanced", hp: 70, attack: 21, defense: 8, drop: "orcTusk" },
    { name: "Gargoyle", profile: "defenseHeavy", hp: 90, attack: 17, defense: 16, drop: "frozenGargoyleShard" },
  ],
  [
    { name: "Berserker", profile: "attackHeavy", hp: 95, attack: 48, defense: 6 },
    { name: "Ogre", profile: "balanced", hp: 105, attack: 32, defense: 12, drop: "ogreHide" },
    { name: "Demon", profile: "defenseHeavy", hp: 140, attack: 25, defense: 24, drop: "demonEmberheart" },
  ],
  [
    { name: "Cultist", profile: "attackHeavy", hp: 145, attack: 72, defense: 9 },
    { name: "Crystal Savant", profile: "balanced", hp: 160, attack: 48, defense: 18, drop: "crystalDust" },
    { name: "Amethyst Golem", profile: "defenseHeavy", hp: 210, attack: 38, defense: 36, drop: "amethystCore" },
  ],
  [
    { name: "Drowned Marauder", profile: "attackHeavy", hp: 215, attack: 110, defense: 14 },
    { name: "Temple Wraith", profile: "balanced", hp: 240, attack: 72, defense: 27, drop: "wraithEctoplasm" },
    { name: "Coral Knight", profile: "defenseHeavy", hp: 310, attack: 58, defense: 54, drop: "coralCrest" },
  ],
  [
    { name: "Sporeling", profile: "attackHeavy", hp: 325, attack: 165, defense: 20 },
    { name: "Troll", profile: "balanced", hp: 360, attack: 110, defense: 40, drop: "trollWart" },
    { name: "Spore Colossus", profile: "defenseHeavy", hp: 470, attack: 88, defense: 80, drop: "sporeheart" },
  ],
  [
    { name: "Shadow Stalker", profile: "attackHeavy", hp: 485, attack: 250, defense: 30 },
    { name: "Obsidian Revenant", profile: "balanced", hp: 540, attack: 165, defense: 60, drop: "revenantShard" },
    { name: "Blackstone Colossus", profile: "defenseHeavy", hp: 700, attack: 130, defense: 120, drop: "blackstoneHeart" },
  ],
  [
    { name: "Starfire Adept", profile: "attackHeavy", hp: 730, attack: 375, defense: 45 },
    { name: "Dragon Whelp", profile: "balanced", hp: 810, attack: 250, defense: 90, drop: "whelpScale" },
    { name: "Celestial Guardian", profile: "defenseHeavy", hp: 1050, attack: 200, defense: 180, drop: "celestialAegis" },
  ],
] as const;

/** One rotation is approximately ten 50% increases. A clean 60x multiplier
 * keeps room 101 about 50% stronger than room 100. */
export const TOWER_CYCLE_MULTIPLIER = 60;

export function towerZoneIndex(room: number) {
  return Math.floor(Math.max(0, room) / 10) % TOWER_ZONE_ENEMIES.length;
}

export function towerCycle(room: number) {
  return Math.floor(Math.max(0, room) / 100);
}

export function towerEnemyDrop(name: string): MaterialId | null {
  return TOWER_ZONE_ENEMIES.flat().find((enemy) => enemy.name === name)?.drop ?? null;
}

export function getTowerEnemy(room: number, rng: () => number, forceProfile?: TowerEnemyProfile) {
  const roster = TOWER_ZONE_ENEMIES[towerZoneIndex(room)];
  const definition = forceProfile
    ? roster.find((enemy) => enemy.profile === forceProfile)!
    : roster[Math.floor(rng() * roster.length)];
  const multiplier = TOWER_CYCLE_MULTIPLIER ** towerCycle(room);
  return {
    name: definition.name,
    hp: definition.hp * multiplier,
    attack: definition.attack * multiplier,
    defense: definition.defense * multiplier,
    tier: 1,
  };
}
