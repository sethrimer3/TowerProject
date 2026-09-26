import { point, type Point, type Tile } from '../entities.ts';
import type { Gate } from '../tower/types.ts';
import { choosePattern, FALSE_ASCENTS, type Pattern } from './patterns.ts';

/** Delve is one continuous lattice of chambers (COLUMNS wide, endless rows).
 * Every lattice cell belongs to exactly one AREA. Area ownership is decided
 * per column by an interlocking boundary, so an old area can send a tongue
 * several rows above the next milestone gate while the new area dips below
 * it elsewhere. Regions touch along that boundary but are never carved
 * together, except through the single one-way milestone gate: the boundary is
 * a graph cut, not a wall band or a Y threshold. */
export const DELVE_TUNING = {
  columns: 5, rowsPerArea: 18, pitch: 6,
  /** Rows an area boundary may wander from its nominal row per column. */
  boundaryWander: 3,
  /** Rows by which the old-area tongue climbs / the new area dips. */
  tongue: 5,
  loopChance: 0.12, shaftBreakChance: 0.4, sidewaysBias: 2.2, straightPenalty: 0.35, chamberChance: 0.46, wideChamberChance: 0.18,
  /** Graph/physical distance (tiles) over which two area themes blend. */
  themeBand: 26,
  junctionKeyChance: 0.32, cacheAreas: 16,
};
const { columns: COLS, rowsPerArea: ROWS, pitch: PITCH } = DELVE_TUNING;
/** Nominal world-Y span of one area; only used to find candidate areas. */
export const AREA_SPAN = ROWS * PITCH;
const REACH = (DELVE_TUNING.tongue + 1) * PITCH + 4;

export function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function rngFor(seed: number) { let n = 0; return () => hash(n++, 91, seed); }

/** A small per-column vertical warp: each lattice column's 6-tile slab is
 * shifted 0..3 tiles, neighbouring slabs by at most one. Horizontal corridors
 * therefore take a single one-tile step between columns (staying 1 wide and
 * 4-connected) and rows meander without any global tilt. */
const warps = new Map<number, number[]>();
export function warp(x: number, seed: number) {
  let w = warps.get(seed);
  if (!w) {
    w = [Math.floor(hash(0, 1, seed) * 4)];
    for (let i = 1; i < 6; i++) w.push(Math.max(0, Math.min(3, w[i - 1] + Math.floor(hash(i, 2, seed) * 3) - 1)));
    warps.set(seed, w); if (warps.size > 8) warps.delete(warps.keys().next().value!);
  }
  return w[Math.max(0, Math.min(5, Math.floor(x / 6)))];
}
const colX = (col: number) => 3 + col * PITCH;
const rowY = (row: number) => 3 + row * PITCH;
export const physical = (x: number, y: number, seed: number): Point => ({ x, y: y + warp(x, seed) });
export const cellPoint = (col: number, row: number, seed: number) => physical(colX(col), rowY(row), seed);

export type Boundary = { rows: number[]; gateCol: number; tongueCol: number; dipCol: number };
const boundaries = new Map<string, Boundary>();
/** Boundary `b` (b >= 1) separates area b-1 below from area b above. */
export function boundary(seed: number, b: number): Boundary {
  const key = `${seed}:${b}`, old = boundaries.get(key); if (old) return old;
  const h = (i: number) => hash(b, 300 + i, seed);
  const cols = [...Array(COLS).keys()];
  const take = (i: number) => cols.splice(Math.floor(h(i) * cols.length), 1)[0];
  // The gate avoids the outer columns so false branches can surround it.
  const gateCol = 1 + Math.floor(h(0) * (COLS - 2)); cols.splice(cols.indexOf(gateCol), 1);
  const tongueCol = take(1), dipCol = take(2);
  const w = DELVE_TUNING.boundaryWander, t = DELVE_TUNING.tongue;
  const rows = Array.from({ length: COLS }, (_, c) => {
    const offset = c === tongueCol ? t : c === dipCol ? -t : c === gateCol ? Math.round((h(10 + c) - 0.5) * 2) : Math.round((h(10 + c) * 2 - 1) * w);
    return b * ROWS + offset;
  });
  const out = { rows, gateCol, tongueCol, dipCol };
  boundaries.set(key, out); if (boundaries.size > 64) boundaries.delete(boundaries.keys().next().value!);
  return out;
}
const lower = (seed: number, area: number, col: number) => area ? boundary(seed, area).rows[col] : 0;
const upper = (seed: number, area: number, col: number) => boundary(seed, area + 1).rows[col];
/** Which area owns lattice cell (col,row). */
export function ownerOf(seed: number, col: number, row: number) {
  if (row < 0) return 0;
  let a = Math.max(0, Math.floor(row / ROWS));
  while (a > 0 && row < lower(seed, a, col)) a--;
  while (row >= upper(seed, a, col)) a++;
  return a;
}
/** Nearest lattice cell to a world tile (walls included). */
export function cellAt(seed: number, x: number, y: number) {
  const col = Math.max(0, Math.min(COLS - 1, Math.round((x - 3) / PITCH)));
  const row = Math.max(0, Math.round((y - warp(x, seed) - 3) / PITCH));
  return { col, row };
}
export function ownerAt(seed: number, x: number, y: number) { const c = cellAt(seed, x, y); return ownerOf(seed, c.col, c.row); }

export function entrance(seed: number, area: number): Point {
  if (!area) return { x: colX(2), y: 0 };
  const b = boundary(seed, area); return cellPoint(b.gateCol, b.rows[b.gateCol], seed);
}

export type Node = Point & { id: number; col: number; row: number; links: number[]; depth: number; influence: number; pattern?: Pattern; main: boolean; falseAscent: boolean };
export type Edge = { a: number; b: number; path: Point[]; shortcut: boolean };
export type Region = {
  area: number; nodes: Node[]; edges: Edge[]; cells: Map<string, Tile>; metadata: Map<string, { depth: number; area: number }>;
  gate: Point; entry: Point; exit: number; start: number; minY: number; maxY: number;
  nodeAt: (col: number, row: number) => Node | undefined;
};
const cache = new Map<string, Region>();

/** Builds (or recalls) one area of the labyrinth. The stages run in a fixed
 * order and share one random stream, so reordering them or their draws
 * changes every map after it. */
export function region(seed: number, area: number): Region {
  area = Math.max(0, Math.floor(area));
  const key = `${seed}:${area}`;
  const old = cache.get(key); if (old) return old;
  const lab = lattice(seed, area);
  growTree(lab);
  addLoops(lab);
  for (const e of lab.edges) e.path = corridor(seed, unwarped(lab.nodes[e.a]), unwarped(lab.nodes[e.b]));
  measure(lab);
  assignPatterns(lab);
  const board = carve(lab);
  placePatternCosts(lab, board);
  // Character power remains necessary even when every optional tax is avoided.
  board.put({ x: board.gate.x, y: board.gate.y - 2 }, gateTile(lab, { kind: 'enemy', strength: 'normal' }, lab.nodes[lab.exit]), area * 100 + 99);
  placeJunctionKeys(lab, board);
  const { nodes, edges, exit, start, nodeAt } = lab, { cells, metadata, gate } = board;
  const result: Region = { area, nodes, edges, cells, metadata, gate, entry: entrance(seed, area), exit, start, ...rowSpan(cells), nodeAt };
  cache.set(key, result);
  if (cache.size > DELVE_TUNING.cacheAreas) cache.delete(cache.keys().next().value!);
  return result;
}

/** One area's lattice graph while it is being built. */
type Lab = {
  seed: number; area: number; rng: () => number;
  nodes: Node[]; edges: Edge[];
  nodeAt: (col: number, row: number) => Node | undefined;
  /** Ids of the area's own cells beside `id`. */
  neighbors: (id: number) => number[];
  /** The entrance cell and the cell below the next milestone gate. */
  start: number; exit: number;
  /** The boundary above this area. */
  up: Boundary;
};

/** The area's cells, unlinked, with its entrance and exit cells. */
function lattice(seed: number, area: number): Lab {
  const nodes: Node[] = [], index = new Map<string, number>();
  for (let col = 0; col < COLS; col++) for (let row = lower(seed, area, col); row < upper(seed, area, col); row++) {
    const id = nodes.length; index.set(`${col},${row}`, id);
    nodes.push({ id, col, row, ...cellPoint(col, row, seed), links: [], depth: area * 100, influence: area, main: false, falseAscent: false });
  }
  const idAt = (col: number, row: number) => index.get(`${col},${row}`);
  const nodeAt = (col: number, row: number) => { const id = idAt(col, row); return id === undefined ? undefined : nodes[id]; };
  const neighbors = (id: number) => { const n = nodes[id]; return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => idAt(n.col + dc, n.row + dr)).filter((v): v is number => v !== undefined); };
  const up = boundary(seed, area + 1);
  const entryCol = area ? boundary(seed, area).gateCol : 2;
  return {
    seed, area, rng: rngFor(seed ^ Math.imul(area + 1, 0x45d9f3b)), nodes, edges: [], nodeAt, neighbors, up,
    start: idAt(entryCol, lower(seed, area, entryCol))!,
    exit: idAt(up.gateCol, up.rows[up.gateCol] - 1)!,
  };
}

function connect({ nodes, edges }: Lab, a: number, b: number, shortcut = false) {
  nodes[a].links.push(b); nodes[b].links.push(a); edges.push({ a, b, path: [], shortcut });
}

/** Growing-tree labyrinth: mostly depth-first (long winding passages) with
 * occasional random-frontier growth (bushy side networks). */
function growTree(lab: Lab) {
  const { rng, nodes } = lab;
  const seen = new Set([lab.start]), stack = [lab.start];
  while (stack.length) {
    const slot = rng() < 0.72 ? stack.length - 1 : Math.floor(rng() * stack.length);
    const a = stack[slot], choices = lab.neighbors(a).filter(b => !seen.has(b));
    if (!choices.length) { stack.splice(slot, 1); continue; }
    const b = choices[pickWeighted(rng, choices.map(b => growthWeight(nodes, a, b)))];
    connect(lab, a, b); seen.add(b); stack.push(b);
  }
}

/** Turns are favoured over straight continuation, and sideways steps over
 * vertical ones, so a five-column lattice still winds instead of collapsing
 * into long straight shafts. */
function growthWeight(nodes: Node[], from: number, to: number) {
  const a = nodes[from], via = a.links.length ? nodes[a.links[0]] : undefined;
  const vertical = nodes[to].col === a.col, straight = via && (vertical ? via.col === a.col : via.row === a.row);
  return (vertical ? 1 : DELVE_TUNING.sidewaysBias) * (straight ? DELVE_TUNING.straightPenalty : 1);
}

function pickWeighted(rng: () => number, weights: number[]) {
  let roll = rng() * weights.reduce((s, w) => s + w, 0), pick = 0;
  while ((roll -= weights[pick]) > 0 && pick < weights.length - 1) pick++;
  return pick;
}

/** Loops join existing passages; terminal pockets stay terminal. A plain
 * shaft cell (two vertical links) is much likelier to gain a side opening,
 * which breaks long straight shafts into ladders and loops. */
function addLoops(lab: Lab) {
  for (const n of lab.nodes) for (const b of lab.neighbors(n.id)) {
    if (b < n.id || n.links.includes(b)) continue;
    const chance = loopChance(lab.nodes, n, lab.nodes[b]);
    if (chance && lab.rng() < chance) connect(lab, n.id, b, true);
  }
}

/** How likely a new opening between two unlinked neighbours is (0: never). */
function loopChance(nodes: Node[], a: Node, b: Node) {
  const shaft = (n: Node) => n.links.length === 2 && n.links.every(l => nodes[l].col === n.col);
  const besideShaft = b.row === a.row && (shaft(a) || shaft(b));
  if (besideShaft) return DELVE_TUNING.shaftBreakChance;
  const junctions = a.links.length > 1 && b.links.length > 1;
  return junctions ? DELVE_TUNING.loopChance : 0;
}

/** A cell's lattice point before the column warp. */
const unwarped = (n: Node): Point => ({ x: colX(n.col), y: rowY(n.row) });

const samePoint = (a: Point | undefined, b: Point) => a?.x === b.x && a?.y === b.y;

/** The warped tiles of a straight lattice corridor, horizontal leg first. */
function corridor(seed: number, from: Point, to: Point) {
  const out: Point[] = [], x2 = to.x, y2 = to.y; let { x, y } = from;
  const add = (p: Point) => { if (!samePoint(out.at(-1), p)) out.push(p); };
  add(physical(x, y, seed));
  while (x !== x2 || y !== y2) {
    if (x !== x2) { const prev = physical(x, y, seed); x += Math.sign(x2 - x); add({ x, y: prev.y }); add(physical(x, y, seed)); }
    else { y += Math.sign(y2 - y); add(physical(x, y, seed)); }
  }
  return out;
}

/** Sets each cell's progression depth, main-route flag and theme influence. */
function measure(lab: Lab) {
  const { nodes, area, start, exit } = lab;
  const dist = tileDistances(lab), routeLength = Math.max(1, dist.get(exit)!);
  const fromStart = hops(nodes, start), fromExit = hops(nodes, exit);
  let at = exit; nodes[at].main = true;
  while (at !== start) { at = nodes[at].links.find(id => fromStart.get(id)! === fromStart.get(at)! - 1)!; nodes[at].main = true; }
  const nextRow = Math.min(...lab.up.rows);
  // How near a cell is to a gate: along the labyrinth or through the rock.
  const near = (n: Node, hopsTo: Map<number, number>, gate: Node) => Math.min(hopsTo.get(n.id)! * PITCH, Math.hypot(n.x - gate.x, n.y - gate.y) * 1.2);
  for (const n of nodes) {
    n.depth = area * 100 + Math.min(99, Math.floor(99 * dist.get(n.id)! / routeLength));
    n.influence = influence(lab, n, { exitNear: near(n, fromExit, nodes[exit]), entryNear: near(n, fromStart, nodes[start]), nextRow });
  }
}

/** Official progression distance: corridor tiles walked from this area's
 * entrance, which `measure` normalises so the milestone gate sits at 99. */
function tileDistances({ edges, start }: Lab) {
  const dist = new Map<number, number>([[start, 0]]), pending = new Set([start]);
  while (pending.size) {
    const at = nearest(pending, dist);
    pending.delete(at);
    for (const e of edges) {
      const o = e.a === at ? e.b : e.b === at ? e.a : -1;
      const d = dist.get(at)! + e.path.length - 1;
      if (o >= 0 && d < (dist.get(o) ?? Infinity)) { dist.set(o, d); pending.add(o); }
    }
  }
  return dist;
}

/** The first pending id at the smallest distance. */
function nearest(pending: Set<number>, dist: Map<number, number>) {
  let at = -1;
  for (const id of pending) if (at < 0 || dist.get(id)! < dist.get(at)!) at = id;
  return at;
}

function hops(nodes: Node[], from: number) {
  const d = new Map([[from, 0]]), q = [from];
  for (let i = 0; i < q.length; i++) for (const id of nodes[q[i]].links) if (!d.has(id)) { d.set(id, d.get(q[i])! + 1); q.push(id); }
  return d;
}

/** Theme influence: graph AND physical proximity to either gate, plus a lift
 * for cells climbing above the next boundary's lowest row, plus a per-room
 * bias. A false branch climbing toward the next area therefore starts to look
 * like it without owning any of its progression. */
function influence({ area, seed }: Lab, n: Node, { exitNear, entryNear, nextRow }: { exitNear: number; entryNear: number; nextRow: number }) {
  const climb = Math.max(0, Math.min(1, (n.row - nextRow + 2) / (DELVE_TUNING.tongue + 2)));
  const bias = (hash(n.col, n.row, seed ^ 0x2b1d) - 0.5) * 0.16;
  const future = Math.max(1 - exitNear / DELVE_TUNING.themeBand, climb * 0.9);
  const past = area ? 1 - entryNear / DELVE_TUNING.themeBand : 0;
  return Math.max(area - 0.49, Math.min(area + 0.49, area + 0.5 * Math.max(0, future) - 0.5 * Math.max(0, past) + bias));
}

/** Gives every pocket a pattern. The highest cell of the old-area tongue is
 * always a pocket (its sideways neighbours belong to the next area), i.e. a
 * genuine false ascent. */
function assignPatterns(lab: Lab) {
  const { nodes, up, rng } = lab;
  const tongueTop = lab.nodeAt(up.tongueCol, up.rows[up.tongueCol] - 1);
  if (tongueTop && isPocket(lab, tongueTop)) {
    tongueTop.falseAscent = true; tongueTop.pattern = FALSE_ASCENTS[Math.floor(rng() * FALSE_ASCENTS.length)];
  }
  for (const n of nodes) if (!n.pattern && isPocket(lab, n)) n.pattern = choosePattern(rng, lab.area, branchLength(nodes, n.id));
}

/** A dead end other than the area's entrance or exit. */
const isPocket = ({ start, exit }: Lab, n: Node) => n.links.length === 1 && n.id !== start && n.id !== exit;

/** The carved tiles of one area and where its chambers are. */
type Board = {
  cells: Map<string, Tile>; metadata: Region['metadata']; roomTiles: Set<string>; gate: Point;
  put: (p: Point, tile: Tile, depth: number) => void;
};

/** Carves chambers, corridors, and the milestone gate out of solid rock. */
function carve(lab: Lab): Board {
  const { nodes, area } = lab;
  const cells = new Map<string, Tile>(), metadata: Region['metadata'] = new Map(), roomTiles = new Set<string>();
  const put = (p: Point, tile: Tile, depth: number) => { cells.set(point(p.x, p.y), tile); metadata.set(point(p.x, p.y), { depth, area }); };
  const dig = (p: Point, depth: number) => { if (!cells.has(point(p.x, p.y))) put(p, { kind: 'floor' }, depth); };
  for (const n of nodes) {
    const { room, tiles } = chamber(lab, n);
    for (const p of tiles) { dig(p, n.depth); if (room) roomTiles.add(point(p.x, p.y)); }
  }
  for (const e of lab.edges) {
    const a = nodes[e.a], b = nodes[e.b], len = e.path.length - 1;
    e.path.forEach((p, i) => dig(p, Math.round(a.depth + (b.depth - a.depth) * i / Math.max(1, len))));
  }
  const gate = carveGate(lab, put);
  if (!area) for (let y = 0; y < nodes[lab.start].y; y++) dig({ x: colX(2), y }, 0);
  return { cells, metadata, roomTiles, gate, put };
}

/** The single inter-area connection: exit cell -> one-way gate -> next entry. */
function carveGate({ nodes, exit, area }: Lab, put: Board['put']): Point {
  const end = nodes[exit], gate = { x: end.x, y: end.y + 3 };
  for (let y = end.y + 1; y < end.y + PITCH; y++) put({ x: end.x, y }, { kind: 'floor' }, y >= gate.y ? (area + 1) * 100 : area * 100 + 99);
  put(gate, { kind: 'oneway' }, (area + 1) * 100);
  return gate;
}

/** The tiles cell `n` opens up. Pockets and pattern rooms are always rooms;
 * some junctions are wide halls. Rooms stay inside their lattice cell so walls
 * between neighbouring (possibly foreign-area) cells are never breached. */
function chamber({ rng, seed }: Lab, n: Node) {
  // Pattern pockets are never wide, so their throat always has room for two
  // consecutive costs; the last column never reaches the world edge.
  const room = !!n.pattern || rng() < DELVE_TUNING.chamberChance;
  const wide = room && widens(n, rng);
  const rx = wide ? 2 : room ? 1 : 0, ry = room ? 1 : 0, centre = unwarped(n), tiles: Point[] = [];
  for (let dy = -ry; dy <= ry; dy++) tiles.push(...corridor(seed, { x: centre.x - rx, y: centre.y + dy }, { x: centre.x + rx, y: centre.y + dy }));
  return { room, tiles };
}

/** Whether a room at `n` becomes a wide hall: never a pattern pocket or in
 * the last column. */
const widens = (n: Node, rng: () => number) => !n.pattern && n.col < COLS - 1 && rng() < DELVE_TUNING.wideChamberChance;

const ENEMY_NAMES =['Cinder slime', 'Bone sentinel', 'Dusk wing', 'Ash warden'];

/** The tile standing in for one pattern cost at cell `n`. */
function gateTile({ rng }: Lab, g: Gate, n: Node): Tile {
  if (g.kind === 'door') return { kind: 'door', color: g.color };
  if (g.kind !== 'enemy') return { kind: 'floor' };
  const strong = g.strength === 'strong' ? 2 : 1;
  // Populations mix around transitions: influence is fractional there.
  const population = Math.max(0, Math.round(n.influence + (rng() - 0.5) * 0.8));
  const tier = population % 4, depth = n.depth;
  return { kind: 'enemy', enemy: { name: ENEMY_NAMES[tier], tier, hp: Math.round((12 + depth * 0.6) * strong), attack: Math.round((6 + depth / 16) * strong), defense: Math.floor(depth / 65) + (strong - 1) * 2 } };
}

/** Puts each pocket's costs in its throat and its rewards in its chamber. */
function placePatternCosts(lab: Lab, board: Board) {
  for (const n of lab.nodes) {
    if (!n.pattern) continue;
    const edge = lab.edges.find(e => e.a === n.id || e.b === n.id)!;
    const path = edge.b === n.id ? edge.path : [...edge.path].reverse();
    // Costs sit in the single-width throat, outside either chamber, so each
    // one is a cut tile between the pocket and the rest of the labyrinth.
    // Only verified cut tiles qualify: a corner tile touching a room can be
    // side-stepped. A pocket whose throat is too short for its costs takes a
    // pattern that fits instead.
    const cuts = path.filter(p => !board.roomTiles.has(point(p.x, p.y)) && separates(board.cells, path[0], p, n));
    if (cuts.length < n.pattern.gates.length) n.pattern = choosePattern(lab.rng, lab.area, 0, cuts.length);
    const middle = Math.min(cuts.length - 1, Math.floor(cuts.length / 2) + n.pattern.gates.length - 1);
    n.pattern.gates.forEach((g, i) => board.put(cuts[middle - i], gateTile(lab, g, n), n.depth));
    const rewards = [{ x: n.x, y: n.y }, physical(n.x - 1, rowY(n.row), lab.seed), physical(n.x + 1, rowY(n.row), lab.seed)];
    n.pattern.rewards.forEach((r, i) => board.put(rewards[i], { ...r }, n.depth));
  }
}

/** Coherent key sources at strategic junctions; no blanket key-solvability fixup. */
function placeJunctionKeys({ nodes, start, rng }: Lab, board: Board) {
  const junctions = nodes.filter(n => !n.pattern && n.id !== start && n.links.length >= 3);
  for (const n of junctions) if (rng() < DELVE_TUNING.junctionKeyChance) board.put(n, { kind: 'key', color: rng() < 0.8 ? 'yellow' : 'blue' }, n.depth);
}

function rowSpan(cells: Map<string, Tile>) {
  let minY = Infinity, maxY = -Infinity;
  for (const k of cells.keys()) { const y = Number(k.split(',')[1]); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { minY, maxY };
}
/** True when blocking `cut` disconnects `from` from the pocket at `to`. */
function separates(cells: Map<string, Tile>, from: Point, cut: Point, to: Point) {
  const blocked = point(cut.x, cut.y), goal = point(to.x, to.y), seen = new Set([point(from.x, from.y), blocked]), queue = [from];
  for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const k = point(queue[i].x + dx, queue[i].y + dy);
    if (seen.has(k) || !cells.has(k)) continue;
    if (k === goal) return false;
    seen.add(k); queue.push({ x: queue[i].x + dx, y: queue[i].y + dy });
  }
  return true;
}
/** Length (in lattice hops) of the dead-end chain ending at a pocket. */
function branchLength(nodes: Node[], leaf: number) {
  let n = 0, prev = -1, at = leaf;
  while (nodes[at].links.length <= 2 && n < 12) { const next = nodes[at].links.find(l => l !== prev); if (next === undefined) break; prev = at; at = next; n++; }
  return n;
}
/** Areas whose cells may appear in world rows [minY, maxY). */
export function areasBetween(minY: number, maxY: number) {
  const out: number[] = [];
  for (let a = Math.max(0, Math.floor((minY - REACH) / AREA_SPAN)); a <= Math.floor((maxY + REACH) / AREA_SPAN); a++) out.push(a);
  return out;
}
/** Lowest world row that can still matter once `milestone` gates are crossed. */
export function floorFor(seed: number, milestone: number) { return milestone ? Math.max(0, region(seed, milestone).minY - 2) : 0; }
export function depthAt(seed: number, x: number, y: number, milestone: number) {
  const r = region(seed, milestone), meta = r.metadata.get(point(x, y));
  return Math.max(milestone * 100, Math.min(milestone * 100 + 99, meta?.depth ?? milestone * 100));
}
export function themeInfluence(seed: number, x: number, y: number) {
  const { col, row } = cellAt(seed, x, y);
  return region(seed, ownerOf(seed, col, row)).nodeAt(col, row)?.influence ?? ownerOf(seed, col, row);
}
