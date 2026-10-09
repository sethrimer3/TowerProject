import { analyzeDelve, worldCells } from '../src/delve/analyzer.ts';
import { region, ownerAt } from '../src/delve/labyrinth.ts';
import { delveCensus } from '../src/delve/census.ts';
import { formatCensus } from '../src/tower/census.ts';
// usage: npm run delve:report -- [seed] [area] [--map]
//        npm run delve:report -- --census [--tiers 1,2,9] [--floors 1-200] [--band 50] [--seeds 20]
//          → doors, keys, enemies and items per equivalent floor by delve and band
const args = process.argv.slice(2);
/** The value after `--name`, or `fallback`. */
const option = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
if (args.includes('--census')) {
  const [from, to] = option('floors', '1-200').split('-').map(Number);
  console.log(formatCensus(delveCensus({
    towers: option('tiers', '1').split(',').map(Number),
    from, to: to ?? from,
    band: Number(option('band', '50')),
    seeds: Number(option('seeds', '20')),
  }), 'Delve'));
  process.exit(0);
}
const [seed = 42, area = 0] = args.filter(a => !a.startsWith('--')).map(Number);
const { patterns, ...summary } = analyzeDelve(seed, area);
console.log(JSON.stringify(summary, null, 2));
console.log(patterns.map(p => p.fork ? `${p.pattern} (fork ${p.fork})` : p.pattern).join(', '));
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
