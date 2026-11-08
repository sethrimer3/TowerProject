// Export individual native sprites first, then pack their exact pixels.
// Run from the repository root: node tools/prepare-additions-sprites.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { decodePng, encodePng } from './ui-atlas-png.mjs';

const out = 'public/assets/additions';
mkdirSync(`${out}/individual`, { recursive: true });
const support = [
  'currency-trial-points', 'skill-armor-break', 'skill-aether-shield', 'skill-hero-shield',
  'skill-shield-thorns', 'skill-regrow-shield', 'skill-shield-regen', 'skill-super-critical',
  'skill-offline-gold', 'skill-dash-combo', 'skill-enemy-level-skips',
  'skill-enemy-hp-level-skips', 'skill-enemy-combat-level-skips',
  'event-star', 'event-harvest', 'event-battle', 'event-frost', 'event-sun',
  'equip-knightsSword', 'equip-ironShield', 'equip-steelCuirass', 'equip-ironHelm',
  'equip-leatherGauntlets', 'equip-travelersBoots', 'equip-woolCloak',
  'equip-leatherBelt', 'equip-silverBand', 'equip-amberPendant',
];
const batches = [
  { source: 'relics', columns: 10, rows: 10, ids: Array.from({length:100}, (_, i) => `relic-${String(i+1).padStart(3,'0')}`) },
  { source: 'support', columns: 7, rows: 4, ids: support },
];
const width = 512, height = 256, size = 24, padding = 2, pitch = size + padding * 2;
const pixels = Buffer.alloc(width * height * 4);
const sprites = {};
let index = 0;
for (const batch of batches) {
  const source = `assets/game-sprites/additions-sources/${batch.source}.png`;
  const header = readFileSync(source), sw = header.readUInt32BE(16), sh = header.readUInt32BE(20);
  for (const [i, id] of batch.ids.entries()) {
    const col = i % batch.columns, row = Math.floor(i / batch.columns);
    const left = Math.round(sw * col / batch.columns), top = Math.round(sh * row / batch.rows);
    const right = Math.round(sw * (col+1) / batch.columns), bottom = Math.round(sh * (row+1) / batch.rows);
    const file = `individual/${id}.png`;
    const result = spawnSync('magick', ['-limit','thread','1', source,
      '-crop',`${right-left}x${bottom-top}+${left}+${top}`,'+repage',
      '-channel','A','-threshold','65%','+channel','-trim','+repage',
      '-filter','point','-resize','20x20','-background','none','-gravity','center','-extent','24x24',
      '-write','mpr:alpha','+dither','-remap','assets/ui-sprites/palette.ppm',
      'mpr:alpha','-compose','CopyAlpha','-composite','-strip',`PNG32:${out}/${file}`], {encoding:'utf8'});
    if (result.status !== 0) throw new Error(result.stderr || String(result.error));
    const input = decodePng(readFileSync(`${out}/${file}`));
    const x = (index % 18) * pitch + padding, y = Math.floor(index / 18) * pitch + padding;
    for (let row = 0; row < size; row++) input.pixels.copy(pixels, ((y+row)*width+x)*4, row*size*4, (row+1)*size*4);
    sprites[id] = { file, x, y, width:size, height:size, category: id.split('-')[0], ...(batch.source === 'relics' ? { status:'art-only; gameplay definition pending' } : {}) };
    index++;
  }
}
writeFileSync(`${out}/atlas.png`, encodePng(width,height,pixels));
writeFileSync(`${out}/atlas.json`, JSON.stringify({image:'atlas.png', width,height,padding, nativeSize:size, sprites}, null,2)+'\n');
writeFileSync(`${out}/README.md`, '# Tower Delve additions art\n\n128 individual transparent 24 × 24 PNGs, packed losslessly into atlas.png (512 × 256).\nRead atlas.json for named regions; coordinates start at the top left, exclude the two-pixel transparent padding, and use pixels.\nUse nearest-neighbor sampling at integer scales.\n\n100 relics are an art library, numbered in source reading order; no names, rarities, bonuses or ownership rules are assigned.\nThe remaining art comprises Trial Points, 12 skill symbols, five event pennants, and ten Standard equipment pieces.\nEvent pennants are reusable themes, not scheduled events.\nThese files are not wired to gameplay yet and do not replace existing art.\n\nRegenerate with node tools/prepare-additions-sprites.mjs.\nThe retained generated sources live in assets/game-sprites/additions-sources/.\n');
console.log(`Exported and packed ${index} individual sprites.`);
