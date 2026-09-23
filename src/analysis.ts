import type { Run, Tile } from "./entities.ts";
import { predict } from "./combat.ts";
import { generateTowerRoom } from "./generation.ts";
import { doorCost } from "./doors.ts";

const DIRS = [[1,0], [-1,0], [0,1], [0,-1]];

/** Conservative deadlock check across every visited Tower floor plus one
 * step of unexplored space above the highest reached stairs. `run.floors`
 * only ever stores this floor's MUTATIONS (cleared tiles), never a full
 * snapshot — so the true tile at any position is that mutation map
 * overlaid on the same deterministic base `generateTowerRoom(seed, height)`
 * regenerates every time. Reading `run.floors` alone (without that base)
 * would see every uncollected item, live enemy, unopened door and every
 * stairway as a plain wall, since none of those are ever written into the
 * mutation map — only consumed tiles (cleared to floor) are. */
export function isDeadlocked(run: Run): boolean {
  if (!run.floors) return false;

  const baseCache = new Map<number, Map<string, Tile>>();
  const baseFor = (h: number) => {
    let base = baseCache.get(h);
    if (!base) {
      base = generateTowerRoom(run.seed, h);
      baseCache.set(h, base);
    }
    return base;
  };
  const tileAt = (h: number, x: number, y: number): Tile => {
    const key = `${x},${y}`;
    return run.floors![h]?.[key] ?? baseFor(h).get(key) ?? { kind: "wall" };
  };
  const findKind = (h: number, kind: string): [number, number] | null => {
    for (const [k, t] of baseFor(h))
      if (t.kind === kind) {
        const [x, y] = k.split(",").map(Number);
        return [x, y];
      }
    return null;
  };

  const queue = [{ h: run.height, x: run.player.x, y: run.player.y }];
  const seen = new Set<string>();
  seen.add(`${run.height},${run.player.x},${run.player.y}`);

  while (queue.length > 0) {
    const { h, x, y } = queue.shift()!;
    // Only floors actually visited (or the one step above a reachable
    // stairway, handled below) are explored — never an arbitrarily deep
    // unvisited floor.
    if (h !== run.height && !run.floors[h]) continue;

    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;

      const key = `${h},${nx},${ny}`;
      if (seen.has(key)) continue;

      const t = tileAt(h, nx, ny);

      if (t.kind === "wall") continue;

      if (t.kind === "door") {
        if (doorCost(t, run.player) !== null) return false; // Action available
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
        // Unexplored floors above are always reachable-in-principle: the
        // player can always climb to generate a new room, so this alone
        // means the run is not deadlocked.
        if (!run.floors[upFloor]) return false;

        const downStairs = findKind(upFloor, "stairsDown");
        if (downStairs) {
          const [sx, sy] = downStairs;
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
            const upStairs = findKind(downFloor, "stairs");
            if (upStairs) {
              const [sx, sy] = upStairs;
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

  // Every reachable space across all visited floors (and the one step of
  // unexplored space above) was explored with no items, no unlocked doors,
  // no survivable enemies, and no unexplored stairway found -> deadlocked.
  return true;
}
