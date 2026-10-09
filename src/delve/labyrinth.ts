import { point, type Point, type Tile } from '../entities.ts';
import type { Fork, Gate, LaneStep, Strength } from '../tower/types.ts';
import { strengthOnFloor, DELVE_ENEMY_NAMES, enemyTier, type TowerEnemyProfile } from '../scaling.ts';
import { enemyStats, woodDurability } from '../enemy-curves.ts';
import { FORK_TUNING, forkDepth, forksWorth, stepValue } from '../tower/forks.ts';
import { choosePattern, FALSE_ASCENTS, type Pattern } from './patterns.ts';
import { tileRandom } from '../random.ts';
import { heartDoorsOn, keyColorsOn, onlyOpenKeys, withoutHeart } from '../key-schedule.ts';

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
  /** Most pockets per area whose throat becomes a fork. */
  forksPerArea: 6,
  /** Chance that a corridor not leading into a pocket gets a guard, and the
   * odds of each guard's strength (about the Tower's mix per floor), so an
   * area holds about as many enemies as ten Tower floors. */
  guardChance: 0.65,
  guardStrengths: { weak: 0.31, normal: 0.4, strong: 0.26, elite: 0.03 },
  /** The odds of the reward left beside a guard (none otherwise), so an area
   * also holds about the potions and shards of ten Tower floors. */
  guardRewards: { potion: 0.55, attack: 0.15, defense: 0.1 },
};
const { columns: COLS, rowsPerArea: ROWS, pitch: PITCH } = DELVE_TUNING;
/** Nominal world-Y span of one area; only used to find candidate areas. */
const AREA_SPAN = ROWS * PITCH;
const REACH = (DELVE_TUNING.tongue + 1) * PITCH + 4;

function rngFor(seed: number) { let n = 0; return () => tileRandom(n++, 91, seed); }

/** A small per-column vertical warp: each lattice column's 6-tile slab is
 * shifted 0..3 tiles, neighbouring slabs by at most one. Horizontal corridors
 * therefore take a single one-tile step between columns (staying 1 wide and
 * 4-connected) and rows meander without any global tilt. */
const warps = new Map<number, number[]>();
function warp(x: number, seed: number) {
  let w = warps.get(seed);
  if (!w) {
    w = [Math.floor(tileRandom(0, 1, seed) * 4)];
    for (let i = 1; i < 6; i++) w.push(Math.max(0, Math.min(3, w[i - 1] + Math.floor(tileRandom(i, 2, seed) * 3) - 1)));
    warps.set(seed, w); if (warps.size > 8) warps.delete(warps.keys().next().value!);
  }
  return w[Math.max(0, Math.min(5, Math.floor(x / 6)))];
}
const colX = (col: number) => 3 + col * PITCH;
const rowY = (row: number) => 3 + row * PITCH;
export const physical = (x: number, y: number, seed: number): Point => ({ x, y: y + warp(x, seed) });
const cellPoint = (col: number, row: number, seed: number) => physical(colX(col), rowY(row), seed);

export type Boundary = { rows: number[]; gateCol: number; tongueCol: number; dipCol: number };
const boundaries = new Map<string, Boundary>();
/** Boundary `b` (b >= 1) separates area b-1 below from area b above. */
export function boundary(seed: number, b: number): Boundary {
  const key = `${seed}:${b}`, old = boundaries.get(key); if (old) return old;
  const h = (i: number) => tileRandom(b, 300 + i, seed);
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
function ownerOf(seed: number, col: number, row: number) {
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

export type Node = Point & { id: number; col: number; row: number; links: number[]; depth: number; influence: number; pattern?: Pattern; main: boolean; falseAscent: boolean;
  /** A pocket whose throat is two parallel lanes instead of its pattern's
   * gates, and each lane's tiles from the neighbour's side. */
  fork?: Fork; lanes?: Point[][] };
export type Edge = { a: number; b: number; path: Point[]; shortcut: boolean };
export type Region = {
  area: number; nodes: Node[]; edges: Edge[]; cells: Map<string, Tile>; metadata: Map<string, { depth: number; area: number }>;
  gate: Point; entry: Point; exit: number; start: number; minY: number; maxY: number;
  nodeAt: (col: number, row: number) => Node | undefined;
};
const cache = new Map<string, Region>();

/** Builds (or recalls) one area of the labyrinth. The stages run in a fixed
 * order and share one random stream, so reordering them or their draws
 * changes every map after it. Tier `tier` decides which key colours its
 * pockets, forks and junctions may use, which can change their costs and
 * forks, and the enemy curve its enemies come from. */
export function region(seed: number, area: number, tier = 1): Region {
  area = Math.max(0, Math.floor(area));
  const key = `${seed}:${area}:${tier}`;
  const old = cache.get(key); if (old) return old;
  const lab = lattice(seed, area, tier);
  growTree(lab);
  addLoops(lab);
  for (const e of lab.edges) e.path = corridor(seed, unwarped(lab.nodes[e.a]), unwarped(lab.nodes[e.b]));
  measure(lab);
  assignPatterns(lab);
  const board = carve(lab);
  placePatternCosts(lab, board);
  placeGuards(lab, board);
  // Every milestone gate, ten equivalent floors up, is held by a boss, so
  // character power stays necessary even when every optional tax is avoided.
  board.put({ x: board.gate.x, y: board.gate.y - 2 }, gateTile(lab, { kind: 'enemy', strength: 'boss' }, lab.nodes[lab.exit]), area * 100 + 99);
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
  /** The numbered delve: the first keeps blue and red keys for its deeper floors (`keyColorsOn`). */
  tier: number;
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
function lattice(seed: number, area: number, tier: number): Lab {
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
    seed, area, tier, rng: rngFor(seed ^ Math.imul(area + 1, 0x45d9f3b)), nodes, edges: [], nodeAt, neighbors, up,
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
  const near = (n: Node, hopsTo: Map<number, number>, gate: Node) => Math.min(hopsTo.get(n.id)! * PITCH, Math.sqrt((n.x - gate.x) * (n.x - gate.x) + (n.y - gate.y) * (n.y - gate.y)) * 1.2);
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
  const bias = (tileRandom(n.col, n.row, seed ^ 0x2b1d) - 0.5) * 0.16;
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
  for (const n of nodes) if (!n.pattern && isPocket(lab, n)) n.pattern = choosePattern(rng, { area: lab.area, branch: branchLength(nodes, n.id) }, colorsAt(lab, n));
}

/** The key colours cell `n` may use, by its equivalent floor. */
const colorsAt = (lab: Lab, n: Node) => keyColorsOn(Math.floor(n.depth / 10), lab.tier);

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


/** The tile standing in for one pattern cost or fork lane step at cell `n`. */
function gateTile({ rng, tier }: Lab, g: LaneStep, n: Node): Tile {
  if (g.kind === 'reward') return { ...g.reward };
  if (g.kind === 'door') return { kind: 'door', color: g.color };
  if (g.kind === 'wood') return { kind: 'door', door: { type: 'wood', durability: woodDurability('delve', tier, n.depth) } };
  if (g.kind === 'heart') return { kind: 'door', door: { type: 'fullHp' } };
  if (g.kind !== 'enemy') return { kind: 'floor' };
  // Strong and elite enemies wait for their equivalent floors, as in the Tower.
  const strength = strengthOnFloor(g.strength, Math.floor(n.depth / 10));
  // Populations mix around transitions: influence is fractional there.
  const population = Math.max(0, Math.round(n.influence + (rng() - 0.5) * 0.8));
  return { kind: 'enemy', enemy: {
    name: DELVE_ENEMY_NAMES[population % DELVE_ENEMY_NAMES.length], tier: enemyTier(strength), strength,
    // The delve's own enemy curve, read at this depth.
    ...enemyStats('delve', tier, n.depth, strength, g.profile ?? 'balanced'),
  } };
}

/** Puts each pocket's costs in its throat and its rewards in its chamber.
 * Some throats become forks instead: two parallel lanes priced like the
 * pattern's own costs. */
function placePatternCosts(lab: Lab, board: Board) {
  let forks = 0;
  for (const n of lab.nodes) {
    if (!n.pattern) continue;
    const path = throatPath(lab, n);
    if (forks < DELVE_TUNING.forksPerArea && tryFork(lab, board, n, path)) forks++;
    else placeCosts(lab, board, n, path);
    placeRewards(lab, board, n);
  }
}

/** The corridor into pocket `n`, from the neighbour's side. */
function throatPath(lab: Lab, n: Node) {
  const edge = lab.edges.find(e => e.a === n.id || e.b === n.id)!;
  return edge.b === n.id ? edge.path : [...edge.path].reverse();
}

/** Turns the throat into a fork when lanes fit beside it, the fork chance
 * rolls it, and a fork worth the pattern's costs (two lanes, no deeper than
 * the throat, its keys open here) is found; returns whether it did. */
function tryFork(lab: Lab, board: Board, n: Node, path: Point[]) {
  const lanes = forkLanes(board, n, path);
  if (!lanes || lab.rng() >= FORK_TUNING.chance(n.depth / 10)) return false;
  const value = n.pattern!.gates.reduce((sum, g) => sum + stepValue(g), 0);
  const colors = colorsAt(lab, n), hearts = heartDoorsOn(n.depth / 10, lab.tier);
  const [fork] = forksWorth(value, n.depth / 10, 'mixed', lab.rng, f => f.lanes.length === 2 && forkDepth(f) <= lanes[0].length && onlyOpenKeys(f, colors) && (hearts || withoutHeart(f)));
  if (!fork) return false;
  carveFork(lab, board, n, { fork, lanes, path });
  return true;
}

/** Costs sit in the single-width throat, outside either chamber, so each
 * one is a cut tile between the pocket and the rest of the labyrinth. Only
 * verified cut tiles qualify: a corner tile touching a room can be
 * side-stepped. A pocket whose throat is too short for its costs takes a
 * pattern that fits instead. */
function placeCosts(lab: Lab, board: Board, n: Node, path: Point[]) {
  const separates = separators(board.cells, path[0], n);
  const cuts = path.filter(p => !board.roomTiles.has(point(p.x, p.y)) && separates(p));
  if (cuts.length < n.pattern!.gates.length) n.pattern = choosePattern(lab.rng, { area: lab.area, branch: 0, maxGates: cuts.length }, colorsAt(lab, n));
  const pattern = n.pattern!, middle = Math.min(cuts.length - 1, Math.floor(cuts.length / 2) + pattern.gates.length - 1);
  pattern.gates.forEach((g, i) => board.put(cuts[middle - i], gateTile(lab, g, n), n.depth));
}

function placeRewards(lab: Lab, board: Board, n: Node) {
  const rewards = [{ x: n.x, y: n.y }, physical(n.x - 1, rowY(n.row), lab.seed), physical(n.x + 1, rowY(n.row), lab.seed)];
  n.pattern!.rewards.forEach((r, i) => board.put(rewards[i], { ...r }, n.depth));
}

const shift = (p: Point, d: Point, k = 1): Point => ({ x: p.x + d.x * k, y: p.y + d.y * k });

/** Whether pocket `n` can take a fork: it holds something worth reaching
 * and has costs to trade, and isn't a false ascent. */
const forkable = (n: Node) => !!n.pattern!.gates.length && !!n.pattern!.rewards.length && !n.falseAscent;

/** Where a fork's two lanes would run into pocket `n`: one tile either side
 * of its throat, from the neighbouring chamber into the pocket's, or null
 * when the pocket can't take a fork (`forkable`) or its throat isn't a
 * straight run between two chambers with solid rock either side. Lanes are
 * listed from the neighbour's side. */
function forkLanes(board: Board, n: Node, path: Point[]): Point[][] | null {
  if (!forkable(n)) return null;
  const run = straightThroat(board, path);
  if (!run) return null;
  const { throat, dir } = run, side = { x: dir.y, y: dir.x };
  const lanes = [-1, 1].map(o => throat.map(p => shift(p, side, o)));
  return lanes.every((lane, i) => laneFits(board, lane, dir, shift({ x: 0, y: 0 }, side, i ? 1 : -1))) ? lanes : null;
}

/** The throat of `path` (its tiles outside every chamber) and the way it
 * runs, when it is one straight run entered from a chamber tile; null
 * otherwise. */
function straightThroat(board: Board, path: Point[]): { throat: Point[]; dir: Point } | null {
  const throat = path.filter(p => !board.roomTiles.has(point(p.x, p.y)));
  const first = path.indexOf(throat[0]);
  if (first < 1 || !contiguous(path, throat, first)) return null;
  const dir = { x: throat[0].x - path[first - 1].x, y: throat[0].y - path[first - 1].y };
  return throat.every((p, i) => p.x === throat[0].x + dir.x * i && p.y === throat[0].y + dir.y * i) ? { throat, dir } : null;
}

/** Whether `throat` is one unbroken stretch of `path` from index `first`. */
const contiguous = (path: Point[], throat: Point[], first: number) =>
  throat.length > 0 && path.indexOf(throat[throat.length - 1]) === first + throat.length - 1;

/** Whether a lane runs through solid rock, with rock on its far side
 * (`out`), from a chamber tile before it to a chamber tile after it. */
function laneFits(board: Board, lane: Point[], dir: Point, out: Point) {
  const rock = (p: Point) => !board.cells.has(point(p.x, p.y));
  const room = (p: Point) => board.roomTiles.has(point(p.x, p.y));
  return lane.every(p => rock(p) && rock(shift(p, out))) && room(shift(lane[0], dir, -1)) && room(shift(lane[lane.length - 1], dir));
}

/** A fork chosen for a pocket: the fork, the tiles of its lanes, and the
 * throat it replaces. */
type ForkPlan = { fork: Fork; lanes: Point[][]; path: Point[] };

/** Fills the old throat back in and cuts the fork's lanes beside it. */
function carveFork(lab: Lab, board: Board, n: Node, { fork, lanes, path }: ForkPlan) {
  for (const p of path) if (!board.roomTiles.has(point(p.x, p.y))) { board.cells.delete(point(p.x, p.y)); board.metadata.delete(point(p.x, p.y)); }
  lanes.forEach((lane, i) => lane.forEach((p, k) => {
    const step = fork.lanes[i][k];
    board.put(p, step ? gateTile(lab, step, n) : { kind: 'floor' }, n.depth);
  }));
  n.fork = fork;
  n.lanes = lanes;
}

/** A corridor guard's rolls: its strength, profile, and the reward beside it, if any. */
type GuardRoll = { strength: Strength; profile: TowerEnemyProfile; reward?: 'potion' | 'attack' | 'defense' };
const GUARD_STRENGTHS = Object.entries(DELVE_TUNING.guardStrengths) as [Strength, number][];
const GUARD_PROFILES: TowerEnemyProfile[] = ['attackHeavy', 'balanced', 'defenseHeavy'];
const GUARD_REWARDS = Object.entries(DELVE_TUNING.guardRewards) as ['potion' | 'attack' | 'defense', number][];

/** Guards the labyrinth's corridors: each corridor that doesn't lead into a
 * pocket may get one enemy on its middle corridor tile, outside any chamber,
 * with a random strength and profile, and often a potion or shard on the
 * corridor tile beside it. */
function placeGuards(lab: Lab, board: Board) {
  const { nodes, rng } = lab, pockets = new Set(nodes.filter(n => n.pattern).map(n => n.id));
  const intoPocket = (e: Lab['edges'][number]) => pockets.has(e.a) || pockets.has(e.b);
  for (const e of lab.edges) {
    if (intoPocket(e) || rng() >= DELVE_TUNING.guardChance) continue;
    // Rolled before looking for room, so every guarded corridor draws alike.
    const guard = rollGuard(rng);
    const open = e.path.filter(p => !board.roomTiles.has(point(p.x, p.y)) && board.cells.get(point(p.x, p.y))?.kind === 'floor');
    if (open.length) placeGuard(lab, board, open, guard, nodes[e.a]);
  }
}

function rollGuard(rng: () => number): GuardRoll {
  const strength = GUARD_STRENGTHS[pickWeighted(rng, GUARD_STRENGTHS.map(([, w]) => w))][0];
  const profile = GUARD_PROFILES[Math.floor(rng() * GUARD_PROFILES.length)];
  let roll = rng();
  return { strength, profile, reward: GUARD_REWARDS.find(([, chance]) => (roll -= chance) < 0)?.[0] };
}

/** The guard on the middle of the corridor's `open` tiles, and its reward
 * on the tile after it. A guard's potion may be a percent potion, as the
 * run decides (`withPotions`). */
function placeGuard(lab: Lab, board: Board, open: Point[], { strength, profile, reward }: GuardRoll, from: Node) {
  const middle = Math.floor(open.length / 2), at = open[middle], depth = board.metadata.get(point(at.x, at.y))!.depth;
  board.put(at, gateTile(lab, { kind: 'enemy', strength, profile }, { ...from, depth }), depth);
  const beside = open[middle + 1];
  if (!reward || !beside) return;
  const tile: Tile = reward === 'potion' ? { kind: 'potion', color: 'blue' } : { kind: reward };
  board.put(beside, tile, board.metadata.get(point(beside.x, beside.y))!.depth);
}

/** Coherent key sources at strategic junctions; no blanket key-solvability
 * fixup. Where blue keys don't appear yet, a junction's blue key is yellow. */
function placeJunctionKeys(lab: Lab, board: Board) {
  const { nodes, start, rng } = lab;
  const junctions = nodes.filter(n => !n.pattern && n.id !== start && n.links.length >= 3);
  for (const n of junctions) if (rng() < DELVE_TUNING.junctionKeyChance)
    board.put(n, { kind: 'key', color: rng() < 0.8 || !colorsAt(lab, n).blue ? 'yellow' : 'blue' }, n.depth);
}

function rowSpan(cells: Map<string, Tile>) {
  let minY = Infinity, maxY = -Infinity;
  for (const k of cells.keys()) { const y = Number(k.split(',')[1]); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { minY, maxY };
}
/** Whether blocking a tile disconnects `from` from the pocket at `to`,
 * walking only tiles in `cells` (and `from`), for any tile asked: one
 * depth-first search (Tarjan's low links) answers for every tile, where a
 * flood per tile would walk the area each time. A tile separates them when
 * it is `to` itself, when `to` can't be reached at all, or when `to` lies
 * below one of its children in the search tree that has no way round it. */
function separators(cells: Map<string, Tile>, from: Point, to: Point): (cut: Point) => boolean {
  const start = point(from.x, from.y), goal = point(to.x, to.y);
  const order = new Map<string, number>([[start, 0]]), low = new Map<string, number>([[start, 0]]), parent = new Map<string, string>();
  const near = (x: number, y: number) => {
    const out: { k: string; x: number; y: number }[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = point(x + dx, y + dy);
      if (k === start || cells.has(k)) out.push({ k, x: x + dx, y: y + dy });
    }
    return out;
  };
  const stack = [{ k: start, ns: near(from.x, from.y), i: 0 }];
  let time = 1;
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top.i < top.ns.length) {
      const n = top.ns[top.i++];
      if (!order.has(n.k)) {
        order.set(n.k, time), low.set(n.k, time++), parent.set(n.k, top.k);
        stack.push({ k: n.k, ns: near(n.x, n.y), i: 0 });
      } else if (n.k !== parent.get(top.k)) low.set(top.k, Math.min(low.get(top.k)!, order.get(n.k)!));
      continue;
    }
    stack.pop();
    const up = parent.get(top.k);
    if (up !== undefined) low.set(up, Math.min(low.get(up)!, low.get(top.k)!));
  }
  return (cut: Point) => {
    const k = point(cut.x, cut.y);
    if (k === goal || goal === start || !order.has(goal)) return true;
    if (k === start || !order.has(k)) return false;
    // The child of the cut on the way down to the goal, if the cut is above it.
    let child = goal;
    while (parent.get(child) !== k) {
      const up = parent.get(child);
      if (up === undefined) return false;
      child = up;
    }
    return low.get(child)! >= order.get(k)!;
  };
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
export function depthAt(seed: number, x: number, y: number, milestone: number, tier = 1) {
  const r = region(seed, milestone, tier), meta = r.metadata.get(point(x, y));
  return Math.max(milestone * 100, Math.min(milestone * 100 + 99, meta?.depth ?? milestone * 100));
}
export function themeInfluence(seed: number, x: number, y: number) {
  const { col, row } = cellAt(seed, x, y);
  return region(seed, ownerOf(seed, col, row)).nodeAt(col, row)?.influence ?? ownerOf(seed, col, row);
}
