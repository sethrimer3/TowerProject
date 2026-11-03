import type { Torch } from "../entities.ts";
import { computeVisibilityPolygon } from "../torches.ts";
import { LIGHTING_CONFIG } from "./lighting.ts";
import { lightFalloff, rowCrossings } from "./torch-light.ts";
import { screenX, screenY, type BoardTiles, type FrameContext } from "./render-frame.ts";

/** Walls and closed doors occupy their whole collision tile, in every door style. */
export function blocksTorch(world: BoardTiles, x: number, y: number) {
  const kind = world.tile(x, y).kind;
  return kind === "wall" || kind === "door";
}

/** The missing direct light on open ground, sampled on the world grid.
 * Scan each polygon once per row rather than once per pixel.
 * Another visible torch fills a shadow according to its light at that point. */
export function terrainShadowField(torches: readonly Torch[], world: BoardTiles, left: number, bottom: number, tiles: number, res = 12) {
  const size = tiles * res, values = new Float32Array(size * size);
  const active = torches.filter((t) => t.active && t.baseIntensity > 0);
  for (let row = 0; row < size; row++) {
    const y = bottom + tiles - (row + 0.5) / res;
    const sources = active.map((t) => ({ t, xs: rowCrossings(y, t.visibilityPolygon ?? []), passed: 0 }));
    for (let col = 0; col < size; col++) {
      const x = left + (col + 0.5) / res;
      let potential = 0, direct = 0;
      for (const source of sources) {
        const { t, xs } = source;
        while (source.passed < xs.length && xs[source.passed]! <= x) source.passed++;
        const v = lightFalloff(Math.hypot(x - t.x - 0.5, y - t.y - 0.5), t.lightRadius) * t.baseIntensity;
        potential = Math.max(potential, v);
        if ((xs.length - source.passed) % 2) direct = Math.max(direct, v);
      }
      if (potential > direct && !blocksTorch(world, Math.floor(x), Math.floor(y)))
        values[row * size + col] = Math.sqrt(potential) * (1 - direct / potential);
    }
  }
  return { values, size };
}

type Geometry = { key: string; torch: Torch };

/** Shared live visibility for terrain, relief, sprite lighting and cast shadows.
 * Stable Torch copies keep all downstream WeakMap bakes warm.
 * Only a changed blocking tile replaces a copy (doors opening, undo, or a
 * Delve gate closing); pickups and enemy wounds leave it alone. */
export class TerrainShadows {
  private world: BoardTiles | null = null;
  private geometry = new WeakMap<Torch, Geometry>();
  private bake: { left: number; bottom: number; tiles: number; torches: Torch[]; canvas: HTMLCanvasElement } | null = null;

  torches(f: Pick<FrameContext, "world" | "torches">): Torch[] {
    if (this.world !== f.world) {
      this.world = f.world;
      this.geometry = new WeakMap();
      this.bake = null;
    }
    return f.torches.filter((t) => t.active).map((t) => {
      // Include the extra ring used by computeVisibilityPolygon's exposed faces.
      const reach = Math.ceil(t.lightRadius) + 2, size = reach * 2 + 1;
      const left = t.x - reach, bottom = t.y - reach;
      const solid: boolean[] = [];
      let key = `${t.x},${t.y},${t.lightRadius},${t.baseIntensity}|`;
      for (let y = bottom; y < bottom + size; y++)
        for (let x = left; x < left + size; x++) {
          const blocked = blocksTorch(f.world, x, y);
          solid.push(blocked);
          key += blocked ? "1" : "0";
        }
      let cached = this.geometry.get(t);
      if (cached?.key !== key) {
        const isSolid = (x: number, y: number) => solid[(y - bottom) * size + x - left] ?? true;
        const torch = { ...t, visibilityPolygon: computeVisibilityPolygon(t, isSolid) };
        cached = { key, torch };
        this.geometry.set(t, cached);
      }
      return cached.torch;
    });
  }

  /** One cached image blit per frame, anchored to world tiles while the
   * camera glides; no pixel reads, ray casts or filters in the warm draw. */
  draw(f: FrameContext) {
    if (!f.torches.length || typeof document === "undefined") return;
    const left = Math.floor(f.left) - 1, bottom = Math.floor(f.bottom) - 1, tiles = f.n + 3;
    let bake = this.bake;
    if (!bake || bake.left !== left || bake.bottom !== bottom || bake.tiles !== tiles ||
      bake.torches.length !== f.torches.length || bake.torches.some((t, i) => t !== f.torches[i])) {
      const { values, size } = terrainShadowField(f.torches, f.world, left, bottom, tiles);
      const canvas = bake?.canvas ?? document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = ctx.createImageData(size, size), color = LIGHTING_CONFIG.shadow.color;
      for (let i = 0; i < values.length; i++) {
        img.data[i * 4] = color[0]; img.data[i * 4 + 1] = color[1]; img.data[i * 4 + 2] = color[2];
        img.data[i * 4 + 3] = Math.round(255 * values[i]);
      }
      ctx.putImageData(img, 0, 0);
      this.bake = bake = { left, bottom, tiles, torches: [...f.torches], canvas };
    }
    const c = f.c, cfg = LIGHTING_CONFIG.shadow;
    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha = Math.min(0.95, cfg.strength * (1 + cfg.darkBoost * f.darkness));
    c.drawImage(bake.canvas, screenX(f, left), screenY(f, bottom + tiles), tiles * f.s, tiles * f.s);
    c.restore();
  }
}
