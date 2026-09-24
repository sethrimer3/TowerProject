import { point, type Point, type Tile } from '../entities.ts';
import type { Gate } from '../tower/types.ts';
import { choosePattern, type Pattern } from './patterns.ts';

export const DELVE_TUNING = { columns: 5, rows: 18, pitch: 6, span: 108, loopChance: 0.09, chamberChance: 0.46, themeBand: 22, cacheAreas: 16 };
export function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function rngFor(seed: number) { let n = 0; return () => hash(n++, 91, seed); }
// A continuous shear of the embedding, NOT an area-wide wall or Y test.
// Neighbouring columns differ by at most one tile, preserving corridor clearance.
export function shear(x: number, seed: number) { return hash(0, 0, seed) < 0.5 ? x : 29 - x; }
export const physical = (x: number, y: number, seed: number): Point => ({ x, y: y + shear(x, seed) });
function boundaryColumn(seed: number, boundary: number) { return 1 + Math.floor(hash(boundary, 17, seed) * 3); }
export function entrance(seed: number, area: number): Point {
  if (!area) return { x: 15, y: 0 };
  return physical(3 + boundaryColumn(seed, area) * 6, area * 108 + 3, seed);
}
export type Node = Point & { id: number; col: number; row: number; links: number[]; depth: number; influence: number; pattern?: Pattern; main: boolean };
export type Edge = { a: number; b: number; path: Point[]; shortcut: boolean };
export type Region = { area: number; nodes: Node[]; edges: Edge[]; cells: Map<string, Tile>; metadata: Map<string, { depth: number; area: number }>; gate: Point; entry: Point; exit: number; start: number };
const cache = new Map<string, Region>();
function distances(nodes: Node[], start: number) {
  const d = new Map([[start, 0]]), q = [start];
  for (let i = 0; i < q.length; i++) for (const id of nodes[q[i]].links) if (!d.has(id)) { d.set(id, d.get(q[i])! + 1); q.push(id); }
  return d;
}
export function region(seed: number, area: number): Region {
  area = Math.max(0, Math.floor(area));
  const key = `${seed}:${area}`;
  const old = cache.get(key); if (old) return old;
  const rng = rngFor(seed ^ Math.imul(area + 1, 0x45d9f3b));
  const nodes: Node[] = Array.from({ length: 90 }, (_, id) => {
    const col = id % 5, row = Math.floor(id / 5);
    return { id, col, row, ...physical(3 + col * 6, area * 108 + 3 + row * 6, seed), links: [], depth: area * 100, influence: area, main: false };
  });
  const start = area ? boundaryColumn(seed, area) : 2;
  const exit = 85 + boundaryColumn(seed, area + 1);
  const edges: Edge[] = [];
  const connect = (a: number, b: number, shortcut = false) => { nodes[a].links.push(b); nodes[b].links.push(a); edges.push({ a, b, path: [], shortcut }); };
  const neighbors = (id: number) => [id % 5 > 0 ? id - 1 : -1, id % 5 < 4 ? id + 1 : -1, id >= 5 ? id - 5 : -1, id < 85 ? id + 5 : -1].filter(n => n >= 0);
  // A growing graph with a mix of long passages and branching growth.
  const seen = new Set([start]), stack = [start];
  while (seen.size < nodes.length) {
    const slot = rng() < 0.72 ? stack.length - 1 : Math.floor(rng() * stack.length);
    const a = stack[slot], choices = neighbors(a).filter(b => !seen.has(b));
    if (!choices.length) { stack.splice(slot, 1); continue; }
    const b = choices[Math.floor(rng() * choices.length)]; connect(a, b); seen.add(b); stack.push(b);
  }
  // Keep terminal pockets intact; loops connect existing junctions/passages.
  for (const n of nodes) for (const b of neighbors(n.id)) if (b > n.id && !n.links.includes(b) && n.links.length > 1 && nodes[b].links.length > 1 && rng() < DELVE_TUNING.loopChance) connect(n.id, b, true);
  const fromStart = distances(nodes, start), fromExit = distances(nodes, exit);
  let at = exit; nodes[at].main = true;
  while (at !== start) { at = nodes[at].links.find(id => fromStart.get(id)! === fromStart.get(at)! - 1)!; nodes[at].main = true; }
  const routeLength = fromStart.get(exit)!;
  for (const n of nodes) {
    n.depth = area * 100 + Math.min(99, Math.floor(99 * fromStart.get(n.id)! / Math.max(1, routeLength)));
    // Path proximity plus physical proximity allows distant false branches to
    // acquire the future aesthetic without acquiring progression ownership.
    const exitNear = Math.min(fromExit.get(n.id)! * 5, Math.hypot(n.x - nodes[exit].x, n.y - nodes[exit].y) * 1.3);
    const entryNear = Math.min(fromStart.get(n.id)! * 5, Math.hypot(n.x - nodes[start].x, n.y - nodes[start].y) * 1.3);
    n.influence = area + (0.5 * Math.max(0, 1 - exitNear / DELVE_TUNING.themeBand)) - (area ? 0.5 * Math.max(0, 1 - entryNear / DELVE_TUNING.themeBand) : 0);
    if (n.links.length === 1 && n.id !== start && n.id !== exit) n.pattern = choosePattern(rng, area);
  }
  const cells = new Map<string, Tile>(), metadata: Region['metadata'] = new Map();
  const put = (p: Point, tile: Tile, n: Node) => { cells.set(point(p.x, p.y), tile); metadata.set(point(p.x, p.y), { depth: n.depth, area }); };
  const carve = (p: Point, n: Node) => put(p, { kind: 'floor' }, n);
  // Embed an edge through the same sheared lattice as the rooms. Every
  // horizontal logical step gains a bridging tile, making it 4-connected.
  const path = (x1: number, y1: number, x2: number, y2: number, n: Node) => {
    const out: Point[] = []; let x = x1, y = y1;
    const add = (p: Point) => { if (!out.length || point(p.x, p.y) !== point(out.at(-1)!.x, out.at(-1)!.y)) { out.push(p); carve(p, n); } };
    add(physical(x, y, seed));
    while (x !== x2 || y !== y2) {
      if (x !== x2) { const prev = physical(x, y, seed); x += Math.sign(x2 - x); add({ x, y: prev.y }); add(physical(x, y, seed)); }
      else { y += Math.sign(y2 - y); add(physical(x, y, seed)); }
    }
    return out;
  };
  for (const n of nodes) {
    const radius = n.pattern || rng() < DELVE_TUNING.chamberChance ? 1 : 0;
    for (let dy = -radius; dy <= radius; dy++) path(n.x - radius, area * 108 + 3 + n.row * 6 + dy, n.x + radius, area * 108 + 3 + n.row * 6 + dy, n);
  }
  for (const e of edges) {
    const a = nodes[e.a], b = nodes[e.b];
    e.path = path(a.x, area * 108 + 3 + a.row * 6, b.x, area * 108 + 3 + b.row * 6, b);
  }
  const end = nodes[exit], gate = physical(end.x, (area + 1) * 108, seed);
  path(end.x, area * 108 + 105, end.x, (area + 1) * 108 + 3, end);
  put(gate, { kind: 'oneway' }, end);
  // Initial approach is deliberately long; subsequent entries are supplied
  // by the preceding region's one and only inter-region edge.
  if (!area) for (let y = 0; y <= nodes[start].y; y++) carve({ x: 15, y }, nodes[start]);
  const gateTile = (g: Gate, n: Node): Tile => {
    if (g.kind === 'door') return { kind: 'door', color: g.color };
    if (g.kind !== 'enemy') return { kind: 'floor' };
    const strong = g.strength === 'strong' ? 2 : 1;
    const population = Math.max(0, Math.round(n.influence + (rng() - 0.5) * 0.8));
    const names = ['Cinder slime', 'Bone sentinel', 'Dusk wing', 'Ash warden'];
    const tier = population % 4, depth = n.depth;
    return { kind: 'enemy', enemy: { name: names[tier], tier, hp: Math.round((12 + depth * 0.6) * strong), attack: Math.round((6 + depth / 16) * strong), defense: Math.floor(depth / 65) + (strong - 1) * 2 } };
  };
  for (const n of nodes) {
    if (!n.pattern) continue;
    const edge = edges.find(e => e.a === n.id || e.b === n.id)!;
    const route = edge.b === n.id ? edge.path : [...edge.path].reverse();
    // Two costs stay in the single-width throat, outside either chamber.
    const middle = Math.floor(route.length / 2);
    n.pattern.gates.forEach((g, i) => put(route[middle - i], gateTile(g, n), n));
    const rewards = [{ x: n.x, y: n.y }, physical(n.x - 1, area * 108 + 3 + n.row * 6, seed), physical(n.x + 1, area * 108 + 3 + n.row * 6, seed)];
    n.pattern.rewards.forEach((r, i) => put(rewards[i], { ...r }, n));
  }
  // Character power remains necessary even when all optional taxes are avoided.
  put({ x: gate.x, y: gate.y - 2 }, gateTile({ kind: 'enemy', strength: 'normal' }, end), end);
  // Coherent sources at strategic junctions; no blanket key-solvability fixup.
  for (const n of nodes) if (!n.pattern && n.links.length >= 3 && rng() < 0.32) put(n, { kind: 'key', color: rng() < 0.8 ? 'yellow' : 'blue' }, n);
  const result = { area, nodes, edges, cells, metadata, gate, entry: entrance(seed, area), exit, start };
  cache.set(key, result);
  if (cache.size > DELVE_TUNING.cacheAreas) cache.delete(cache.keys().next().value!);
  return result;
}
export function regionsAt(seed: number, y: number) {
  const approx = Math.floor(y / 108);
  return [approx - 1, approx, approx + 1].filter(a => a >= 0).map(a => region(seed, a));
}
export function depthAt(seed: number, x: number, y: number, milestone: number) {
  const r = region(seed, milestone), meta = r.metadata.get(point(x, y));
  return Math.max(milestone * 100, Math.min(milestone * 100 + 99, meta?.depth ?? milestone * 100));
}
export function themeInfluence(seed: number, x: number, y: number) {
  const logical = y - shear(x, seed), area = Math.max(0, Math.floor(logical / 108));
  const r = region(seed, area);
  const col = Math.max(0, Math.min(4, Math.round((x - 3) / 6)));
  const row = Math.max(0, Math.min(17, Math.round((logical - area * 108 - 3) / 6)));
  return r.nodes[row * 5 + col].influence;
}
