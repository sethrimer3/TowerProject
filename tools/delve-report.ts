import { analyzeDelve } from '../src/delve/analyzer.ts';
import { region } from '../src/delve/labyrinth.ts';
const [seed = 42, area = 0] = process.argv.slice(2).map(Number);
console.log(JSON.stringify(analyzeDelve(seed, area), null, 2));
const r = region(seed, area);
const glyph: Record<string, string> = { floor: '.', enemy: 'E', door: 'D', key: 'k', potion: 'p', attack: 'A', defense: 'S', treasure: '$', oneway: '^' };
for (let y = (area + 1) * 108 + 32; y >= area * 108; y--) {
  let line = ''; for (let x = 0; x < 30; x++) line += glyph[r.cells.get(`${x},${y}`)?.kind ?? 'wall'] ?? '#';
  console.log(`${String(y).padStart(5)} ${line}`);
}
