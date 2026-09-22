import type { Run, Tile } from "./entities.ts";
import { predict } from "./combat.ts";

const DIRS = [[1,0], [-1,0], [0,1], [0,-1]];

export function isDeadlocked(run: Run): boolean {
  if (!run.floors) return false;
  
  const queue = [{ h: run.height, x: run.player.x, y: run.player.y }];
  const seen = new Set<string>();
  seen.add(`${run.height},${run.player.x},${run.player.y}`);
  
  while (queue.length > 0) {
    const { h, x, y } = queue.shift()!;
    const floorCells = run.floors[h];
    if (!floorCells) continue;
    
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      
      const key = `${h},${nx},${ny}`;
      if (seen.has(key)) continue;
      
      const tileObj = floorCells[`${nx},${ny}`];
      const t: Tile = tileObj ? (tileObj as unknown as Tile) : { kind: "wall" };
      
      if (t.kind === "wall") continue;
      
      if (t.kind === "door") {
        if (run.player.keys[t.color!]) return false; // Action available
        continue;
      }
      
      if (t.kind === "enemy") {
        const pred = predict(run.player, t.enemy!);
        if (!pred.impervious && pred.survivable) return false; // Action available
        continue;
      }
      
      if (t.kind === "potion" || t.kind === "attack" || t.kind === "defense" || t.kind === "key" || t.kind === "treasure" || t.kind === "reward") {
        return false; // Action available
      }
      
      if (t.kind === "stairs") {
        const upFloor = h + 1;
        // If we haven't visited upFloor, we can go there and generate it -> NOT deadlocked
        if (!run.floors[upFloor]) return false; 
        
        // Find stairsDown on upFloor
        const upTiles = Object.entries(run.floors[upFloor]);
        const downStairs = upTiles.find(([, t]) => (t as Tile).kind === "stairsDown");
        if (downStairs) {
          const [sx, sy] = downStairs[0].split(',').map(Number);
          const upKey = `${upFloor},${sx},${sy}`;
          if (!seen.has(upKey)) {
            seen.add(upKey);
            queue.push({ h: upFloor, x: sx, y: sy });
          }
        }
        continue;
      }
      
      if (t.kind === "stairsDown") {
        if (h > 0) {
          const downFloor = h - 1;
          if (run.floors[downFloor]) {
            const downTiles = Object.entries(run.floors[downFloor]);
            const upStairs = downTiles.find(([, t]) => (t as Tile).kind === "stairs");
            if (upStairs) {
              const [sx, sy] = upStairs[0].split(',').map(Number);
              const downKey = `${downFloor},${sx},${sy}`;
              if (!seen.has(downKey)) {
                seen.add(downKey);
                queue.push({ h: downFloor, x: sx, y: sy });
              }
            }
          }
        }
        continue;
      }
      
      // Floor, oneway
      seen.add(key);
      queue.push({ h, x: nx, y: ny });
    }
  }
  
  // If we explored all reachable space and found no items, no unlocked doors, no survivable enemies, and no unexplored floors -> Deadlocked
  return true;
}
