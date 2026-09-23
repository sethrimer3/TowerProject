import type { KeyColor } from "../config.ts";
import { pick, type Weighted } from "./patterns.ts";
import type { GraphBuilder } from "./strategic-graph.ts";
import type { Reward, StrategicGraph, StrategicNode, Strength } from "./types.ts";

/** Resource planner: treats keys and doors as an economy
 * (yellow = common, blue = uncommon, red = rare) and nudges — never forces —
 * the floor towards coherence.
 *
 * For every door it asks "is there plausibly a key for this outside the
 * area it locks?". If not, it rolls a depth- and route-dependent chance to
 * add a key source in a Magic-Tower way (behind a weak enemy, behind a
 * lower-tier door, in the open, …). When the roll fails the door simply
 * stays unaffordable — possibly protecting something valuable, possibly a
 * dead end for this run. Exact door/key parity is never enforced. */

/** Hard cap: a 15x15 interior cannot legibly hold more regions. */
export const MAX_REGIONS = 13;

export const COHERENCE_TUNING = {
  /** Chance to add a missing key source for a door on the main route. */
  main: {
    yellow: (d: number) => Math.max(0.6, 0.93 - d * 0.012),
    blue: (d: number) => Math.max(0.5, 0.8 - d * 0.01),
    red: (d: number) => Math.max(0.4, 0.65 - d * 0.005),
  } as Record<KeyColor, (d: number) => number>,
  /** Chance for an optional (branch/shortcut) door. */
  optional: { yellow: 0.55, blue: 0.4, red: 0.3 } as Record<KeyColor, number>,
  /** When no key is added for an optional door, chance to make what it
   * protects more valuable instead ("worth saving a key for"). */
  sweetenChance: 0.6,
};

type SourceKind = "weakEnemy" | "strongEnemy" | "eliteEnemy" | "lowerDoor" | "open" | "package";

/** Where a key of each tier tends to come from (spec §18). */
const SOURCE_TABLE: Record<KeyColor, Weighted<SourceKind>> = {
  yellow: [
    { w: 5, v: "weakEnemy" }, { w: 2.5, v: "open" }, { w: 2, v: "package" }, { w: 1.5, v: "strongEnemy" },
  ],
  blue: [
    { w: 5, v: "strongEnemy" }, { w: 4, v: "lowerDoor" }, { w: 1.5, v: "open" }, { w: 1, v: "package" },
  ],
  red: [
    { w: 4, v: "eliteEnemy" }, { w: 2, v: "lowerDoor" }, { w: 0.5, v: "open" }, { w: 1, v: "package" },
  ],
};
const LOWER: Record<KeyColor, KeyColor | null> = { yellow: null, blue: "yellow", red: "blue" };

export function subtreeOf(nodes: StrategicNode[], id: number): Set<number> {
  const out = new Set<number>();
  const stack = [id];
  while (stack.length) {
    const n = stack.pop()!;
    out.add(n);
    stack.push(...nodes[n].children);
  }
  return out;
}

export function keysIn(node: StrategicNode, color: KeyColor): number {
  const count = (r: Reward) => (r.kind === "key" && r.color === color ? 1 : 0);
  return node.rewards.reduce((s, r) => s + count(r), 0) + node.guarded.reduce((s, g) => s + count(g.reward), 0);
}

function lockColor(n: StrategicNode): KeyColor | null {
  return n.gate.kind === "door" ? n.gate.color : n.gate.kind === "steel" ? "yellow" : null;
}

function ancestors(nodes: StrategicNode[], id: number): number[] {
  const out: number[] = [];
  for (let p = nodes[id].parent; p !== null; p = nodes[p].parent) out.push(p);
  return out;
}

type Door = { color: KeyColor; route: "main" | "optional"; lockedNode: number | null; order: number };

function collectDoors(graph: StrategicGraph): Door[] {
  const doors: Door[] = [];
  const depthOf = (id: number) => ancestors(graph.nodes, id).length;
  for (const n of graph.nodes)
    // A steel lock eats the cheapest key available, so it is yellow demand.
    if (n.gate.kind === "door" || n.gate.kind === "steel")
      doors.push({
        color: n.gate.kind === "door" ? n.gate.color : "yellow", route: n.route, lockedNode: n.id,
        order: (n.route === "main" ? 0 : 100) + depthOf(n.id),
      });
  for (const s of graph.shortcuts)
    if (s.gate.kind === "door") doors.push({ color: s.gate.color, route: "optional", lockedNode: null, order: 1000 });
  return doors.sort((a, b) => a.order - b.order);
}

export function planResources(graph: StrategicGraph, b: GraphBuilder, rng: () => number) {
  const nodes = graph.nodes;
  const depth = graph.depth;
  // Rarest first: adding a blue key "behind a yellow door" creates new
  // yellow demand that the yellow pass then sees.
  for (const color of ["red", "blue", "yellow"] as KeyColor[]) {
    let demand = 0;
    for (const door of collectDoors(graph).filter((d) => d.color === color)) {
      demand++;
      const locked = door.lockedNode === null ? new Set<number>() : subtreeOf(nodes, door.lockedNode);
      // Keys behind another lock of the same colour don't pay for this one.
      const supply = nodes
        .filter((n) => !locked.has(n.id) && ![n.id, ...ancestors(nodes, n.id)].some((a) => lockColor(nodes[a]) === color))
        .reduce((s, n) => s + keysIn(n, color), 0);
      if (supply >= demand) continue;
      const chance = door.route === "main" ? COHERENCE_TUNING.main[color](depth) : COHERENCE_TUNING.optional[color];
      if (rng() < chance && addKeySource(graph, b, rng, color, door)) continue;
      if (door.lockedNode !== null && door.route === "optional" && rng() < COHERENCE_TUNING.sweetenChance) {
        sweeten(nodes[door.lockedNode], rng);
        graph.notes.push(`${color} door (region ${door.lockedNode}) has no key; its contents were sweetened`);
      } else {
        graph.notes.push(`${color} door ${door.lockedNode === null ? "(shortcut)" : `(region ${door.lockedNode})`} left without a key on this floor`);
      }
    }
  }
  // A red door should always feel important.
  for (const n of nodes)
    if (n.gate.kind === "door" && n.gate.color === "red" && n.route === "optional" && n.rewards.length + n.guarded.length < 3)
      sweeten(n, rng);
}

function sweeten(node: StrategicNode, rng: () => number) {
  node.rewards.push(rng() < 0.5 ? { kind: "treasure" } : rng() < 0.5 ? { kind: "attack" } : { kind: "defense" });
  if (!node.tags.includes("treasureRoom")) node.tags.push("treasureRoom");
}

/** Adds one key of `color` somewhere reachable without opening `door`. */
function addKeySource(graph: StrategicGraph, b: GraphBuilder, rng: () => number, color: KeyColor, door: Door): boolean {
  const nodes = graph.nodes;
  const locked = door.lockedNode === null ? new Set<number>() : subtreeOf(nodes, door.lockedNode);
  // Main-route regions the player passes before this door.
  const mainBefore = (door.lockedNode === null
    ? nodes.filter((n) => n.route === "main" && n.purpose !== "stairs").map((n) => n.id)
    : ancestors(nodes, door.lockedNode).filter((id) => nodes[id].route === "main"));
  const hosts = mainBefore.filter((id) => b.freeSlots(id) > 0 && nodes[id].purpose !== "stairs");
  const roomForNode = nodes.length < MAX_REGIONS && hosts.length > 0;
  const key: Reward = { kind: "key", color };

  const kinds = SOURCE_TABLE[color].filter((o) => {
    if (o.v === "open" || o.v === "package") return true;
    if (o.v === "lowerDoor") return roomForNode && LOWER[color] !== null;
    return roomForNode;
  });
  for (let tries = 0; tries < 3 && kinds.length; tries++) {
    const kind = pick(kinds, rng);
    const host = hosts[Math.floor(rng() * hosts.length)];
    if (kind === "open") {
      const target = mainBefore.length ? mainBefore[Math.floor(rng() * mainBefore.length)] : 0;
      nodes[target].rewards.push(key);
      return true;
    }
    if (kind === "package") {
      // Add to an existing optional reward room the player can reach
      // without this door (and not locked behind the same colour).
      const candidates = nodes.filter((n) =>
        n.route === "optional" && !locked.has(n.id) &&
        !(n.gate.kind === "door" && n.gate.color === color) &&
        ancestors(nodes, n.id).every((a) => !(nodes[a].gate.kind === "door" && (nodes[a].gate as { color: KeyColor }).color === color)));
      if (!candidates.length) continue;
      candidates[Math.floor(rng() * candidates.length)].rewards.push(key);
      return true;
    }
    const strength: Record<string, Strength> = { weakEnemy: "weak", strongEnemy: "strong", eliteEnemy: "elite" };
    const gate = kind === "lowerDoor"
      ? { kind: "door" as const, color: LOWER[color]! }
      : { kind: "enemy" as const, strength: strength[kind] };
    const extra: Reward[] = rng() < 0.3 ? [{ kind: "potion" }] : [];
    b.add({
      purpose: "keyRoom", patternId: `keySource:${kind}`, parent: host, gate,
      rewards: [key, ...extra], formation: "row", route: "optional", footprint: "pocket",
      tags: ["keyReward", "branch", "optionalRoute", gate.kind === "door" ? "doorGate" : "combatGate"],
    });
    return true;
  }
  return false;
}
