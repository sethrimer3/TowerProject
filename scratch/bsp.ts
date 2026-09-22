import { validate, random, rollUnguardedLoot, reachable } from "./generation.ts";
import { TOWER_WIDTH, TOWER_START_X, TOWER_CHUNK } from "./config.ts";
import { point, type Tile } from "./entities.ts";

export function bsp(x: number, y: number, w: number, h: number, rng: () => number, minSize = 4) {
  const regions = [{ x, y, w, h }];
  const rooms: { x: number, y: number, w: number, h: number }[] = [];
  while (regions.length > 0) {
    const r = regions.pop()!;
    const canSplitH = r.h > minSize * 2;
    const canSplitV = r.w > minSize * 2;
    if (canSplitH && canSplitV) {
      if (rng() < 0.5) splitH(r); else splitV(r);
    } else if (canSplitH) {
      splitH(r);
    } else if (canSplitV) {
      splitV(r);
    } else {
      rooms.push(r);
    }
    function splitH(r: any) {
      const wallThick = rng() < 0.25 ? 2 : 1; 
      const split = Math.floor(rng() * (r.h - minSize * 2 - wallThick + 1)) + minSize;
      regions.push({ x: r.x, y: r.y, w: r.w, h: split });
      regions.push({ x: r.x, y: r.y + split + wallThick, w: r.w, h: r.h - split - wallThick });
    }
    function splitV(r: any) {
      const wallThick = rng() < 0.25 ? 2 : 1; 
      const split = Math.floor(rng() * (r.w - minSize * 2 - wallThick + 1)) + minSize;
      regions.push({ x: r.x, y: r.y, w: split, h: r.h });
      regions.push({ x: r.x + split + wallThick, y: r.y, w: r.w - split - wallThick, h: r.h });
    }
  }
  return rooms;
}
