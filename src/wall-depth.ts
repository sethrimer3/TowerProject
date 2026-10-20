import type { Tile } from "./entities.ts";

export type DungeonWallDepth = 0 | 1 | 2;

/** All materials form one solid mass. Missing world cells are solid too.
 * The first ring is exposed, the second is sparse padding, the rest black. */
export function dungeonWallDepth(world: { tile(x: number, y: number): Tile | undefined }, x: number, y: number): DungeonWallDepth {
  for (const radius of [1, 2] as const) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
    const tile = world.tile(x + dx, y + dy);
    if (tile && tile.kind !== "wall") return radius === 1 ? 0 : 1;
  }
  return 2;
}
