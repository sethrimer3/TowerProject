import type { Tile } from "./entities.ts";
import { OutsideWorld, OUTSIDE_SIZE, OUTSIDE_START_Y } from "./outside.ts";

export const FISHERMAN_DIALOGUE = "Come back later, traveller...";
export const FISHERMAN = { x: 6, y: 8 } as const;
/** A fixed shore keeps the path and dock connected for every run seed. */
const SHORE = [11, 11, 12, 12, 12, 13, 13, 13, 13, 14, 14, 15, 16, 16, 17, 17, 18, 18, 19, 19];
export const shoreAt = (y: number) => SHORE[Math.max(0, Math.min(OUTSIDE_SIZE - 1, y))];
export const onDock = (x: number, y: number) =>
  (y === OUTSIDE_START_Y && x >= 6 && x <= 13) || (x >= 5 && x <= 7 && y >= 6 && y <= 8);
export const atFisherman = (x: number, y: number) => x === FISHERMAN.x && y === FISHERMAN.y;
/** Decorative trunks also define collision, so a visible tree cannot be walked through. */
export const LAKE_TREES = [
  { x: 16, y: 18, id: "forest-old-pine" }, { x: 19, y: 16, id: "forest-pine" },
  { x: 17, y: 14, id: "forest-birch" }, { x: 19, y: 12, id: "forest-elder" },
  { x: 16, y: 11, id: "forest-oak" }, { x: 19, y: 10, id: "forest-pine" },
  { x: 17, y: 3, id: "forest-elder" }, { x: 14, y: 1, id: "forest-birch" },
  { x: 19, y: 0, id: "forest-old-pine" },
] as const;

/** An outside area of Tower I, rather than a new tier or a dungeon run. */
export class LakeWorld extends OutsideWorld {
  constructor(seed: number) { super(seed, "tower", false, false, false, true); }
  override tile(x: number, y: number): Tile {
    if (x < 0 || x >= this.width || y < 0 || y >= OUTSIDE_SIZE) return { kind: "wall" };
    if (atFisherman(x, y)) return { kind: "wall" };
    if (onDock(x, y) || (y === OUTSIDE_START_Y && x >= 13)) return { kind: "floor" };
    if (x <= shoreAt(y) || y >= 12 || LAKE_TREES.some(t => t.x === x && t.y === y)) return { kind: "wall" };
    return { kind: "floor" };
  }
  override isProvingGrounds(_x: number, _y: number) { return false; }
  override isArch(_x: number, _y: number) { return false; }
  override atExit(_x: number, _y: number) { return false; }
}
