// node tools/prepare-divine-relic-sprites.mjs
// Draws the Divine Relics' 24 × 24 artwork (src/divine.ts) in the shared UI
// palette (assets/ui-sprites/palette.ppm) and registers it in the style
// manifest; follow with npm run sprites:atlas. With --preview, also writes
// an 8× copy of each to test-results/divine-relics/ for review.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { encodePng } from './ui-atlas-png.mjs';

const SIZE = 24;
// The palette's ramps used: slate outline, brass, and the pale blue of time.
const C = {
  o: [12, 16, 22], k: [41, 37, 31], d: [128, 96, 61], m: [178, 138, 82], l: [225, 187, 120], h: [238, 224, 183],
  B: [84, 135, 154], b: [136, 197, 219],
};

/** The Chrono Anchor: an anchor whose ring is a clock face, its hands at
 * twelve and three, a stock across its shank, its arms curving up into flukes. */
function chronoAnchor() {
  const px = Array.from({ length: SIZE }, () => Array(SIZE).fill('.'));
  const cx = 12, ring = { y: 5.5, outer: 5.2, inner: 3.3 };
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) px[y][x] = c; };
  // Lit from the upper left: pale left of the middle, dark right of it.
  const metal = (x) => (x < cx - 1 ? 'l' : x <= cx ? 'm' : 'd');
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = x + 0.5 - (cx + 0.5), dy = y + 0.5 - ring.y, r = Math.sqrt(dx * dx + dy * dy);
    // The ring and its clock face.
    if (r < ring.inner) set(x, y, r < 1.2 ? 'h' : 'b');
    else if (r < ring.outer) set(x, y, dy < -1.5 && dx < 0.5 ? 'h' : metal(x));
    // The shank, a pixel wide each side of the middle.
    if (y >= 10 && y <= 21 && Math.abs(dx) < 1) set(x, y, metal(x));
    // The arms: the lower part of a ring round the stock, thin.
    const ay = y + 0.5 - 13, ar = Math.sqrt(dx * dx + ay * ay);
    if (ay > 2.5 && ar > 7.2 && ar < 8.7) set(x, y, ay > 6.5 ? 'd' : metal(x));
  }
  // The stock across the shank, its ends knobbed.
  for (let x = cx - 5; x <= cx + 5; x++) set(x, 12, x < cx ? 'h' : 'l');
  for (const x of [cx - 5, cx + 5]) { set(x, 11, 'm'); set(x, 13, 'd'); }
  // The flukes: barbs turned up and out at the arms' tips.
  for (const side of [-1, 1]) {
    const tip = cx + side * 8, c = side < 0 ? 'l' : 'm';
    for (const [dx, dy] of [[0, 15], [0, 14], [side, 15], [side, 16], [-side, 14], [-side, 13]]) set(tip + dx, dy, c);
  }
  // The clock's hands, at twelve and three, its pin, and ticks at six and nine.
  for (const [x, y] of [[cx, 3], [cx, 4], [cx, 5], [cx + 1, 5], [cx + 2, 5]]) set(x, y, 'k');
  set(cx, 5, 'o');
  set(cx, 7, 'B'); set(cx - 2, 5, 'B');
  // A slate outline round the whole.
  const filled = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && px[y][x] !== '.' && px[y][x] !== '*';
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++)
    if (px[y][x] === '.' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => filled(x + dx, y + dy))) px[y][x] = '*';
  return px.map((row) => row.map((c) => (c === '*' ? 'o' : c)));
}

const ART = { 'relic-divine-chrono-anchor': chronoAnchor() };

const dir = 'public/assets/style', manifest = JSON.parse(readFileSync(`${dir}/manifest.json`));
const preview = process.argv.includes('--preview');
if (preview) mkdirSync('test-results/divine-relics', { recursive: true });
for (const [id, rows] of Object.entries(ART)) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  rows.forEach((row, y) => row.forEach((c, x) => {
    if (c === '.') return;
    const [r, g, b] = C[c], i = (y * SIZE + x) * 4;
    pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255;
  }));
  writeFileSync(`${dir}/${id}.png`, encodePng(SIZE, SIZE, pixels));
  manifest.assets[id] = { file: `${id}.png`, width: SIZE, height: SIZE };
  if (preview) {
    const k = 8, big = Buffer.alloc(SIZE * k * SIZE * k * 4);
    for (let y = 0; y < SIZE * k; y++) for (let x = 0; x < SIZE * k; x++) pixels.copy(big, (y * SIZE * k + x) * 4, ((Math.floor(y / k) * SIZE) + Math.floor(x / k)) * 4, ((Math.floor(y / k) * SIZE) + Math.floor(x / k)) * 4 + 4);
    writeFileSync(`test-results/divine-relics/${id}.png`, encodePng(SIZE * k, SIZE * k, big));
  }
}
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Drew ${Object.keys(ART).length} Divine Relic sprite(s).`);
