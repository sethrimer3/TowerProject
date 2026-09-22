import { random } from "./src/generation.ts";

function generateOrganicRooms(width: number, height: number, seed: number) {
  const rng = random(seed);
  // Grid of walls
  const grid = Array.from({ length: height }, () => Array(width).fill("#"));
  
  // Create a BSP tree
  const regions = [{ x: 1, y: 1, w: width - 2, h: height - 2 }];
  const rooms: { x: number, y: number, w: number, h: number }[] = [];

  while (regions.length > 0) {
    const r = regions.pop()!;
    // can we split?
    const minSize = 4;
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
      // Instead of always 1-thick walls, sometimes make them thicker
      const wallThick = rng() < 0.3 ? 2 : 1; 
      const split = Math.floor(rng() * (r.h - minSize * 2 - wallThick + 1)) + minSize;
      regions.push({ x: r.x, y: r.y, w: r.w, h: split });
      regions.push({ x: r.x, y: r.y + split + wallThick, w: r.w, h: r.h - split - wallThick });
    }
    function splitV(r: any) {
      const wallThick = rng() < 0.3 ? 2 : 1; 
      const split = Math.floor(rng() * (r.w - minSize * 2 - wallThick + 1)) + minSize;
      regions.push({ x: r.x, y: r.y, w: split, h: r.h });
      regions.push({ x: r.x + split + wallThick, y: r.y, w: r.w - split - wallThick, h: r.h });
    }
  }

  // carve rooms
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        // randomly make corners walls to make them organic
        grid[y][x] = ".";
      }
    }
    // organic corners
    if (rng() < 0.5) grid[r.y][r.x] = "#";
    if (rng() < 0.5) grid[r.y+r.h-1][r.x] = "#";
    if (rng() < 0.5) grid[r.y][r.x+r.w-1] = "#";
    if (rng() < 0.5) grid[r.y+r.h-1][r.x+r.w-1] = "#";
  }
  
  return grid.map(row => row.join("")).join("\n");
}

console.log(generateOrganicRooms(20, 20, 12345));
