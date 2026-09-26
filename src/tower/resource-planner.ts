import type { KeyColor } from "../config.ts";
import { pick, type Weighted } from "./patterns.ts";
import type { GraphBuilder } from "./strategic-graph.ts";
import type { Gate, Reward, StrategicGraph, StrategicNode, Strength } from "./types.ts";

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

/** The key colour a region's lock takes: a steel lock eats the cheapest key
 * available, so it is yellow demand. */
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
  for (const n of graph.nodes) {
    const color = lockColor(n);
    if (color) doors.push({ color, route: n.route, lockedNode: n.id, order: (n.route === "main" ? 0 : 100) + depthOf(n.id) });
  }
  for (const s of graph.shortcuts)
    if (s.gate.kind === "door") doors.push({ color: s.gate.color, route: "optional", lockedNode: null, order: 1000 });
  return doors.sort((a, b) => a.order - b.order);
}

/** The graph being planned, the builder that adds regions to it, and the
 * floor's random stream. */
type Plan = { graph: StrategicGraph; b: GraphBuilder; rng: () => number };

export function planResources(graph: StrategicGraph, b: GraphBuilder, rng: () => number) {
  const plan: Plan = { graph, b, rng };
  // Rarest first: adding a blue key "behind a yellow door" creates new
  // yellow demand that the yellow pass then sees.
  for (const color of ["red", "blue", "yellow"] as KeyColor[]) {
    let demand = 0;
    for (const door of collectDoors(graph).filter((d) => d.color === color)) coverDoor(plan, door, ++demand);
  }
  // A red door should always feel important.
  for (const n of graph.nodes) if (thinRedVault(n)) sweeten(n, rng);
}

const thinRedVault = (n: StrategicNode) =>
  lockedWith(n, "red") && n.route === "optional" && n.rewards.length + n.guarded.length < 3;

/** When the keys reachable without `door` fall short of the `demand` for
 * its colour so far, rolls to add a source, else sweetens or notes it. */
function coverDoor(plan: Plan, door: Door, demand: number) {
  const { graph, rng } = plan;
  if (supply(graph.nodes, door) >= demand) return;
  const chance = door.route === "main" ? COHERENCE_TUNING.main[door.color](graph.depth) : COHERENCE_TUNING.optional[door.color];
  if (rng() < chance && addKeySource(plan, door)) return;
  const region = door.lockedNode;
  if (region !== null && sweetens(door, rng)) {
    sweeten(graph.nodes[region], rng);
    graph.notes.push(`${door.color} door (region ${region}) has no key; its contents were sweetened`);
  } else {
    graph.notes.push(`${door.color} door ${region === null ? "(shortcut)" : `(region ${region})`} left without a key on this floor`);
  }
}

/** An optional door left without a key may guard something better instead. */
const sweetens = (door: Door, rng: () => number) => door.route === "optional" && rng() < COHERENCE_TUNING.sweetenChance;

/** Keys of the door's colour outside what it locks; keys behind another
 * lock of the same colour don't pay for it. */
function supply(nodes: StrategicNode[], door: Door) {
  const locked = lockedBy(nodes, door);
  return nodes
    .filter((n) => !locked.has(n.id) && ![n.id, ...ancestors(nodes, n.id)].some((a) => lockColor(nodes[a]) === door.color))
    .reduce((s, n) => s + keysIn(n, door.color), 0);
}

const lockedBy = (nodes: StrategicNode[], door: Door) =>
  door.lockedNode === null ? new Set<number>() : subtreeOf(nodes, door.lockedNode);
const lockedWith = (n: StrategicNode, color: KeyColor) => n.gate.kind === "door" && n.gate.color === color;

function sweeten(node: StrategicNode, rng: () => number) {
  node.rewards.push(rng() < 0.5 ? { kind: "treasure" } : rng() < 0.5 ? { kind: "attack" } : { kind: "defense" });
  if (!node.tags.includes("treasureRoom")) node.tags.push("treasureRoom");
}

/** Where a new key for a door can go: the main-route regions the player
 * passes before it, those with a free doorway for a key room, and what the
 * door locks. */
type KeySite = { door: Door; locked: Set<number>; mainBefore: number[]; hosts: number[] };

function keySite(nodes: StrategicNode[], b: GraphBuilder, door: Door): KeySite {
  const mainBefore = door.lockedNode === null
    ? nodes.filter((n) => n.route === "main" && n.purpose !== "stairs").map((n) => n.id)
    : ancestors(nodes, door.lockedNode).filter((id) => nodes[id].route === "main");
  const hosts = mainBefore.filter((id) => b.freeSlots(id) > 0 && nodes[id].purpose !== "stairs");
  return { door, locked: lockedBy(nodes, door), mainBefore, hosts };
}

/** Adds one key of the door's colour somewhere reachable without opening
 * it, trying up to three kinds of source. */
function addKeySource(plan: Plan, door: Door): boolean {
  const { graph, rng } = plan;
  const site = keySite(graph.nodes, plan.b, door);
  const roomForNode = graph.nodes.length < MAX_REGIONS && site.hosts.length > 0;
  const kinds = SOURCE_TABLE[door.color].filter((o) => sourceFits(o.v, door.color, roomForNode));
  for (let tries = 0; tries < 3 && kinds.length; tries++) {
    const kind = pick(kinds, rng);
    const host = site.hosts[Math.floor(rng() * site.hosts.length)];
    if (placeKey(plan, site, kind, host)) return true;
  }
  return false;
}

/** Open and package keys need no new region; the rest need room for one. */
const sourceFits = (kind: SourceKind, color: KeyColor, roomForNode: boolean) =>
  kind === "open" || kind === "package" || (roomForNode && (kind !== "lowerDoor" || LOWER[color] !== null));

/** Places the key as `kind` says; only a package can fail, when no room
 * takes it. */
function placeKey(plan: Plan, site: KeySite, kind: SourceKind, host: number) {
  if (kind === "open") return keyInOpen(plan.graph.nodes, site, plan.rng);
  if (kind === "package") return keyInPackage(plan.graph.nodes, site, plan.rng);
  addKeyRoom(plan, kind, host, site.door.color);
  return true;
}

/** Lays the key in the open in a main-route region before the door. */
function keyInOpen(nodes: StrategicNode[], site: KeySite, rng: () => number) {
  const target = site.mainBefore.length ? site.mainBefore[Math.floor(rng() * site.mainBefore.length)] : 0;
  nodes[target].rewards.push({ kind: "key", color: site.door.color });
  return true;
}

/** Adds the key to an existing optional reward room the player can reach
 * without this door (and not locked behind the same colour). */
function keyInPackage(nodes: StrategicNode[], site: KeySite, rng: () => number) {
  const color = site.door.color;
  const candidates = nodes.filter((n) =>
    n.route === "optional" && !site.locked.has(n.id) && !lockedWith(n, color) &&
    !ancestors(nodes, n.id).some((a) => lockedWith(nodes[a], color)));
  if (!candidates.length) return false;
  candidates[Math.floor(rng() * candidates.length)].rewards.push({ kind: "key", color });
  return true;
}

const STRENGTH: Partial<Record<SourceKind, Strength>> = { weakEnemy: "weak", strongEnemy: "strong", eliteEnemy: "elite" };

/** A new key pocket off `host`, behind an enemy or a lower-tier door. */
function addKeyRoom({ b, rng }: Plan, kind: SourceKind, host: number, color: KeyColor) {
  const gate: Gate = kind === "lowerDoor" ? { kind: "door", color: LOWER[color]! } : { kind: "enemy", strength: STRENGTH[kind]! };
  const extra: Reward[] = rng() < 0.3 ? [{ kind: "potion" }] : [];
  b.add({
    purpose: "keyRoom", patternId: `keySource:${kind}`, parent: host, gate,
    rewards: [{ kind: "key", color }, ...extra], formation: "row", route: "optional", footprint: "pocket",
    tags: ["keyReward", "branch", "optionalRoute", gate.kind === "door" ? "doorGate" : "combatGate"],
  });
}
