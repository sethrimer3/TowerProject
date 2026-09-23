import { TOWER_HEIGHT, TOWER_START_X, TOWER_WIDTH, type KeyColor } from "../config.ts";
import { doorCost } from "../doors.ts";
import { point, type Tile } from "../entities.ts";
import type { Embedding } from "./embedder.ts";
import type { Gate, StrategicGraph, StrategicNode } from "./types.ts";

/** Generation analysis: measures whether a floor reads as a strategic
 * economy (it never rejects a floor for being hard or unwinnable). Used by
 * tests, `npm run tower:report`, and the in-game `towerDebug()` console hook. */

export type FloorAnalysis = {
  archetype: string;
  depth: number;
  regions: { id: number; purpose: string; pattern: string; route: string; gate: string; contents: string }[];
  doors: Record<string, number>;
  /** e.g. "yellow via weak enemy": 2, "yellow via blue door": 3 */
  keys: Record<string, number>;
  progressionGates: number;
  strategicBranches: number;
  rewardDeadEnds: number;
  emptyDeadEnds: number;
  interactions: number;
  walkable: number;
  /** Farthest any empty floor tile is from something to decide about. */
  longestEmptyTraversal: number;
  shortcutsPlaced: number;
  /** Keys-only search (enemies passable, no starting keys): can every door
   * on the floor be opened in some order? Informational only. */
  keyEconomyComplete: boolean;
  /** Same simulation: can the stairs be reached? */
  stairsKeyReachable: boolean;
  dropped: number;
  notes: string[];
};

export function gateLabel(g: Gate): string {
  if (g.kind === "open") return "open";
  if (g.kind === "enemy") return `${g.strength} enemy`;
  if (g.kind === "door") return `${g.color} door`;
  return `${g.kind} door`;
}

const INTERACTIVE = new Set(["enemy", "key", "door", "potion", "attack", "defense", "treasure", "stairs"]);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function neighbours(k: string) {
  const [x, y] = k.split(",").map(Number);
  return DIRS.map(([dx, dy]) => point(x + dx, y + dy));
}

/** Keys-only economy search from the entrance with no starting keys:
 * enemies count as passable (HP is a separate question) and heart doors as
 * openable. Explores every order of opening doors (floors hold few doors),
 * so it answers "can a careful player afford X?", not "will a greedy one". */
export function keyEconomy(cells: Map<string, Tile>, entrance: string, target: string) {
  const doors = [...cells].filter(([, t]) => t.kind === "door").map(([k]) => k);
  const index = new Map(doors.map((k, i) => [k, i]));
  const explore = (opened: number) => {
    const seen = new Set<string>([entrance]);
    const queue = [entrance];
    const frontier: number[] = [];
    const keys: Record<KeyColor, number> = { yellow: 0, blue: 0, red: 0 };
    for (let i = 0; i < queue.length; i++)
      for (const n of neighbours(queue[i])) {
        const t = cells.get(n);
        if (!t || t.kind === "wall" || seen.has(n)) continue;
        seen.add(n);
        const d = index.get(n);
        if (d !== undefined && !(opened & (1 << d))) { frontier.push(d); continue; }
        if (t.kind === "key") keys[t.color!]++;
        queue.push(n);
      }
    return { seen, frontier, keys };
  };
  // State: which doors are open, plus the keys left after paying for them.
  type State = { opened: number; spent: Record<KeyColor, number> };
  const visited = new Set<string>();
  const stack: State[] = [{ opened: 0, spent: { yellow: 0, blue: 0, red: 0 } }];
  let stairs = false, allDoors = doors.length === 0;
  const limit = doors.length > 14 ? 0 : 20000; // pathological floors: report unknown as false
  for (let steps = 0; stack.length && steps < limit; steps++) {
    const s = stack.pop()!;
    const id = `${s.opened}|${s.spent.yellow},${s.spent.blue},${s.spent.red}`;
    if (visited.has(id)) continue;
    visited.add(id);
    const { seen, frontier, keys } = explore(s.opened);
    if (seen.has(target)) stairs = true;
    if (s.opened === (1 << doors.length) - 1) allDoors = true;
    if (stairs && allDoors) break;
    const wallet = { yellow: keys.yellow - s.spent.yellow, blue: keys.blue - s.spent.blue, red: keys.red - s.spent.red };
    for (const d of new Set(frontier)) {
      const cost = doorCost(cells.get(doors[d])!, { keys: wallet, hp: 1, maxHp: 1 });
      if (!cost) continue;
      const spent = { ...s.spent };
      for (const c of cost) spent[c]++;
      stack.push({ opened: s.opened | (1 << d), spent });
    }
  }
  return { stairs, allDoors };
}

export function analyzeFloor(emb: Embedding): FloorAnalysis {
  const { graph, cells } = emb;
  const nodes = graph.nodes;
  const entrance = point(TOWER_START_X, 0);

  const doors: Record<string, number> = {};
  for (const [, t] of cells)
    if (t.kind === "door") {
      const label = t.door?.type === "fullHp" ? "heart" : t.door?.type === "keys" && t.door.mode === "any" ? "steel" : t.color ?? "yellow";
      doors[label] = (doors[label] ?? 0) + 1;
    }

  // What does it cost to reach a region? The nearest non-open gate on the
  // path from the start.
  const costOf = (n: StrategicNode): string => {
    for (let cur: StrategicNode | null = n; cur; cur = cur.parent === null ? null : nodes[cur.parent])
      if (cur.gate.kind !== "open") return gateLabel(cur.gate);
    return "open";
  };
  const keys: Record<string, number> = {};
  for (const p of emb.placements)
    if (p.tile.kind === "key" && p.role === "reward") {
      const guard = emb.placements.find((g) => g.role === "guard" && g.node === p.node &&
        Math.abs(g.x - p.x) + Math.abs(g.y - p.y) === 1);
      const label = `${p.tile.color} via ${guard ? "guarded niche" : costOf(nodes[p.node])}`;
      keys[label] = (keys[label] ?? 0) + 1;
    }

  const contentOf = (n: StrategicNode) =>
    [...n.rewards.map((r) => (r.kind === "key" ? `${r.color} key` : r.kind)),
      ...n.guarded.map((g) => `${g.reward.kind === "key" ? `${g.reward.color} key` : g.reward.kind}←${g.guard}`),
      ...(n.ringGuard ? [`ring of ${n.ringGuard}`] : []),
      ...(n.stairsGuard ? [`stairs←${n.stairsGuard}`] : [])].join(", ");
  const leaves = nodes.filter((n) => n.children.length === 0 && n.purpose !== "stairs");
  const hasContent = (n: StrategicNode) => emb.placements.some((p) => p.node === n.id);

  // Distance from every walkable tile to the nearest interactive tile.
  const walkable = [...cells].filter(([, t]) => t.kind !== "wall").map(([k]) => k);
  const dist = new Map<string, number>();
  const queue = walkable.filter((k) => INTERACTIVE.has(cells.get(k)!.kind));
  for (const k of queue) dist.set(k, 0);
  for (let i = 0; i < queue.length; i++)
    for (const n of neighbours(queue[i])) {
      const t = cells.get(n);
      if (!t || t.kind === "wall" || dist.has(n)) continue;
      dist.set(n, dist.get(queue[i])! + 1);
      queue.push(n);
    }

  const economy = keyEconomy(cells, entrance, point(...emb.stairs));
  return {
    archetype: graph.archetype,
    depth: graph.depth,
    regions: nodes.map((n) => ({
      id: n.id, purpose: n.purpose, pattern: n.patternId, route: n.route,
      gate: gateLabel(n.gate), contents: contentOf(n),
    })),
    doors,
    keys,
    progressionGates: nodes.filter((n) => n.route === "main" && n.gate.kind !== "open").length,
    strategicBranches: nodes.filter((n) => n.route === "optional" && n.parent !== null && nodes[n.parent].route === "main").length,
    rewardDeadEnds: leaves.filter(hasContent).length,
    emptyDeadEnds: leaves.filter((n) => !hasContent(n)).length,
    interactions: queue.filter((k) => dist.get(k) === 0).length,
    walkable: walkable.length,
    longestEmptyTraversal: Math.max(0, ...dist.values()),
    shortcutsPlaced: emb.shortcutsPlaced,
    keyEconomyComplete: economy.allDoors,
    stairsKeyReachable: economy.stairs,
    dropped: emb.dropped.length,
    notes: graph.notes,
  };
}

const GLYPH: Record<string, string> = {
  wall: "#", floor: ".", enemy: "E", potion: "p", attack: "a", defense: "d",
  treasure: "T", stairs: ">", stairsDown: "<", reward: "C", oneway: "v",
};
export function asciiMap(cells: Map<string, Tile>): string {
  const rows: string[] = [];
  for (let y = 0; y < TOWER_HEIGHT; y++) {
    let row = "";
    for (let x = 0; x < TOWER_WIDTH; x++) {
      const t = cells.get(point(x, y)) ?? { kind: "wall" as const };
      if (t.kind === "key") row += t.color![0];
      else if (t.kind === "door")
        row += t.door?.type === "fullHp" ? "H" : t.door?.type === "keys" && t.door.mode === "any" ? "S" : t.color![0].toUpperCase();
      else row += GLYPH[t.kind] ?? "?";
      row += " ";
    }
    rows.push(row.trimEnd());
  }
  return rows.join("\n");
}

export function formatFloorSummary(a: FloorAnalysis, cells?: Map<string, Tile>): string {
  const lines = [
    `Floor generation summary (depth ${a.depth})`,
    `Archetype: ${a.archetype}`,
    "Regions:",
    ...a.regions.map((r) => `  ${r.id}. ${r.purpose} [${r.pattern}] ${r.route} · gate: ${r.gate}${r.contents ? ` · ${r.contents}` : ""}`),
    `Doors: ${Object.entries(a.doors).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`,
    "Keys:",
    ...(Object.entries(a.keys).map(([k, v]) => `  ${k}: ${v}`)),
    `Progression gates: ${a.progressionGates} · Strategic branches: ${a.strategicBranches} · Shortcuts: ${a.shortcutsPlaced}`,
    `Reward dead ends: ${a.rewardDeadEnds} · Empty dead ends: ${a.emptyDeadEnds}`,
    `Interactions: ${a.interactions} on ${a.walkable} walkable tiles · Longest empty traversal: ${a.longestEmptyTraversal} tiles`,
    `Key economy: ${a.keyEconomyComplete ? "every door affordable" : "some doors unaffordable"} · stairs ${a.stairsKeyReachable ? "reachable" : "NOT reachable"} without starting keys`,
    ...(a.notes.length ? ["Notes:", ...a.notes.map((n) => `  - ${n}`)] : []),
  ];
  if (cells) lines.push("", asciiMap(cells), "Legend: # wall · E enemy · y/b/r key · Y/B/R door · S steel · H heart · p potion · a atk · d def · T treasure · > stairs · < down");
  return lines.join("\n");
}
