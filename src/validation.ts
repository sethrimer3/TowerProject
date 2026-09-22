import type { Tile, Player } from "./entities.ts";
import { predict } from "./combat.ts";
import { point } from "./entities.ts";

const DIRS = [[1,0], [-1,0], [0,1], [0,-1]];

export function validatePhysicalLayout(
  cells: Map<string, Tile>,
  startX: number,
  startY: number,
  exitX: number,
  exitY: number,
  startPlayer: Player
): boolean {
  // Can we reach the exit with the required keys?
  // We'll do a simple state-space search.
  // State: "x,y,keys"
  const queue = [{ x: startX, y: startY, keys: { ...startPlayer.keys }, hp: startPlayer.hp }];
  const seen = new Set<string>();
  
  const keyState = (k: Record<string, number>) => Object.entries(k).map(([c, n]) => `${c}:${n}`).sort().join(',');
  
  seen.add(`${startX},${startY},${keyState(startPlayer.keys)}`);
  
  while(queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.x === exitX && curr.y === exitY) return true;
    
    for (const [dx, dy] of DIRS) {
      const nx = curr.x + dx;
      const ny = curr.y + dy;
      const p = point(nx, ny);
      const t = cells.get(p);
      
      if (!t || t.kind === "wall") continue;
      
      let nextKeys = { ...curr.keys };
      let nextHp = curr.hp;
      let canPass = true;
      
      if (t.kind === "door") {
        if (!nextKeys[t.color!]) {
          canPass = false;
        } else {
          nextKeys[t.color!]--;
        }
      } else if (t.kind === "key") {
        nextKeys[t.color!] = (nextKeys[t.color!] || 0) + 1;
      } else if (t.kind === "enemy") {
        const pState: Player = { ...startPlayer, hp: curr.hp }; // use starting stats, we only care about keys/routing
        const pred = predict(pState, t.enemy!);
        if (pred.impervious || !pred.survivable) {
          // If we can't beat it, we can't path through it.
          // Wait, if it's lethal, maybe the puzzle intends for us to gain ATK first?
          // Since this is physical validation, we just need to know if the GRAPH constraints were broken.
          // The abstract graph generates a mathematically solvable sequence.
          // If the physical mapping connects things improperly, we might face a strong enemy too early.
          canPass = false; 
        }
      }
      
      if (canPass) {
        const s = `${nx},${ny},${keyState(nextKeys)}`;
        if (!seen.has(s)) {
          seen.add(s);
          queue.push({ x: nx, y: ny, keys: nextKeys, hp: nextHp });
        }
      }
    }
  }
  
  return false; // Exit not reachable
}
