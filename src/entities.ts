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
/** Which of an enemy's stats lead (enemies/curves.ts scales each). */
export type EnemyProfile = "attackHeavy" | "balanced" | "defenseHeavy";
export type Enemy = {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  tier: number;
  strength: EnemyStrength;
  /** Which of its stats lead (`enemies/curves.ts`), as generation made it;
   * absent on enemies made outside generation. */
  profile?: EnemyProfile;
  /** A Fast enemy (enemies/fast.ts) strikes first in every fight. */
  fast?: true;
  /** A Ranged enemy (enemies/ranged.ts) shoots the hero from a distance. */
  ranged?: true;
  /** An Armored enemy (enemies/armored.ts): its `defense` is already multiplied. */
  armored?: true;
  /** A Flying enemy (enemies/flying.ts) hovers over a floor tile (`Tile.flyer`):
   * it shoots the hero as a Ranged one does, and the hero can only shoot
   * it, walking under it as over open floor. */
  flying?: true;
  /** An Aggroed enemy (enemies/flying.ts) closes on the hero, a step each time its
   * `stride` charge (whole charge units, as a Ranged enemy's cooldown) is
   * full; a Flying enemy becomes one once an arrow wounds it. */
  aggro?: true;
  stride?: number;
  /** Where an enemy that has moved (an Aggroed one) stood as the board made
   * it, by `point`: its loot is keyed there (`RunPurse.killKey`), wherever
   * it falls. */
  home?: string;
  /** A Shielded enemy (enemies/shielded.ts) casts a bubble that cuts the hero's
   * damage to every enemy within it. */
  shielded?: true;
  /** The percent a Shielded enemy's bubble cuts the hero's damage to this
   * one by, after DEF; set by the board as it reads the tile, never saved. */
  guard?: number;
  /** The HP an enemy the hero's arrows have wounded had before them (its
   * HP plus the tile's wound), which its thorns are a share of; set by the
   * board as it reads the tile (`wounded` in enemies/ranged.ts), never saved. */
  fullHp?: number;
  /** The percent of its DEF the hero's arrows have taken off it (Armor Break,
   * the tile's `broken`), over 100 when that takes it below 0; set by the board
   * as it reads the tile (`wounded` in enemies/ranged.ts), never saved. */
  broken?: number;
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
/** A run's chances, in percent, of DOOR's and GOLD DOOR's trees remaking
 * the doors of its floors as they are generated: each colour door a Wooden
 * Door instead (`skeleton`, Skeleton Key), each door of two or three
 * colours without its rarest lock (`lockPick`, Lock Pick), and each Wooden
 * or Steel Door a Gold Door (`transmute`, Gold Door Transmute), each Heart
 * Door taking no keys a Wooden Door (`wood`, Wooden Door Transmute), and
 * each door taking keys and draining HP without its drain (`heartPick`,
 * Heart Lock Pick); each of the last three none when absent. */
export type DoorOdds = { skeleton: number; lockPick: number; transmute?: number; wood?: number; heartPick?: number };
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
 * here (enemies/ranged.ts); the board reads its HP that much lower. `broken`:
 * the percent of that enemy's DEF they have taken off it (Armor Break). `flyer`: the
 * Flying enemy hovering over this open floor tile (enemies/flying.ts), which the
 * hero walks under; its wound is the tile's `wound`. */
/** The colour a potion is drawn in: a regular potion red, like the HP bar
 * it fills, and a percent potion (whose tile is marked `color: "red"`, the
 * mark generation and saves keep) blue, like the Overheal bar. */
export const potionShade = (t: Pick<Tile, "color">): "red" | "blue" => (t.color === "red" ? "blue" : "red");
export type Tile = { kind: Kind; amount?: number; color?: KeyColor; door?: DoorRule; enemy?: Enemy; flyer?: Enemy; tier?: ChestTier; wound?: number; broken?: number; chest?: Exclude<ChestKind, "plain"> };
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
/** A percent the hero carries against some enemies, by the card (or card
 * tree) covering them (cards/foe-cards.ts's `FoeKey`). */
export type ByFoe = Partial<Record<"weakEnemy" | "baseEnemy" | "strongEnemy" | "eliteEnemy" | "bossEnemy" | "nonBossEnemy" | "fastEnemy" | "flyingEnemy" | "monster" | "torch" | "archer", number>>;
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
  /** The percent of an enemy's original DEF each of the hero's hits takes off
   * it before its damage (Armor Break); none when absent. */
  armorBreak?: number;
  /** The percent of every enemy strike HEAL's card tree parries, added to
   * Parry %; absent without it. */
  cardParry?: number;
  /** The percent more ATK the hero strikes bosses with (equipment; none
   * when absent). */
  bossAttack?: number;
  /** ATK UP's Power Strike, charged by an ATK shard: the hero's next fight
   * strikes with twice its ATK; absent while not charged. */
  powerStrike?: true;
  /** The percent more ATK a Dash Combo gives the fight being taken. Only the
   * copy of the hero a fight is taken with carries it (`Game.fighter`), so
   * previews and planners never count it. */
  comboAttack?: number;
  /** The percent of a boss's or a Greater Boss's max HP (`takedown`: ATK
   * UP's Takedown, TORCH's Greater Takedown) and ATK (`tangle`: DEF UP's
   * Tangle, TORCH's Greater Tangle) taken off as a fight with it begins, by
   * strength; absent without them. */
  takedown?: Partial<Record<"boss" | "greaterBoss", number>>;
  tangle?: Partial<Record<"boss" | "greaterBoss", number>>;
  /** The percent more ATK the hero strikes the enemies each enemy card of
   * the run's hand covers with (cards/foe-cards.ts), by card, its tree's and
   * ENEMY's and TORCH's from their card trees; absent without one. */
  foeAttack?: ByFoe;
  /** The percent more DEF and shroud the hero holds against the enemies a
   * card tree covers (an enemy card's its own, ENEMY's every enemy, TORCH's
   * the Greater Boss), by card; absent without one. HEAL's tree's shroud,
   * against every enemy, goes under ENEMY's key. */
  foeDefense?: ByFoe;
  foeShroud?: ByFoe;
  /** The percent more Crit % chance and Crit x factor the hero strikes the
   * enemies an enemy card's tree covers with, and the percent of max HP
   * Lifesteal may heal it above it in fights with them, by card; absent
   * without one. */
  foeCritChance?: ByFoe;
  foeCritFactor?: ByFoe;
  foeStealOverheal?: ByFoe;
  /** The percent of an enemy's DEF the hero's strikes ignore (equipment's
   * Piercing; none when absent). */
  pierce?: number;
  /** The percent of max HP Lifesteal may heal the hero above it (ENEMY's
   * Lifesteal Overheal; none when absent). */
  stealOverheal?: number;
  /** The percent more shroud the hero holds against every enemy for the
   * rest of the run, grown by each Heart Door's drain paid (HEART DOOR's
   * Shroud Growth); absent without it. */
  doorShroud?: number;
  keys: Record<KeyColor, number>;
  /** Optional secret inventory counters stay absent from legacy saves until
   * the corresponding item has actually been found. */
  skeletonKeys?: number;
};
export type Mode = "tower" | "delve";
export const point = (x: number, y: number) => `${x},${y}`;
