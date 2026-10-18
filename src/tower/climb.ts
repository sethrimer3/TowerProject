import type { TowerRun } from "../runs.ts";
import { TOWER_SECTION, TOWER_START_X } from "../config.ts";
import { RoomWorld } from "./room-world.ts";
import { runExtras } from "../card-trees.ts";

/** A Tower run's climb: the floor it stands on and the stairs up from it.
 *
 * The climb only goes up. The floor the player stands on keeps its changes
 * in `run.changes`; a floor left behind is forgotten, all but whether it
 * still held an enemy (`run.enemiesLeft`, for its area's cleared reward). */
export class TowerClimb {
  constructor(private run: TowerRun) {}

  /** The floor the run stands on, as it stands now. */
  board() {
    return new RoomWorld(this.run.seed, this.run.height, this.run.changes, this.run.percentPotions, this.run.tier, runExtras(this.run), this.run.shrine?.applied?.foes, this.run.chestOdds);
  }

  /** Climbs the stairs to the next floor's entrance; `sectionStart` when
   * it is a section's first floor. */
  up() {
    if (!noEnemies(this.board())) this.run.enemiesLeft = true;
    this.run.height++;
    this.run.changes = {};
    this.run.maxHeight = Math.max(this.run.maxHeight ?? 0, this.run.height);
    Object.assign(this.run.player, { x: TOWER_START_X, y: 0 });
    return { board: this.board(), sectionStart: this.run.height % TOWER_SECTION === 0 };
  }
}

/** Whether a floor has no enemy left. */
export function noEnemies(world: RoomWorld) {
  for (const k of world.cells.keys()) {
    const [x, y] = k.split(",").map(Number);
    if (world.tile(x, y).kind === "enemy") return false;
  }
  return true;
}
