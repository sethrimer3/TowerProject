import type { QuotaDoor } from "../key-schedule.ts";
import type { KeyColor } from "../config.ts";
import type { TowerEnemyProfile, TowerEnemyStrength } from "../scaling.ts";

/** Shared vocabulary for strategic Tower generation.
 *
 * A floor is conceived in two layers:
 *   A. a StrategicGraph — regions (nodes) with a purpose, the gate that must
 *      be paid to enter each one from its parent, and the resources visible
 *      inside it;
 *   B. a spatial embedding of that graph onto the 17x17 tile grid.
 * Nothing in layer A knows about coordinates. */

/** Enemy difficulty bands (stats in scaling.ts). Enemies are gates that
 * cost HP instead of keys. */
export type Strength = TowerEnemyStrength;

/** The cost of crossing from a parent region into a child region. It
 * occupies the single doorway tile between the two rooms, or one tile of a
 * fork's lane. An enemy may name its profile (attack-heavy enemies punish a
 * low-DEF build, defense-heavy ones a low-ATK build); otherwise the
 * furnisher picks one its strength allows. */
export type Gate =
  | { kind: "open" }
  | { kind: "enemy"; strength: Strength; profile?: TowerEnemyProfile }
  /** A door taking a key of `color`, and of each colour in `also` (a
   * combined door, which the door stage makes: `doorKeys`); with `heart`
   * it also drains HP to 1. */
  | { kind: "door"; color: KeyColor; also?: KeyColor[]; heart?: true; run?: DoorRun }
  /** Special locks from the door vocabulary: wood takes any one key
   * (cheapest first) or, with none, HP to break it; heart always opens but
   * drains HP to 1. */
  | { kind: "wood"; run?: DoorRun }
  | { kind: "heart"; run?: DoorRun }
  /** No cost at all: a potion lies in the doorway, in an enemy's place on
   * the way to the stairs of the first tower's first floors. */
  | { kind: "potion" };

/** A door run: a gate of two or three of the same door in a row, each paid
 * in turn (docs/DOOR_AND_KEY_SCHEDULE.md section 7). Absent, one door. */
export type DoorRun = 2 | 3;

export type Reward =
  | { kind: "key"; color: KeyColor }
  | { kind: "potion" }
  | { kind: "attack" }
  | { kind: "defense" }
  | { kind: "treasure" };

/** One tile of a fork's lane: a gate to pay or an item to pick up. */
export type LaneStep = Gate | { kind: "reward"; reward: Reward };
/** A lane's tiles in the order the player walks them, parent side first. */
export type Lane = LaneStep[];
/** Two or three parallel lanes from a parent region into the same child
 * region, each costing a different resource (HP to one build, HP to
 * another, keys of a colour, full HP), so entering is a choice of what to
 * spend rather than whether to pay. */
export type Fork = { patternId: string; lanes: Lane[] };

/** An item that sits in a one-tile niche with an enemy standing in front of
 * it, so the item can only be taken by fighting that enemy. */
export type GuardedReward = { reward: Reward; guard: Strength };

/** How a region's open rewards are arranged. `row` lines them up along the
 * wall opposite the entrance (K K K), `cluster` groups them around the room
 * centre, `ring` surrounds one centrepiece with enemies. */
export type Formation = "row" | "cluster" | "ring";

export type RegionPurpose =
  | "start"
  | "hub"
  | "transition"
  | "stairs"
  | "keyRoom"
  | "potionRoom"
  | "statRoom"
  | "exchange"
  | "cache"
  | "treasure"
  | "choice"
  | "temptation"
  | "detour"
  | "majorReward";

export type StrategicTag =
  | "combatGate"
  | "keyReward"
  | "doorGate"
  | "statReward"
  | "resourceExchange"
  | "treasureRoom"
  | "shortcut"
  | "branch"
  | "progressionRoute"
  | "optionalRoute";

/** Rough room size a region wants. The embedder matches it to partition
 * leaves: pockets are small vaults, halls are the big hub chambers. */
export type Footprint = "pocket" | "room" | "hall";

export type StrategicNode = {
  id: number;
  purpose: RegionPurpose;
  /** Pattern that produced this region (or a built-in role such as "main"). */
  patternId: string;
  parent: number | null;
  children: number[];
  gate: Gate;
  /** Forks to try for the way in, best first. The embedder builds the first
   * that fits and falls back to the single `gate` when none does. */
  forks?: Fork[];
  /** Set by the door stage on a region it forked round a quota door: the
   * door. The stage counts the region as its single gate, the door itself,
   * which stands whenever the fork doesn't fit (about three times in four);
   * should the fork fit, the embedder settles the difference
   * (`settleQuota`). */
  quotaFork?: QuotaDoor;
  rewards: Reward[];
  guarded: GuardedReward[];
  /** Ring formation: `rewards[0]` is the centrepiece, surrounded by these. */
  ringGuard?: Strength;
  formation: Formation;
  route: "main" | "optional";
  footprint: Footprint;
  tags: StrategicTag[];
  /** Stairs region only: what stands directly in front of the stairs, an
   * enemy of this strength or a yellow door. */
  stairsGuard?: Strength | "door" | "wood";
};

/** An extra connection that turns the tree into a loop: typically a locked
 * door that lets the player skip a costly enemy route with a key. */
export type ShortcutRequest = { from: number; to: number; gate: Gate };

export type Archetype =
  | "mixed"
  | "keyEconomy"
  | "combatHeavy"
  | "treasure"
  | "branching"
  | "riskyShortcut";

export type StrategicGraph = {
  archetype: Archetype;
  depth: number;
  /** The numbered tower whose enemy curve furnishes it; absent for the first. */
  tower?: number;
  nodes: StrategicNode[];
  shortcuts: ShortcutRequest[];
  /** Notes from the resource planner, e.g. "blue door left without key". */
  notes: string[];
  /** The door stage's quota by door, when it rolled any: how many it
   * rolled, and how many found no place (door-quota.ts). */
  doorQuota?: Partial<Record<QuotaDoor, { rolled: number; dropped: number }>>;
  /** What the enemy stage did (tower/enemy-stage.ts): the enemies it found,
   * those it added for the floor's count, and those that found no tile. */
  enemyCount?: { baseline: number; added: number; dropped: number };
};
