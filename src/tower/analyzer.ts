import { TOWER_HEIGHT, TOWER_START_X, TOWER_WIDTH, type KeyColor } from "../config.ts";
import { doorCost } from "../doors.ts";
import { point, type Tile } from "../entities.ts";
import type { Embedding } from "./embedder.ts";
import type { Gate, Reward, StrategicNode } from "./types.ts";

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

/** The unvisited, non-wall tiles beside `k`, checked one at a time so the
 * caller can mark each before the next. */
function* unseenSteps(cells: Map<string, Tile>, k: string, seen: { has(k: string): boolean }): Generator<[string, Tile]> {
  const [x, y] = k.split(",").map(Number);
  for (const [dx, dy] of DIRS) {
    const n = point(x + dx, y + dy);
    const t = cells.get(n);
    if (open(t) && !seen.has(n)) yield [n, t];
  }
}

const open = (t: Tile | undefined): t is Tile => t !== undefined && t.kind !== "wall";

/** Heart and steel locks by name, else null for a plain key door. */
function specialLock(t: Tile): "heart" | "steel" | null {
  if (t.door?.type === "fullHp") return "heart";
  return t.door?.type === "keys" && t.door.mode === "any" ? "steel" : null;
}

const tally = (counts: Record<string, number>, label: string) => void (counts[label] = (counts[label] ?? 0) + 1);

type Keys = Record<KeyColor, number>;
/** Which doors are open, plus the keys spent paying for them. */
type EconomyState = { opened: number; spent: Keys };
/** What is reachable with some doors open: the tiles, the closed doors at
 * the edge, and the keys lying on the way. */
type Reach = { seen: Set<string>; frontier: number[]; keys: Keys };

/** Keys-only economy search from the entrance with no starting keys:
 * enemies count as passable (HP is a separate question) and heart doors as
 * openable. Explores every order of opening doors (floors hold few doors),
 * so it answers "can a careful player afford X?", not "will a greedy one". */
export function keyEconomy(cells: Map<string, Tile>, entrance: string, target: string) {
  const doors = [...cells].filter(([, t]) => t.kind === "door").map(([k]) => k);
  const index = new Map(doors.map((k, i) => [k, i]));
  const everyDoor = (1 << doors.length) - 1;
  const visited = new Set<string>();
  const stack: EconomyState[] = [{ opened: 0, spent: { yellow: 0, blue: 0, red: 0 } }];
  let stairs = false, allDoors = doors.length === 0;
  for (let steps = 0; stack.length && steps < searchLimit(doors.length); steps++) {
    const s = stack.pop()!;
    if (!firstVisit(visited, s)) continue;
    const reach = explore(cells, entrance, index, s.opened);
    stairs ||= reach.seen.has(target);
    allDoors ||= s.opened === everyDoor;
    if (stairs && allDoors) break;
    stack.push(...openings(cells, doors, s, reach));
  }
  return { stairs, allDoors };
}

/** States to search before giving up; pathological floors report unknown
 * as false. */
const searchLimit = (doors: number) => (doors > 14 ? 0 : 20000);

/** Marks the state visited; false when it already was. */
function firstVisit(visited: Set<string>, s: EconomyState) {
  const id = `${s.opened}|${s.spent.yellow},${s.spent.blue},${s.spent.red}`;
  if (visited.has(id)) return false;
  visited.add(id);
  return true;
}

/** Floods from the entrance, stopping at doors not yet `opened`. */
function explore(cells: Map<string, Tile>, entrance: string, index: Map<string, number>, opened: number): Reach {
  const seen = new Set<string>([entrance]);
  const queue = [entrance];
  const frontier: number[] = [];
  const keys: Keys = { yellow: 0, blue: 0, red: 0 };
  const enter = (n: string, t: Tile) => {
    if (t.kind === "key") keys[t.color!]++;
    queue.push(n);
  };
  for (let i = 0; i < queue.length; i++)
    for (const [n, t] of unseenSteps(cells, queue[i], seen)) {
      seen.add(n);
      const d = index.get(n);
      if (closed(d, opened)) frontier.push(d);
      else enter(n, t);
    }
  return { seen, frontier, keys };
}

const closed = (door: number | undefined, opened: number): door is number => door !== undefined && !(opened & (1 << door));

/** The states after opening each frontier door the unspent keys pay for. */
function openings(cells: Map<string, Tile>, doors: string[], s: EconomyState, { frontier, keys }: Reach): EconomyState[] {
  const wallet = { yellow: keys.yellow - s.spent.yellow, blue: keys.blue - s.spent.blue, red: keys.red - s.spent.red };
  const next: EconomyState[] = [];
  for (const d of new Set(frontier)) {
    const cost = doorCost(cells.get(doors[d])!, { keys: wallet, hp: 1, maxHp: 1 });
    if (!cost) continue;
    const spent = { ...s.spent };
    for (const c of cost) spent[c]++;
    next.push({ opened: s.opened | (1 << d), spent });
  }
  return next;
}

export function analyzeFloor(emb: Embedding): FloorAnalysis {
  const { graph, cells } = emb;
  const nodes = graph.nodes;
  const leaves = nodes.filter((n) => n.children.length === 0 && n.purpose !== "stairs");
  const hasContent = (n: StrategicNode) => emb.placements.some((p) => p.node === n.id);
  const spacing = interactionSpacing(cells);
  const economy = keyEconomy(cells, point(TOWER_START_X, 0), point(...emb.stairs));
  return {
    archetype: graph.archetype,
    depth: graph.depth,
    regions: nodes.map((n) => ({
      id: n.id, purpose: n.purpose, pattern: n.patternId, route: n.route,
      gate: gateLabel(n.gate), contents: contentOf(n),
    })),
    doors: doorCounts(cells),
    keys: keySources(emb),
    progressionGates: nodes.filter((n) => n.route === "main" && n.gate.kind !== "open").length,
    strategicBranches: nodes.filter((n) => n.route === "optional" && n.parent !== null && nodes[n.parent].route === "main").length,
    rewardDeadEnds: leaves.filter(hasContent).length,
    emptyDeadEnds: leaves.filter((n) => !hasContent(n)).length,
    ...spacing,
    shortcutsPlaced: emb.shortcutsPlaced,
    keyEconomyComplete: economy.allDoors,
    stairsKeyReachable: economy.stairs,
    dropped: emb.dropped.length,
    notes: graph.notes,
  };
}

/** Doors on the floor by kind: heart, steel, or their key colour. */
function doorCounts(cells: Map<string, Tile>) {
  const doors: Record<string, number> = {};
  for (const [, t] of cells) if (t.kind === "door") tally(doors, specialLock(t) ?? t.color ?? "yellow");
  return doors;
}

/** Placed reward keys by colour and what it costs to reach them: a guard
 * beside them, else the nearest gate on the way in. */
function keySources(emb: Embedding) {
  const keys: Record<string, number> = {};
  for (const p of emb.placements)
    if (p.tile.kind === "key" && p.role === "reward") {
      const guard = emb.placements.find((g) => g.role === "guard" && g.node === p.node &&
        Math.abs(g.x - p.x) + Math.abs(g.y - p.y) === 1);
      tally(keys, `${p.tile.color} via ${guard ? "guarded niche" : entryCost(emb.graph.nodes, p.node)}`);
    }
  return keys;
}

/** What it costs to reach a region: the nearest non-open gate on the path
 * from the start. */
function entryCost(nodes: StrategicNode[], id: number): string {
  for (let cur: StrategicNode | null = nodes[id]; cur; cur = cur.parent === null ? null : nodes[cur.parent])
    if (cur.gate.kind !== "open") return gateLabel(cur.gate);
  return "open";
}

const rewardLabel = (r: Reward) => (r.kind === "key" ? `${r.color} key` : r.kind);

function contentOf(n: StrategicNode) {
  return [
    ...n.rewards.map(rewardLabel),
    ...n.guarded.map((g) => `${rewardLabel(g.reward)}←${g.guard}`),
    ...(n.ringGuard ? [`ring of ${n.ringGuard}`] : []),
    ...(n.stairsGuard ? [`stairs←${n.stairsGuard}`] : []),
  ].join(", ");
}

/** How many interactive tiles lie among the walkable ones, and the farthest
 * any tile is from one of them. */
function interactionSpacing(cells: Map<string, Tile>) {
  const walkable = [...cells].filter(([, t]) => t.kind !== "wall").map(([k]) => k);
  const queue = walkable.filter((k) => INTERACTIVE.has(cells.get(k)!.kind));
  const interactions = queue.length;
  const dist = new Map(queue.map((k) => [k, 0]));
  for (let i = 0; i < queue.length; i++)
    for (const [n] of unseenSteps(cells, queue[i], dist)) {
      dist.set(n, dist.get(queue[i])! + 1);
      queue.push(n);
    }
  return { interactions, walkable: walkable.length, longestEmptyTraversal: Math.max(0, ...dist.values()) };
}

const GLYPH: Record<string, string> = {
  wall: "#", floor: ".", enemy: "E", potion: "p", attack: "a", defense: "d",
  treasure: "T", stairs: ">", stairsDown: "<", reward: "C", oneway: "v",
};
const LOCK_GLYPH = { heart: "H", steel: "S" };

export function asciiMap(cells: Map<string, Tile>): string {
  const rows: string[] = [];
  for (let y = 0; y < TOWER_HEIGHT; y++) {
    const row: string[] = [];
    for (let x = 0; x < TOWER_WIDTH; x++) row.push(glyph(cells.get(point(x, y)) ?? { kind: "wall" }));
    rows.push(row.join(" "));
  }
  return rows.join("\n");
}

function glyph(t: Tile) {
  if (t.kind === "key") return t.color![0];
  if (t.kind !== "door") return GLYPH[t.kind] ?? "?";
  const lock = specialLock(t);
  return lock ? LOCK_GLYPH[lock] : t.color![0].toUpperCase();
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
