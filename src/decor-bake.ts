import { tileRandom } from "./themes.ts";
import { FLOWER_COLORS, TILE_PX, tileKey, valueNoise, type DecorSource, type Flower, type Plant, type PlantKind, type TileDecor } from "./decor.ts";

/** Bakes a tile's static decor (moss, water, vines, flowers, plants) into a
 * 24x24 image once, so the renderer can cache it with the rest of the
 * ground. Only the live parts (decor-render.ts) are drawn every frame. */

export type Rgba = readonly [number, number, number, number];
/** Moss by [tone][level]: yellow-green and blue-green mats. */
const MOSS: Rgba[][] = [
  [[0, 0, 0, 0], [66, 106, 56, 0.5], [74, 122, 60, 0.78], [88, 142, 68, 0.9]],
  [[0, 0, 0, 0], [52, 100, 84, 0.5], [60, 116, 94, 0.78], [74, 136, 104, 0.9]],
];
const MOSS_LIGHT: Rgba[] = [[122, 176, 84, 0.95], [106, 170, 132, 0.95]];
const MOSS_DARK: Rgba[] = [[44, 76, 42, 0.85], [36, 72, 64, 0.85]];
/** Vine stem (dark, mid) and leaf (mid, light). */
const VINE: Rgba[] = [[54, 88, 44, 1], [74, 124, 54, 1], [104, 168, 70, 1], [150, 206, 100, 1]];
/** Wall moss is a thinner, darker film than the mats on the floor. */
const WALL_MOSS: Rgba[] = [[0, 0, 0, 0], [58, 92, 52, 0.4], [64, 104, 56, 0.6], [74, 118, 62, 0.72]];
const WATER_DEEP: Rgba = [22, 66, 96, 0.93];
export const WATER_MID: Rgba = [30, 86, 118, 0.92];
const WATER_SHORE: Rgba = [118, 184, 204, 0.92];
/** The far (upper) bank shades the water just below it. */
const WATER_BANK: Rgba = [12, 34, 52, 0.94];
const WATER_SHEEN: Rgba = [96, 160, 190, 0.7];
const WET_STONE: Rgba = [0, 0, 0, 0.22];

/** Caches each tile's baked image (null when it has nothing to draw). */
export class DecorBaker {
  private bakes = new Map<number, HTMLCanvasElement | null>();

  clear() {
    this.bakes.clear();
  }

  bake(src: DecorSource, x: number, y: number, d: TileDecor) {
    const key = tileKey(x, y);
    if (this.bakes.has(key)) return this.bakes.get(key)!;
    if (typeof document === "undefined") return null;
    const cv = document.createElement("canvas");
    cv.width = cv.height = TILE_PX;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(TILE_PX, TILE_PX);
    if (!paintTile(new TilePixels(img.data, src, x, y), d)) {
      this.bakes.set(key, null);
      return null;
    }
    ctx.putImageData(img, 0, 0);
    if (this.bakes.size > 3000) this.bakes.clear();
    this.bakes.set(key, cv);
    return cv;
  }
}

/** One tile's RGBA pixels, with the tile's world position for the noise
 * that textures moss and water. */
class TilePixels {
  constructor(private px: Uint8ClampedArray, readonly src: DecorSource, private x: number, private y: number) {}

  /** Source-over blend of color `c` into pixel (i, j); off-tile pixels are skipped. */
  blend(i: number, j: number, c: Rgba, alpha = 1) {
    if (!inTile(i, j)) return;
    const a = c[3] * alpha;
    if (a <= 0) return;
    const px = this.px, k = (j * TILE_PX + i) * 4, da = px[k + 3] / 255, oa = a + da * (1 - a);
    for (let ch = 0; ch < 3; ch++) px[k + ch] = (c[ch] * a + px[k + ch] * da * (1 - a)) / oa;
    px[k + 3] = oa * 255;
  }

  /** Value noise over world pixels, stretched `sx` by `sy`. */
  noise(i: number, j: number, [sx, sy]: readonly [number, number], salt: number) {
    return valueNoise((this.x * TILE_PX + i) / sx, (-this.y * TILE_PX + j) / sy, this.src.seed ^ salt);
  }

  /** A per-pixel random number. */
  hash(i: number, j: number, salt: number) {
    return tileRandom(this.x * TILE_PX + i, this.y * TILE_PX - j, this.src.seed ^ salt);
  }

  get wall() {
    return this.src.kind(this.x, this.y) === "wall";
  }
}

const inTile = (i: number, j: number) => i >= 0 && j >= 0 && i < TILE_PX && j < TILE_PX;

/** Paints every static layer; false when nothing was drawn. */
function paintTile(tp: TilePixels, d: TileDecor) {
  const water = d.water ? paintWater(tp, d.water) : false;
  const moss = d.moss ? paintMoss(tp, d.moss) : false;
  for (const p of d.vines) tp.blend(p.i, p.j, VINE[p.c]);
  for (const f of d.flowers) paintFlower(tp, f);
  for (const p of d.plants) PLANTS[p.kind](tp, p);
  return water || moss || d.vines.length + d.flowers.length + d.plants.length > 0;
}

// ---------------------------------------------------------------- water

function paintWater(tp: TilePixels, water: Uint8Array) {
  let drew = false;
  for (let k = 0; k < water.length; k++) {
    const v = water[k], i = k % TILE_PX, j = (k - i) / TILE_PX;
    if (v === 2) tp.blend(i, j, WET_STONE);
    else if (v === 1) paintOpenWater(tp, water, i, j);
    if (v) drew = true;
  }
  return drew;
}

function paintOpenWater(tp: TilePixels, water: Uint8Array, i: number, j: number) {
  const shade = waterShade(water, i, j);
  tp.blend(i, j, shade);
  // Long, faint reflections across the open water.
  const open = shade === WATER_MID || shade === WATER_DEEP;
  if (open && tp.noise(i, j, [6, 1.3], 0x5ee) > 0.78) tp.blend(i, j, WATER_SHEEN);
}

/** Water is darkest under the far bank, pale at the shore, and deepens
 * toward the middle of the pool: each shade applies when any of its
 * offsets is dry. Off-tile pixels count as water. */
const WATER_SHADES: [Rgba, [number, number][]][] = [
  [WATER_BANK, [[0, -1], [0, -2]]],
  [WATER_SHORE, [[-1, 0], [1, 0], [0, 1]]],
  [WATER_MID, [[-2, 0], [2, 0], [0, 2]]],
];

function waterShade(water: Uint8Array, i: number, j: number): Rgba {
  const dry = ([a, b]: [number, number]) => inTile(i + a, j + b) && water[(j + b) * TILE_PX + i + a] !== 1;
  return WATER_SHADES.find(([, offsets]) => offsets.some(dry))?.[0] ?? WATER_DEEP;
}

// ---------------------------------------------------------------- moss

function paintMoss(tp: TilePixels, moss: Uint8Array) {
  const wall = tp.wall;
  let drew = false;
  for (let k = 0; k < moss.length; k++) {
    const m = moss[k], lv = m & 3, i = k % TILE_PX, j = (k - i) / TILE_PX;
    if (!lv) continue;
    if (wall) tp.blend(i, j, WALL_MOSS[lv]);
    else paintFloorMoss(tp, i, j, m);
    drew = true;
  }
  return drew;
}

/** Clumps a few pixels across: lit tops and shaded hollows. */
function paintFloorMoss(tp: TilePixels, i: number, j: number, m: number) {
  const lv = m & 3, tone = m >> 2 ? 1 : 0;
  const clump = tp.noise(i, j, [2.6, 2.6], 0x3a1);
  const lit = lv >= 2 && clump > 0.7;
  tp.blend(i, j, mossColor(lv, tone, clump), lit ? 0.55 + 0.1 * lv : 1);
  // Sparse moss catches the odd bright speck.
  if (lv === 1 && tp.hash(i, j, 0x3a1) < 0.08) tp.blend(i, j, MOSS_LIGHT[tone], 0.5);
}

function mossColor(lv: number, tone: number, clump: number) {
  if (lv < 2) return MOSS[tone][lv];
  return clump > 0.7 ? MOSS_LIGHT[tone] : clump < 0.24 ? MOSS_DARK[tone] : MOSS[tone][lv];
}

// ---------------------------------------------------------------- flowers and plants

/** Five petals round a pale heart, with a leaf at the base. */
function paintFlower(tp: TilePixels, f: Flower) {
  const [r, g, b] = FLOWER_COLORS[f.color];
  const petal: Rgba = [r * 0.85, g * 0.85, b * 0.85, 1], shade: Rgba = [r * 0.55, g * 0.55, b * 0.55, 1];
  tp.blend(f.i - 1, f.j + 2, VINE[2]); tp.blend(f.i + 1, f.j + 2, VINE[3]);
  tp.blend(f.i - 1, f.j, petal); tp.blend(f.i + 1, f.j, petal);
  tp.blend(f.i, f.j - 1, petal); tp.blend(f.i - 1, f.j + 1, shade); tp.blend(f.i + 1, f.j + 1, shade);
  tp.blend(f.i - 1, f.j - 1, petal, 0.5); tp.blend(f.i + 1, f.j - 1, petal, 0.5);
  tp.blend(f.i, f.j, [255, 250, 225, 1]);
}

type Put = (a: number, b: number, c: Rgba, alpha?: number) => void;
/** Draws relative to the plant's root pixel. */
const rooted = (tp: TilePixels, p: Plant): Put => (a, b, c, alpha = 1) => tp.blend(p.i + a, p.j + b, c, alpha);

const PLANTS: Record<PlantKind, (tp: TilePixels, p: Plant) => void> = {
  tuft(tp, p) {
    const put = rooted(tp, p), v = p.variant;
    const dark: Rgba = [50, 88, 48, 1], mid: Rgba = [78, 128, 64, 1], hi: Rgba = [118, 172, 86, 1];
    const blades = [[-2, 3], [-1, 4 + v], [0, 5], [1, 4], [2, 2 + v]];
    for (const [dx, hgt] of blades)
      for (let k = 0; k < hgt; k++) put(dx + (k > 2 ? Math.sign(dx) : 0), -k, k === hgt - 1 ? hi : k < 2 ? dark : mid);
  },
  fern(tp, p) {
    const put = rooted(tp, p);
    const stem: Rgba = [52, 96, 50, 1], leaf: Rgba = [84, 146, 72, 1], tip: Rgba = [120, 180, 96, 1];
    for (const side of [-1, 1])
      for (let k = 0; k < 5 + p.variant; k++) {
        const fx = side * (1 + Math.floor(k * 0.8)), fy = -Math.floor(k * 0.7);
        put(fx, fy, k > 3 ? tip : stem);
        if (k % 2 === 1) put(fx, fy - 1, leaf);
      }
    put(0, 0, stem); put(0, -1, stem); put(0, -2, leaf);
  },
  sprout(tp, p) {
    const put = rooted(tp, p);
    const stem: Rgba = [70, 120, 60, 1];
    const bloom: Rgba = ([[230, 220, 150, 1], [200, 180, 230, 1], [236, 236, 228, 1]] as Rgba[])[p.variant];
    put(0, 0, stem); put(0, -1, stem); put(-1, -1, [88, 140, 70, 1]);
    put(0, -2, bloom); put(1, -2, bloom, 0.8);
  },
  mushrooms(tp, p) {
    const put = rooted(tp, p), caps = capColors(p);
    const stem: Rgba = [214, 204, 186, 1];
    for (const [dx, dy, size] of MUSHROOM_CLUSTERS[p.variant] ?? MUSHROOM_CLUSTERS[2]) {
      put(dx, dy + 1, [0, 0, 0, 0.3]);
      put(dx, dy, stem);
      paintCap(put, [dx, dy, size], caps);
    }
  },
  pebbles(tp, p) {
    const put = rooted(tp, p);
    const a: Rgba = [120, 120, 126, 0.9], b: Rgba = [84, 84, 92, 0.9];
    put(0, 0, a); put(1, 0, b); put(3, 1, a); put(-2, 2, b);
    if (p.variant) put(2, -2, a);
  },
  web: paintWeb,
};

/** Each variant's mushrooms as [dx, dy, cap width]. */
const MUSHROOM_CLUSTERS: [number, number, number][][] = [
  [[0, 0, 3], [3, 1, 2]],
  [[0, 0, 2], [2, 1, 3], [-2, 1, 2]],
  [[0, 0, 3]],
];

/** Cap and highlight colors: glowing caps are pale green. */
function capColors(p: Plant): Rgba[] {
  if (p.glow) return [[120, 214, 160, 1], [170, 246, 196, 1]];
  const caps: Rgba[] = [[168, 92, 70, 1], [196, 160, 110, 1], [150, 120, 150, 1]];
  return caps.slice(p.variant, p.variant + 1).concat([[222, 200, 170, 1]]);
}

function paintCap(put: Put, [dx, dy, size]: [number, number, number], caps: Rgba[]) {
  const x0 = dx - (size >> 1);
  for (let a = 0; a < size; a++) put(x0 + a, dy - 1, caps[0]);
  if (size > 2) for (let a = 1; a < size - 1; a++) put(x0 + a, dy - 2, caps[0]);
  else put(dx, dy - 2, caps[0]);
  put(size > 2 ? x0 + 1 : dx, dy - 2, caps[1], 0.8);
}

/** Which way a web spreads from each corner (NW, NE, SE, SW), in pixels. */
const WEB_SIGNS: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

/** Radial threads and sagging rings from a corner of the tile. */
function paintWeb(tp: TilePixels, p: Plant) {
  const [sx, sy] = WEB_SIGNS[p.corner ?? 0];
  const ox = sx > 0 ? 0 : TILE_PX - 1, oy = sy > 0 ? 0 : TILE_PX - 1;
  const thread: Rgba = [214, 220, 228, 0.42];
  const len = 9 + p.variant * 2;
  const at = (ang: number, r: number) => [ox + sx * Math.round(Math.cos(ang) * r), oy + sy * Math.round(Math.sin(ang) * r)] as const;
  for (const ang of [0.05, 0.42, 0.78, 1.15, 1.52])
    for (let k = 1; k < len; k++) tp.blend(...at(ang, k), thread);
  for (const r of [3.5, 6.5, 9.5].filter((r) => r <= len))
    for (let a = 0.05; a < 1.52; a += 0.12) tp.blend(...at(a, r), thread, 0.8);
}
