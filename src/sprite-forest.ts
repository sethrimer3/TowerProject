import { drawKit, kitImage } from "./sprite-kit.ts";

/** Native pixels, shared with the exporter. Large crowns contain more
 * pixels rather than scaling up a one-tile tree icon. */
export const FOREST_SPRITES = {
  "forest-oak": [72, 72],
  "forest-elder": [96, 72],
  "forest-birch": [72, 72],
  "forest-pine": [48, 72],
  "forest-old-pine": [72, 96],
  "forest-young-pine": [24, 36],
  "forest-sapling": [24, 36],
  "forest-shrub": [24, 24],
  "forest-berries": [24, 24],
  "forest-fern": [24, 24],
  "forest-boulder": [24, 24],
  "forest-mossy-boulder": [24, 24],
  "forest-log": [36, 12],
  "forest-stump": [24, 24],
  "forest-flowers": [24, 24],
  "forest-mushrooms": [12, 12],
  "forest-litter": [24, 24],
  "forest-grass": [24, 24],
  "forest-path": [24, 24],
  "forest-pebbles": [24, 24],
} as const;
export type ForestSprite = keyof typeof FOREST_SPRITES;
export const FOREST_CANOPIES = ["forest-oak", "forest-elder", "forest-birch", "forest-pine", "forest-old-pine"] as const;
export const FOREST_GROUND = ["forest-litter", "forest-grass", "forest-path"] as const;
export const FOREST_LANDMARKS = { "forest-tower-base": [216, 216], "forest-mountain-base": [360, 240] } as const;

/** Atomic ground/foliage switch: a delayed or missing PNG keeps the old
 * complete forest, so removing its baked trees never leaves empty walls. */
export function forestSpritesReady() {
  let ready = true;
  for (const id of Object.keys(FOREST_SPRITES)) if (!kitImage(id)) ready = false;
  return ready;
}

export function drawForestSprite(c: CanvasRenderingContext2D, id: ForestSprite, x: number, y: number) {
  const [width, height] = FOREST_SPRITES[id];
  return drawKit(c, id, x, y, width, height);
}

/** Bottom center meets the existing stairs tile. The flat cropped top
 * extends beyond the northern viewport, with no complete roof or peak. */
export function drawForestLandmark(c: CanvasRenderingContext2D, tower: boolean, x: number, bottom: number) {
  const id = tower ? "forest-tower-base" : "forest-mountain-base";
  const [width, height] = FOREST_LANDMARKS[id];
  return drawKit(c, id, x - width / 2, bottom - height, width, height);
}
