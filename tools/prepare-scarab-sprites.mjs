// node tools/prepare-scarab-sprites.mjs
// The Golden Scarab, drawn here pixel by pixel in the shared palette: a
// brass beetle seen from above, its wing cases split down the middle, the
// board's find and the Golden Scarab Research skill's icon. Then run
// npm run sprites:atlas and npm run sprites:manifest.
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePng } from './ui-atlas-png.mjs';

const words = readFileSync('assets/ui-sprites/palette.ppm', 'utf8').replace(/#[^\n]*/g, '').trim().split(/\s+/).slice(4).map(Number);
const PALETTE = Array.from({ length: words.length / 3 }, (_, i) => words.slice(i * 3, i * 3 + 3));

/** Each sprite: its keys to palette entries, and its rows' left halves
 * (12 pixels, mirrored for the right half). */
const SPRITES = {
  scarab: {
    keys: { o: 8, s: 9, d: 10, b: 11, l: 12, h: 13, g: 24, G: 25 },
    rows: [
      '............',
      '.......o....',
      '........o...',
      '.........ooo',
      '........odll',
      '........odlh',
      '.....o..oddd',
      '......oooooo',
      '.....odbbbll',
      '..o.odbbblhh',
      '...ooodbbbll',
      '....osdddddd',
      '...odbbbbbbo',
      '...odbbbllho',
      '..ooddbblhbo',
      '.o.odbbbllbo',
      '...odbbGgbbo',
      '...odbbggbbo',
      '..oodbbbbbbo',
      '.o..odbbbbbo',
      '....oddbbbbo',
      '.....osdddbo',
      '......oooooo',
      '............',
    ],
  },
};

/** A sprite's RGBA pixels, 24 by 24. */
function draw(id, { keys, rows }) {
  if (rows.length !== 24) throw Error(`${id}: ${rows.length} rows`);
  const pixels = Buffer.alloc(24 * 24 * 4);
  rows.forEach((row, y) => {
    if (row.length !== 12) throw Error(`${id} row ${y}: ${row.length} pixels`);
    [...(row + [...row].reverse().join(''))].forEach((k, x) => {
      if (k === '.') return;
      const c = PALETTE[keys[k]];
      if (!c) throw Error(`${id}: no colour for ${k}`);
      pixels.set([...c, 255], (y * 24 + x) * 4);
    });
  });
  return pixels;
}

const dir = 'public/assets/style', manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
for (const [id, sprite] of Object.entries(SPRITES)) {
  writeFileSync(`${dir}/${id}.png`, encodePng(24, 24, draw(id, sprite)));
  manifest.assets[id] = { file: `${id}.png`, width: 24, height: 24 };
}
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Drew ${Object.keys(SPRITES).length} Golden Scarab sprite.`);
