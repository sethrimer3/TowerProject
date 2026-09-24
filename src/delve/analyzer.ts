import { region } from './labyrinth.ts';
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
export function analyzeDelve(seed: number, area: number) {
  const r = region(seed, area), next = region(seed, area + 1);
  const cells = new Map([...r.cells, ...next.cells]);
  const all = flood(cells, point(r.entry.x, r.entry.y));
  const blocked = flood(cells, point(r.entry.x, r.entry.y), point(r.gate.x, r.gate.y));
  const qualities = { good: 0, poor: 0, contextual: 0 };
  for (const n of r.nodes) if (n.pattern) qualities[n.pattern.quality]++;
  return {
    seed, area, depth: area * 100, nextMilestone: (area + 1) * 100,
    gate: r.gate, connected: all.size === cells.size,
    gateBypass: blocked.has(point(next.entry.x, next.entry.y)),
    walkable: r.cells.size, nodes: r.nodes.length, loops: r.edges.length - r.nodes.length + 1,
    deadEnds: r.nodes.filter(n => n.links.length === 1).length, qualities,
    pastAboveGate: r.nodes.some(n => n.y > r.gate.y),
    futureBelowGate: next.nodes.some(n => n.y < r.gate.y),
    patterns: r.nodes.filter(n => n.pattern).map(n => ({ id: n.id, pattern: n.pattern!.id, x: n.x, y: n.y })),
  };
}
