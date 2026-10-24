import { OUTSIDE_SIZE, ENTRANCE_Y, OutsideWorld, onPath, roadsOf, BLACKSMITH, TOURNAMENT_HALL } from "../../outside.ts";
import { tileRandom } from "../../random.ts";
import type { BoardView } from "../render-frame.ts";
import { FOREST_CANOPIES, FOREST_SPRITES, drawForestSprite, type ForestSprite } from "../../sprites/forest.ts";

export type ForestObject = {
  id: ForestSprite; x: number; y: number; width: number; height: number;
  layer: "understory" | "canopy"; dressing: boolean;
};

/** Clear the actual paths, the sign, building yards and the entrance's
 * footprint. Canopies may overhang ordinary woodland floor, never roads. */
export function forestProtected(world: OutsideWorld, x: number, y: number) {
  const center = world.entranceX;
  if (world.isProvingGrounds(x, y)) return true;
  if (onPath({ x, y, center, seed: world.seed, roads: roadsOf(world) })) return true;
  if (Math.abs(x - center) <= (y <= 1 ? 2 : 1) && y <= ENTRANCE_Y) return true;
  if (y >= ENTRANCE_Y && Math.abs(x - center) <= (world.mode === "tower" ? 4 : 7)) return true;
  const buildings = [[world.blacksmith, BLACKSMITH], [world.hall, TOURNAMENT_HALL]] as const;
  return buildings.some(([open, r]) => {
    if (!open) return false;
    return x >= center + r.dx - 1 && x <= center + r.dx + r.width && y >= r.y - 1 && y <= r.y + r.height;
  });
}

/** Every tile touched by the full rectangle must clear interactive art,
 * including the northward reach of a multi-tile crown. */
export function forestObjectClear(world: OutsideWorld, p: ForestObject) {
  for (let y = Math.ceil(-(p.y + p.height - 1) / 24); y <= Math.ceil(-p.y / 24); y++)
    for (let x = Math.floor(p.x / 24); x <= Math.floor((p.x + p.width - 1) / 24); x++)
      if (forestProtected(world, x, y)) return false;
  return true;
}

const smallTrees = ["forest-young-pine", "forest-sapling", "forest-shrub", "forest-berries"] as const;
const smallRocks = ["forest-boulder", "forest-mossy-boulder", "forest-pebbles"] as const;
const floorPlants = ["forest-fern", "forest-flowers", "forest-mushrooms", "forest-log", "forest-stump", "forest-shrub"] as const;
const overlaps = (a: ForestObject, b: ForestObject) =>
  a.x + 12 < b.x + b.width && b.x + 12 < a.x + a.width && a.y + 12 < b.y + b.height && b.y + 12 < a.y + a.height;

/** Pure visual placement: read tiles, use independent coordinate hashes,
 * and never consume a game RNG or change a collision/interaction tile. */
export function planForest(world: OutsideWorld): ForestObject[] {
  const understory: ForestObject[] = [], canopies: ForestObject[] = [];
  const center = world.entranceX, seed = world.seed;
  const place = (id: ForestSprite, x: number, y: number, layer: ForestObject["layer"], dressing = false): ForestObject => {
    const [width, height] = FOREST_SPRITES[id];
    return { id, x: x * 24 + 12 - width / 2, y: -y * 24 + 22 - height, width, height, layer, dressing };
  };
  // Roots outside the board fill the viewport's spare columns as before.
  for (let y = OUTSIDE_SIZE + 3; y >= -2; y--) for (let x = center - 13; x <= center + 13; x++) {
    if ((x + y) % 2 || world.tile(x, y).kind !== "wall" || tileRandom(x + 170, y - 93, seed) > .68) continue;
    const id = FOREST_CANOPIES[Math.floor(tileRandom(x - 223, y + 49, seed) * FOREST_CANOPIES.length)];
    const p = place(id, x, y, "canopy");
    if (forestObjectClear(world, p) && !canopies.some(other => overlaps(p, other))) canopies.push(p);
  }
  for (let y = OUTSIDE_SIZE + 3; y >= -2; y--) for (let x = center - 13; x <= center + 13; x++) {
    if (forestProtected(world, x, y)) continue;
    const wall = world.tile(x, y).kind === "wall", roll = tileRandom(x - 79, y + 197, seed);
    if (!wall && roll > .14) continue;
    if (wall && canopies.some(p => Math.abs(p.x + p.width / 2 - (x * 24 + 12)) < 18 && Math.abs(p.y + p.height - (-y * 24 + 22)) < 18)) continue;
    const family = !wall ? floorPlants : tileRandom(x, y, seed) > .2 ? smallTrees : smallRocks;
    const id = family[Math.floor(tileRandom(x + 41, y - 133, seed) * family.length)];
    const p = place(id, x, y, "understory", !wall);
    if (forestObjectClear(world, p)) understory.push(p);
  }
  // Every crown is above every smaller plant; within a layer, south wins.
  return [...understory, ...canopies];
}

export class ForestFoliage {
  private key = "";
  private plan: ForestObject[] = [];
  draw(c: CanvasRenderingContext2D, view: BoardView, world: OutsideWorld, decoration: boolean) {
    const key = [world.seed, world.mode, world.width, world.entranceX, world.blacksmith, world.hall, world.prevRoad, world.nextRoad].join(":");
    if (key !== this.key) { this.key = key; this.plan = planForest(world); }
    c.save();
    c.translate(-view.left * view.s, (view.n - 1 + view.bottom) * view.s);
    c.scale(view.s / 24, view.s / 24);
    for (const p of this.plan) {
      if (p.dressing && !decoration) continue;
      const left = view.left * 24, top = -(view.bottom + view.n - 1) * 24;
      if (p.x + p.width < left || p.x > left + view.n * 24 || p.y + p.height < top || p.y > top + view.n * 24) continue;
      drawForestSprite(c, p.id, p.x, p.y);
    }
    c.restore();
  }
}
