import { FISHERMAN, LAKE_TREES, onDock, shoreAt } from "../lakeside.ts";
import { OUTSIDE_SIZE, OUTSIDE_START_Y } from "../outside.ts";
import { drawKit, kitImage } from "../sprites/kit.ts";
import { drawForestSprite, FOREST_SPRITES } from "../sprites/forest.ts";
import type { FrameContext } from "./render-frame.ts";

/** Native PNG terrain goes through the existing ground cache. */
export function drawLakeGround(c: CanvasRenderingContext2D, x: number, y: number) {
  const shore = shoreAt(y);
  let ready: boolean;
  if (x < shore) {
    const water = kitImage("lake-water");
    ready = !!water;
    if (water) {
      c.save();
      c.imageSmoothingEnabled = false;
      c.drawImage(water, ((x % 4 + 4) % 4) * 24, ((-y % 4 + 4) % 4) * 24, 24, 24, 0, 0, 24, 24);
      c.restore();
    }
  } else ready = drawKit(c, x === shore ? "lake-shore" : y === OUTSIDE_START_Y ? "forest-path" : "forest-grass");
  if (onDock(x, y)) ready = drawKit(c, "lake-dock") && ready;
  return ready;
}

/** Reuse the forest's mature trees; only water, shore, dock, reeds and fisherman need new art. */
export function drawLakeObjects(f: FrameContext, decoration: boolean) {
  const c = f.c;
  c.save();
  c.translate(-f.left * f.s, (f.n - OUTSIDE_SIZE + f.bottom) * f.s);
  c.scale(f.s / 24, f.s / 24);
  for (const t of LAKE_TREES) {
    const [width, height] = FOREST_SPRITES[t.id];
    drawForestSprite(c, t.id, t.x * 24 + 12 - width / 2, (OUTSIDE_SIZE - t.y) * 24 - height);
  }
  // End-platform mooring posts and their dark reflections stay clear of the walkway.
  for (const [x, y] of [[5, 6], [7, 6], [5, 8], [7, 8]]) {
    const left = x * 24 + (x === 5 ? 1 : 18), bottom = (OUTSIDE_SIZE - y) * 24;
    c.fillStyle = "#10151c"; c.fillRect(left, bottom - 12, 6, 17);
    c.fillStyle = "#80603d"; c.fillRect(left + 1, bottom - 11, 4, 14);
    c.fillStyle = "#e1bb78"; c.fillRect(left + 1, bottom - 12, 4, 2);
  }
  if (decoration) {
    for (const y of [1, 3, 10, 12, 16, 18]) {
      const x = shoreAt(y);
      drawKit(c, "lake-reeds", x * 24 - 8, (OUTSIDE_SIZE - y) * 24 - 36, 24, 36);
    }
    for (const [x, y, id] of [[15, 4, "forest-fern"], [18, 5, "forest-flowers"], [15, 9, "forest-boulder"]] as const)
      drawForestSprite(c, id, x * 24, (OUTSIDE_SIZE - 1 - y) * 24);
  }
  drawKit(c, "lake-fisherman", FISHERMAN.x * 24 - 24, (OUTSIDE_SIZE - FISHERMAN.y) * 24 - 40, 48, 40);
  c.restore();
}
