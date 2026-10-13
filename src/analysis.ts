import type { TowerRun, Tile } from "./entities.ts";
import { predict } from "./combat.ts";
import type { RoomWorld } from "./tower/room-world.ts";
import { doorCost } from "./doors.ts";
import { TowerClimb } from "./tower/climb.ts";

const DIRS = [[1,0], [-1,0], [0,1], [0,-1]];
/** Tiles the player can always step onto and take. */
const PICKUPS = new Set<Tile["kind"]>(["potion", "attack", "defense", "key", "treasure", "reward"]);

/** Conservative deadlock check of the Tower floor the run stands on, read
 * through the climb, as the same board play shows. The climb never goes
 * back down, so only this floor counts. */
export function isDeadlocked(run: TowerRun): boolean {
  // Every reachable space explored with no items, no unlocked doors, no
  // survivable enemies, and no stairs up found -> deadlocked.
  return !new ActionSearch(run).findsAction();
}

/** A breadth-first walk over the floor's open tiles, looking for anything
 * the player could still do. */
class ActionSearch {
  private board: RoomWorld;
  private queue: [number, number][] = [];
  private seen = new Set<string>();

  constructor(private run: TowerRun) {
    this.board = new TowerClimb(run).board();
  }

  findsAction() {
    this.enqueue(this.run.player.x, this.run.player.y);
    while (this.queue.length > 0) {
      const [x, y] = this.queue.shift()!;
      for (const [dx, dy] of DIRS) if (this.offersAction(x + dx, y + dy)) return true;
    }
    return false;
  }

  /** Looks at tile (x, y): true when it offers an action, and otherwise
   * queues whatever it leads on to. */
  private offersAction(x: number, y: number): boolean {
    if (this.seen.has(`${x},${y}`)) return false;
    const t = this.board.tile(x, y);
    if (PICKUPS.has(t.kind)) return true;
    switch (t.kind) {
      case "wall":
        return false;
      case "door":
        return doorCost(t, this.run.player) !== null;
      case "enemy": {
        const pred = predict(this.run.player, t.enemy!);
        return !pred.impervious && pred.survivable;
      }
      case "stairs":
        // The floor above is always new: climbing is always an action.
        return true;
      default:
        // Floor, oneway
        this.enqueue(x, y);
        return false;
    }
  }

  private enqueue(x: number, y: number) {
    const key = `${x},${y}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.queue.push([x, y]);
  }
}
