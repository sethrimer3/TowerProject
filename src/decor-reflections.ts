import type { Tile } from "./entities.ts";
import { TILE_PX, type TileDecor } from "./decor.ts";
import { WATER_MID } from "./decor-bake.ts";

/** Mirrors what stands on or beside the water into it. The renderer paints
 * the sprites upside down into a small buffer (24 pixels per tile). That
 * image is copied back onto the pools in 1-pixel-high strips, each shifted
 * by the ripple rings passing through it and a faint idle shimmer, then
 * tinted by the water and masked to it. All GPU copies: no per-frame pixel
 * readback. */

/** Lets the renderer paint the sprites that show mirrored in the water. */
export type ReflectionPainter = {
  ctx: CanvasRenderingContext2D;
  /** Sets `ctx` to world pixels mirrored about the line gy = base (the
   * reflected thing's foot), so drawing it normally paints its reflection. */
  flip(base: number): void;
  /** Tiles standing on or just north of water, whose contents reflect. */
  tiles: [number, number][];
  /** Whether a thing at tile (x, y) would show in the water. */
  near(x: number, y: number): boolean;
  /** "static": walls and tile contents, painted only when they change;
   * "moving": the hero and torch flames, painted every frame. */
  phase: "static" | "moving";
};
/** What the renderer supplies for reflections: a painter for its sprites,
 * and a key that changes whenever any moving one (the hero, a torch flame)
 * would look different, so an unchanged picture can be reused. */
export type Reflections = { paint: (p: ReflectionPainter) => void; key: string };
/** Reflection tuning: opacity, how far the water tints them, and how far
 * (pixels) ripples and the idle shimmer push them around. */
export const REFLECTION = { alpha: 0.65, tint: 0.35, darken: 0.85, rippleShift: 2.2, rippleWidth: 4, shimmer: 0.7 };

/** A ring spreading on the water: center and radius (world pixels), and strength. */
export type Wave = { gx: number; gy: number; r: number; fade: number };

/** Everything one frame of reflections needs from the decor layer. */
export type ReflectionScene = {
  /** Decor source key, so a new board never reuses old pictures. */
  key: string;
  /** Planned tiles in view that hold water. */
  pools: [number, number, TileDecor][];
  now: number;
  reduceMotion: boolean;
  /** Rings spreading on the water right now. Called once per frame, after
   * the still picture is up to date, and not at all with reduced motion. */
  waves: () => Wave[];
  tileAt: (x: number, y: number) => Tile;
  plan: (x: number, y: number) => TileDecor | null;
  isBroken: (x: number, y: number) => boolean;
  /** Paints tile (x, y)'s crates, for their mirror image. */
  drawCrates: (c: CanvasRenderingContext2D, x: number, y: number, d: TileDecor) => void;
  sprites?: Reflections;
};

type Canvas = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
/** The world-pixel rectangle around the pools in view. */
type Area = { x0: number; y0: number; x1: number; y1: number; W: number; H: number; ox: number; oy: number };

export class WaterReflections {
  /** The mirrored sprites, redrawn each time the picture is. */
  private mirror: Canvas | null = null;
  /** The finished reflection, reused while nothing in it changes. */
  private out: Canvas | null = null;
  /** The mirrored walls, contents, and crates, repainted only when they change. */
  private still: Canvas | null = null;
  /** Opaque where there is water, for the pools in view. */
  private mask: Canvas | null = null;
  private stillKey = "";
  private maskKey = "";
  /** What the finished reflection in `out` shows, while it can be reused. */
  private frameKey = "";
  /** Rows of the mask with any water, for the whole-row copies. */
  private waterRows = new Uint8Array(0);
  /** When `out` was last redrawn. */
  private builtAt = -Infinity;

  /** Draws the reflections onto `c`, which is already in world pixels. */
  draw(c: CanvasRenderingContext2D, scene: ReflectionScene) {
    if (!scene.pools.length || typeof document === "undefined") return;
    const area = poolArea(scene.pools);
    if (!this.allocate(area.W, area.H)) return;
    const { tiles, near } = mirroredTiles(scene, area);
    const where = `${scene.key}|${area.x0},${area.y0},${area.x1},${area.y1}`;
    if (this.maskKey !== where) this.paintMask(where, scene.pools, area);
    // Walls, contents, and crates rarely change: repaint them only when the
    // pools in view or anything standing by them does.
    const stillKey = where + "|" + tiles.map(([x, y]) => standingKey(scene, x, y)).join(",");
    if (stillKey !== this.stillKey) this.paintStill(stillKey, scene, area, { tiles, near });
    // Between ripples, the picture only changes when something mirrored
    // moves or the shimmer steps (ten times a second): reuse the last one.
    // While rings pass, it is redrawn at most 30 times a second (the rings
    // drawn on the surface itself still move every frame).
    const waves = scene.reduceMotion ? [] : scene.waves();
    const tick = scene.reduceMotion ? 0 : Math.floor(scene.now / 100);
    const frameKey = `${stillKey}|${scene.sprites?.key ?? ""}|${tick}`;
    if (this.stale(frameKey, waves.length > 0, scene.now)) {
      this.frameKey = frameKey;
      this.builtAt = scene.now;
      this.paintMirror(scene, area, { tiles, near });
      this.compose(scene, area, new Shimmer(tick / 10, waves, scene.reduceMotion));
    }
    c.save();
    c.globalAlpha = REFLECTION.alpha;
    c.drawImage(this.out!.canvas, 0, 0, area.W, area.H, area.ox, area.oy, area.W, area.H);
    c.restore();
  }

  /** Whether the finished picture must be redrawn: something in it changed,
   * or rings are passing and it is older than a 30 fps frame. */
  private stale(frameKey: string, rippling: boolean, now: number) {
    if (frameKey !== this.frameKey) return true;
    return rippling && now - this.builtAt >= 1000 / 30;
  }

  /** Makes (or grows) the buffers. Grow only, so walking around a room
   * doesn't reallocate every frame. */
  private allocate(w: number, h: number) {
    if (!this.mirror && !this.create()) return false;
    const buffers = [this.mirror!, this.out!, this.still!, this.mask!];
    const size = this.mirror!.canvas;
    if (size.width < w || size.height < h) {
      const nw = Math.max(w, size.width), nh = Math.max(h, size.height);
      for (const { canvas } of buffers) { canvas.width = nw; canvas.height = nh; }
      this.stillKey = this.maskKey = this.frameKey = "";
    }
    for (const b of buffers.slice(0, 3)) b.ctx.imageSmoothingEnabled = false;
    return true;
  }

  private create() {
    const made = [makeCanvas(), makeCanvas(), makeCanvas(), makeCanvas()];
    if (made.some((b) => !b)) return false;
    [this.mirror, this.out, this.still, this.mask] = made;
    return true;
  }

  /** The water mask, rebuilt only when the pools in view change. */
  private paintMask(key: string, pools: [number, number, TileDecor][], { W, H, ox, oy }: Area) {
    this.maskKey = key;
    const { canvas, ctx } = this.mask!, img = ctx.createImageData(W, H), m = img.data;
    for (const [x, y, d] of pools)
      for (let k = 0; k < TILE_PX * TILE_PX; k++) {
        const i = k % TILE_PX, j = (k - i) / TILE_PX;
        if (d.water![k] === 1) m[((-y * TILE_PX + j - oy) * W + x * TILE_PX + i - ox) * 4 + 3] = 255;
      }
    this.waterRows = new Uint8Array(H);
    for (let r = 0; r < H; r++) this.waterRows[r] = rowHasWater(m, r, W) ? 1 : 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(img, 0, 0);
  }

  /** The mirrored crates, then the renderer's static sprites. */
  private paintStill(key: string, scene: ReflectionScene, area: Area, view: Pick<ReflectionPainter, "tiles" | "near">) {
    this.stillKey = key;
    const { canvas, ctx: st } = this.still!;
    st.setTransform(1, 0, 0, 1, 0, 0);
    st.clearRect(0, 0, canvas.width, canvas.height);
    const flip = mirrorAbout(st, area);
    for (const [x, y] of view.tiles) {
      const d = scene.plan(x, y);
      if (!d?.crates.length || scene.tileAt(x, y).kind !== "floor") continue;
      flip(-y * TILE_PX + Math.max(...d.crates.map((k) => k.y + k.h)));
      scene.drawCrates(st, x, y, d);
    }
    scene.sprites?.paint({ ctx: st, flip, ...view, phase: "static" });
    st.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The still picture plus the renderer's moving sprites. */
  private paintMirror(scene: ReflectionScene, area: Area, view: Pick<ReflectionPainter, "tiles" | "near">) {
    const sctx = this.mirror!.ctx;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = "source-over";
    sctx.clearRect(0, 0, area.W, area.H);
    sctx.drawImage(this.still!.canvas, 0, 0);
    scene.sprites?.paint({ ctx: sctx, flip: mirrorAbout(sctx, area), ...view, phase: "moving" });
    sctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Copies the mirror image back in strips: whole rows across the pools,
   * shifted by the shimmer, then 4-pixel strips on the tiles a ring is
   * crossing, each pushed along the rings passing through it. Then tints
   * it by the water and keeps it to the water. */
  private compose(scene: ReflectionScene, area: Area, shimmer: Shimmer) {
    const { W, H, oy } = area, octx = this.out!.ctx, src = this.mirror!.canvas;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalAlpha = 1;
    octx.globalCompositeOperation = "source-over";
    octx.clearRect(0, 0, W, H);
    for (let r = 0; r < H; r++) {
      if (!this.waterRows[r]) continue;
      const [dx] = shimmer.shift(0, oy + r);
      if (dx >= 0) octx.drawImage(src, dx, r, W - dx, 1, 0, r, W - dx, 1);
      else octx.drawImage(src, 0, r, W + dx, 1, -dx, r, W + dx, 1);
    }
    for (const pool of scene.pools) if (shimmer.reaches(pool)) this.rippleTile(pool, area, shimmer);
    octx.globalCompositeOperation = "source-atop";
    const [wr, wg, wb] = WATER_MID;
    octx.fillStyle = `rgba(${wr},${wg},${wb},${REFLECTION.tint})`;
    octx.fillRect(0, 0, W, H);
    octx.fillStyle = `rgba(0,0,0,${1 - REFLECTION.darken})`;
    octx.fillRect(0, 0, W, H);
    octx.globalCompositeOperation = "destination-in";
    octx.drawImage(this.mask!.canvas, 0, 0);
    octx.globalCompositeOperation = "source-over";
  }

  /** Recopies one pool tile in 4-pixel strips, each pushed by the rings. */
  private rippleTile([x, y, d]: [number, number, TileDecor], { W, H, ox, oy }: Area, shimmer: Shimmer) {
    const octx = this.out!.ctx, src = this.mirror!.canvas;
    const tx = x * TILE_PX, ty = -y * TILE_PX, bx = tx - ox, by = ty - oy;
    octx.clearRect(bx, by, TILE_PX, TILE_PX);
    for (let j = 0; j < TILE_PX; j++)
      for (let i = 0; i < TILE_PX; i += 4) {
        if (!stripHasWater(d.water!, i, j)) continue;
        const [dx, dy] = shimmer.shift(tx + i + 2, ty + j);
        const sx = bx + i + dx, sy = by + j + dy;
        if (sy >= 0 && sy < H && sx + 4 > 0 && sx < W) octx.drawImage(src, sx, sy, 4, 1, bx + i, by + j, 4, 1);
      }
  }
}

/** The idle shimmer plus the rings passing through, as a pixel offset. */
class Shimmer {
  constructor(private t: number, private waves: Wave[], private still: boolean) {}

  shift(gx: number, gy: number) {
    const R = REFLECTION;
    let dx = this.still ? 0 : Math.sin(this.t * 1.7 + gy * 0.8) * R.shimmer, dy = 0;
    for (const w of this.waves) {
      const ex = gx - w.gx, ey = (gy - w.gy) / 0.62, dist = Math.hypot(ex, ey), off = dist - w.r;
      if (Math.abs(off) >= R.rippleWidth || dist < 0.5) continue;
      const push = Math.sin((off / R.rippleWidth) * Math.PI) * R.rippleShift * w.fade;
      dx += (ex / dist) * push;
      dy += (ey / dist) * push * 0.62;
    }
    return [Math.round(dx), Math.round(dy)];
  }

  /** Rings reach a tile if its center is within their band. */
  reaches([x, y]: [number, number, TileDecor]) {
    const cx = x * TILE_PX + 12, cy = -y * TILE_PX + 12;
    return this.waves.some((w) => Math.abs(Math.hypot(cx - w.gx, (cy - w.gy) / 0.62) - w.r) < REFLECTION.rippleWidth + 20);
  }
}

/** Tiles standing on or just north of water, whose contents reflect. */
function mirroredTiles(scene: ReflectionScene, area: Area) {
  const wet = (x: number, y: number) => (scene.plan(x, y)?.waterCount ?? 0) > 0;
  const near = (x: number, y: number) => wet(x, y) || wet(x, y - 1);
  const tiles: [number, number][] = [];
  for (let y = area.y0; y <= area.y1 + 1; y++) for (let x = area.x0; x <= area.x1; x++) if (near(x, y)) tiles.push([x, y]);
  return { tiles, near };
}

function poolArea(pools: [number, number, TileDecor][]): Area {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pools) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1, W: (x1 - x0 + 1) * TILE_PX, H: (y1 - y0 + 1) * TILE_PX, ox: x0 * TILE_PX, oy: -y1 * TILE_PX };
}

/** What stands on a tile, as far as its mirror image goes. */
function standingKey(scene: ReflectionScene, x: number, y: number) {
  const t = scene.tileAt(x, y);
  return `${t.kind}${t.color ?? ""}${t.tier ?? ""}${scene.isBroken(x, y) ? "b" : ""}`;
}

/** Sets `ctx` to world pixels mirrored about gy = base. */
const mirrorAbout = (ctx: CanvasRenderingContext2D, { ox, oy }: Area) => (base: number) =>
  ctx.setTransform(1, 0, 0, -1, -ox, 2 * base - oy);

function rowHasWater(m: Uint8ClampedArray, r: number, W: number) {
  for (let q = 0; q < W; q++) if (m[(r * W + q) * 4 + 3]) return true;
  return false;
}

function stripHasWater(water: Uint8Array, i: number, j: number) {
  for (let k = i; k < i + 4; k++) if (water[j * TILE_PX + k] === 1) return true;
  return false;
}

function makeCanvas(): Canvas | null {
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}
