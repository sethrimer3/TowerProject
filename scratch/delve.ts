import { validate, random, rollUnguardedLoot, reachable } from "./generation.ts";
import { CHUNK, WIDTH, START_X, DELVE_MAX_DEPTH } from "./config.ts";
import { point, type Tile } from "./entities.ts";

export function generateFullDelveMap(seed: number): Map<string, Tile> {
  const rng = random(seed);
  const cells = new Map<string, Tile>();
  const set = (x: number, y: number, t: Tile) => cells.set(point(x, y), t);
  const floor = (x: number, y: number) => set(x, y, { kind: "floor" });
  for (let y = 0; y < DELVE_MAX_DEPTH; y++)
    for (let x = 0; x < WIDTH; x++) set(x, y, { kind: "wall" });

  floor(START_X, 0);

  const regions = [{ x: 1, y: 1, w: WIDTH - 2, h: DELVE_MAX_DEPTH - 2 }];
  const rooms: any[] = [];
  const minSize = 4;
  
  // To connect rooms, we save the splits
  const edges: {x: number, y: number}[] = [];

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
      const r1 = { x: r.x, y: r.y, w: r.w, h: split };
      const r2 = { x: r.x, y: r.y + split + wallThick, w: r.w, h: r.h - split - wallThick };
      regions.push(r1);
      regions.push(r2);
      // door
      const dx = r.x + Math.floor(rng() * r.w);
      for(let wy = r1.y + r1.h; wy < r2.y; wy++) edges.push({x: dx, y: wy});
    }
    function splitV(r: any) {
      const wallThick = rng() < 0.25 ? 2 : 1; 
      const split = Math.floor(rng() * (r.w - minSize * 2 - wallThick + 1)) + minSize;
      const r1 = { x: r.x, y: r.y, w: split, h: r.h };
      const r2 = { x: r.x + split + wallThick, y: r.y, w: r.w - split - wallThick, h: r.h };
      regions.push(r1);
      regions.push(r2);
      // door
      const dy = r.y + Math.floor(rng() * r.h);
      for(let wx = r1.x + r1.w; wx < r2.x; wx++) edges.push({x: wx, y: dy});
    }
  }

  for (let r of rooms) {
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      for (let xx = r.x; xx < r.x + r.w; xx++) {
        floor(xx, yy);
      }
    }
  }
  
  // carve the split doors
  for (let e of edges) floor(e.x, e.y);
  
  // connect entrance
  floor(START_X, 1);
  
  // we need to place enemies, loot, and oneway doors!
  // ...
  
  return cells;
}
