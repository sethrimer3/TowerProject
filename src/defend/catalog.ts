/** Data tables for DEFEND: what the player can place, what it costs in
 * main-game currency, the universal upgrades, and the enemy roster. */

export type StructureKind = "keep" | "barracks" | "archerTower" | "watchTower";
/** Everything that appears in the build palette (the keep is placed from the
 * start and can only be moved, so it is not a palette item). */
export type PaletteItem = "cityTile" | Exclude<StructureKind, "keep">;
export const PALETTE_ITEMS: PaletteItem[] = ["cityTile", "barracks", "archerTower", "watchTower"];

export type StructureDef = {
  kind: StructureKind;
  name: string;
  /** Footprint in cells (before rotation). */
  w: number;
  h: number;
  maxHp: number;
  /** Can be placed on ground outside the city limits. */
  outsideOk: boolean;
  description: string;
};

export const STRUCTURES: Record<StructureKind, StructureDef> = {
  keep: {
    kind: "keep",
    name: "Keep",
    w: 3,
    h: 3,
    maxHp: 400,
    outsideOk: false,
    description: "The heart of the city. Enemies march on it; if it falls, the defense is over.",
  },
  barracks: {
    kind: "barracks",
    name: "Barracks",
    w: 3,
    h: 4,
    maxHp: 160,
    outsideOk: false,
    description: "Trains swordsmen who sally out against anything that breaches the walls.",
  },
  archerTower: {
    kind: "archerTower",
    name: "Archer tower",
    w: 2,
    h: 2,
    maxHp: 120,
    outsideOk: true,
    description: "Looses arrows at the nearest enemy in range. Can stand inside or outside the walls.",
  },
  watchTower: {
    kind: "watchTower",
    name: "Watch tower",
    w: 2,
    h: 2,
    maxHp: 100,
    outsideOk: true,
    description: "Marks every enemy in its radius with a golden outline — marked enemies take double damage.",
  },
};

/** Palette items the player owns at the very start. */
export const STARTING_OWNED: Record<PaletteItem, number> = {
  cityTile: 8,
  barracks: 1,
  archerTower: 1,
  watchTower: 0,
};

/** A price in main-game currency. */
export type Price = { gold: number; ironBar?: number; steelBar?: number };

/** Price of buying one more of a palette item, given how many are owned. */
export function purchasePrice(item: PaletteItem, owned: number): Price {
  const extra = Math.max(0, owned - STARTING_OWNED[item]);
  const base: Record<PaletteItem, Price> = {
    cityTile: { gold: 120, ironBar: 1 },
    barracks: { gold: 300, ironBar: 3 },
    archerTower: { gold: 220, ironBar: 2 },
    watchTower: { gold: 180, ironBar: 2 },
  };
  const growth = item === "cityTile" ? 1.3 : 1.5;
  const m = Math.pow(growth, extra);
  const b = base[item];
  return { gold: Math.round(b.gold * m), ironBar: Math.ceil((b.ironBar ?? 0) * Math.pow(1.25, extra)) };
}

export type UpgradeId =
  | "barracksCapacity"
  | "barracksTraining"
  | "soldierArms"
  | "archerDamage"
  | "archerRange"
  | "archerRate"
  | "watchRadius"
  | "wallStrength"
  | "keepStrength"
  | "civilianCount"
  | "civilianHealth"
  | "rebuildSpeed";

export type UpgradeDef = {
  id: UpgradeId;
  group: string;
  name: string;
  maxLevel: number;
  describe: (level: number) => string;
};

export const UPGRADES: UpgradeDef[] = [
  { id: "barracksCapacity", group: "Barracks", name: "Garrison", maxLevel: 4, describe: (l) => `${2 + l} swordsmen per barracks` },
  { id: "barracksTraining", group: "Barracks", name: "Drill yard", maxLevel: 5, describe: (l) => `Train one every ${trainSeconds(l).toFixed(1)}s` },
  { id: "soldierArms", group: "Barracks", name: "Arms & armour", maxLevel: 6, describe: (l) => `+${l * 25}% soldier HP and damage` },
  { id: "archerDamage", group: "Archer tower", name: "Bodkin points", maxLevel: 6, describe: (l) => `${archerDamage(l)} damage per arrow` },
  { id: "archerRange", group: "Archer tower", name: "Longbows", maxLevel: 4, describe: (l) => `${archerRange(l)} cell range` },
  { id: "archerRate", group: "Archer tower", name: "Quick nock", maxLevel: 5, describe: (l) => `An arrow every ${archerCooldown(l).toFixed(2)}s` },
  { id: "watchRadius", group: "Watch tower", name: "Lookouts", maxLevel: 4, describe: (l) => `${watchRadius(l)} cell marking radius` },
  { id: "wallStrength", group: "City", name: "Masonry", maxLevel: 6, describe: (l) => `${wallHp(l)} HP per wall stone` },
  { id: "keepStrength", group: "City", name: "Keep bastions", maxLevel: 6, describe: (l) => `${keepHp(l)} keep HP` },
  { id: "civilianCount", group: "Civilians", name: "Guild of builders", maxLevel: 5, describe: (l) => `${civilianCount(l)} civilians repair the city` },
  { id: "civilianHealth", group: "Civilians", name: "Hardy folk", maxLevel: 5, describe: (l) => `${civilianHp(l)} civilian HP` },
  { id: "rebuildSpeed", group: "Civilians", name: "Master masons", maxLevel: 5, describe: (l) => `${rebuildSeconds(l).toFixed(1)}s to rebuild each section` },
];

export function upgradePrice(level: number): Price {
  return {
    gold: Math.round(200 * Math.pow(1.6, level)),
    ironBar: 2 + level * 2,
    steelBar: level >= 3 ? level - 2 : 0,
  };
}

export const BOMB_PRICE: Price = { gold: 60 };
export const BOMB_RADIUS = 3.2;
export const BOMB_DAMAGE = 45;

// Stat curves, keyed by upgrade level.
export const soldierCap = (l: number) => 2 + l;
export const trainSeconds = (l: number) => 5 * Math.pow(0.85, l);
export const soldierScale = (l: number) => 1 + l * 0.25;
export const archerDamage = (l: number) => 6 + l * 3;
export const archerRange = (l: number) => 10 + l * 2;
export const archerCooldown = (l: number) => 1.1 * Math.pow(0.85, l);
export const watchRadius = (l: number) => 8 + l * 2;
export const wallHp = (l: number) => Math.round(70 * (1 + l * 0.35));
export const keepHp = (l: number) => Math.round(STRUCTURES.keep.maxHp * (1 + l * 0.3));
export const civilianCount = (l: number) => 2 + l;
export const civilianHp = (l: number) => 8 + l * 5;
export const rebuildSeconds = (l: number) => 3 * Math.pow(0.82, l);
export const HOUSE_HP_PER_CELL = 22;

export type EnemyKind = "roach" | "orc" | "ogre" | "bat";
export type EnemyDef = {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  cooldown: number;
  /** Rendered edge length, in cells. */
  size: number;
  color: string;
  /** 0–1: how easily nearby houses lure it off the road to smash them. */
  distraction: number;
  flying: boolean;
  firstWave: number;
  weight: number;
  /** How much of the wave budget one of these costs. */
  cost: number;
};

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  roach: { kind: "roach", name: "Roach", hp: 10, speed: 2.6, damage: 2, cooldown: 0.6, size: 0.34, color: "#b0643a", distraction: 0.15, flying: false, firstWave: 1, weight: 5, cost: 1 },
  orc: { kind: "orc", name: "Orc", hp: 34, speed: 1.6, damage: 6, cooldown: 0.9, size: 0.46, color: "#6fa04a", distraction: 0.6, flying: false, firstWave: 2, weight: 3, cost: 3 },
  ogre: { kind: "ogre", name: "Ogre", hp: 120, speed: 1.0, damage: 18, cooldown: 1.4, size: 0.62, color: "#a08a6a", distraction: 0.35, flying: false, firstWave: 5, weight: 1, cost: 8 },
  bat: { kind: "bat", name: "Bat", hp: 14, speed: 3.2, damage: 3, cooldown: 0.7, size: 0.3, color: "#8a5bb8", distraction: 0, flying: true, firstWave: 7, weight: 2, cost: 2 },
};

/** Enemies get tougher every wave. */
export const waveHpScale = (wave: number) => Math.pow(1.11, wave - 1);
export const waveBudget = (wave: number) => Math.round(6 + wave * 3.2 + Math.pow(wave, 1.4));

export const SOLDIER = { hp: 30, damage: 5, cooldown: 0.8, speed: 2.4, reach: 0.75, leash: 16, size: 0.4, color: "#5b8fd9" };
export const CIVILIAN = { speed: 1.9, size: 0.3, color: "#e6d7b4", respawnSeconds: 10 };
