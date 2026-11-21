// node --experimental-transform-types tools/prepare-shop-sprites.mjs
// The Shop's own sprites, drawn here pixel by pixel in the shared palette:
// the VIP Points crown, Champion Status's star and One Piece Ticket, the Ruby, and the
// Premium Offers' and Champion's Bundle's relics. Run after
// tools/prepare-relic-sprites.mjs (which rewrites the relic atlas without
// them), then npm run sprites:atlas.
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePng } from './ui-atlas-png.mjs';
import { RELICS } from '../src/economy/relics.ts';
import { CHAMPION_STAR_SPRITE, ONE_PIECE_SPRITE, RUBY_SPRITE, VIP_SPRITE } from '../src/sprites/kit.ts';

const words = readFileSync('assets/ui-sprites/palette.ppm', 'utf8').replace(/#[^\n]*/g, '').trim().split(/\s+/).slice(4).map(Number);
const PALETTE = Array.from({ length: words.length / 3 }, (_, i) => words.slice(i * 3, i * 3 + 3));

/** Each sprite: its keys to palette entries, and its rows' left halves
 * (12 pixels, mirrored for the right half) or whole rows (24). */
const SPRITES = {
  // A brass crown set with garnets and sapphires.
  [VIP_SPRITE]: {
    keys: { o: 8, d: 10, b: 11, l: 12, h: 13, r: 16, R: 15, c: 21, C: 20 },
    rows: [
      '............', '............', '............',
      '..........oo',
      '.........orh',
      '.........orR',
      '..oo......oo',
      '.ohRo.....ol',
      '.orRo....olb',
      '..oo.....olb',
      '..olo...olbb',
      '..olbo.olbbb',
      '..olbbolbbbb',
      '..olbbbbbbbb',
      '..olbbbbbbbb',
      '..oddddddddd',
      '..ohhhhhhhhh',
      '..olcCllrRll',
      '..olCCllRRll',
      '..obbbbbbbbb',
      '..oddddddddd',
      '...ooooooooo',
      '............', '............',
    ],
  },
  // A brass medallion bearing a blue book, on wine ribbon tails.
  'shop.researcher': {
    keys: { o: 8, d: 10, b: 11, l: 12, h: 13, D: 18, C: 20, w: 21, p: 13, r: 16, R: 15 },
    rows: [
      '............', '............',
      '........oooo',
      '......oohhhh',
      '.....ohlllll',
      '....ohllbbbb',
      '...ohlbbbbbb',
      '...olbbbbbbb',
      '..ohlDDDbbbb',
      '..olDpppppDD',
      '..olDpCCCCpD',
      '..olDppppppD',
      '..olDpCCCCpD',
      '...olDDDDDDD',
      '...odbbbbbbb',
      '....oddbbbbb',
      '.....ooddddd',
      '.....orRoooo',
      '....orrRo...',
      '....orrRo...',
      '...orrRRo...',
      '...oRooRRo..',
      '...o....o...',
      '............',
    ],
  },
  // A brass star on a garnet ribbon: an accolade for training.
  'shop.trainer': {
    keys: { o: 8, d: 10, b: 11, l: 12, h: 13, r: 16, R: 15, s: 17 },
    rows: [
      '............',
      '..oooo......',
      '..osrRo.....',
      '...osrRo....',
      '....osrRo...',
      '.....osrRo..',
      '......osrRoo',
      '.......osrRR',
      '........oooo',
      '..........oo',
      '.........olh',
      '.........olh',
      '...ooooooolb',
      '...ohhllllbb',
      '....odbbbbbb',
      '.....odbbbbb',
      '......obbbbb',
      '.....olbbbbb',
      '.....olbbbbb',
      '....olbbbo..',
      '...olbbo....',
      '...ooooo....',
      '............', '............',
    ],
  },
  // A looped sky-blue ribbon among golden stars.
  'shop.stellar': {
    keys: { o: 18, c: 20, C: 21, y: 13, Y: 12 },
    rows: [
      '............',
      '............',
      '..Y......ooo',
      '.YyY...ooCCC',
      '..Y...oCCCcc',
      '......oCCcoo',
      '.....oCCco..',
      '.....oCCco..',
      '.....oCCco..',
      '......oCCco.',
      '.......oCCco',
      '........oCCc',
      '.......oCCcc',
      '......oCCco.',
      '.....oCCco..',
      '....oCCco...',
      '...oCCco....',
      '..oooo......',
      '............',
      '...........Y',
      '..........Yy',
      '...........Y',
      '............', '............',
    ],
  },
  // A crimson cape hung from a golden clasp, trimmed in gold: the Champion's Bundle's.
  'shop.coins3': {
    keys: { o: 8, r: 15, R: 16, p: 17, y: 12, Y: 13, d: 14 },
    rows: [
      '............', '............',
      '.........ooo',
      '.......ooyYY',
      '......oyyyyY',
      '.....orRRoyy',
      '....orRRRRoy',
      '....orRRRRRo',
      '...orRRRRRRR',
      '...orRRpRRRR',
      '...orRRpRRRR',
      '..orRRRpRRRR',
      '..orRRRpRRRR',
      '..orRRpRRRRR',
      '..orRRpRRRRd',
      '.orRRRpRRRRd',
      '.orRRpRRRRRd',
      '.orRRpRRRRdd',
      '.orRRpRRRRdd',
      '.oyYRRRRRRdd',
      '.oyyyyyyyyyy',
      '..oooooooooo',
      '............', '............',
    ],
  },
  // A golden star: Champion Status's banner and the Champion's Club's tiers.
  [CHAMPION_STAR_SPRITE]: {
    keys: { o: 10, y: 12, Y: 13, b: 11 },
    rows: [
      '............', '............',
      '...........o',
      '..........oY',
      '..........oY',
      '.........oYY',
      '.........oyY',
      '........oyyY',
      '.ooooooooyyy',
      '.oYYYYyyyyyy',
      '..obyyyyyyyy',
      '...obyyyyyyy',
      '....obyyyyyy',
      '.....obyyyyy',
      '.....obyyyyy',
      '....obyyyyyy',
      '....obyyyyyy',
      '...obyyyybbb',
      '...obyybbooo',
      '..obybboo...',
      '..oboo......',
      '..oo........',
      '............', '............',
    ],
  },
  // A faceted ruby, pale highlights on its crown: Rubies, which ascend cards.
  [RUBY_SPRITE]: {
    keys: { o: 0, w: 13, p: 17, r: 16, R: 15, d: 14 },
    rows: [
      '............', '............', '............', '............',
      '.....ooooooo',
      '....opwprrrr',
      '...opwprrrRR',
      '..oppprrrRRR',
      '.ooooooooooo',
      '.orrrrrrRRRR',
      '..orrrrrRRRR',
      '...orrrrRRRd',
      '....orrrRRdd',
      '.....orrRRdd',
      '......orRRdd',
      '.......orRdd',
      '........oRdd',
      '.........odd',
      '..........od',
      '...........o',
      '............', '............', '............', '............',
    ],
  },
  // A golden ticket bearing a crimson star: a One Piece Ticket.
  [ONE_PIECE_SPRITE]: {
    keys: { o: 10, y: 12, Y: 13, b: 11, r: 16 },
    rows: [
      '............', '............', '............', '............', '............', '............',
      '.ooooooooooo',
      '.oYYYYYYYYYY',
      '.oYyyyyyyyyy',
      '..oyyyyyyyyr',
      '...oyyyyyyrr',
      '...oyyyyyrrr',
      '...oyyyyyyrr',
      '..oyyyyyyyry',
      '.oyyyyyyyyyy',
      '.obbbbbbbbbb',
      '.ooooooooooo',
      '............', '............', '............', '............', '............', '............', '............',
    ],
  },
};

/** `sprite`'s RGBA pixels, 24 by 24. */
function draw(id, { keys, rows }) {
  if (rows.length !== 24) throw Error(`${id}: ${rows.length} rows`);
  const pixels = Buffer.alloc(24 * 24 * 4);
  rows.forEach((row, y) => {
    const full = row.length === 12 ? row + [...row].reverse().join('') : row;
    if (full.length !== 24) throw Error(`${id} row ${y}: ${row.length} pixels`);
    [...full].forEach((k, x) => {
      if (k === '.') return;
      const c = PALETTE[keys[k]];
      if (!c) throw Error(`${id}: no colour for ${k}`);
      pixels.set([...c, 255], (y * 24 + x) * 4);
    });
  });
  return pixels;
}

const dir = 'public/assets/style', manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
const atlasJson = JSON.parse(readFileSync('public/assets/relics/atlas.json', 'utf8'));
const { decodePng } = await import('./ui-atlas-png.mjs');
const atlas = decodePng(readFileSync('public/assets/relics/atlas.png'));
const pitch = 28, padding = atlasJson.padding;
for (const [key, sprite] of Object.entries(SPRITES)) {
  const pixels = draw(key, sprite), relic = RELICS[key];
  const id = relic ? `relic-${key.replaceAll('.', '-')}` : key;
  writeFileSync(`${dir}/${id}.png`, encodePng(24, 24, pixels));
  manifest.assets[id] = { file: `${id}.png`, width: 24, height: 24 };
  if (!relic) continue;
  // The relic atlas: the next free cell after the event and tower relics.
  const i = atlasJson.regions[key] ? Object.keys(atlasJson.regions).indexOf(key) : Object.keys(atlasJson.regions).length;
  const x = (i % 18) * pitch + padding, y = Math.floor(i / 18) * pitch + padding;
  for (let r = 0; r < 24; r++) pixels.copy(atlas.pixels, ((y + r) * atlas.width + x) * 4, r * 24 * 4, (r + 1) * 24 * 4);
  atlasJson.regions[key] = { id, name: relic.name, rarity: relic.rarity, shop: true, file: `../style/${id}.png`, x, y, width: 24, height: 24 };
}
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
writeFileSync('public/assets/relics/atlas.png', encodePng(atlas.width, atlas.height, atlas.pixels));
writeFileSync('public/assets/relics/atlas.json', JSON.stringify(atlasJson, null, 2) + '\n');
const art = Object.fromEntries(Object.entries(atlasJson.regions).map(([key, { id, name, rarity }]) => [key, { id, name, rarity }]));
writeFileSync('src/sprites/relics.ts', '// Generated by tools/prepare-relic-sprites.mjs and tools/prepare-shop-sprites.mjs.\nexport const RELIC_ART = ' + JSON.stringify(art, null, 2) + ' as const;\n\nconst byName = new Map<string, string>(Object.values(RELIC_ART).map(a => [a.name, a.id]));\n/** Exact catalog names resolve without importing gameplay modules into artwork. */\nexport const relicSpriteId = (relic: { name: string }) => byName.get(relic.name);\n');
console.log(`Drew ${Object.keys(SPRITES).length} Shop sprites.`);
