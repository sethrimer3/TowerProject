import type { Tile } from "./entities.ts";
import { tileRandom } from "./random.ts";

export type DungeonWallDepth = 0 | 1 | 2;
export type DungeonWallProfile = { depth: DungeonWallDepth; openings: number };

/** Keep the actual 5x5 opening positions, not just four directions: one
 * diagonal opening must never illuminate an entire unrelated tile edge. */
export function dungeonWallProfile(world: { tile(x: number, y: number): Tile | undefined }, x: number, y: number): DungeonWallProfile {
  let depth: DungeonWallDepth = 2, openings = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (!dx && !dy) continue;
    const tile = world.tile(x + dx, y + dy);
    if (!tile || tile.kind === "wall") continue;
    openings |= 1 << ((dy + 2) * 5 + dx + 2);
    if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) depth = 0;
    else if (depth === 2) depth = 1;
  }
  return { depth, openings };
}

export const dungeonWallDepth = (world: { tile(x: number, y: number): Tile | undefined }, x: number, y: number) => dungeonWallProfile(world, x, y).depth;

/** Two-pixel clusters cut literal PNG textures into three hard shade bands.
 * Distance is measured to air rectangles in world space, so contours cross
 * tile seams and round corners continuously, including negative coordinates.
 * Only the contour varies; lighting and texture orientation never rotate. */
export function dungeonWallBands(profile: DungeonWallProfile, x: number, y: number, seed: number): Uint8Array {
  const air: [number, number][] = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
    if (profile.openings & (1 << ((dy + 2) * 5 + dx + 2))) air.push([dx * 24, -dy * 24]);
  const bands = new Uint8Array(144);
  // A native tile fits within one noise cell; sample its corners just once.
  const ix = Math.floor(x / 2), iy = Math.floor(-y / 2);
  const a = tileRandom(ix, iy, seed ^ 0x48d31), b = tileRandom(ix + 1, iy, seed ^ 0x48d31);
  const c = tileRandom(ix, iy + 1, seed ^ 0x48d31), d = tileRandom(ix + 1, iy + 1, seed ^ 0x48d31);
  for (let py = 0; py < 24; py += 2) for (let px = 0; px < 24; px += 2) {
    let distance = Infinity;
    for (const [ax, ay] of air) {
      const dx = Math.max(ax - px - 1, px + 1 - ax - 24, 0);
      const dy = Math.max(ay - py - 1, py + 1 - ay - 24, 0);
      distance = Math.min(distance, Math.sqrt(dx * dx + dy * dy));
    }
    // Broad, gently stepped contours rather than per-tile cutout stamps.
    const u = (x * 24 + px + 1) / 48 - ix, v = (-y * 24 + py + 1) / 48 - iy;
    const relief = (((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v) - .5) * 6;
    bands[py / 2 * 12 + px / 2] = distance <= 14 + relief ? 0 : distance <= 28 + relief ? 1 : distance <= 42 + relief ? 2 : 3;
  }
  return bands;
}
