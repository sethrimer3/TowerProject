const fs = require('fs');

let code = fs.readFileSync('src/generation.ts', 'utf8');

// Needs imports from puzzle.ts
if (!code.includes('generatePuzzleGraph')) {
  code = 'import { generatePuzzleGraph, type PuzzleNode } from "./puzzle.ts";\n' + code;
}

const newGenTowerRoom = `
export function generateTowerRoom(
  seed: number,
  room: number,
): Map<string, Tile> {
  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    const rng = random(seed ^ Math.imul(room + 1 + attempts * 1000, 2654435761));
    const cells = new Map<string, Tile>();
    const set = (x: number, y: number, t: Tile) => cells.set(point(x, y), t);
    const floor = (x: number, y: number) => set(x, y, { kind: "floor" });
    for (let y = 0; y < CHUNK; y++)
      for (let x = 0; x < WIDTH; x++) set(x, y, { kind: "wall" });
      
    // 1. Generate abstract graph
    const nodes = generatePuzzleGraph(seed + attempts * 1000, room);
    
    // 2. Generate BSP rooms
    // We want roughly nodes.length rooms
    const bspRng = random(seed ^ Math.imul(room + 2 + attempts * 1000, 2654435761));
    const bsp = bspRooms(1, 1, WIDTH - 2, CHUNK - 2, bspRng, 4);
    
    if (bsp.length < nodes.length) continue; // Not enough physical rooms, retry
    
    // Shuffle rooms slightly to assign nodes randomly but we need them connected!
    // Sort rooms roughly by distance from bottom-left
    bsp.sort((a, b) => (b.y - a.y) + (a.x - b.x));
    
    // Assign nodes 0..n to rooms 0..n
    const mapping = new Map<number, any>();
    for (let i = 0; i < nodes.length; i++) {
      mapping.set(nodes[i].id, bsp[i]);
    }
    
    // Carve room floors
    for (let i = 0; i < bsp.length; i++) {
      const r = bsp[i];
      for (let yy = r.y; yy < r.y + r.h; yy++) {
        for (let xx = r.x; xx < r.x + r.w; xx++) {
          floor(xx, yy);
        }
      }
    }
    
    // Entrance
    const startRoom = mapping.get(0);
    const entrance: [number, number] = [TOWER_START_X, 0];
    set(...entrance, room > 0 ? { kind: "stairsDown" } : { kind: "floor" });
    carvePath(cells, point, TOWER_START_X, 1, Math.floor(startRoom.x + startRoom.w/2), Math.floor(startRoom.y + startRoom.h/2), bspRng);
    
    // Map edges and place gates
    // To ensure strict gating, we carve ONLY the paths defined by the puzzle graph edges.
    let validMapping = true;
    for (const n of nodes) {
      const r1 = mapping.get(n.id);
      const cx1 = Math.floor(r1.x + r1.w / 2);
      const cy1 = Math.floor(r1.y + r1.h / 2);
      
      // Place node item
      if (n.type === "exit") {
        set(cx1, cy1, { kind: "stairs" });
      } else if (n.type === "reward") {
        if (n.reward === "attack" || n.reward === "defense" || n.reward === "potion" || n.reward === "treasure") {
          set(cx1, cy1, { kind: n.reward });
        } else if (n.reward === "key" && n.keyColor) {
          set(cx1, cy1, { kind: "key", color: n.keyColor });
        }
      }
      
      for (const edge of n.edges) {
        const r2 = mapping.get(edge.target);
        const cx2 = Math.floor(r2.x + r2.w / 2);
        const cy2 = Math.floor(r2.y + r2.h / 2);
        
        // Carve path
        carvePath(cells, point, cx1, cy1, cx2, cy2, bspRng);
        
        // Place gate roughly halfway
        const hx = Math.floor((cx1 + cx2) / 2);
        const hy = Math.floor((cy1 + cy2) / 2);
        
        if (edge.gate === "door") {
           set(hx, hy, { kind: "door", color: edge.doorColor });
        } else if (edge.gate === "enemy" && edge.enemy) {
           set(hx, hy, { kind: "enemy", enemy: edge.enemy });
        }
      }
    }
    
    if (validMapping) return cells;
  }
  
  // Fallback if loop fails, shouldn't happen but TS wants a return
  return new Map<string, Tile>();
}
`;

const startIdx = code.indexOf('export function generateTowerRoom(');
const endIdx = code.indexOf('export function RoomWorld', startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  code = code.substring(0, startIdx) + newGenTowerRoom + code.substring(endIdx);
  fs.writeFileSync('src/generation.ts', code);
}
