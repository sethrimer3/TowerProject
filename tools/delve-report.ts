import { analyzeDelve, worldCells } from '../src/delve/analyzer.ts';
import { region, ownerAt } from '../src/delve/labyrinth.ts';
// usage: npm run delve:report -- [seed] [area] [--map]
const args = process.argv.slice(2), [seed = 42, area = 0] = args.filter(a => !a.startsWith('--')).map(Number);
const { patterns, ...summary } = analyzeDelve(seed, area);
console.log(JSON.stringify(summary, null, 2));
console.log(patterns.map(p => p.pattern).join(', '));
const r = region(seed, area);
const glyph: Record<string, string> = { floor: '.', enemy: 'E', door: 'D', key: 'k', potion: 'p', attack: 'A', defense: 'S', treasure: '$', oneway: '^' };
const cells = worldCells(seed, r.minY - 10, r.maxY + 10);
// Upper-case letters for this area, and the owning area digit in wall-free
// cells of other areas, so the interlocking boundary is visible.
for (let y = r.maxY + 8; y >= Math.max(0, r.minY - 8); y--) {
  let line = ''; for (let x = 0; x < 30; x++) {
    const t = cells.get(`${x},${y}`);
    if (!t) { line += '#'; continue; }
    const owner = ownerAt(seed, x, y);
    line += owner === area ? (glyph[t.kind] ?? '?') : t.kind === 'oneway' ? '^' : String(owner % 10);
  }
  console.log(`${String(y).padStart(5)} ${line}`);
}
