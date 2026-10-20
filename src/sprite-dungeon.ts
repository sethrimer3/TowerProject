import type { Mode, Tile } from "./entities.ts";
import { tileRandom } from "./random.ts";
import { themeAt, type TerrainTile } from "./themes.ts";
import { kitImage } from "./sprite-kit.ts";
import { wallAdjacencyMask } from "./area1-tileset.ts";
import { dungeonWallBands, type DungeonWallProfile } from "./wall-depth.ts";

export const DUNGEON_MATERIALS = ["masonry", "stone", "earth"] as const;
export type DungeonMaterial = typeof DUNGEON_MATERIALS[number];
export const DUNGEON_TONES = 10;
export const DUNGEON_COLUMNS = 4;
export const DUNGEON_WALL_FRAME = 4;
export const DUNGEON_WALL_VARIANTS = 6;
export const DUNGEON_CORNER_FRAME = DUNGEON_WALL_FRAME + DUNGEON_WALL_VARIANTS * 16;
export const DUNGEON_CONTACT_FRAME = 16;
export const DUNGEON_SOIL_CORNER_FRAME = 32;
/** Clockwise from northwest; world north is +y. */
export const DUNGEON_CORNERS = [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const;
export type DungeonDiagonal = DungeonMaterial | "wall" | undefined;
export const dungeonAtlasId = (material: DungeonMaterial, tone: number) => material === "earth" ? "dungeon-earth" : `dungeon-${material}-${tone}`;
export const DUNGEON_ATLASES = [...["masonry", "stone"].flatMap(material =>
  Array.from({ length: DUNGEON_TONES }, (_, tone) => dungeonAtlasId(material as DungeonMaterial, tone))), "dungeon-earth"];
export const DUNGEON_EDGE_ATLAS = "dungeon-edges";
export const DUNGEON_BLEND_ATLAS = "dungeon-blends";
export const DUNGEON_INFILL_ATLAS = "dungeon-infill";
export const DUNGEON_CORE_FRAME = 12;
export const DUNGEON_CAP_FRAME = DUNGEON_CORNER_FRAME + 4;
export const DUNGEON_SHADE_FRAME = DUNGEON_CAP_FRAME + DUNGEON_WALL_VARIANTS;

/** Smooth, coordinate-hashed material patches, independent of generation
 * and its random stream. Both wall and floor at a position share material. */
export function dungeonMaterial(mode: Mode, x: number, y: number, seed: number): DungeonMaterial {
  if (mode === "tower") return "masonry";
  const xx = x / 5, yy = y / 5, ix = Math.floor(xx), iy = Math.floor(yy);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const u = smooth(xx - ix), v = smooth(yy - iy), salt = seed ^ 0x6d731;
  const a = tileRandom(ix, iy, salt), b = tileRandom(ix + 1, iy, salt);
  const c = tileRandom(ix, iy + 1, salt), d = tileRandom(ix + 1, iy + 1, salt);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v < .48 ? "earth" : "stone";
}

export function dungeonFloorFrame(x: number, y: number, seed: number) {
  return Math.floor(tileRandom(x, y, seed ^ 0x73a91) * 4);
}

export function dungeonWallVariant(x: number, y: number, seed: number) {
  return Math.floor(tileRandom(x + 53, y - 71, seed ^ 0x3b618) * DUNGEON_WALL_VARIANTS);
}

export function dungeonDiagonals(world: { tile(x: number, y: number): Tile | undefined }, mode: Mode, x: number, y: number, seed: number): DungeonDiagonal[] {
  return DUNGEON_CORNERS.map(([dx, dy]) => {
    const tile = world.tile(x + dx, y + dy);
    return !tile ? undefined : tile.kind === "wall" ? "wall" : dungeonMaterial(mode, x + dx, y + dy, seed);
  });
}

function imagesFor(mode: Mode, tone: number) {
  const ids = mode === "tower" ? [dungeonAtlasId("masonry", tone), DUNGEON_EDGE_ATLAS]
    : [dungeonAtlasId("stone", tone), "dungeon-earth", DUNGEON_EDGE_ATLAS];
  // Request the complete group even when the first image is delayed.
  ids.push(DUNGEON_INFILL_ATLAS, DUNGEON_BLEND_ATLAS);
  const images = ids.map(kitImage);
  return images.every(Boolean) ? { surface: images[0]!, earth: images[mode === "delve" ? 1 : 0]!, edges: images.at(-3)!, infill: images.at(-2)!, blends: images.at(-1)! } : null;
}

/** Earth crosses the material seam in authored stepped clusters. Wall
 * joins require solid neighbors; floor joins never cross a blocking wall. */
export function dungeonMaterialJoins(tile: TerrainTile, diagonals: readonly DungeonDiagonal[]) {
  const { mode, x, y, seed, wall, neighbors: n } = tile;
  let sides = 0, corners = 0;
  if (dungeonMaterial(mode, x, y, seed) !== "stone") return { sides, corners };
  const wallMask = wallAdjacencyMask({ northWall: !!n?.northWall, eastWall: !!n?.eastWall, southWall: !!n?.southWall, westWall: !!n?.westWall });
  for (const [bit, dx, dy] of [[1, 0, 1], [2, 1, 0], [4, 0, -1], [8, -1, 0]])
    if (!!(wallMask & bit) === wall && dungeonMaterial(mode, x + dx, y + dy, seed) === "earth") sides |= bit;
  for (let corner = 0; corner < 4; corner++) {
    const adjacent = [9, 3, 6, 12][corner], [dx, dy] = DUNGEON_CORNERS[corner];
    const earth = wall ? diagonals[corner] === "wall" && dungeonMaterial(mode, x + dx, y + dy, seed) === "earth" : diagonals[corner] === "earth";
    if (earth && !(sides & adjacent) && (wall ? (wallMask & adjacent) === adjacent : !(wallMask & adjacent))) corners |= 1 << corner;
  }
  return { sides, corners };
}

const materialBlends = new Map<string, HTMLCanvasElement>();
function drawMaterialBlend(c: CanvasRenderingContext2D, image: HTMLImageElement, frame: number, mask: HTMLImageElement, maskFrame: number) {
  if (typeof document === "undefined") return;
  const key = `${image.src}:${frame}:${maskFrame}`;
  let canvas = materialBlends.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas"); canvas.width = canvas.height = 24;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    drawDungeonFrame(ctx, image, frame);
    ctx.globalCompositeOperation = "destination-in"; drawDungeonFrame(ctx, mask, maskFrame);
    if (materialBlends.size >= 512) materialBlends.clear();
    materialBlends.set(key, canvas);
  }
  c.save(); c.imageSmoothingEnabled = false; c.drawImage(canvas, 0, 0); c.restore();
}

export function drawDungeonFrame(c: CanvasRenderingContext2D, image: HTMLImageElement, frame: number) {
  c.save(); c.imageSmoothingEnabled = false;
  c.drawImage(image, frame % 4 * 24, Math.floor(frame / 4) * 24, 24, 24, 0, 0, 24, 24);
  c.restore();
}

const wallImages = new Map<string, HTMLCanvasElement>();
/** Compose at native resolution before scaling: clipping directly into a
 * fractional-size ground cache can leave hairlines between pixel clusters. */
export function drawDungeonGround(c: CanvasRenderingContext2D, tile: TerrainTile, diagonals: readonly DungeonDiagonal[] = [], profile?: DungeonWallProfile): boolean {
  if (!tile.wall || !profile || profile.depth === 2 || typeof document === "undefined") return paintDungeonGround(c, tile, diagonals, profile);
  const n = tile.neighbors;
  const key = [tile.mode, themeAt(tile.mode, tile.height, tile.x, tile.y, tile.seed).decor, tile.seed, tile.x, tile.y,
    n?.northWall, n?.eastWall, n?.southWall, n?.westWall, diagonals.join(","), profile.openings].join(":");
  let canvas = wallImages.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas"); canvas.width = canvas.height = 24;
    const ctx = canvas.getContext("2d");
    if (!ctx || !paintDungeonGround(ctx, tile, diagonals, profile)) return false;
    if (wallImages.size >= 512) wallImages.clear();
    wallImages.set(key, canvas);
  }
  c.save(); c.imageSmoothingEnabled = false; c.drawImage(canvas, 0, 0, 24, 24); c.restore();
  return true;
}

/** Four quiet floors, six variants of sixteen wall shapes, and corners.
 * South-facing facades occupy eight pixels; north/side lips are shallow.
 * Everything stays inside the existing tile and collision footprint. */
function paintDungeonGround(c: CanvasRenderingContext2D, tile: TerrainTile, diagonals: readonly DungeonDiagonal[], profile?: DungeonWallProfile) {
  const { mode, height, x, y, seed } = tile, tone = themeAt(mode, height, x, y, seed).decor;
  const images = imagesFor(mode, tone);
  if (!images) return false;
  const material = dungeonMaterial(mode, x, y, seed);
  const image = material === "earth" ? images.earth : images.surface;
  if (tile.wall && profile?.depth === 2) { drawDungeonFrame(c, images.infill, DUNGEON_CORE_FRAME); return true; }
  const edges = images.edges;
  const n = tile.neighbors;
  const mask = wallAdjacencyMask({ northWall: !!n?.northWall, eastWall: !!n?.eastWall, southWall: !!n?.southWall, westWall: !!n?.westWall });
  const variant = dungeonWallVariant(x, y, seed);
  const frame = tile.wall ? DUNGEON_WALL_FRAME + variant * 16 + mask : dungeonFloorFrame(x, y, seed);
  const joins = dungeonMaterialJoins(tile, diagonals), blendVariant = variant % 4;
  const surface = (frame: number) => {
    drawDungeonFrame(c, image, frame);
    if (joins.sides) drawMaterialBlend(c, images.earth, frame, images.blends, blendVariant * 20 + joins.sides);
    for (let corner = 0; corner < 4; corner++) if (joins.corners & (1 << corner))
      drawMaterialBlend(c, images.earth, frame, images.blends, blendVariant * 20 + 16 + corner);
  };
  if (tile.wall && profile) {
    drawDungeonFrame(c, images.infill, DUNGEON_CORE_FRAME);
    const bands = dungeonWallBands(profile, x, y, seed);
    for (const band of [2, 1, 0]) {
      c.save(); c.beginPath(); let visible = false;
      for (let row = 0; row < 12; row++) for (let col = 0; col < 12;) {
        if (bands[row * 12 + col] !== band) { col++; continue; }
        const start = col++;
        while (col < 12 && bands[row * 12 + col] === band) col++;
        c.rect(start * 2, row * 2, (col - start) * 2, 2); visible = true;
      }
      if (visible) {
        c.clip();
        surface(band === 0 ? DUNGEON_CAP_FRAME + variant : band === 1 ? DUNGEON_WALL_FRAME + variant * 16 + 15 : DUNGEON_SHADE_FRAME + variant);
      }
      c.restore();
    }
    // Keep physical coping/facades independent of the inward shade contour.
    if (mask !== 15) {
      c.save(); c.beginPath();
      if (!(mask & 1)) c.rect(0, 0, 24, 3);
      if (!(mask & 2)) c.rect(21, 0, 3, 24);
      if (!(mask & 4)) c.rect(0, 15, 24, 9);
      if (!(mask & 8)) c.rect(0, 0, 3, 24);
      c.clip(); surface(frame); c.restore();
    }
  } else surface(frame);
  if (tile.wall && (!profile || profile.depth === 0)) {
    for (let corner = 0; corner < 4; corner++) {
      const diagonal = diagonals[corner];
      // A diagonal opening meets either two joined sides (concave) or two
      // exposed sides (convex); a straight side keeps its existing lip.
      const [a, b] = [[1, 8], [1, 2], [4, 2], [4, 8]][corner];
      if (diagonal && diagonal !== "wall" && !!(mask & a) === !!(mask & b))
        drawDungeonFrame(c, image, DUNGEON_CORNER_FRAME + corner);
    }
  }
  if (!tile.wall) {
    if (mask) drawDungeonFrame(c, edges, DUNGEON_CONTACT_FRAME + mask);
  }
  return true;
}

const floorImages = new Map<string, HTMLCanvasElement>();
/** The literal selected floor PNG texels for torch relief, not the old
 * area-one texture. Each native frame is decoded only once. */
export function dungeonFloorSprite(mode: Mode, height: number, x: number, y: number, seed: number): HTMLCanvasElement | undefined {
  if (typeof document === "undefined") return undefined;
  const tone = themeAt(mode, height, x, y, seed).decor;
  if (!imagesFor(mode, tone)) return undefined;
  const id = dungeonAtlasId(dungeonMaterial(mode, x, y, seed), tone), frame = dungeonFloorFrame(x, y, seed);
  const key = `${id}:${frame}`;
  let canvas = floorImages.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas"); canvas.width = canvas.height = 24;
    drawDungeonFrame(canvas.getContext("2d")!, kitImage(id)!, frame);
    floorImages.set(key, canvas);
  }
  return canvas;
}
