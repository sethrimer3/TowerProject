import type { KeyColor } from "../config.ts";

/** Shared vocabulary for strategic Tower generation.
 *
 * A floor is conceived in two layers:
 *   A. a StrategicGraph — regions (nodes) with a purpose, the gate that must
 *      be paid to enter each one from its parent, and the resources visible
 *      inside it;
 *   B. a spatial embedding of that graph onto the 17x17 tile grid.
 * Nothing in layer A knows about coordinates. */

/** Enemy difficulty bands. Enemies are gates that cost HP instead of keys. */
export type Strength = "weak" | "normal" | "strong" | "elite";

/** The cost of crossing from a parent region into a child region. It always
 * occupies the single doorway tile between the two rooms. */
export type Gate =
  | { kind: "open" }
  | { kind: "enemy"; strength: Strength }
  | { kind: "door"; color: KeyColor }
  /** Special locks from the door vocabulary: steel takes any one key
   * (cheapest first), heart opens only while HP is full. */
  | { kind: "steel" }
  | { kind: "heart" };

export type Reward =
  | { kind: "key"; color: KeyColor }
  | { kind: "potion" }
  | { kind: "attack" }
  | { kind: "defense" }
  | { kind: "treasure" };

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
  rewards: Reward[];
  guarded: GuardedReward[];
  /** Ring formation: `rewards[0]` is the centrepiece, surrounded by these. */
  ringGuard?: Strength;
  formation: Formation;
  route: "main" | "optional";
  footprint: Footprint;
  tags: StrategicTag[];
  /** Stairs region only: an enemy standing directly in front of the stairs. */
  stairsGuard?: Strength;
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
  nodes: StrategicNode[];
  shortcuts: ShortcutRequest[];
  /** Notes from the resource planner, e.g. "blue door left without key". */
  notes: string[];
};
