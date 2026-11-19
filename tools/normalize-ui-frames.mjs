// Native export geometry for continuous-frame-source.png's slate/brass design.
// Enforce whole-pixel, continuous rails rather than downsampling fragile highlights.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodePng } from './ui-atlas-png.mjs';
const root = fileURLToPath(new URL('../public/assets/ui/frames/', import.meta.url));
const manifest = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
const steel = ['8b9a9d', '63717b'], brass = ['e1bb78', 'b28a52'];
const styles = {
  button: [...brass, '1b2430'],
  'button-hover': ['eee0b7', 'e1bb78', '293543'],
  'button-selected': ['eee0b7', 'e1bb78', '293543'],
  'button-pressed': ['b28a52', '80603d', '10151c'],
  'button-disabled': [...steel, '1b2430'],
  'button-danger': ['a6544e', '693239', '382027'],
  panel: [...steel, '1b2430'], dialog: [...brass, '1b2430'],
  field: [...steel, '1b2430'], track: [...steel, '1b2430'],
  banner: [...brass, 'e1bb78'], slot: [...steel, '1b2430'],
};
for (const [name, [light, shade, center]] of Object.entries(styles)) {
  const width = 48, height = 24, pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const edge = Math.min(x, y, width - x - 1, height - y - 1);
    const color = edge === 0 ? '10151c' : edge === 1 ? light : edge === 2 ? shade : center;
    Buffer.from(color + 'ff', 'hex').copy(pixels, (y * width + x) * 4);
  }
  writeFileSync(root + name + '.png', encodePng(width, height, pixels));
  manifest.assets[name].slice = 3;
}
manifest.nativeScale = 1;
writeFileSync(root + 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');
