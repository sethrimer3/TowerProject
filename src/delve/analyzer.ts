import { region, boundary, areasBetween } from './labyrinth.ts';
import { point, type Tile } from '../entities.ts';
export function flood(cells: Map<string, Tile>, start: string, blocked = '') {
  const seen = new Set<string>(), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i]; if (seen.has(k) || k === blocked || !cells.has(k) || cells.get(k)!.kind === 'wall') continue;
    seen.add(k); const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) queue.push(point(x + dx, y + dy));
  }
  return seen;
}
/** Merged tiles of every area that can appear between two world rows. */
export function worldCells(seed: number, minY: number, maxY: number) {
  const cells = new Map<string, Tile>();
  for (const a of areasBetween(minY, maxY)) for (const [k, t] of region(seed, a).cells) cells.set(k, t);
  return cells;
}
/** Structural + strategic audit of one area and its neighbours, as they
 * really coexist in the world (tiles of areas a-1, a, a+1, a+2 merged). */
export function analyzeDelve(seed: number, area: number) {
  const r = region(seed, area), next = region(seed, area + 1);
  const cells = new Map<string, Tile>();
  for (const a of [area - 1, area, area + 1, area + 2]) if (a >= 0) for (const [k, t] of region(seed, a).cells) cells.set(k, t);
  const from = point(r.entry.x, r.entry.y);
  const all = flood(cells, from);
  const blocked = flood(cells, from, point(r.gate.x, r.gate.y));
  const own = [...r.cells.keys()];
  const qualities = { good: 0, poor: 0, contextual: 0 };
  for (const n of r.nodes) if (n.pattern) qualities[n.pattern.quality]++;
  const b = boundary(seed, area + 1);
  // Row-seam audit: no world row may be a solid wall across all five lattice
  // columns between this area's tiles and the next area's tiles.
  const seamRows: number[] = [];
  for (let y = r.gate.y - 40; y <= r.gate.y + 40; y++) {
    let open = false; for (let x = 0; x < 30 && !open; x++) open = cells.has(point(x, y));
    if (!open) seamRows.push(y);
  }
  return {
    seed, area, depth: area * 100, nextMilestone: (area + 1) * 100,
    gate: r.gate, gateColumn: b.gateCol, tongueColumn: b.tongueCol, dipColumn: b.dipCol,
    // Every tile of this area is reachable from its entrance...
    connected: own.every(k => all.has(k)),
    // ...and without the gate, nothing of the next area is.
    gateBypass: blocked.has(point(next.entry.x, next.entry.y)) || [...next.cells.keys()].some(k => blocked.has(k)),
    walkable: r.cells.size, nodes: r.nodes.length, loops: r.edges.length - r.nodes.length + 1,
    deadEnds: r.nodes.filter(n => n.links.length === 1).length, qualities,
    mainRouteNodes: r.nodes.filter(n => n.main).length,
    falseAscent: r.nodes.find(n => n.falseAscent)?.pattern?.id ?? null,
    pastAboveGate: r.nodes.some(n => n.y > r.gate.y),
    futureBelowGate: next.nodes.some(n => n.y < r.gate.y),
    seamRows: seamRows.length,
    patterns: r.nodes.filter(n => n.pattern).map(n => ({ id: n.id, pattern: n.pattern!.id, x: n.x, y: n.y })),
  };
}
