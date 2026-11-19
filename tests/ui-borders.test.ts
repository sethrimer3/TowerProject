import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodePng } from '../tools/ui-atlas-png.mjs';

test('shared frames have continuous native rails and equally thick corners', () => {
  const root = new URL('../public/assets/ui/frames/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  const values = readFileSync(new URL('../assets/ui-sprites/palette.ppm', import.meta.url), 'utf8').replace(/#[^\n]*/g, '').trim().split(/\s+/).slice(4).map(Number);
  const palette = new Set(Array.from({ length: values.length / 3 }, (_, i) => values.slice(i * 3, i * 3 + 3).join(',')));
  for (const [name, entry] of Object.entries(manifest.assets) as [string, { file: string; slice: number }][]) {
    if (!entry.slice) continue;
    assert.equal(entry.slice, 3, name);
    const { width, height, pixels } = decodePng(readFileSync(new URL(entry.file, root)));
    const color = (x: number, y: number) => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 3)].join(',');
    const rings = [0, 1, 2, 3].map(n => color(n, height >> 1));
    assert.equal(new Set(rings.slice(0, 3)).size, 3, `${name}: three distinct rail bands`);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      assert.equal(color(x, y), rings[Math.min(edge, 3)], `${name} ${x},${y}: uniform ring/corner`);
      assert.equal(pixels[(y * width + x) * 4 + 3], 255, `${name}: no disappearing gaps`);
      assert.ok(palette.has(color(x, y)), `${name}: shared palette`);
    }
  }
});
