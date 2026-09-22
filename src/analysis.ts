import type { Player, Tile, Run } from "./entities.ts";
import { predict } from "./combat.ts";

const DIRS = [[1,0], [-1,0], [0,1], [0,-1]];

export function isDeadlocked(run: Run, getTile: (x: number, y: number, h: number) => Tile, findStairs: (h: number) => {x: number, y: number} | null, width: number, currentHeight: number): boolean {
  // BFS state: "height,x,y"
  const queue = [{ h: currentHeight, x: run.player.x, y: run.player.y }];
  const seen = new Set<string>();
  seen.add(`${currentHeight},${run.player.x},${run.player.y}`);
  
  while (queue.length > 0) {
    const { h, x, y } = queue.shift()!;
    
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= 20) continue;
      
      const key = `${h},${nx},${ny}`;
      if (seen.has(key)) continue;
      
      const t = getTile(nx, ny, h);
      if (t.kind === "wall") continue;
      
      if (t.kind === "door") {
        if (run.player.keys[t.color!]) return false; 
        continue;
      }
      
      if (t.kind === "enemy") {
        const pred = predict(run.player, t.enemy!);
        if (pred.impervious) continue;
        if (pred.survivable) return false;
        continue;
      }
      
      if (t.kind === "potion" || t.kind === "attack" || t.kind === "defense" || t.kind === "key" || t.kind === "treasure" || t.kind === "reward") {
        return false;
      }
      
      if (t.kind === "stairs") {
        return false; // Can go up!
      }
      
      if (t.kind === "stairsDown") {
        if (h > 0) {
          const lowerStairs = findStairs(h - 1);
          if (lowerStairs) {
            const back = `${h-1},${lowerStairs.x},${lowerStairs.y}`;
            if (!seen.has(back)) {
              seen.add(back);
              queue.push({ h: h-1, x: lowerStairs.x, y: lowerStairs.y });
            }
          }
        }
        continue; // can pass, but doesn't inherently break deadlock
      }
      
      seen.add(key);
      queue.push({ h, x: nx, y: ny });
    }
  }
  return true;
}
