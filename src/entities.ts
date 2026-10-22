/** The board's pieces: its tiles, the enemies, torches and hero on them, and where they stand. This module imports nothing, so anything can use it. */
export type KeyColor = "yellow" | "blue" | "red";
export type Kind =
  | "wall"
  | "floor"
  | "enemy"
  | "key"
  | "door"
  | "potion"
  | "attack"
  | "defense"
  | "reward"
  | "treasure"
  | "openedChest"
  | "stairs"
  | "oneway";
/** How hard a generator asked an enemy to be. Strong and elite enemies wear
 * a brighter glow and rank chevrons, and weak ones a chevron pointing down,
 * so the player can tell them apart. A
 * boss guards the way up at the end of every ten floors, and a Greater
 * Boss appears on a Tower floor whose every torch is put out. */
export type EnemyStrength = "weak" | "normal" | "strong" | "elite" | "boss" | "greaterBoss";
/** Which of an enemy's stats lead (enemy-curves.ts scales each). */
export type EnemyProfile = "attackHeavy" | "balanced" | "defenseHeavy";
export type Enemy = {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  tier: number;
  strength: EnemyStrength;
  /** Which of its stats lead (`enemy-curves.ts`), as generation made it;
   * absent on enemies made outside generation. */
  profile?: EnemyProfile;
  /** A Fast enemy (fast-enemies.ts) strikes first in every fight. */
  fast?: true;
  /** A Ranged enemy (ranged.ts) shoots the hero from a distance. */
  ranged?: true;
  /** A Flying enemy (flying.ts) hovers over a floor tile (`Tile.flyer`):
   * it shoots the hero as a Ranged one does, and the hero can only shoot
   * it, walking under it as over open floor. */
  flying?: true;
  /** An Aggroed enemy (flying.ts) closes on the hero, a step each time its
   * `stride` charge (whole charge units, as a Ranged enemy's cooldown) is
   * full; a Flying enemy becomes one once an arrow wounds it. */
  aggro?: true;
  stride?: number;
  /** Where an enemy that has moved (an Aggroed one) stood as the board made
   * it, by `point`: its loot is keyed there (`RunPurse.killKey`), wherever
   * it falls. */
  home?: string;
  /** A Shielded enemy (shielded.ts) casts a bubble that cuts the hero's
   * damage to every enemy within it. */
  shielded?: true;
  /** The percent a Shielded enemy's bubble cuts the hero's damage to this
   * one by, after DEF; set by the board as it reads the tile, never saved. */
  guard?: number;
  /** The HP an enemy the hero's arrows have wounded had before them (its
   * HP plus the tile's wound), which its thorns are a share of; set by the
   * board as it reads the tile (`wounded` in ranged.ts), never saved. */
  fullHp?: number;
  /** An enemy spawned onto the floor during the run (`Game.spawnEnemy`):
   * its number among the run's spawns, which keys its loot apart from the
   * tile's (`RunPurse.killKey`); absent on enemies the floor was made with. */
  spawn?: number;
};
/** An area reward chest's metal: gold for an area mastered, silver for one
 * cleared (tower/area-ledger.ts). */
export type ChestTier = "silver" | "gold";
/** A treasure chest's kind: a plain one pays only Gold; a Supply Chest adds
 * upgrade materials and an Equipment Chest a Standard piece, both only ever
 * from the CHEST card held. Fixed as the floor is generated (board.ts
 * `withChest`). */
export type ChestKind = "plain" | "supply" | "equipment";
/** A run's chances, in percent, of each treasure chest being a Supply or
 * an Equipment Chest, fixed as it goes inside. */
export type ChestOdds = { supply: number; equipment: number };
/** A run's chances, in percent, of DOOR's tree remaking the doors of its
 * floors as they are generated: each colour door a Wooden Door instead
 * (`skeleton`, Skeleton Key), and each door of two or three colours
 * without its rarest lock (`locksmith`, Locksmith). */
export type DoorOdds = { skeleton: number; locksmith: number };
/** Declarative lock rules. `color` remains on Tile for legacy single-key
 * doors and keys; new doors use this rule so every gameplay system shares
 * the same requirements and consumption behavior. */
export type DoorRule =
  /** `heart`: it also drains the hero's HP to 1, as a Heart Door does. */
  | { type: "keys"; keys: KeyColor[]; mode: "all" | "any"; heart?: true }
  | { type: "fullHp" }
  /** A Wooden Door: any one key opens it; a hero with none breaks it down
   * for `durability` HP, which DEF doesn't reduce (doors.ts). */
  | { type: "wood"; durability: number };
/** `wound`: the HP the hero's arrows have taken off the enemy standing
 * here (ranged.ts); the board reads its HP that much lower. `flyer`: the
 * Flying enemy hovering over this open floor tile (flying.ts), which the
 * hero walks under; its wound is the tile's `wound`. */
/** The colour a potion is drawn in: a regular potion red, like the HP bar
 * it fills, and a percent potion (whose tile is marked `color: "red"`, the
 * mark generation and saves keep) blue, like the Overheal bar. */
export const potionShade = (t: Pick<Tile, "color">): "red" | "blue" => (t.color === "red" ? "blue" : "red");
export type Tile = { kind: Kind; amount?: number; color?: KeyColor; door?: DoorRule; enemy?: Enemy; flyer?: Enemy; tier?: ChestTier; wound?: number; chest?: Exclude<ChestKind, "plain"> };
export type Point = { x: number; y: number };
/** A stationary wall-mounted light source, anchored to a walkable floor
 * tile adjacent to a wall. Its visibility polygon is computed once (on
 * creation) and cached; rendering only clips a radial gradient to it. */
export type Torch = {
  x: number;
  y: number;
  lightRadius: number;
  baseIntensity: number;
  active: boolean;
  visibilityPolygon?: Point[];
};
export type Player = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  /** The damage the shroud blocks at the start of every fight (none when
   * absent). */
  shroud?: number;
  /** The HP regained with every step in a run (Regen; none when absent). */
  regen?: number;
  /** The percent of the damage each of the hero's strikes deals that is
   * restored to it as HP (Lifesteal; none when absent). */
  lifesteal?: number;
  /** The percent of an enemy's max HP each of its strikes costs it (Thorn
   * Damage; none when absent), half against a boss or Greater Boss. */
  thorns?: number;
  /** The percent every enemy strike's damage is cut by, parried (Parry %);
   * none when absent. */
  parry?: number;
  /** The percent of every enemy strike HEAL's card tree parries, added to
   * Parry %; absent without it. */
  cardParry?: number;
  /** The percent more ATK the hero strikes bosses with (equipment; none
   * when absent). */
  bossAttack?: number;
  /** The percent more ATK the hero strikes the enemies each enemy card of
   * the run's hand covers with (foe-cards.ts), by card, ENEMY's and TORCH's
   * from their card trees; absent without one. */
  foeAttack?: Partial<Record<"weakEnemy" | "baseEnemy" | "strongEnemy" | "eliteEnemy" | "bossEnemy" | "nonBossEnemy" | "fastEnemy" | "flyingEnemy" | "monster" | "torch", number>>;
  /** The percent more DEF and shroud the hero holds against the enemies a
   * card tree covers (ENEMY's every enemy, TORCH's the Greater Boss), by
   * card; absent without one. HEAL's tree's shroud, against every enemy,
   * goes under ENEMY's key. */
  foeDefense?: Partial<Record<"monster" | "torch", number>>;
  foeShroud?: Partial<Record<"monster" | "torch", number>>;
  /** The percent of an enemy's DEF the hero's strikes ignore (equipment's
   * Piercing; none when absent). */
  pierce?: number;
  keys: Record<KeyColor, number>;
  /** Optional secret inventory counters stay absent from legacy saves until
   * the corresponding item has actually been found. */
  skeletonKeys?: number;
};
export type Mode = "tower" | "delve";
export const point = (x: number, y: number) => `${x},${y}`;
