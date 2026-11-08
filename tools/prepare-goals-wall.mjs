// Reuse the connected Tower masonry as an opaque UI tile, without changing
// dungeon art or padding/cropping a decorative swatch into a repeating wall.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('../public/assets/style/', import.meta.url);
copyFileSync(new URL('dungeon-floor-masonry-0.png', dir), new URL('goals-wall.png', dir));
const path = new URL('manifest.json', dir), manifest = JSON.parse(readFileSync(path, 'utf8'));
manifest.assets['goals-wall'] = { file: 'goals-wall.png', width: 96, height: 96, tile: true };
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
