import type { Run, Tile } from "./entities.ts";
import { predict } from "./combat.ts";
import { generateTowerRoom } from "./generation.ts";
import { doorCost } from "./doors.ts";

const DIRS = [[1,0], [-1,0], [0,1], [0,-1]];
/** Tiles the player can always step onto and take. */
const PICKUPS = new Set<Tile["kind"]>(["potion", "attack", "defense", "key", "treasure", "reward"]);

type Floors = Record<number, Record<string, Tile>>;
type Spot = { h: number; x: number; y: number };

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
  // Every reachable space across all visited floors (and the one step of
  // unexplored space above) explored with no items, no unlocked doors, no
  // survivable enemies, and no unexplored stairway found -> deadlocked.
  return !new ActionSearch(run, run.floors).findsAction();
}

/** A breadth-first walk over the visited floors' open tiles, through their
 * stairways, looking for anything the player could still do. */
class ActionSearch {
  private bases = new Map<number, Map<string, Tile>>();
  private queue: Spot[] = [];
  private seen = new Set<string>();

  constructor(private run: Run, private floors: Floors) {}

  findsAction() {
    this.enqueue(this.run.height, this.run.player.x, this.run.player.y);
    while (this.queue.length > 0) {
      const { h, x, y } = this.queue.shift()!;
      // Only floors actually visited (or the one step above a reachable
      // stairway, handled in `climb`) are explored — never an arbitrarily
      // deep unvisited floor.
      if (h !== this.run.height && !this.floors[h]) continue;
      for (const [dx, dy] of DIRS) if (this.offersAction(h, x + dx, y + dy)) return true;
    }
    return false;
  }

  /** Looks at tile (x, y) of floor `h`: true when it offers an action, and
   * otherwise queues whatever it leads on to. */
  private offersAction(h: number, x: number, y: number): boolean {
    const key = `${h},${x},${y}`;
    if (this.seen.has(key)) return false;
    const t = this.tileAt(h, x, y);
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
        return this.climb(h);
      case "stairsDown":
        this.descend(h);
        return false;
      default:
        // Floor, oneway
        this.enqueue(h, x, y);
        return false;
    }
  }

  /** Stairs up from floor `h`. Unexplored floors above are always
   * reachable-in-principle: the player can always climb to generate a new
   * room, so reaching stairs to one means the run is not deadlocked. A
   * visited floor above is searched from its stairs down. */
  private climb(h: number) {
    if (!this.floors[h + 1]) return true;
    const down = this.find(h + 1, "stairsDown");
    if (down) this.enqueue(h + 1, ...down);
    return false;
  }

  /** Stairs down from floor `h` lead on to its stairs up, if it was visited. */
  private descend(h: number) {
    if (h <= 0 || !this.floors[h - 1]) return;
    const up = this.find(h - 1, "stairs");
    if (up) this.enqueue(h - 1, ...up);
  }

  private enqueue(h: number, x: number, y: number) {
    const key = `${h},${x},${y}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.queue.push({ h, x, y });
  }

  private base(h: number) {
    let base = this.bases.get(h);
    if (!base) {
      base = generateTowerRoom(this.run.seed, h);
      this.bases.set(h, base);
    }
    return base;
  }

  private tileAt(h: number, x: number, y: number): Tile {
    const key = `${x},${y}`;
    return this.floors[h]?.[key] ?? this.base(h).get(key) ?? { kind: "wall" };
  }

  /** Where the first tile of `kind` stands on floor `h`'s base layout. */
  private find(h: number, kind: string): [number, number] | null {
    for (const [k, t] of this.base(h))
      if (t.kind === kind) {
        const [x, y] = k.split(",").map(Number);
        return [x, y];
      }
    return null;
  }
}
