import type { Tile } from "./entities.ts";

export type DungeonWallDepth = 0 | 1 | 2;

/** The shaded band connects to the real opening instead of scattering
 * isolated fragments. Missing cells and all wall materials stay solid. */
export function dungeonWallProfile(world: { tile(x: number, y: number): Tile | undefined }, x: number, y: number): { depth: DungeonWallDepth; paddingMask: number } {
  let paddingMask = 0;
  for (const radius of [1, 2] as const) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
    const tile = world.tile(x + dx, y + dy);
    if (!tile || tile.kind === "wall") continue;
    if (radius === 1) return { depth: 0, paddingMask: 0 };
    if (dy === 2) paddingMask |= 1;
    if (dx === 2) paddingMask |= 2;
    if (dy === -2) paddingMask |= 4;
    if (dx === -2) paddingMask |= 8;
  }
  return { depth: paddingMask ? 1 : 2, paddingMask };
}

export const dungeonWallDepth = (world: { tile(x: number, y: number): Tile | undefined }, x: number, y: number) => dungeonWallProfile(world, x, y).depth;
