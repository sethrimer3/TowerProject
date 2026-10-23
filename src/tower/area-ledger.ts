/** The Tower's area rewards. An area is the ten floors of a section, ending
 * at a Goals checkpoint (floors 1 to 10, 11 to 20 …). Climbing onto the
 * next area's first floor judges the area left behind: it is **mastered**
 * when the hero took no fight damage anywhere in it (only an area ending at
 * a checkpoint, whose warp it unlocks) and **cleared** when the hero
 * climbed past no enemy on any of its floors (the Inspiration its floors
 * pay on the milestone schedule, `clearedInspiration`; an area that would
 * pay none, as most past floor 1,000 and all past 10,000 do, is never
 * cleared, so it gets no chest and no burst; the climb
 * keeps only that of the floors left behind, `run.enemiesLeft`). Each is paid the moment it
 * is earned and recorded for good, by tower, in `save.goals`, so undo,
 * reloads and later runs never pay it twice. A chest for each then stands
 * in front of the hero on the new floor; it is a `reward` tile in the
 * floor's changes, and opening it pays nothing more, only shows the reward. */
import type { ChestTier, Tile } from "../entities.ts";
import type { Save } from "../save-shape.ts";
import type { TowerRun } from "../runs.ts";
import { TOWER_SECTION } from "../config.ts";
import { checkpoint } from "../goals.ts";
import { milestonePoints } from "../modes.ts";
import { earn } from "../profile.ts";
import { ENTRY } from "./embedder.ts";
import type { RoomWorld } from "./room-world.ts";

export type AreaReward = "mastered" | "cleared";
/** The Inspiration clearing the area ending at floor `last` pays: what
 * reaching its floors pays on the milestone schedule (`milestonePoints`),
 * so 10 an area to floor 100, 1 an area to 1,000, 1 at each hundredth floor
 * to 10,000, then none. */
export const clearedInspiration = (last: number) =>
  milestonePoints(last) - milestonePoints(Math.max(0, last - TOWER_SECTION));
/** How long an area reward's burst and its words last on the board. */
export const AREA_BURST_MS = 3200;
/** Each reward's chest. */
export const AREA_CHEST: Record<AreaReward, ChestTier> = { mastered: "gold", cleared: "silver" };
/** The reward a chest shows. */
export const chestReward = (tier: ChestTier | undefined): AreaReward => (tier === "gold" ? "mastered" : "cleared");

/** The tower a run climbs. */
const towerOf = (run: TowerRun) => run.tier ?? 1;

/** Where the chests go: the first tile inside, directly in front of the
 * hero (whatever stands there), then, for a second chest, the tile behind
 * it or beside it, plain floor first, never a wall, door or stairs. */
function chestSpots(board: RoomWorld) {
  const [x, y] = ENTRY;
  const near = [[x, y + 1], [x - 1, y], [x + 1, y]].filter(([nx, ny]) => !["wall", "door", "stairs"].includes(board.tile(nx, ny).kind));
  near.sort((a, b) => Number(board.tile(a[0], a[1]).kind !== "floor") - Number(board.tile(b[0], b[1]).kind !== "floor"));
  return [[x, y], ...near];
}

export class AreaLedger {
  constructor(private save: Save) {}

  /** Called once the run has climbed onto `board`, its new floor: when that
   * is an area's first floor, judges the area below, pays what it earned,
   * sets each reward's chest in front of the hero, and starts the new area
   * undamaged. Returns the rewards newly earned. */
  enter(run: TowerRun, board: RoomWorld): AreaReward[] {
    if (run.height === 0 || run.height % TOWER_SECTION !== 0) return [];
    const earned = this.judge(run);
    run.damaged = false;
    delete run.enemiesLeft;
    const spots = chestSpots(board);
    for (const reward of earned) {
      this.pay(run, reward);
      const spot = spots.shift();
      // The board reads the run's changes, so the chest shows at once.
      if (spot) run.changes[`${spot[0]},${spot[1]}`] = { kind: "reward", tier: AREA_CHEST[reward] } satisfies Tile;
    }
    return earned;
  }

  /** The rewards the area just left earns that its tower hasn't had yet.
   * Its last floor is the new floor's height, since floors count from 1. */
  private judge(run: TowerRun): AreaReward[] {
    const tower = towerOf(run), last = run.height, goals = this.save.goals;
    const earned: AreaReward[] = [];
    if (!run.damaged && checkpoint(tower, last) && !goals.mastered[tower]?.includes(last)) earned.push("mastered");
    if (!run.enemiesLeft && clearedInspiration(last) > 0 && !goals.cleared[tower]?.includes(last)) earned.push("cleared");
    return earned;
  }

  private pay(run: TowerRun, reward: AreaReward) {
    const tower = towerOf(run), list = (this.save.goals[reward][tower] ??= []);
    list.push(run.height);
    list.sort((a, b) => a - b);
    if (reward === "cleared") {
      const amount = clearedInspiration(run.height);
      this.save.tower.inspiration += amount;
      earn(this.save, "inspiration", amount);
      this.save.tower.runCurrency += amount;
    }
  }
}
