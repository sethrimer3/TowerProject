import { TOWER_HEIGHT, TOWER_START_X, TOWER_WIDTH } from "../config.ts";
import { point, type Tile } from "../entities.ts";
import type { Gate, ShortcutRequest, StrategicGraph, StrategicNode } from "./types.ts";
import { area, inRect, minSide, centre, type Rect, type XY } from "./grid.ts";
import { Furnisher, gateTile, type Dropped, type Placement } from "./furnisher.ts";

/** Layer B: express a StrategicGraph on the 17x17 grid.
 *
 * The interior is tiled edge-to-edge by rectangular chambers separated by
 * one-tile walls (a guillotine partition with exactly one chamber per
 * region), so there are no corridors at all: every connection is a single
 * doorway tile in a shared wall, and that tile *is* the gate — an enemy, a
 * lock, or an open gap. A backtracking search assigns regions to chambers so
 * that every graph edge becomes a pair of neighbouring chambers, the main
 * route moves away from the entrance, and the stairs chamber reaches the
 * outer wall. Chamber contents are then arranged by furnisher.ts. */

const INTERIOR: Rect = { x1: 1, y1: 1, x2: TOWER_WIDTH - 2, y2: TOWER_HEIGHT - 2 };
/** First tile inside the tower, directly below the entrance at (START_X, 0). */
export const ENTRY: XY = [TOWER_START_X, 1];
const MIN_SIDE = 2;

export const EMBED_TUNING = {
  /** Preferred chamber area per footprint. */
  idealArea: { pocket: 6, room: 12, hall: 20 },
  /** Partition attempts per graph before giving up on it. */
  partitionAttempts: 40,
  /** Valid embeddings compared per graph (best size fit wins). */
  candidates: 6,
  /** Backtracking steps per partition. */
  searchSteps: 3000,
  /** Chance a split peels off a thin two-tile pocket instead of halving. */
  pocketSplitChance: 0.3,
  /** Chambers are trimmed to about this many tiles per content item. */
  roomsPerItem: 2.4,
};

export type { Placement };
export type Doorway = { parent: number; child: number; x: number; y: number; shortcut: boolean };
export type Embedding = {
  /** The graph as actually furnished (niche fallbacks may move rewards). */
  graph: StrategicGraph;
  cells: Map<string, Tile>;
  rects: Rect[];
  /** node id → rect index */
  leafOf: number[];
  doorways: Doorway[];
  stairs: XY;
  placements: Placement[];
  dropped: Dropped;
  shortcutsPlaced: number;
};

const distFromEntrance = (r: Rect) => {
  const [cx, cy] = centre(r);
  return Math.abs(cx - TOWER_START_X) + cy;
};
const touchesExitWall = (r: Rect) => r.x1 === INTERIOR.x1 || r.x2 === INTERIOR.x2 || r.y2 === INTERIOR.y2;

// ---------------------------------------------------------------- partition

function splitRect(r: Rect, vertical: boolean, rng: () => number): [Rect, Rect] | null {
  const len = vertical ? r.x2 - r.x1 + 1 : r.y2 - r.y1 + 1;
  if (len < MIN_SIDE * 2 + 1) return null;
  const start = vertical ? r.x1 : r.y1;
  // Never wall off the tile beneath the entrance.
  const blocksEntry = (wall: number) => vertical && wall === ENTRY[0] && r.y1 <= ENTRY[1];
  const a = splitOffsets(len, rng).find((a) => !blocksEntry(start + a));
  if (a === undefined) return null;
  const wall = start + a;
  return vertical
    ? [{ ...r, x2: wall - 1 }, { ...r, x1: wall + 1 }]
    : [{ ...r, y2: wall - 1 }, { ...r, y1: wall + 1 }];
}

/** Where a split of a side `len` long may put its wall, best first:
 * sometimes a thin pocket at one end, then a soft bias towards balanced
 * halves (two uniforms), then every other offset. */
function splitOffsets(len: number, rng: () => number) {
  const lo = MIN_SIDE, hi = len - 1 - MIN_SIDE;
  const options: number[] = [];
  if (rng() < EMBED_TUNING.pocketSplitChance && len >= 7) options.push(rng() < 0.5 ? lo : hi);
  options.push(Math.round(lo + ((rng() + rng()) / 2) * (hi - lo)));
  for (let a = lo; a <= hi; a++) options.push(a);
  return options;
}

function partition(n: number, rng: () => number): Rect[] | null {
  const leaves: Rect[] = [{ ...INTERIOR }];
  while (leaves.length < n) {
    const weights = leaves.map((r) => {
      const w = r.x2 - r.x1 + 1, h = r.y2 - r.y1 + 1;
      return Math.max(w, h) >= MIN_SIDE * 2 + 1 ? area(r) ** 1.6 : 0;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (!total) return null;
    let roll = rng() * total, idx = 0;
    while ((roll -= weights[idx]) >= 0) idx++;
    const r = leaves[idx];
    const w = r.x2 - r.x1 + 1, h = r.y2 - r.y1 + 1;
    const vertical = w > h * 1.25 ? true : h > w * 1.25 ? false : rng() < 0.5;
    const parts = splitRect(r, vertical, rng) ?? splitRect(r, !vertical, rng);
    if (!parts) return null;
    leaves.splice(idx, 1, ...parts);
  }
  return leaves;
}

type Candidate = { x: number; y: number; a: number; b: number; inA: XY; inB: XY };

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Every wall tile that could become a doorway, by the pair of chambers it
 * joins; `between(a, b)` lists them oriented from chamber a to b. */
function doorwayCandidates(rects: Rect[]) {
  const grid = chamberGrid(rects);
  const pairs = new Map<string, Candidate[]>();
  for (const c of wallGaps(grid)) {
    const k = pairKey(c.a, c.b);
    if (!pairs.has(k)) pairs.set(k, []);
    pairs.get(k)!.push(c);
  }
  const between = (a: number, b: number) =>
    (pairs.get(pairKey(a, b)) ?? []).map((c) =>
      c.a === a ? c : { ...c, a: c.b, b: c.a, inA: c.inB, inB: c.inA });
  const neighbours = rects.map((_, i) =>
    rects.map((_, j) => j).filter((j) => j !== i && between(i, j).length > 0));
  return { grid, between, neighbours };
}

/** The chamber index of every tile, or -1 for wall. */
function chamberGrid(rects: Rect[]) {
  const grid: number[][] = [];
  for (let y = 0; y < TOWER_HEIGHT; y++) {
    grid.push([]);
    for (let x = 0; x < TOWER_WIDTH; x++) grid[y].push(rects.findIndex((r) => inRect(r, x, y)));
  }
  return grid;
}

/** Interior wall tiles with a different chamber on each side, left/right
 * then above/below, row by row. */
function wallGaps(grid: number[][]) {
  const out: Candidate[] = [];
  for (let y = INTERIOR.y1; y <= INTERIOR.y2; y++)
    for (let x = INTERIOR.x1; x <= INTERIOR.x2; x++) if (grid[y][x] === -1) out.push(...gapsAt(grid, x, y));
  return out;
}

/** The doorways wall tile (x, y) could be: across it left/right, then up/down. */
function gapsAt(grid: number[][], x: number, y: number) {
  const out: Candidate[] = [];
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const inA: XY = [x - dx, y - dy], inB: XY = [x + dx, y + dy];
    const a = grid[inA[1]]?.[inA[0]] ?? -1, b = grid[inB[1]]?.[inB[0]] ?? -1;
    if (a >= 0 && b >= 0 && a !== b) out.push({ x, y, a, b, inA, inB });
  }
  return out;
}

// ---------------------------------------------------------------- embedding

function need(node: StrategicNode) {
  return 1 + node.rewards.length + node.guarded.length * 2 + (node.ringGuard ? 3 : 0) +
    node.children.length + (node.purpose === "stairs" ? 1 : 0);
}

/** Main route first (so it claims the spine), then branches by tree depth. */
function embedOrder(graph: StrategicGraph): number[] {
  const depthOf = (n: StrategicNode) => {
    let d = 0;
    for (let p = n.parent; p !== null; p = graph.nodes[p].parent) d++;
    return d;
  };
  const main = graph.nodes.filter((n) => n.route === "main").map((n) => n.id);
  const rest = graph.nodes.filter((n) => n.route !== "main")
    .sort((a, b) => depthOf(a) - depthOf(b) || a.id - b.id).map((n) => n.id);
  return [...main, ...rest];
}

/** The start hall is the first thing the player sees: never a sliver. */
function startHallFits(r: Rect | undefined, start: StrategicNode) {
  return !!r && area(r) >= need(start) && minSide(r) >= 3;
}

function assign(graph: StrategicGraph, rects: Rect[], neighbours: number[][], rng: () => number): number[] | null {
  const order = embedOrder(graph);
  const leafOf: number[] = graph.nodes.map(() => -1);
  const used = new Set<number>();
  const startLeaf = rects.findIndex((r) => inRect(r, ...ENTRY));
  if (!startHallFits(rects[startLeaf], graph.nodes[0])) return null;
  let steps = 0;
  const jitter = graph.nodes.map(() => rects.map(() => rng() * 4));

  const score = (node: StrategicNode, leaf: number) => {
    const r = rects[leaf];
    let s = -Math.abs(area(r) - EMBED_TUNING.idealArea[node.footprint]) * 0.35;
    // Hubs are chambers, not corridors.
    if (node.footprint === "hall" && minSide(r) < 3) s -= 8;
    if (node.route === "main") {
      // The main route should travel away from the entrance.
      s += (distFromEntrance(r) - distFromEntrance(rects[leafOf[node.parent!]])) * 0.8;
      if (node.purpose === "stairs") s += distFromEntrance(r) * 0.6;
    }
    return s + jitter[node.id][leaf];
  };
  const fits = (node: StrategicNode, leaf: number) => {
    const r = rects[leaf];
    if (area(r) < need(node) + (node.footprint === "hall" ? 2 : 0)) return false;
    if (node.purpose === "stairs" && !touchesExitWall(r)) return false;
    // Enough free neighbours left for this region's own children.
    return neighbours[leaf].filter((j) => !used.has(j)).length >= node.children.length;
  };

  const place = (i: number): boolean => {
    if (i === order.length) return true;
    if (++steps > EMBED_TUNING.searchSteps) return false;
    const node = graph.nodes[order[i]];
    const options = node.parent === null
      ? [startLeaf]
      : neighbours[leafOf[node.parent]].filter((j) => !used.has(j));
    const ranked = options.filter((j) => fits(node, j)).sort((a, b) => score(node, b) - score(node, a));
    for (const leaf of ranked) {
      leafOf[node.id] = leaf;
      used.add(leaf);
      if (place(i + 1)) return true;
      used.delete(leaf);
      leafOf[node.id] = -1;
    }
    return false;
  };
  return place(0) ? leafOf : null;
}

// ---------------------------------------------------------------- driver

/** Attempts to embed `graph`. Returns null only when no partition could
 * host the graph; the caller then simplifies the graph and retries. */
export function embed(graph: StrategicGraph, rng: () => number): Embedding | null {
  // Several partitions usually host the graph; keep the one whose chamber
  // sizes best match what each region holds (less dead space to trim away).
  let best: { fit: number; result: Embedding } | null = null;
  let found = 0;
  for (let attempt = 0; attempt < EMBED_TUNING.partitionAttempts && found < EMBED_TUNING.candidates; attempt++) {
    const layout = tryLayout(graph, rng);
    if (!layout) continue;
    const fit = layoutFit(graph, layout);
    if (best && fit >= best.fit) { found++; continue; }
    const result = new FloorBuilder(graph, layout, rng).build();
    if (!result) continue;
    found++;
    best = { fit, result };
  }
  return best?.result ?? null;
}

/** Chambers, which chamber each region sits in, and the doorway candidates
 * between chambers. */
type Layout = { rects: Rect[]; leafOf: number[]; between: (a: number, b: number) => Candidate[] };

/** One random partition with the graph assigned to it, or null. */
function tryLayout(graph: StrategicGraph, rng: () => number): Layout | null {
  const rects = partition(graph.nodes.length, rng);
  if (!rects) return null;
  const { between, neighbours } = doorwayCandidates(rects);
  const leafOf = assign(graph, rects, neighbours, rng);
  return leafOf && { rects, leafOf, between };
}

/** How far chamber sizes are from what each region wants (lower is better);
 * a hub squeezed into a corridor costs extra. */
function layoutFit(graph: StrategicGraph, { rects, leafOf }: Layout) {
  return graph.nodes.reduce((s, n) => {
    const r = rects[leafOf[n.id]];
    return s + Math.abs(area(r) - targetArea(n)) + (n.footprint === "hall" && minSide(r) < 3 ? 10 : 0);
  }, 0);
}

function targetArea(node: StrategicNode) {
  return Math.max(EMBED_TUNING.idealArea[node.footprint], need(node) * EMBED_TUNING.roomsPerItem);
}

/** A trimmable side of a chamber: which edge, the length it shortens, and
 * whether a tile lies on that edge. */
type Edge = readonly ["x1" | "x2" | "y1" | "y2", number, (x: number, y: number) => boolean];

/** Turns an assignment of regions to chambers into tiles: a doorway for
 * every graph edge, the requested shortcuts, the stairs, chambers trimmed
 * to their contents, and finally the furnishing. */
class FloorBuilder {
  private graph: StrategicGraph;
  private cells = new Map<string, Tile>();
  private doorTiles: XY[] = [];
  private doorways: Doorway[] = [];
  private entryOf = new Map<number, { entry: XY; inward: XY }>();
  private exitsOf: Map<number, XY[]>;
  private rects: Rect[];
  private leafOf: number[];
  private between: Layout["between"];

  constructor(graph: StrategicGraph, { rects, leafOf, between }: Layout, private rng: () => number) {
    this.rects = rects;
    this.leafOf = leafOf;
    this.between = between;
    // Work on a copy: furnishing mutates reward lists (niche fallbacks).
    this.graph = structuredClone(graph);
    for (let y = 0; y < TOWER_HEIGHT; y++)
      for (let x = 0; x < TOWER_WIDTH; x++)
        this.cells.set(point(x, y), rects.some((r) => inRect(r, x, y)) ? { kind: "floor" } : { kind: "wall" });
    this.exitsOf = new Map(this.graph.nodes.map((n) => [n.id, []]));
    this.entryOf.set(0, { entry: ENTRY, inward: [0, 1] });
  }

  build(): Embedding | null {
    if (!this.connectRegions()) return null;
    const shortcutsPlaced = this.placeShortcuts();
    const stairs = this.placeStairs();
    if (!stairs) return null;
    this.trimChambers();
    const f = this.furnish();
    const { graph, cells, rects, leafOf, doorways } = this;
    return {
      graph, cells, rects, leafOf, doorways, stairs,
      placements: f.placements, dropped: f.dropped, shortcutsPlaced,
    };
  }

  /** A doorway from each region's parent into it, holding its gate. */
  private connectRegions() {
    for (const node of this.graph.nodes) {
      if (node.parent === null) continue;
      const c = this.chooseDoorway(node.parent, node.id);
      if (!c) return false;
      this.cut(c, node.gate);
      this.doorways.push({ parent: node.parent, child: node.id, x: c.x, y: c.y, shortcut: false });
      this.exitsOf.get(node.parent)!.push(c.inA);
      this.entryOf.set(node.id, { entry: c.inB, inward: [c.inB[0] - c.x, c.inB[1] - c.y] });
    }
    return true;
  }

  private cut(c: Candidate, gate: Gate) {
    this.doorTiles.push([c.x, c.y]);
    this.cells.set(point(c.x, c.y), gateTile(gate, this.graph.depth, this.rng));
  }

  /** Whether a doorway already lies within `d` steps of candidate `c`. */
  private nearDoor(c: { x: number; y: number }, d: number) {
    return this.doorTiles.some(([x, y]) => Math.abs(x - c.x) + Math.abs(y - c.y) <= d);
  }

  /** The doorway between regions a and b: centred doorways read as
   * authored, a little jitter keeps variety, and doorways keep apart. */
  private chooseDoorway(a: number, b: number) {
    const options = this.between(this.leafOf[a], this.leafOf[b]).filter((c) => !this.nearDoor(c, 1));
    if (!options.length) return null;
    const mid = options.reduce((s, c) => [s[0] + c.x / options.length, s[1] + c.y / options.length], [0, 0]);
    const score = (c: Candidate) =>
      Math.abs(c.x - mid[0]) + Math.abs(c.y - mid[1]) + this.rng() * 1.5 +
      (c.inA[0] === ENTRY[0] && c.inA[1] === ENTRY[1] ? 3 : 0) + (this.nearDoor(c, 2) ? 4 : 0);
    return options.sort((p, q) => score(p) - score(q))[0];
  }

  /** Shortcuts: realise each request between the requested regions, or any
   * other pair of main-route chambers that happen to touch. */
  private placeShortcuts() {
    let placed = 0;
    for (const req of this.graph.shortcuts) if (this.placeShortcut(req)) placed++;
    return placed;
  }

  private placeShortcut(req: ShortcutRequest) {
    const nodes = this.graph.nodes;
    for (const [u, v] of shortcutPairs(this.graph, req)) {
      if (nodes[v].parent === u || nodes[u].parent === v) continue;
      const c = this.chooseDoorway(u, v);
      if (!c) continue;
      this.cut(c, req.gate);
      this.doorways.push({ parent: u, child: v, x: c.x, y: c.y, shortcut: true });
      this.exitsOf.get(u)!.push(c.inA);
      this.exitsOf.get(v)!.push(c.inB);
      return true;
    }
    return false;
  }

  /** Stairs: in the outer wall, far from the entrance, centred on the
   * stairs chamber's outer side. */
  private placeStairs(): XY | null {
    const stairsNode = this.graph.nodes.find((n) => n.purpose === "stairs")!;
    const options = this.stairOptions(this.rects[this.leafOf[stairsNode.id]]);
    if (!options.length) return null;
    const stairs = options.sort((a, b) => b.s - a.s)[0];
    this.cells.set(point(...stairs.ring), { kind: "stairs" });
    this.exitsOf.get(stairsNode.id)!.push(stairs.inner);
    return stairs.ring;
  }

  /** Every outer-wall tile beside the chamber (west, east, then north),
   * with the tile inside it and a score. */
  private stairOptions(sr: Rect) {
    const out: { ring: XY; inner: XY; s: number }[] = [];
    const midX = (sr.x1 + sr.x2) / 2, midY = (sr.y1 + sr.y2) / 2;
    if (sr.x1 === INTERIOR.x1) for (let y = sr.y1; y <= sr.y2; y++) out.push(this.stairOption([0, y], [1, y], Math.abs(y - midY)));
    if (sr.x2 === INTERIOR.x2) for (let y = sr.y1; y <= sr.y2; y++) out.push(this.stairOption([TOWER_WIDTH - 1, y], [INTERIOR.x2, y], Math.abs(y - midY)));
    if (sr.y2 === INTERIOR.y2) for (let x = sr.x1; x <= sr.x2; x++) out.push(this.stairOption([x, TOWER_HEIGHT - 1], [x, INTERIOR.y2], Math.abs(x - midX)));
    return out;
  }

  private stairOption(ring: XY, inner: XY, offset: number) {
    const clash = this.nearDoor({ x: inner[0], y: inner[1] }, 1);
    return {
      ring, inner,
      s: Math.abs(ring[0] - TOWER_START_X) + ring[1] - offset * 0.7 - (clash ? 6 : 0) + this.rng() * 2,
    };
  }

  /** Trim oversized chambers down towards what their content needs, cutting
   * whole rows/columns that hold no doorway so walls stay straight. This is
   * what keeps a two-item pocket from becoming a 40-tile empty hall. */
  private trimChambers() {
    this.rects = this.rects.map((r) => ({ ...r }));
    for (const node of this.graph.nodes) {
      const r = this.rects[this.leafOf[node.id]];
      const anchors = [this.entryOf.get(node.id)!.entry, ...this.exitsOf.get(node.id)!];
      const target = targetArea(node);
      while (area(r) > target * 1.2) {
        const edge = this.edgeToTrim(r, anchors);
        if (!edge) break;
        this.wallOff(r, edge);
      }
    }
  }

  /** A side of `r` that holds no doorway and can still shrink: the longer
   * dimension first, so rooms tend towards squares. */
  private edgeToTrim(r: Rect, anchors: XY[]): Edge | undefined {
    const w = r.x2 - r.x1 + 1, h = r.y2 - r.y1 + 1;
    const sides = ([
      ["y1", h, (x: number, y: number) => y === r.y1],
      ["y2", h, (x: number, y: number) => y === r.y2],
      ["x1", w, (x: number, y: number) => x === r.x1],
      ["x2", w, (x: number, y: number) => x === r.x2],
    ] as const).filter(([, len, on]) => len > MIN_SIDE && !anchors.some(([x, y]) => on(x, y)));
    if (!sides.length) return undefined;
    return sides.sort((a, b) => b[1] - a[1] + (this.rng() - 0.5) * 0.1)[0];
  }

  private wallOff(r: Rect, [side, , on]: Edge) {
    for (let y = r.y1; y <= r.y2; y++)
      for (let x = r.x1; x <= r.x2; x++) if (on(x, y)) this.cells.set(point(x, y), { kind: "wall" });
    r[side] += side.endsWith("1") ? 1 : -1;
  }

  /** Furnish reward rooms before hubs so hub pillars never crowd a doorway. */
  private furnish() {
    const f = new Furnisher(this.cells, this.graph.depth, this.rng);
    const order = [...this.graph.nodes].sort((a, b) => (a.route === "main" ? 1 : 0) - (b.route === "main" ? 1 : 0));
    for (const node of order) {
      const { entry, inward } = this.entryOf.get(node.id)!;
      f.furnish({ node, rect: this.rects[this.leafOf[node.id]], entry, inward, exits: this.exitsOf.get(node.id)! });
    }
    return f;
  }
}

/** The requested shortcut first, then every pair of main-route regions. */
function shortcutPairs(graph: StrategicGraph, req: ShortcutRequest) {
  const main = graph.nodes.filter((n) => n.route === "main");
  const pairs: [number, number][] = [[req.from, req.to]];
  for (const u of main) for (const v of main) if (u.id < v.id) pairs.push([u.id, v.id]);
  return pairs;
}
