import { TOWER_HEIGHT, TOWER_START_X, TOWER_WIDTH } from "../config.ts";
import { point, type Tile } from "../entities.ts";
import type { Fork, Gate, ShortcutRequest, StrategicGraph, StrategicNode } from "./types.ts";
import { area, inRect, minSide, centre, type Rect, type XY } from "./grid.ts";
import { Furnisher, gateTile, laneTile, type Dropped, type Placement } from "./furnisher.ts";
import { forkDepth } from "./forks.ts";
import { QUOTA_DOORS, forkCredit, owesDoor, towerKeyRatio, type QuotaDoor } from "../key-schedule.ts";
import type { KeyColor } from "../config.ts";
import { runsWith } from "./door-quota.ts";
import { lockColors } from "./resource-planner.ts";
import { keyedFloor } from "./patterns.ts";
import { random } from "../random.ts";

/** Layer B: express a StrategicGraph on the 17x17 grid.
 *
 * The interior is tiled edge-to-edge by rectangular chambers separated by
 * one-tile walls (a guillotine partition with exactly one chamber per
 * region), so there are no corridors at all: every connection is a single
 * doorway tile in a shared wall, and that tile *is* the gate — an enemy, a
 * lock, or an open gap. A backtracking search assigns regions to chambers so
 * that every graph edge becomes a pair of neighbouring chambers, the main
 * route moves away from the entrance, and the stairs chamber reaches the
 * outer wall. A forked connection is several such doorways side by side,
 * one per lane; a lane deeper than one tile runs through a band of rows
 * taken from one of the two chambers. Chamber contents are then arranged
 * by furnisher.ts. */

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
/** A connecting tile between two regions. A fork's lanes give one per lane
 * tile, numbered by `lane`. */
export type Doorway = { parent: number; child: number; x: number; y: number; shortcut: boolean; lane?: number };
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

/** The index of the smallest value (the first, on a tie). */
function lowest(values: number[]) {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] < values[best]) best = i;
  return best;
}

function partition(n: number, rng: () => number): Rect[] | null {
  const leaves: Rect[] = [{ ...INTERIOR }];
  while (leaves.length < n) {
    const weights = leaves.map((r) => {
      const w = r.x2 - r.x1 + 1, h = r.y2 - r.y1 + 1;
      // area^1.5 (sqrt is exact in every engine; ** is not).
      return Math.max(w, h) >= MIN_SIDE * 2 + 1 ? area(r) * Math.sqrt(area(r)) : 0;
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
    rects.map((_, j) => j).filter((j) => j !== i && pairs.has(pairKey(i, j))));
  return { grid, between, neighbours };
}

/** The chamber index of every tile, or -1 for wall. */
function chamberGrid(rects: Rect[]) {
  const grid: number[][] = Array.from({ length: TOWER_HEIGHT }, () => new Array<number>(TOWER_WIDTH).fill(-1));
  // Last to first, so where chambers overlap the first holds the tile.
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    for (let y = Math.max(0, r.y1); y <= Math.min(TOWER_HEIGHT - 1, r.y2); y++)
      for (let x = Math.max(0, r.x1); x <= Math.min(TOWER_WIDTH - 1, r.x2); x++) grid[y][x] = i;
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

function assign(graph: StrategicGraph, rects: Rect[], { neighbours, between }: Pick<ReturnType<typeof doorwayCandidates>, "neighbours" | "between">, rng: () => number): number[] | null {
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
    // A fork wants a shared wall long enough for its lanes side by side.
    if (node.forks && between(leafOf[node.parent!], leaf).length >= node.forks[0].lanes.length * 2 - 1) s += 4;
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
    const fitting = options.filter((j) => fits(node, j));
    // Scored once each, not in the comparator; a lone option (the start
    // hall's) needs no score.
    const scores = fitting.length > 1 ? new Map(fitting.map((j) => [j, score(node, j)])) : null;
    const ranked = scores ? fitting.sort((a, b) => scores.get(b)! - scores.get(a)!) : fitting;
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
  const candidates = doorwayCandidates(rects);
  const leafOf = assign(graph, rects, candidates, rng);
  const { between } = candidates;
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
/** `p` moved `k` tiles along `u`. */
const step = ([x, y]: XY, u: XY, k: number): XY => [x + u[0] * k, y + u[1] * k];

/** `r` with `rows` rows taken off the side facing `side`. */
function shrink(r: Rect, side: XY, rows: number): Rect {
  const rect = { ...r };
  if (side[0] === 1) rect.x2 -= rows;
  else if (side[0] === -1) rect.x1 += rows;
  else if (side[1] === 1) rect.y2 -= rows;
  else rect.y1 += rows;
  return rect;
}

/** Whether `donor`'s chamber, shrunk to `rect`, still holds what it must:
 * a hall a little more room, and the stairs' chamber its exit wall. */
function keepsRoom(donor: StrategicNode, rect: Rect) {
  const hall = donor.footprint === "hall";
  if (rect.x2 < rect.x1 || rect.y2 < rect.y1) return false;
  if (minSide(rect) < (hall ? 3 : MIN_SIDE) || area(rect) < need(donor) + (hall ? 2 : 0)) return false;
  return donor.purpose !== "stairs" || touchesExitWall(rect);
}

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
  /** Each door run's region and doorway, laid once the chambers are furnished. */
  private runs: { node: StrategicNode; c: Candidate }[] = [];
  /** Settling's own stream, seeded by one draw, so the rest of the layout
   * draws the same however many settling takes (the key ratio, and so the
   * draws, differ by tower). */
  private settling: () => number = () => 0;

  constructor(graph: StrategicGraph, { rects, leafOf, between }: Layout, private rng: () => number) {
    this.rects = rects.map((r) => ({ ...r }));
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
    this.carveForks();
    this.settling = random(Math.floor(this.rng() * 0x100000000));
    this.settleQuota();
    this.settleKeys();
    if (!this.connectRegions()) return null;
    const shortcutsPlaced = this.placeShortcuts();
    const stairs = this.placeStairs();
    if (!stairs) return null;
    this.trimChambers();
    const f = this.furnish();
    this.layRuns();
    const { graph, cells, rects, leafOf, doorways } = this;
    return {
      graph, cells, rects, leafOf, doorways, stairs,
      placements: f.placements, dropped: f.dropped, shortcutsPlaced,
    };
  }

  /** A doorway from each region's parent into it, holding its gate. */
  private connectRegions() {
    for (const node of this.graph.nodes) {
      if (node.parent === null || node.forks) continue;
      const c = this.chooseDoorway(node.parent, node.id);
      if (!c) return false;
      this.cut(c, node.gate);
      if (runOf(node.gate) > 1) this.runs.push({ node, c });
      this.doorways.push({ parent: node.parent, child: node.id, x: c.x, y: c.y, shortcut: false });
      this.exitsOf.get(node.parent)!.push(c.inA);
      this.entryOf.set(node.id, { entry: c.inB, inward: [c.inB[0] - c.x, c.inB[1] - c.y] });
    }
    return true;
  }

  private cut(c: Candidate, gate: Gate) {
    this.doorTiles.push([c.x, c.y]);
    this.cells.set(point(c.x, c.y), gateTile(gate, this.graph.depth, this.rng, this.graph.tower));
  }

  /** Whether a doorway already lies within `d` steps of candidate `c`. */
  private nearDoor(c: { x: number; y: number }, d: number) {
    return this.doorTiles.some(([x, y]) => Math.abs(x - c.x) + Math.abs(y - c.y) <= d);
  }

  /** The doorway between regions a and b: centred doorways read as
   * authored, a little jitter keeps variety, and doorways keep apart. */
  private chooseDoorway(a: number, b: number) {
    const options = this.doorwayOptions(a, b);
    if (!options.length) return null;
    const mid = options.reduce((s, c) => [s[0] + c.x / options.length, s[1] + c.y / options.length], [0, 0]);
    // Each option draws its jitter once, before comparing: how often a sort
    // compares is up to the engine, so a draw inside it would not replay.
    const score = options.map((c) =>
      Math.abs(c.x - mid[0]) + Math.abs(c.y - mid[1]) + this.rng() * 1.5 +
      (c.inA[0] === ENTRY[0] && c.inA[1] === ENTRY[1] ? 3 : 0) + (this.nearDoor(c, 2) ? 4 : 0));
    return options[lowest(score)];
  }

  /** Wall tiles that can still join regions a and b: both sides inside
   * their chambers as they now stand, and no doorway beside them. */
  private doorwayOptions(a: number, b: number) {
    const ra = this.rects[this.leafOf[a]], rb = this.rects[this.leafOf[b]];
    return this.between(this.leafOf[a], this.leafOf[b])
      .filter((c) => inRect(ra, ...c.inA) && inRect(rb, ...c.inB) && !this.nearDoor(c, 1));
  }

  // ---------------------------------------------------------------- door runs

  /** The door stage counted each quota fork as the door it falls back to.
   * One that fits counts 1/k of each door its lanes hold instead, as the
   * hero opens one lane of k (`forkCredit`): its door counts less, and any
   * extra doors in it more. Runs settle the difference, a door a time, a
   * fraction at its chance (`owesDoor`): a door owed lengthens a single
   * door or run of two of that door into a run, a door over shortens a
   * run. What is left moves the quota's `dropped` (owed; below 0, over). */
  private settleQuota() {
    const owed: Record<QuotaDoor, number> = { blue: 0, red: 0, heart: 0 };
    for (const n of this.graph.nodes) {
      if (!n.quotaFork || !n.forks) continue;
      const credit = forkCredit(n.forks[0].lanes);
      for (const d of QUOTA_DOORS) owed[d] += (d === n.quotaFork ? 100 : 0) - credit[d];
    }
    for (const d of QUOTA_DOORS) {
      while (owesDoor(owed[d], this.settling) && this.changeRun(d, 1)) owed[d] -= 100;
      while (owesDoor(-owed[d], this.settling) && this.changeRun(d, -1)) owed[d] += 100;
      const q = this.graph.doorQuota?.[d];
      if (q && owed[d]) q.dropped += owed[d] / 100;
    }
  }

  /** The key supply planned each forked region for its single gate, which
   * stands whenever the fork doesn't fit. One that fits asks instead for
   * 1/k of the keys of each of its lanes, as the hero opens one lane of k:
   * the difference, at the keys per lock its colour aims for
   * (`towerKeyRatio`), adds keys to the floor's rooms or takes them away, a
   * key a time, a fraction at its chance (`owesDoor`); a room left empty
   * holds a potion. Floors 2 to 5 keep their key behind every door. */
  private settleKeys() {
    const { depth } = this.graph, tower = this.graph.tower ?? 1;
    if (keyedFloor(depth)) return;
    const owed: Record<KeyColor, number> = { yellow: 0, blue: 0, red: 0 };
    for (const n of this.graph.nodes) {
      if (!n.forks || n.parent === null) continue;
      const ratio = (c: KeyColor) => towerKeyRatio(c, depth, tower, n.route === "main") / 10000;
      const lanes = n.forks[0].lanes;
      for (const step of lanes.flat())
        if (step.kind !== "reward") for (const c of lockColors({ ...n, gate: step })) owed[c] += ratio(c) / lanes.length;
      for (const c of lockColors(n)) owed[c] -= ratio(c);
    }
    const rooms = this.graph.nodes.filter((n) => n.parent !== null && n.purpose !== "stairs");
    for (const color of ["red", "blue", "yellow"] as KeyColor[]) {
      while (owesDoor(owed[color] * 100, this.settling) && rooms.length) {
        rooms[Math.floor(this.settling() * rooms.length)].rewards.push({ kind: "key", color });
        owed[color]--;
      }
      while (owesDoor(-owed[color] * 100, this.settling)) {
        const holding = rooms.filter((n) => n.rewards.some((r) => r.kind === "key" && r.color === color));
        if (!holding.length) break;
        const room = holding[Math.floor(this.settling() * holding.length)];
        const i = room.rewards.findIndex((r) => r.kind === "key" && r.color === color);
        if (room.rewards.length + room.guarded.length > 1) room.rewards.splice(i, 1);
        else room.rewards[i] = { kind: "potion" };
        owed[color]++;
      }
    }
  }

  /** Lengthens (`by` 1) a single door or run of two of `door` standing
   * alone, or shortens (`by` -1) a run of it, chosen at random; false when
   * the floor has none. */
  private changeRun(door: QuotaDoor, by: 1 | -1) {
    const options = this.graph.nodes.filter((n) => n.parent !== null && !n.forks &&
      (by > 0 ? runsWith(n.gate, door) : runOf(n.gate) > 1 && quotaKind(n.gate) === door));
    if (!options.length) return false;
    const node = options[Math.floor(this.settling() * options.length)], run = runOf(node.gate) + by;
    const gate = { ...node.gate } as Gate & { run?: number };
    if (run > 1) gate.run = run;
    else delete gate.run;
    node.gate = gate;
    return true;
  }

  /** Lays each door run's other doors once the chambers are furnished: the
   * tile just inside the region it opens, then (a run of three) the tile
   * just outside in the parent's chamber. The doorway is the only way
   * between them, so neither can be walked round; each must still be open
   * floor, keep its chamber in one piece and stand by no other doorway, the
   * entrance or the stairs. A door that finds no place shortens the run,
   * recorded as owed in the quota. */
  private layRuns() {
    for (const { node, c } of this.runs) {
      const run = runOf(node.gate), tile = gateTile(node.gate, this.graph.depth, this.settling, this.graph.tower);
      const spots: [XY, number][] = [[c.inB, node.id], [c.inA, node.parent!]];
      let laid = 1;
      for (const [p, region] of spots.slice(0, run - 1))
        if (this.runSpot(p, c, region)) {
          this.cells.set(point(...p), { ...tile });
          this.doorTiles.push(p);
          laid++;
        }
      const kind = quotaKind(node.gate), q = kind && this.graph.doorQuota?.[kind];
      if (q && laid < run) q.dropped += run - laid;
    }
  }

  /** Whether a run's door may stand on `p`, beside doorway `c`, in
   * `region`'s chamber. */
  private runSpot([x, y]: XY, c: Candidate, region: number) {
    if (this.cells.get(point(x, y))?.kind !== "floor" || (x === ENTRY[0] && y === ENTRY[1])) return false;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => this.cells.get(point(x + dx, y + dy))?.kind);
    if (near.some((k) => k === "stairs" || k === "stairsDown")) return false;
    if (this.doorTiles.some(([dx, dy]) => (dx !== c.x || dy !== c.y) && Math.abs(dx - x) + Math.abs(dy - y) <= 1)) return false;
    return this.staysWhole(this.rects[this.leafOf[region]], [x, y]);
  }

  /** Whether `rect`'s open tiles stay joined without `gone`. */
  private staysWhole(rect: Rect, gone: XY) {
    const open: string[] = [];
    for (let y = rect.y1; y <= rect.y2; y++)
      for (let x = rect.x1; x <= rect.x2; x++)
        if ((x !== gone[0] || y !== gone[1]) && this.cells.get(point(x, y))?.kind !== "wall") open.push(point(x, y));
    if (!open.length) return true;
    const seen = new Set([open[0]]), queue = [open[0]], inside = new Set(open);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i].split(",").map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = point(x + dx, y + dy);
        if (inside.has(k) && !seen.has(k)) { seen.add(k); queue.push(k); }
      }
    }
    return seen.size === open.length;
  }

  // ---------------------------------------------------------------- forks

  /** Each forked region's way in: the first of its forks that fits, else
   * none, and connectRegions cuts its single gate instead. */
  private carveForks() {
    for (const node of this.graph.nodes) {
      if (!node.forks) continue;
      const built = node.forks.find((fork) => this.carveFork(node, fork));
      if (built) node.forks = [built];
      else delete node.forks;
    }
  }

  /** Lays one fork's lanes between a region and its parent, or returns
   * false (changing nothing) when they don't fit. */
  private carveFork(node: StrategicNode, fork: Fork): boolean {
    const plan = this.forkPlan(node, fork);
    if (!plan) return false;
    const { u, band, walls } = plan, parent = node.parent!;
    if (band) {
      for (const p of band.cells) this.cells.set(point(...p), { kind: "wall" });
      this.rects[this.leafOf[band.node]] = band.rect;
    }
    // A band taken from the parent's chamber starts the lanes back inside it.
    const first = band && band.node !== node.id ? -(plan.depth - 1) : 0;
    const ends = walls.map((w, lane) => this.layLane(node, fork, { lane, from: step([w.x, w.y], u, first), u, depth: plan.depth }));
    const middle = Math.floor(ends.length / 2);
    for (const e of ends) this.exitsOf.get(parent)!.push(e.out);
    this.entryOf.set(node.id, { entry: ends[middle].in, inward: u });
    ends.forEach((e, i) => i !== middle && this.exitsOf.get(node.id)!.push(e.in));
    return true;
  }

  /** Where a fork's lanes would go into `node`: the way from the parent's
   * chamber towards the child's (`u`), the band of rows a deeper fork runs
   * through, and a doorway tile for each lane; null when they don't fit. */
  private forkPlan(node: StrategicNode, fork: Fork) {
    const depth = forkDepth(fork), options = this.doorwayOptions(node.parent!, node.id);
    if (!options.length) return null;
    const u: XY = [options[0].inB[0] - options[0].x, options[0].inB[1] - options[0].y];
    const band = depth === 1 ? null : this.band(node, u, depth - 1);
    if (depth > 1 && !band) return null;
    const walls = this.laneSpots(options, fork.lanes.length);
    return walls ? { u, band, walls, depth } : null;
  }

  /** One lane's tiles, from the parent's side to the child's: its steps
   * (floor where it has none), each a doorway between the two regions.
   * Returns the tiles just outside either end. */
  private layLane(node: StrategicNode, fork: Fork, { lane, from, u, depth }: { lane: number; from: XY; u: XY; depth: number }) {
    const tiles = Array.from({ length: depth }, (_, k) => step(from, u, k));
    tiles.forEach((p, k) => {
      const laneStep = fork.lanes[lane][k];
      this.cells.set(point(...p), laneStep ? laneTile(laneStep, this.graph.depth, this.rng, this.graph.tower) : { kind: "floor" });
      this.doorTiles.push(p);
      this.doorways.push({ parent: node.parent!, child: node.id, x: p[0], y: p[1], shortcut: false, lane });
    });
    return { out: step(tiles[0], u, -1), in: step(tiles[tiles.length - 1], u, 1) };
  }

  /** `count` doorway tiles for side-by-side lanes, centred on the shared
   * wall and at least two apart so a wall stands between each pair. */
  private laneSpots(options: Candidate[], count: number): Candidate[] | null {
    const mid = options.reduce((s, c) => [s[0] + c.x / options.length, s[1] + c.y / options.length], [0, 0]);
    const ranked = options
      .map((c) => ({ c, s: Math.abs(c.x - mid[0]) + Math.abs(c.y - mid[1]) + this.rng() * 1.5 }))
      .sort((p, q) => p.s - q.s).map((o) => o.c);
    const picked: Candidate[] = [];
    for (const c of ranked)
      if (picked.length < count && picked.every((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) >= 2)) picked.push(c);
    return picked.length === count ? picked : null;
  }

  /** The rows a deep fork's lanes run through: taken from the child's
   * chamber if it can spare them, else the parent's, along the wall they
   * share. Null when neither chamber can. */
  private band(node: StrategicNode, u: XY, rows: number) {
    const child = this.bandFrom(node, [-u[0], -u[1]], rows, node.parent!);
    return child ?? this.bandFrom(this.graph.nodes[node.parent!], u, rows, node.id);
  }

  /** `rows` rows off the side of `donor`'s chamber facing `side`, or null
   * when the chamber would get too small, lose the entrance tile, crowd a
   * doorway, or be cut off from a region it still has to join other than
   * `across`, the region the lanes lead to. */
  private bandFrom(donor: StrategicNode, side: XY, rows: number, across: number) {
    const r = this.rects[this.leafOf[donor.id]], rect = shrink(r, side, rows);
    if (!keepsRoom(donor, rect)) return null;
    const cells: XY[] = [];
    for (let y = r.y1; y <= r.y2; y++)
      for (let x = r.x1; x <= r.x2; x++) if (!inRect(rect, x, y)) cells.push([x, y]);
    if (!this.canGive(cells) || !this.stillJoins(donor, rect, across)) return null;
    return { node: donor.id, rect, cells };
  }

  /** Whether a chamber can give up `cells`: none is the entrance tile or
   * beside a doorway. */
  private canGive(cells: XY[]) {
    return !cells.some(([x, y]) => (x === ENTRY[0] && y === ENTRY[1]) || this.nearDoor({ x, y }, 1));
  }

  /** Whether `donor`, shrunk to `rect`, can still get a doorway to each
   * region it joins that isn't joined to it yet. */
  private stillJoins(donor: StrategicNode, rect: Rect, across: number) {
    const joined = (a: number, b: number) =>
      this.doorways.some((d) => (d.parent === a && d.child === b) || (d.parent === b && d.child === a));
    const others = [...(donor.parent === null ? [] : [donor.parent]), ...donor.children]
      .filter((o) => o !== across && !joined(donor.id, o));
    return others.every((o) => this.between(this.leafOf[donor.id], this.leafOf[o]).some((c) =>
      inRect(rect, ...c.inA) && inRect(this.rects[this.leafOf[o]], ...c.inB)));
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
    // Longest side, jittered a little; drawn before comparing (see chooseDoorway).
    const shorter = sides.map(([, len]) => -len + (this.rng() - 0.5) * 0.1);
    return sides[lowest(shorter)];
  }

  private wallOff(r: Rect, [side, , on]: Edge) {
    for (let y = r.y1; y <= r.y2; y++)
      for (let x = r.x1; x <= r.x2; x++) if (on(x, y)) this.cells.set(point(x, y), { kind: "wall" });
    r[side] += side.endsWith("1") ? 1 : -1;
  }

  /** Furnish reward rooms before hubs so hub pillars never crowd a doorway. */
  private furnish() {
    const f = new Furnisher(this.cells, this.graph.depth, this.rng, this.graph.tower);
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

/** How many doors a gate's run holds (1 for a single gate). */
const runOf = (g: Gate) => (g.kind === "door" || g.kind === "wood" || g.kind === "heart" ? g.run ?? 1 : 1);
/** The quota door a run is made of, if any. */
const quotaKind = (g: Gate): QuotaDoor | null =>
  g.kind === "heart" ? "heart" : g.kind === "door" && (g.color === "blue" || g.color === "red") ? g.color : null;
