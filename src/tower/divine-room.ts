import { TOWER_HEIGHT, TOWER_WIDTH } from "../config.ts";
import { point, type Tile, type Torch } from "../entities.ts";
import type { Board } from "../board.ts";
import { computeVisibilityPolygon, TORCH_LIGHT } from "../torches.ts";

/** Where the hero arrives in the builders' room: the middle of its lowest row. */
export const DIVINE_ARRIVAL = { x: 8, y: 1 } as const;
/** The Divine Relic's chest, in the middle of the room. */
export const DIVINE_CHEST = { x: 8, y: 8 } as const;
/** The portal back, at the upper end of the room. */
export const DIVINE_RETURN = { x: 8, y: TOWER_HEIGHT - 2 } as const;
/** The four lit torches, one in each corner. */
const CORNERS = [[1, 1], [TOWER_WIDTH - 2, 1], [1, TOWER_HEIGHT - 2], [TOWER_WIDTH - 2, TOWER_HEIGHT - 2]] as const;

const wall = (x: number, y: number) => x <= 0 || y <= 0 || x >= TOWER_WIDTH - 1 || y >= TOWER_HEIGHT - 1;

/** The builders' room on floor 999999 (divine.ts): not generated as floors
 * are, but always the same 17x17 room, a wall round its edge, a torch lit
 * in each corner that never goes out, and the Divine Relic's chest (a gold
 * area chest's look) in the middle until opened. The run's changes hold the
 * chest once opened. It has no `cells` or `room`, so it gets no decor. */
export class DivineRoom implements Board {
  width = TOWER_WIDTH;
  height = TOWER_HEIGHT;
  floor = 0;
  torches: Torch[];
  constructor(public changes: Record<string, Tile>) {
    this.torches = CORNERS.map(([x, y]) => {
      const torch: Torch = { x, y, lightRadius: TORCH_LIGHT.radius, baseIntensity: TORCH_LIGHT.intensity, active: true };
      torch.visibilityPolygon = computeVisibilityPolygon(torch, wall);
      return torch;
    });
  }
  tile(x: number, y: number): Tile {
    if (wall(x, y)) return { kind: "wall" };
    const changed = this.changes[point(x, y)];
    if (changed) return changed;
    return x === DIVINE_CHEST.x && y === DIVINE_CHEST.y ? { kind: "reward", tier: "gold" } : { kind: "floor" };
  }
  step(x: number, y: number, dx: number, dy: number) {
    const nx = x + dx, ny = y + dy;
    return nx >= 0 && nx < this.width && ny >= 0 && ny < this.height ? { x: nx, y: ny } : null;
  }
  clear(x: number, y: number) {
    this.changes[point(x, y)] = { kind: "floor" };
  }
  /** The builders' torches burn on whatever walks through them. */
  breakTorchAt() {
    return false;
  }
}
