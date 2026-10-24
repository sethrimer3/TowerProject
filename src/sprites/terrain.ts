import { SPRITE_TERRAIN } from "./terrain-index.ts";
import { kitImage } from "./kit.ts";

/** Original biome selection and wall adjacency address a palette-normalized
 * PNG atlas, preserving all map semantics and seeded texture variation. */
export function drawKitTerrain(c: CanvasRenderingContext2D, originalUrl: string, x = 0, y = 0, w = 24, h = w) {
  const key = originalUrl.split("assets/").at(-1)!;
  const frame = SPRITE_TERRAIN[key];
  if (!frame) return false;
  const image = kitImage("terrain");
  if (!image) return false;
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(image, frame.x, frame.y, 24, 24, x, y, w, h);
  c.restore();
  return true;
}
