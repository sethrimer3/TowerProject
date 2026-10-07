import { random } from "../random.ts";
import {
  ARCHETYPES,
  TOWER_PATTERNS,
  keyedFloor,
  openFirstFloor,
  patternWeight,
  pick,
  type ArchetypeProfile,
  type PatternStep,
  type TowerPattern,
  type Weighted,
} from "./patterns.ts";
import { planForks } from "./forks.ts";
import { MAX_REGIONS, planResources } from "./resource-planner.ts";
import { YELLOW_ONLY, bypassesRareKeys, heartDoorsOn, keyColorsOn, onlyOpenKeys, type KeyColors } from "../key-schedule.ts";
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
 * pattern instances (see patterns.ts) that hang off main-route regions.
 * Some gated edges then become forks of parallel lanes (forks.ts), and the
 * resource planner applies soft key/door coherence. */

/** How many child doorways a region can comfortably host. */
const MAX_CHILDREN: Record<Footprint, number> = { hall: 4, room: 2, pocket: 1 };

/** Tunable depth curves. */
export const GRAPH_TUNING = {
  /** Total regions on a floor (start + main + stairs + branches). */
  regionBudget: (depth: number) => Math.min(MAX_REGIONS - 1, 7 + Math.floor(depth / 5)),
  /** Main-route rooms between start and stairs. */
  mainRouteLength: (depth: number) => (depth < 3 ? 1 : depth < 10 ? 2 : 3),
  startPotionChance: (depth: number) => (depth === 0 ? 0.6 : 0.3),
  hubPotionChance: 0.3,
  /** Of the stairs no enemy guards, the share with a yellow door in front. */
  stairsDoorChance: 0.5,
  /** On the first tower's first floors (`earlyPotions`), the share of the
   * gates on the way to the stairs that are a potion instead of an enemy. */
  earlyPotionShare: 0.35,
  earlyPotionFloors: 10,
};

/** Whether floor `depth` of tower `tier` lays potions in some of the main
 * route's doorways in place of enemies. */
export const earlyPotions = (depth: number, tier: number) => tier === 1 && depth < GRAPH_TUNING.earlyPotionFloors;

/** `table` without the options that hold a key colour `colors` closes. */
export const openOptions = <T>(table: Weighted<T>, colors: KeyColors): Weighted<T> =>
  table.filter((o) => onlyOpenKeys(o.v, colors));

/** `table` with a potion taking `earlyPotionShare` of its weight, all of it
 * from the enemies (as much as they have). */
function withPotionGates(table: Weighted<Gate>): Weighted<Gate> {
  const total = table.reduce((s, o) => s + o.w, 0);
  const enemies = table.reduce((s, o) => (o.v.kind === "enemy" ? s + o.w : s), 0);
  const potion = Math.min(enemies, GRAPH_TUNING.earlyPotionShare * total);
  if (!potion) return table;
  const left = (enemies - potion) / enemies;
  return [...table.map((o) => (o.v.kind === "enemy" ? { w: o.w * left, v: o.v } : o)), { w: potion, v: { kind: "potion" } }];
}

function mainGateTable(depth: number, doorBias: number, hearts: boolean): Weighted<Gate> {
  return [
    { w: 5, v: { kind: "enemy", strength: "normal" } },
    { w: 1.5 + Math.min(2, depth * 0.1), v: { kind: "enemy", strength: "strong" } },
    { w: 3 * doorBias, v: { kind: "door", color: "yellow" } },
    { w: depth >= 3 ? 1 * doorBias : 0, v: { kind: "door", color: "blue" } },
    { w: depth >= 10 ? 0.5 * doorBias : 0, v: { kind: "door", color: "red" } },
    { w: depth >= 1 ? 0.5 * doorBias : 0, v: { kind: "steel" } },
    { w: hearts ? 0.5 : 0, v: { kind: "heart" } },
  ];
}

/** The staircase is an objective: sometimes open and visible, sometimes
 * behind a fight or a lock. */
function stairsGateTable(depth: number, doorBias: number): Weighted<Gate> {
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
  /** The key colours a gate on the way to the stairs may take on its own;
   * with `bypass`, only yellow (`bypassesRareKeys`). */
  mainColors: KeyColors;
  /** Whether the main route's gates may be potions in place of enemies
   * (`earlyPotions`). */
  potions = false;
  /** Whether the floor may hold a Heart Door (`heartDoorsOn`). */
  hearts = false;
  /** `bypass`: a blue or red door on the way to the stairs only ever
   * stands in a fork beside a lane without one. */
  constructor(public depth: number, public rng: () => number, public colors: KeyColors = keyColorsOn(depth), public bypass = false) {
    this.mainColors = bypass ? YELLOW_ONLY : colors;
  }
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
    const rng = this.rng, open = <T>(table: Weighted<T>) => openOptions(table, this.colors);
    return this.add({
      purpose: step.purpose,
      patternId: pattern.id,
      parent,
      gate: pick(open(step.gate), rng),
      rewards: step.rewards ? [...pick(open(step.rewards), rng)] : [],
      guarded: step.guarded ? pick(open(step.guarded), rng).map((g) => ({ ...g })) : [],
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
  if (b.nodes.length + pattern.steps.length > budget) return false;
  const hosts = patternHosts(b, pattern, mainIds);
  if (!hosts.length) return false;
  const host = hosts[Math.floor(b.rng() * Math.min(2, hosts.length))];
  if (pattern.layout === "chain") addChain(b, pattern, host);
  else for (const step of pattern.steps) b.addStep(step, host, pattern);
  return true;
}

/** Main-route regions with enough free doorways for the pattern, those with
 * the most first so branches spread along the route. */
function patternHosts(b: GraphBuilder, pattern: TowerPattern, mainIds: number[]) {
  const needSlots = pattern.layout === "siblings" ? pattern.steps.length : 1;
  const hosts = (pattern.attach === "start" ? mainIds.slice(0, 1) : mainIds)
    .filter((id) => b.nodes[id].purpose !== "stairs" && b.freeSlots(id) >= needSlots);
  // Ties break at random, drawn before sorting: how often a sort compares is
  // up to the engine, so a draw inside it would not replay.
  const tie = new Map(hosts.map((id) => [id, b.rng()]));
  return hosts.sort((a, c) => b.freeSlots(c) - b.freeSlots(a) || tie.get(a)! - tie.get(c)!);
}

/** Whether every choice `pattern` makes keeps an option with only open key
 * colours, so it can be placed on a floor of `colors`. */
const patternFits = (pattern: TowerPattern, colors: KeyColors) =>
  pattern.steps.every((s) => ([s.gate, s.rewards, s.guarded] as (Weighted<unknown> | undefined)[]).every((t) => !t || openOptions(t, colors).length > 0));

/** Each step of a chain opens off the one before. */
function addChain(b: GraphBuilder, pattern: TowerPattern, host: number) {
  let parent = host;
  pattern.steps.forEach((step, i) => {
    const node = b.addStep(step, parent, pattern);
    // Chain rooms need a second doorway for the next link.
    if (node.footprint === "pocket" && i < pattern.steps.length - 1) node.footprint = "room";
    parent = node.id;
  });
}

/** The floor's plan; `tier` decides which key colours it may use
 * (`keyColorsOn`) and the enemy curve its enemies come from. */
export function generateStrategicGraph(seed: number, depth: number, budgetCut = 0, tier = 1): StrategicGraph {
  const rng = random(seed);
  const b = new GraphBuilder(depth, rng, keyColorsOn(depth, tier), bypassesRareKeys(tier));
  b.potions = earlyPotions(depth, tier);
  b.hearts = heartDoorsOn(depth, tier);
  const archetype = pickArchetype(depth, rng);
  const profile = ARCHETYPES[archetype];
  const budget = Math.max(3, Math.min(MAX_REGIONS,
    GRAPH_TUNING.regionBudget(depth) + profile.extraBranches + (rng() < 0.5 ? 1 : 0) - budgetCut));
  const { mainIds, stairs } = addMainRoute(b, profile, budget);
  addBranches(b, archetype, mainIds, budget);
  const shortcuts = planShortcuts(b, profile, mainIds, stairs);
  planForks(b, archetype);
  const graph: StrategicGraph = { archetype, depth, ...(tier > 1 ? { tower: tier } : {}), nodes: b.nodes, shortcuts, notes: [] };
  planResources(graph, b, rng);
  return graph;
}

/** The main strategic route: the start hall, gated hubs and transitions,
 * then the staircase. */
function addMainRoute(b: GraphBuilder, profile: ArchetypeProfile, budget: number) {
  const { depth, rng } = b;
  const start = b.add({
    purpose: "start", patternId: "main", parent: null, gate: { kind: "open" },
    rewards: rng() < GRAPH_TUNING.startPotionChance(depth) ? [{ kind: "potion" }] : [],
    formation: "cluster", route: "main", footprint: "hall", tags: ["progressionRoute"],
  });
  const mainIds = [start.id];
  const mainLen = Math.max(1, Math.min(3, GRAPH_TUNING.mainRouteLength(depth) + profile.mainRouteBonus,
    budget - 2 - 1));
  for (let i = 0; i < mainLen; i++) mainIds.push(addHub(b, profile, mainIds[mainIds.length - 1], i === mainLen - 1));
  const stairs = addStairs(b, profile, mainIds[mainIds.length - 1]);
  return { mainIds, stairs };
}

/** The options for a gate on the way to the stairs: only the key colours it
 * may take there, and on the first tower's first floors potions in some
 * enemies' place. */
function mainGates(b: GraphBuilder, table: Weighted<Gate>) {
  const open = openOptions(table, b.mainColors);
  return b.potions ? withPotionGates(open) : open;
}

/** A gate on the way to the stairs that must cost nothing (floor 1's, and
 * the stairs pocket's on floors 2 to 5): open, or where potions take
 * enemies' place, as often a potion as a gate drawn from a table. */
function freeGate(b: GraphBuilder): Gate {
  return b.potions && b.rng() < GRAPH_TUNING.earlyPotionShare ? { kind: "potion" } : { kind: "open" };
}

/** One gated region on the main route; the last is always a hub. */
function addHub(b: GraphBuilder, profile: ArchetypeProfile, parent: number, last: boolean) {
  const { depth, rng } = b;
  const hub = b.add({
    purpose: last || rng() < 0.6 ? "hub" : "transition",
    patternId: "main", parent,
    gate: openFirstFloor(depth) ? freeGate(b) : pick(mainGates(b, mainGateTable(depth, profile.doorBias, b.hearts)), rng),
    rewards: rng() < GRAPH_TUNING.hubPotionChance ? [{ kind: "potion" }] : [],
    formation: "cluster", route: "main", footprint: "hall", tags: ["progressionRoute"],
  });
  if (hub.purpose === "transition") hub.footprint = "room";
  return hub.id;
}

/** The staircase pocket; an open one may still have an enemy or a yellow
 * door in front of the stairs. The first floor's stairs stand open, and
 * floors 2 to 5 always have the door. */
function addStairs(b: GraphBuilder, profile: ArchetypeProfile, parent: number) {
  const { depth, rng } = b;
  let gate = pick(mainGates(b, stairsGateTable(depth, profile.doorBias)), rng);
  let guard: StrategicNode["stairsGuard"];
  if (openFirstFloor(depth) || keyedFloor(depth)) gate = freeGate(b);
  if (keyedFloor(depth)) guard = "door";
  else if (!openFirstFloor(depth) && (gate.kind === "open" || gate.kind === "potion")) {
    const guardRoll = rng();
    if (guardRoll < 0.5) guard = guardRoll < 0.2 ? "strong" : "normal";
    else if (rng() < GRAPH_TUNING.stairsDoorChance) guard = "door";
  }
  return b.add({
    purpose: "stairs", patternId: "main", parent,
    gate, route: "main", footprint: "pocket", tags: ["progressionRoute"],
    stairsGuard: guard,
  });
}

/** Optional branches: pattern instances until the budget is spent or twelve
 * of them find no room. */
function addBranches(b: GraphBuilder, archetype: Archetype, mainIds: number[], budget: number) {
  let failures = 0;
  while (b.nodes.length < budget && failures < 12) {
    const options = TOWER_PATTERNS
      .filter((p) => b.nodes.length + p.steps.length <= budget)
      .map((p) => ({ w: patternFits(p, b.colors) ? patternWeight(p, b.depth, archetype) : 0, v: p }))
      .filter((o) => o.w > 0);
    if (!options.length) break;
    if (!placePattern(b, pick(options, b.rng), mainIds, budget)) failures++;
  }
}

/** PATTERN 11: a locked door from early in the route to late in the route —
 * the enemy path costs HP, the shortcut costs a key. */
function planShortcuts(b: GraphBuilder, profile: ArchetypeProfile, mainIds: number[], stairs: StrategicNode): StrategicGraph["shortcuts"] {
  const { depth, rng } = b;
  // The first five floors keep every door on the way to the stairs paid for.
  if (openFirstFloor(depth) || keyedFloor(depth) || mainIds.length < 2 || rng() >= profile.shortcutChance) return [];
  return [{
    from: mainIds[0],
    to: rng() < 0.5 ? stairs.id : mainIds[mainIds.length - 1],
    gate: { kind: "door", color: depth >= 6 && b.colors.blue && rng() < 0.3 ? "blue" : "yellow" },
  }];
}
