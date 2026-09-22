const fs = require('fs');

let code = fs.readFileSync('src/generation.ts', 'utf8');

const delveBspCode = `
const delveCaches = new Map<number, Map<string, Tile>>();

export function generateDelveMap(seed: number): Map<string, Tile> {
  const rng = random(seed);
  const cells = new Map<string, Tile>();
  const set = (x: number, y: number, t: Tile) => cells.set(point(x, y), t);
  const floor = (x: number, y: number) => set(x, y, { kind: "floor" });
  for (let y = 0; y < DELVE_MAX_DEPTH; y++)
    for (let x = 0; x < WIDTH; x++) set(x, y, { kind: "wall" });

  floor(START_X, 0);

  const rooms = bspRooms(1, 1, WIDTH - 2, DELVE_MAX_DEPTH - 2, rng, 4);
  const edges: {x: number, y: number}[] = [];
  
  for (let r of rooms) {
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      for (let xx = r.x; xx < r.x + r.w; xx++) {
        floor(xx, yy);
      }
    }
  }

  // We connect rooms by finding neighbors and carving
  // Simple heuristic: connect each room to one below it
  rooms.sort((a, b) => a.y - b.y);
  for (let i = 0; i < rooms.length - 1; i++) {
    const r1 = rooms[i];
    const r2 = rooms[i + 1];
    carvePath(cells, point, Math.floor(r1.x + r1.w / 2), Math.floor(r1.y + r1.h / 2), Math.floor(r2.x + r2.w / 2), Math.floor(r2.y + r2.h / 2), rng);
  }

  // Oneway passages every ~40 tiles
  for (let y = 40; y < DELVE_MAX_DEPTH; y += 40) {
    // Find a floor tile at this y
    let floorX = -1;
    for (let x = 1; x < WIDTH - 1; x++) {
      if (cells.get(point(x, y))?.kind === 'floor') {
        floorX = x;
        break;
      }
    }
    if (floorX !== -1) {
      set(floorX, y, { kind: "oneway" });
      // block other paths at this y
      for (let x = 1; x < WIDTH - 1; x++) {
        if (x !== floorX) set(x, y, { kind: "wall" });
      }
      // ensure path above and below
      floor(floorX, y - 1);
      floor(floorX, y + 1);
    }
  }

  // Place enemies and loot in rooms
  for (let room of rooms) {
    const height = room.y;
    if (height < 2) continue; // skip entrance
    const tier = Math.min(3, Math.floor(height / 35));
    const names = ["Cinder slime", "Bone sentinel", "Dusk wing", "Ash warden"];
    const cx = Math.floor(room.x + room.w / 2);
    const cy = Math.floor(room.y + room.h / 2);
    if (rng() < 0.3) {
      set(cx, cy, {
        kind: "enemy",
        enemy: {
          name: names[tier],
          hp: 12 + tier * 16 + Math.floor(height * 0.5),
          attack: 6 + tier * 4 + Math.floor(height / 12),
          defense: 1 + tier * 2,
          tier,
        }
      });
    } else if (rng() < 0.2) {
      set(cx, cy, { kind: "potion" });
    } else if (rng() < 0.1) {
      set(cx, cy, { kind: "treasure" });
    }
  }

  return cells;
}

export function generate(seed: number, index: number): Map<string, Tile> {
  let fullMap = delveCaches.get(seed);
  if (!fullMap) {
    fullMap = generateDelveMap(seed);
    delveCaches.set(seed, fullMap);
  }
  const chunk = new Map<string, Tile>();
  for (let y = index * CHUNK; y < (index + 1) * CHUNK; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const t = fullMap.get(point(x, y));
      if (t) chunk.set(point(x, y), t);
    }
  }
  return chunk;
}
`;

// Replace the entire export function generate(seed, index) in the original code
const genStart = code.indexOf('export function generate(seed: number, index: number): Map<string, Tile> {');
const nextExport = code.indexOf('export function rollUnguardedLoot', genStart);
if (genStart !== -1 && nextExport !== -1) {
  code = code.substring(0, genStart) + delveBspCode + '\n' + code.substring(nextExport);
}

fs.writeFileSync('src/generation.ts', code);
