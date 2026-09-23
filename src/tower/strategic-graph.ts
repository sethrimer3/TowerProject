import { random } from "../generation.ts";
import {
  ARCHETYPES,
  TOWER_PATTERNS,
  patternWeight,
  pick,
  type PatternStep,
  type TowerPattern,
  type Weighted,
} from "./patterns.ts";
import { MAX_REGIONS, planResources } from "./resource-planner.ts";
import type {
  Archetype,
  Footprint,
  Gate,
  StrategicGraph,
  StrategicNode,
  Strength,
} from "./types.ts";

/** Layer A: decide what strategic situations a floor contains before any
 * geometry exists.
 *
 *   start ─gate─ hub ─gate─ … ─gate─ stairs      (main strategic route)
 *     │           │
 *     └ branch    └ branch ─ nested chain …       (optional value)
 *
 * The main route is the spine that moves towards the staircase; branches are
 * pattern instances (see patterns.ts) that hang off main-route regions. The
 * resource planner then applies soft key/door coherence. */

/** How many child doorways a region can comfortably host. */
const MAX_CHILDREN: Record<Footprint, number> = { hall: 4, room: 2, pocket: 1 };

/** Tunable depth curves. */
export const GRAPH_TUNING = {
  /** Total regions on a floor (start + main + stairs + branches). */
  regionBudget: (depth: number) => Math.min(MAX_REGIONS - 1, 6 + Math.floor(depth / 4)),
  /** Main-route rooms between start and stairs. */
  mainRouteLength: (depth: number) => (depth < 3 ? 1 : depth < 10 ? 2 : 3),
  startPotionChance: (depth: number) => (depth === 0 ? 0.6 : 0.3),
  hubPotionChance: 0.3,
};

export function mainGateTable(depth: number, doorBias: number): Weighted<Gate> {
  return [
    { w: 5, v: { kind: "enemy", strength: "normal" } },
    { w: 1.5 + Math.min(2, depth * 0.1), v: { kind: "enemy", strength: "strong" } },
    { w: 3 * doorBias, v: { kind: "door", color: "yellow" } },
    { w: depth >= 3 ? 1 * doorBias : 0, v: { kind: "door", color: "blue" } },
    { w: depth >= 10 ? 0.5 * doorBias : 0, v: { kind: "door", color: "red" } },
    { w: depth >= 1 ? 0.5 * doorBias : 0, v: { kind: "steel" } },
    { w: depth >= 2 ? 0.5 : 0, v: { kind: "heart" } },
  ];
}

/** The staircase is an objective: sometimes open and visible, sometimes
 * behind a fight or a lock. */
export function stairsGateTable(depth: number, doorBias: number): Weighted<Gate> {
  return [
    { w: 3, v: { kind: "open" } },
    { w: 2.5, v: { kind: "enemy", strength: "strong" } },
    { w: depth >= 5 ? 1 : 0, v: { kind: "enemy", strength: "elite" } },
    { w: 2 * doorBias, v: { kind: "door", color: "yellow" } },
    { w: depth >= 4 ? 0.8 * doorBias : 0, v: { kind: "door", color: "blue" } },
  ];
}

export class GraphBuilder {
  nodes: StrategicNode[] = [];
  constructor(public depth: number, public rng: () => number) {}
  add(partial: Omit<StrategicNode, "id" | "children" | "rewards" | "guarded" | "formation" | "tags"> &
    Partial<Pick<StrategicNode, "rewards" | "guarded" | "formation" | "tags">>): StrategicNode {
    const node: StrategicNode = {
      rewards: [], guarded: [], formation: "row", tags: [],
      ...partial,
      id: this.nodes.length,
      children: [],
    };
    this.nodes.push(node);
    if (node.parent !== null) this.nodes[node.parent].children.push(node.id);
    return node;
  }
  freeSlots(id: number) {
    const n = this.nodes[id];
    return MAX_CHILDREN[n.footprint] - n.children.length;
  }
  /** Instantiate one pattern step as a region under `parent`. */
  addStep(step: PatternStep, parent: number, pattern: TowerPattern): StrategicNode {
    const rng = this.rng;
    return this.add({
      purpose: step.purpose,
      patternId: pattern.id,
      parent,
      gate: pick(step.gate, rng),
      rewards: step.rewards ? [...pick(step.rewards, rng)] : [],
      guarded: step.guarded ? pick(step.guarded, rng).map((g) => ({ ...g })) : [],
      ringGuard: step.ringGuard,
      formation: step.formation ?? "row",
      route: "optional",
      footprint: step.footprint,
      tags: [...pattern.strategicTags],
    });
  }
}

function pickArchetype(depth: number, rng: () => number): Archetype {
  const options = (Object.keys(ARCHETYPES) as Archetype[]).map((a) => ({ w: ARCHETYPES[a].weight(depth), v: a }));
  return pick(options, rng);
}

/** Try to place one pattern instance. Returns false (leaving the graph
 * untouched) when no main-route region has room for it. */
function placePattern(b: GraphBuilder, pattern: TowerPattern, mainIds: number[], budget: number): boolean {
  const cost = pattern.steps.length;
  if (b.nodes.length + cost > budget) return false;
  const needSlots = pattern.layout === "siblings" ? cost : 1;
  const hosts = (pattern.attach === "start" ? mainIds.slice(0, 1) : mainIds)
    .filter((id) => b.nodes[id].purpose !== "stairs" && b.freeSlots(id) >= needSlots);
  if (!hosts.length) return false;
  // Prefer hosts with the most free doorways so branches spread along the route.
  hosts.sort((a, c) => b.freeSlots(c) - b.freeSlots(a) || b.rng() - 0.5);
  const host = hosts[Math.floor(b.rng() * Math.min(2, hosts.length))];
  let parent = host;
  for (const step of pattern.steps) {
    const node = b.addStep(step, pattern.layout === "siblings" ? host : parent, pattern);
    if (pattern.layout === "chain") {
      // Chain rooms need a second doorway for the next link.
      if (node.footprint === "pocket" && step !== pattern.steps[pattern.steps.length - 1]) node.footprint = "room";
      parent = node.id;
    }
  }
  return true;
}

export function generateStrategicGraph(seed: number, depth: number, budgetCut = 0): StrategicGraph {
  const rng = random(seed);
  const b = new GraphBuilder(depth, rng);
  const archetype = pickArchetype(depth, rng);
  const profile = ARCHETYPES[archetype];
  const budget = Math.max(3, Math.min(MAX_REGIONS,
    GRAPH_TUNING.regionBudget(depth) + profile.extraBranches + (rng() < 0.5 ? 1 : 0) - budgetCut));

  // ---- main strategic route ------------------------------------------------
  const start = b.add({
    purpose: "start", patternId: "main", parent: null, gate: { kind: "open" },
    rewards: rng() < GRAPH_TUNING.startPotionChance(depth) ? [{ kind: "potion" }] : [],
    formation: "cluster", route: "main", footprint: "hall", tags: ["progressionRoute"],
  });
  const mainIds = [start.id];
  const mainLen = Math.max(1, Math.min(3, GRAPH_TUNING.mainRouteLength(depth) + profile.mainRouteBonus,
    budget - 2 - 1));
  for (let i = 0; i < mainLen; i++) {
    const hub = b.add({
      purpose: i === mainLen - 1 || rng() < 0.6 ? "hub" : "transition",
      patternId: "main", parent: mainIds[mainIds.length - 1],
      gate: pick(mainGateTable(depth, profile.doorBias), rng),
      rewards: rng() < GRAPH_TUNING.hubPotionChance ? [{ kind: "potion" }] : [],
      formation: "cluster", route: "main", footprint: "hall", tags: ["progressionRoute"],
    });
    if (hub.purpose === "transition") hub.footprint = "room";
    mainIds.push(hub.id);
  }
  const stairsGate = pick(stairsGateTable(depth, profile.doorBias), rng);
  const guardRoll = rng();
  const stairs = b.add({
    purpose: "stairs", patternId: "main", parent: mainIds[mainIds.length - 1],
    gate: stairsGate, route: "main", footprint: "pocket", tags: ["progressionRoute"],
    stairsGuard: stairsGate.kind === "open" && guardRoll < 0.5
      ? ((guardRoll < 0.2 ? "strong" : "normal") as Strength) : undefined,
  });
  // ---- optional branches ---------------------------------------------------
  let failures = 0;
  while (b.nodes.length < budget && failures < 12) {
    const options = TOWER_PATTERNS
      .filter((p) => b.nodes.length + p.steps.length <= budget)
      .map((p) => ({ w: patternWeight(p, depth, archetype), v: p }))
      .filter((o) => o.w > 0);
    if (!options.length) break;
    if (!placePattern(b, pick(options, rng), mainIds, budget)) failures++;
  }
  // ---- shortcut ------------------------------------------------------------
  // PATTERN 11: a locked door from early in the route to late in the route —
  // the enemy path costs HP, the shortcut costs a key.
  const shortcuts: StrategicGraph["shortcuts"] = [];
  if (mainIds.length >= 2 && rng() < profile.shortcutChance)
    shortcuts.push({
      from: mainIds[0],
      to: rng() < 0.5 ? stairs.id : mainIds[mainIds.length - 1],
      gate: { kind: "door", color: depth >= 6 && rng() < 0.3 ? "blue" : "yellow" },
    });

  const graph: StrategicGraph = { archetype, depth, nodes: b.nodes, shortcuts, notes: [] };
  planResources(graph, b, rng);
  return graph;
}
