import type { EnemyStrength } from "./entities.ts";
import { intPow } from "./exact.ts";

export type TowerEnemyProfile = "attackHeavy" | "balanced" | "defenseHeavy";

export type TowerEnemyDefinition = {
  name: string;
  profile: TowerEnemyProfile;
  hp: number;
  attack: number;
  defense: number;
};

/** How hard every enemy in both modes is, on top of its own stats: HP and
 * ATK are doubled so that careless play can die even on the first ten
 * floors. Tune overall difficulty here; each mode's own numbers set how its
 * enemies compare with one another and rise with depth. */
export const ENEMY_STAT_SCALE = { hp: 2, attack: 2, defense: 1 };

/** How many floors each Tower zone (one roster) spans. */
export const TOWER_ZONE_FLOORS = 10;

/** Ten-room Tower zones, before `ENEMY_STAT_SCALE`. The roster repeats every
 * `TOWER_CYCLE_FLOORS` rooms. Stats are deliberately hand-tuned whole
 * numbers, increasing by roughly 50% between adjacent zones instead of
 * looking like raw formula output. */
export const TOWER_ZONE_ENEMIES: readonly (readonly TowerEnemyDefinition[])[] = [
  [
    { name: "Goblin", profile: "attackHeavy", hp: 15, attack: 8, defense: 1 },
    { name: "Thief", profile: "balanced", hp: 16, attack: 6, defense: 2 },
    { name: "Armored Knight", profile: "defenseHeavy", hp: 18, attack: 5, defense: 3 },
  ],
  [
    { name: "Bat", profile: "attackHeavy", hp: 23, attack: 12, defense: 2 },
    { name: "Slime", profile: "balanced", hp: 24, attack: 9, defense: 3 },
    { name: "Stone Warden", profile: "defenseHeavy", hp: 27, attack: 7, defense: 5 },
  ],
  [
    { name: "Assassin", profile: "attackHeavy", hp: 33, attack: 19, defense: 3 },
    { name: "Skeleton", profile: "balanced", hp: 36, attack: 14, defense: 5 },
    { name: "Golem", profile: "defenseHeavy", hp: 42, attack: 11, defense: 8 },
  ],
  [
    { name: "Mage", profile: "attackHeavy", hp: 53, attack: 28, defense: 4 },
    { name: "Orc", profile: "balanced", hp: 56, attack: 21, defense: 8 },
    { name: "Gargoyle", profile: "defenseHeavy", hp: 62, attack: 17, defense: 12 },
  ],
  [
    { name: "Berserker", profile: "attackHeavy", hp: 79, attack: 43, defense: 6 },
    { name: "Ogre", profile: "balanced", hp: 84, attack: 32, defense: 12 },
    { name: "Demon", profile: "defenseHeavy", hp: 97, attack: 25, defense: 18 },
  ],
  [
    { name: "Cultist", profile: "attackHeavy", hp: 121, attack: 64, defense: 9 },
    { name: "Crystal Savant", profile: "balanced", hp: 128, attack: 48, defense: 18 },
    { name: "Amethyst Golem", profile: "defenseHeavy", hp: 145, attack: 38, defense: 27 },
  ],
  [
    { name: "Drowned Marauder", profile: "attackHeavy", hp: 179, attack: 98, defense: 14 },
    { name: "Temple Wraith", profile: "balanced", hp: 192, attack: 72, defense: 27 },
    { name: "Coral Knight", profile: "defenseHeavy", hp: 215, attack: 58, defense: 41 },
  ],
  [
    { name: "Sporeling", profile: "attackHeavy", hp: 271, attack: 147, defense: 20 },
    { name: "Troll", profile: "balanced", hp: 288, attack: 110, defense: 40 },
    { name: "Spore Colossus", profile: "defenseHeavy", hp: 325, attack: 88, defense: 60 },
  ],
  [
    { name: "Shadow Stalker", profile: "attackHeavy", hp: 404, attack: 222, defense: 30 },
    { name: "Obsidian Revenant", profile: "balanced", hp: 432, attack: 165, defense: 60 },
    { name: "Blackstone Colossus", profile: "defenseHeavy", hp: 485, attack: 130, defense: 90 },
  ],
  [
    { name: "Starfire Adept", profile: "attackHeavy", hp: 608, attack: 333, defense: 45 },
    { name: "Dragon Whelp", profile: "balanced", hp: 648, attack: 250, defense: 90 },
    { name: "Celestial Guardian", profile: "defenseHeavy", hp: 727, attack: 200, defense: 135 },
  ],
] as const;

/** One rotation is approximately ten 50% increases. A clean 60x multiplier
 * keeps room 101 about 50% stronger than room 100. */
export const TOWER_CYCLE_MULTIPLIER = 60;

/** How many floors pass before the roster repeats: one of every zone. */
export const TOWER_CYCLE_FLOORS = TOWER_ZONE_FLOORS * TOWER_ZONE_ENEMIES.length;

export function towerZoneIndex(room: number) {
  return Math.floor(Math.max(0, room) / TOWER_ZONE_FLOORS) % TOWER_ZONE_ENEMIES.length;
}

function towerCycle(room: number) {
  return Math.floor(Math.max(0, room) / TOWER_CYCLE_FLOORS);
}

export function getTowerEnemy(room: number, rng: () => number, forceProfile?: TowerEnemyProfile) {
  const roster = TOWER_ZONE_ENEMIES[towerZoneIndex(room)];
  const definition = forceProfile
    ? roster.find((enemy) => enemy.profile === forceProfile)!
    : roster[Math.floor(rng() * roster.length)];
  const multiplier = intPow(TOWER_CYCLE_MULTIPLIER, towerCycle(room));
  return {
    name: definition.name,
    hp: definition.hp * ENEMY_STAT_SCALE.hp * multiplier,
    attack: definition.attack * ENEMY_STAT_SCALE.attack * multiplier,
    defense: definition.defense * ENEMY_STAT_SCALE.defense * multiplier,
    tier: 1,
  };
}

/** How hard a Tower floor's generator asks an enemy to be. */
export type TowerEnemyStrength = EnemyStrength;

/** How far each strength exceeds the floor's own zone: the roster it comes
 * from (zones ahead), multipliers on HP and ATK (`stats`) and on DEF, and
 * its tier (which picks its art). A weak enemy is a balanced one
 * with less HP and ATK, as in the Delve; strong is a hardened local, elite a
 * visitor from the next zone up, and a boss a strong enemy with more HP and
 * ATK (see `bossFactor`). */
export const TOWER_ENEMY_STRENGTH: Record<TowerEnemyStrength, { zonesAhead: number; stats: number; defense: number; tier: number }> = {
  weak: { zonesAhead: 0, stats: 0.75, defense: 1, tier: 1 },
  normal: { zonesAhead: 0, stats: 1, defense: 1, tier: 1 },
  strong: { zonesAhead: 0, stats: 1.25, defense: 1.25, tier: 2 },
  elite: { zonesAhead: 1, stats: 1, defense: 1, tier: 3 },
  boss: { zonesAhead: 0, stats: 1.25, defense: 1.25, tier: 4 },
  greaterBoss: { zonesAhead: 0, stats: 1.25, defense: 1.25, tier: 4 },
};

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

/** Enemy DEF compounds on top of everything else: `rate` for every
 * `towerFloors` Tower floors climbed and every `delveDepth` Delve depth. */
export const ENEMY_DEFENSE_GROWTH = { rate: 1.01, towerFloors: 5, delveDepth: 20 };
/** What every enemy's DEF is multiplied by on Tower floor `room` (0-based). */
export const towerDefenseGrowth = (room: number) =>
  intPow(ENEMY_DEFENSE_GROWTH.rate, Math.floor(Math.max(0, room) / ENEMY_DEFENSE_GROWTH.towerFloors));
/** What every enemy's DEF is multiplied by at Delve depth `depth`. */
export const delveDefenseGrowth = (depth: number) =>
  intPow(ENEMY_DEFENSE_GROWTH.rate, Math.floor(Math.max(0, depth) / ENEMY_DEFENSE_GROWTH.delveDepth));

/** How many times a strong enemy's HP and ATK a boss has, in both modes. */
export const BOSS_OVER_STRONG = 2;
/** How many times a boss's HP, ATK and DEF a Greater Boss has. */
export const GREATER_BOSS_OVER_BOSS = 2;
/** What an enemy of `strength` multiplies a strong enemy's rounded HP and
 * ATK by: BOSS_OVER_STRONG for a boss, GREATER_BOSS_OVER_BOSS times that
 * for a Greater Boss, 1 for every other. */
export const bossFactor = (strength: EnemyStrength) =>
  strength === "boss" ? BOSS_OVER_STRONG : strength === "greaterBoss" ? BOSS_OVER_STRONG * GREATER_BOSS_OVER_BOSS : 1;

/** Weak, strong and elite enemies and bosses say so before their name. */
const RANK: Record<EnemyStrength, string> = { weak: "Weak ", normal: "", strong: "Strong ", elite: "Elite ", boss: "Boss ", greaterBoss: "Greater Boss " };
/** What the game calls an enemy: its name, after its strength unless it
 * is a normal one. */
export const enemyTitle = (e: { name: string; strength?: EnemyStrength }) => (e.strength ? RANK[e.strength] : "") + e.name;

/** The tier an enemy of each strength carries, in both modes. */
export const enemyTier = (strength: EnemyStrength) => TOWER_ENEMY_STRENGTH[strength].tier;

/** The Delve's enemy kinds, one per population an area can hold. Each has
 * its own procedural body (tile-painters.ts), since none has sprite art. */
export const DELVE_ENEMY_NAMES = ["Cinder slime", "Bone sentinel", "Dusk wing", "Ash warden"];

/** A Tower enemy of the given strength and profile for floor `room`. Its
 * DEF grows with the floor it stands on, even for an elite from the next
 * zone's roster. */
export function getTowerGateEnemy(room: number, strength: TowerEnemyStrength, profile: TowerEnemyProfile) {
  const { zonesAhead, stats, defense, tier } = TOWER_ENEMY_STRENGTH[strength];
  const base = getTowerEnemy(room + zonesAhead * TOWER_ZONE_FLOORS, () => 0, profile);
  const boss = bossFactor(strength);
  return {
    name: base.name,
    hp: Math.round(base.hp * stats) * boss,
    attack: Math.round(base.attack * stats) * boss,
    defense: Math.round(base.defense * defense * towerDefenseGrowth(room)) * (strength === "greaterBoss" ? GREATER_BOSS_OVER_BOSS : 1),
    tier,
    strength,
  };
}
