import type { Tile } from "./entities.ts";
import { tileRandom } from "./random.ts";

export type DungeonDetail = { variant: number; half: 0 | 1 };
export const dungeonDetailVariants = (material: string) => material === "masonry" ? 7 : 4;
export const dungeonDetailId = (material: string, tone: number) => material === "earth" ? "dungeon-details-earth" : `dungeon-details-${material}-${tone}`;

/** A sparse shared 48-pixel motif, selected once for both collision tiles.
 * Compatible edge masks keep long joints away from corners and material
 * changes. Missing cells stay solid but cannot receive an overlay. */
export function dungeonDetail(world: { tile(x: number, y: number): Tile | undefined }, x: number, y: number, seed: number,
  materialAt: (x: number, y: number) => string): DungeonDetail | undefined {
  const mod = (n: number, size: number) => (n % size + size) % size;
  const phase = mod(seed, 3), left = x - mod(x - phase, 3), bottom = y - mod(y, 3);
  if (x - left === 2) return; // One clear tile between neighboring motifs.
  const chance = tileRandom(left, bottom, seed ^ 0x5f713);
  if (chance >= .72 || y !== bottom + Math.floor(tileRandom(left, bottom, seed ^ 0x185b9) * 3)) return;
  if (world.tile(left, y)?.kind !== "wall" || world.tile(left + 1, y)?.kind !== "wall") return;
  const material = materialAt(left, y);
  if (material !== materialAt(left + 1, y)) return;
  const air = (x: number, y: number) => { const t = world.tile(x, y); return !!t && t.kind !== "wall"; };
  const north = air(left, y + 1), south = air(left, y - 1);
  if (north !== air(left + 1, y + 1) || south !== air(left + 1, y - 1)) return;
  const exposed = (x: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (air(x + dx, y + dy)) return true;
    return false;
  };
  if (!exposed(left) || !exposed(left + 1)) return;
  // Specific contexts take precedence over the general texture variants.
  const pick = tileRandom(left, y, seed ^ 0x93f27);
  const variant = material === "masonry"
    ? north && south ? (pick < .5 ? 3 : 5) : !north && !south ? (pick < .5 ? 1 : 6)
      : [0, 1, 2, 4][Math.floor(pick * 4)]
    : north && south ? 3 : !north && !south ? 1 : Math.floor(pick * 3);
  return { variant, half: (x - left) as 0 | 1 };
}
