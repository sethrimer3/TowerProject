import { BLACKSMITH, TOURNAMENT_HALL, ENTRANCE_Y, OUTSIDE_SIZE, OutsideWorld, outsideWeather, type Weather } from "../outside.ts";
import { tileRandom } from "../random.ts";
import { kitImage, spriteRevision } from "../sprites/kit.ts";
import { FOREST_LANDMARKS } from "../sprites/forest.ts";
import { planForest } from "./decor/forest-foliage.ts";
import type { FrameContext } from "./render-frame.ts";
import { layeredFeather, softenField } from "./soft-field.ts";

const CELL = 4, RESOLUTION = 96, FIELD = 128, PERIOD = 768;
/** Shared direction and drift keep clouds, elevated surfaces and rays aligned. */
export const CLOUD_LIGHT = { direction: { x: 1, y: 3 }, elevationScale: .25, driftX: 3, driftY: 1.1 } as const;
/** Opacity is a final cap, independent of the number of feather layers. */
export const GOD_RAY_STYLE = {
  opacity: { sunny: .16, cloudy: .13, rain: .045, storm: .02 } satisfies Record<Weather, number>,
  layers: 8, outerWidth: 2.8, blurRadius: 2, blurPasses: 2,
} as const;
const SUN_X = CLOUD_LIGHT.direction.x * CLOUD_LIGHT.elevationScale;
const SUN_Y = CLOUD_LIGHT.direction.y * CLOUD_LIGHT.elevationScale;
const STRENGTH: Record<Weather, number> = { sunny: .19, cloudy: .29, rain: .22, storm: .27 };
const smooth = (v: number) => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
const wrap = (v: number, size: number) => ((v % size) + size) % size;

/** A point on a raised surface meets the same cloud at a different place
 * along the slanting sunlight. Units are native forest pixels, not tiles. */
export const cloudSurfacePoint = (x: number, y: number, height: number) => ({ x: x + height * SUN_X, y: y + height * SUN_Y });

/** Small periodic density texture, made once per seed; no random stream or
 * per-frame noise generation. The seam wraps in both directions. */
export class CloudField {
  readonly pixels = new Float32Array(FIELD * FIELD);
  readonly rays = new Float32Array(FIELD * FIELD);
  constructor(seed: number) {
    const noise = (x: number, y: number, cells: number) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
      const at = (dx: number, dy: number) => tileRandom(wrap(ix + dx, cells), wrap(iy + dy, cells), seed + cells * 97);
      const a = at(0, 0) * (1 - fx) + at(1, 0) * fx, b = at(0, 1) * (1 - fx) + at(1, 1) * fx;
      return a * (1 - fy) + b * fy;
    };
    for (let y = 0; y < FIELD; y++) for (let x = 0; x < FIELD; x++)
      this.pixels[y * FIELD + x] = smooth((noise(x / FIELD * 6, y / FIELD * 6, 6) * .78 + noise(x / FIELD * 13, y / FIELD * 13, 13) * .22 - .36) / .34);
    // Every texel at the same distance across a shaft shares its feather.
    const profile = new Float32Array(FIELD);
    for (let across = 0; across < FIELD; across++) {
      const band = Math.floor(across / 32);
      let shaft = 0;
      for (let offset = -1; offset <= 1; offset++) {
        const neighbor = wrap(band + offset, FIELD / 32);
        const center = offset * 32 + 8 + tileRandom(neighbor, 113, seed) * 16;
        const width = 3 + tileRandom(neighbor, 114, seed) * 4;
        shaft += layeredFeather(across % 32 - center, width, GOD_RAY_STYLE.layers, GOD_RAY_STYLE.outerWidth);
      }
      profile[across] = Math.min(1, shaft);
    }
    // Integrate clear gaps along the sunlight direction once, instead of
    // marching rays every frame. Narrow openings become long, soft shafts.
    for (let y = 0; y < FIELD; y++) for (let x = 0; x < FIELD; x++) {
      let light = 0;
      for (let step = 0; step < 16; step++) {
        const clear = 1 - this.sample(x / FIELD * PERIOD, y / FIELD * PERIOD, 70 + step * 18, 0);
        light += clear * clear * clear * clear * (1 - step / 20);
      }
      // Steep (1,3) shafts, with low-energy widening layers. Neighboring
      // bands overlap across slot boundaries before the combined blur.
      const shaft = profile[wrap(CLOUD_LIGHT.direction.y * x - CLOUD_LIGHT.direction.x * y, FIELD)];
      this.rays[y * FIELD + x] = smooth((light / 10 - .08) / .92) * (.04 + .96 * shaft);
    }
    this.rays.set(softenField(this.rays, FIELD, FIELD, GOD_RAY_STYLE.blurRadius, GOD_RAY_STYLE.blurPasses));
  }
  sample(x: number, y: number, height: number, seconds: number, pixels = this.pixels) {
    x = wrap((x + height * SUN_X - seconds * CLOUD_LIGHT.driftX) / PERIOD * FIELD, FIELD);
    y = wrap((y + height * SUN_Y - seconds * CLOUD_LIGHT.driftY) / PERIOD * FIELD, FIELD);
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const row = iy * FIELD, below = ((iy + 1) % FIELD) * FIELD, right = (ix + 1) % FIELD;
    return (pixels[row + ix] * (1 - fx) + pixels[row + right] * fx) * (1 - fy) + (pixels[below + ix] * (1 - fx) + pixels[below + right] * fx) * fy;
  }
}

type Silhouette = { width: number; height: number; alpha: Uint8ClampedArray };
/** Four-native-pixel height cells, stamped in the same order as the art.
 * Only opaque sprite pixels replace the previous surface: gaps stay ground. */
export class ForestHeightMap {
  readonly left = -96;
  readonly top = -(OUTSIDE_SIZE + 4) * 24;
  readonly width: number;
  readonly height = (OUTSIDE_SIZE + 8) * 24 / CELL;
  readonly pixels: Uint8Array;
  constructor(columns: number) {
    this.width = (columns + 8) * 24 / CELL;
    this.pixels = new Uint8Array(this.width * this.height);
  }
  stamp(image: Silhouette, x: number, y: number, width: number, height: number, base: number, rise: number) {
    for (let row = Math.max(0, Math.floor((y - this.top) / CELL)); row < Math.min(this.height, Math.ceil((y + height - this.top) / CELL)); row++)
      for (let col = Math.max(0, Math.floor((x - this.left) / CELL)); col < Math.min(this.width, Math.ceil((x + width - this.left) / CELL)); col++) {
        const u = (this.left + (col + .5) * CELL - x) / width, v = (this.top + (row + .5) * CELL - y) / height;
        if (u < 0 || v < 0 || u >= 1 || v >= 1 || image.alpha[Math.floor(v * image.height) * image.width + Math.floor(u * image.width)] < 128) continue;
        this.pixels[row * this.width + col] = Math.round(base + (1 - v) * rise);
      }
  }
  at(x: number, y: number) {
    const col = Math.floor((x - this.left) / CELL), row = Math.floor((y - this.top) / CELL);
    return col < 0 || row < 0 || col >= this.width || row >= this.height ? 0 : this.pixels[row * this.width + col];
  }
}

/** Two tiny cached overlays over the finished forest, before rain/lightning.
 * Static silhouettes are read only when art/layout changes; ordinary frames
 * cost two 96x96 texture samples per pixel and two scaled draws. Drift ticks at
 * 15Hz; hero/camera movement also refreshes the projection to stay attached. */
export class CloudShadows {
  private key = "";
  private frameKey = "";
  private heights?: ForestHeightMap;
  private field?: CloudField;
  private fieldSeed: number | null = null;
  private canvas?: HTMLCanvasElement;
  private rayCanvas?: HTMLCanvasElement;
  private scratch?: HTMLCanvasElement;
  private image?: ImageData;
  private rayImage?: ImageData;
  private silhouettes = new Map<string, Silhouette>();
  private silhouette(id: string) {
    const cached = this.silhouettes.get(id);
    if (cached) return cached;
    const source = kitImage(id);
    if (!source) return null;
    const canvas = this.scratch ??= document.createElement("canvas");
    canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
    const c = canvas.getContext("2d", { willReadFrequently: true })!;
    c.drawImage(source, 0, 0);
    const rgba = c.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    const result = { width: canvas.width, height: canvas.height, alpha };
    this.silhouettes.set(id, result);
    return result;
  }
  draw(f: FrameContext, world: OutsideWorld, decoration: boolean, foliage: boolean, seconds: number, heroVisible: boolean) {
    const key = [world.seed, world.mode, world.width, world.entranceX, world.blacksmith, world.hall, world.prevRoad, world.nextRoad, decoration, foliage, spriteRevision()].join(":");
    if (key !== this.key) {
      this.key = key; this.frameKey = ""; this.silhouettes.clear();
      const heights = this.heights = new ForestHeightMap(world.width);
      if (this.fieldSeed !== world.seed) { this.field = new CloudField(world.seed); this.fieldSeed = world.seed; }
      const stamp = (id: string, x: number, y: number, width: number, height: number, base: number, rise: number) => {
        const mask = this.silhouette(id);
        if (mask) heights.stamp(mask, x, y, width, height, base, rise);
      };
      if (foliage) for (const p of planForest(world)) {
        if (p.dressing && !decoration) continue;
        stamp(p.id, p.x, p.y, p.width, p.height, p.layer === "canopy" ? 22 : 1, p.layer === "canopy" ? 44 : p.height * .45);
      }
      const id = world.mode === "tower" ? "forest-tower-base" : "forest-mountain-base";
      const [width, height] = FOREST_LANDMARKS[id];
      const bottom = (1 - ENTRANCE_Y) * 24, center = world.entranceX * 24 + 12;
      stamp(id, center - width / 2, bottom - height, width, height, 0, height * .65);
      for (const [open, shape, sprite] of [[world.blacksmith, BLACKSMITH, "blacksmith"], [world.hall, TOURNAMENT_HALL, "hall"]] as const)
        if (open) stamp(sprite, (world.entranceX + shape.dx) * 24, (1 - shape.y - shape.height) * 24, shape.width * 24, shape.height * 24, 0, 42);
    }
    const hero = heroVisible && f.look.styledSprites ? this.silhouette(`hero-${f.heroFacing.dx ? f.heroFacing.dx > 0 ? "right" : "left" : f.heroFacing.dy > 0 ? "up" : "down"}`) : null;
    const frameKey = [Math.floor(seconds * 15), f.left, f.bottom, f.n, f.playerX, f.playerY, heroVisible, f.heroFacing.dx, f.heroFacing.dy, !!hero].join(":");
    const canvas = this.canvas ??= document.createElement("canvas");
    const rayCanvas = this.rayCanvas ??= document.createElement("canvas");
    if (!this.image) {
      canvas.width = canvas.height = rayCanvas.width = rayCanvas.height = RESOLUTION;
      this.image = canvas.getContext("2d")!.createImageData(RESOLUTION, RESOLUTION);
      this.rayImage = rayCanvas.getContext("2d")!.createImageData(RESOLUTION, RESOLUTION);
    }
    if (frameKey !== this.frameKey) {
      this.frameKey = frameKey;
      const data = this.image.data, step = f.n * 24 / RESOLUTION, strength = STRENGTH[outsideWeather(world.seed)] * 255;
      const rays = this.rayImage!.data, rayStrength = GOD_RAY_STYLE.opacity[outsideWeather(world.seed)] * 255;
      const cloudTime = Math.floor(seconds * 15) / 15;
      const hx = f.playerX * 24, hy = -f.playerY * 24;
      for (let y = 0; y < RESOLUTION; y++) for (let x = 0; x < RESOLUTION; x++) {
        const wx = f.left * 24 + (x + .5) * step, wy = -(f.bottom + f.n - 1) * 24 + (y + .5) * step;
        let height = this.heights!.at(wx, wy);
        const u = (wx - hx) / 24, v = (wy - hy) / 24;
        if (hero && u >= 0 && v >= 0 && u < 1 && v < 1 && hero.alpha[Math.floor(v * hero.height) * hero.width + Math.floor(u * hero.width)] >= 128) height = (1 - v) * 18;
        const i = (y * RESOLUTION + x) * 4;
        data[i] = 12; data[i + 1] = 22; data[i + 2] = 32;
        data[i + 3] = Math.round(this.field!.sample(wx, wy, height, cloudTime) * strength);
        rays[i] = 255; rays[i + 1] = 233; rays[i + 2] = 174;
        rays[i + 3] = Math.round(this.field!.sample(wx, wy, height, cloudTime, this.field!.rays) * rayStrength);
      }
      canvas.getContext("2d")!.putImageData(this.image, 0, 0);
      rayCanvas.getContext("2d")!.putImageData(this.rayImage!, 0, 0);
    }
    f.c.save(); f.c.imageSmoothingEnabled = true;
    f.c.drawImage(canvas, 0, 0, f.width, f.width);
    f.c.globalCompositeOperation = "screen";
    f.c.drawImage(rayCanvas, 0, 0, f.width, f.width);
    f.c.restore();
  }
}
