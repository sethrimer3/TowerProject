import type { TowerRun, Tile } from "../entities.ts";
import { TOWER_SECTION, TOWER_START_X } from "../config.ts";
import { RoomWorld } from "./room-world.ts";
import { extraEnemies } from "../more-enemies.ts";

type Changes = Record<string, Tile>;

/** A Tower run's climb through its floors: which floors were visited, each
 * one's changes, and going up and down between them.
 *
 * The floor the player stands on keeps its changes in `run.changes`; every
 * other visited floor keeps its own in `run.floors`, by height. Changing
 * floors moves the maps across, so no floor's changes are ever shared.
 * An entry in `run.floors` for the current height is out of date and is
 * never read. */
export class TowerClimb {
  constructor(private run: TowerRun) {}

  /** Whether the player has stood on floor `h` this run. */
  visited(h: number) {
    return h === this.run.height || !!this.run.floors?.[h];
  }

  /** Floor `h`'s changes, or undefined for a floor never visited. */
  changesOn(h: number): Changes | undefined {
    return h === this.run.height ? this.run.changes : this.run.floors?.[h];
  }

  /** Floor `h` as it stands now; a floor never visited is freshly generated. */
  board(h: number) {
    return new RoomWorld(this.run.seed, h, this.changesOn(h) ?? {}, this.run.percentPotions, this.run.tier, extraEnemies(this.run.badges));
  }

  /** A section's first floor is sealed below. */
  get sealedBelow() {
    return this.run.height % TOWER_SECTION === 0;
  }

  /** Climbs the stairs to the next floor's entrance. */
  up() {
    this.moveTo(this.run.height + 1);
    this.run.maxHeight = Math.max(this.run.maxHeight ?? 0, this.run.height);
    Object.assign(this.run.player, { x: TOWER_START_X, y: 0 });
    return { board: this.board(this.run.height), sectionStart: this.sealedBelow };
  }

  /** Takes the stairs down onto the floor below's stairs up; null when this
   * floor is sealed below. */
  down() {
    if (this.sealedBelow) return null;
    this.moveTo(this.run.height - 1);
    const board = this.board(this.run.height);
    Object.assign(this.run.player, stairsOn(board, "stairs") ?? { x: TOWER_START_X, y: 0 });
    return { board };
  }

  private moveTo(h: number) {
    const floors = (this.run.floors ??= {});
    floors[this.run.height] = this.run.changes;
    this.run.changes = floors[h] ?? {};
    delete floors[h];
    this.run.height = h;
  }
}

/** Where the first tile of `kind` stands on the board's generated layout. */
export function stairsOn(board: RoomWorld, kind: "stairs" | "stairsDown") {
  for (const [k, t] of board.cells)
    if (t.kind === kind) {
      const [x, y] = k.split(",").map(Number);
      return { x, y };
    }
  return null;
}
