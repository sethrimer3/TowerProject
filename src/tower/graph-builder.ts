import { pick, type PatternStep, type TowerPattern, type Weighted } from "./patterns.ts";
import { onlyOpenKeys, towerKeyColorsOn, type KeyColors } from "../key-schedule.ts";
import type { Footprint, StrategicNode } from "./types.ts";

/** The strategic graph as its stages build it: the regions added so far,
 * and placing pattern instances among them. Graph planning
 * (strategic-graph.ts) and each stage it runs (door-quota.ts, forks.ts,
 * resource-planner.ts) work on one. */

/** How many child doorways a region can comfortably host. */
const MAX_CHILDREN: Record<Footprint, number> = { hall: 4, room: 2, pocket: 1 };

/** `table` without the options that hold a key colour `colors` closes. */
export const openOptions = <T>(table: Weighted<T>, colors: KeyColors): Weighted<T> =>
  table.filter((o) => onlyOpenKeys(o.v, colors));

export class GraphBuilder {
  nodes: StrategicNode[] = [];
  /** Whether the main route's gates may be potions in place of enemies
   * (`earlyPotions`). */
  potions = false;
  /** The tower the floor stands in, whose key ratios the resource planner
   * aims for (`towerKeyRatio`). */
  tower = 1;
  /** `colors`: the key colours the floor's keys and doors may take
   * (`towerKeyColorsOn`). `bypass`: a blue or red door on the way to the
   * stairs only ever stands in a fork beside a lane without one. */
  constructor(public depth: number, public rng: () => number, public colors: KeyColors = towerKeyColorsOn(depth, 1), public bypass = false) {}
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

/** Try to place one pattern instance. Returns false (leaving the graph
 * untouched) when no main-route region has room for it. */
export function placePattern(b: GraphBuilder, pattern: TowerPattern, mainIds: number[], budget: number): boolean {
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
