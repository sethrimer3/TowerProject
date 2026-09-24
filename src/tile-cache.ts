/** A layer of tiles that rarely change (stone, forest floor, baked decor),
 * painted once into an offscreen canvas at screen resolution and then drawn
 * each frame as a single image. The cache covers the view plus a margin of
 * tiles, so a scrolling camera reuses it until the view leaves that area.
 *
 * It repaints when the view leaves the cached area, when `key` changes (a
 * different board, tile size, or setting), and, a few times a second, while
 * the last paint was incomplete (sprite art still loading, decor still
 * being planned). */
export type CacheView = { left: number; bottom: number; n: number; s: number };

export class TileLayerCache {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private key = "";
  private x0 = 0;
  private x1 = -1;
  private y0 = 0;
  private y1 = -1;
  private incomplete = false;
  private builtAt = -Infinity;
  /** When the last repaint that wasn't a retry happened (a new key or a
   * new area): retries of missing art count from here. */
  private windowStart = -Infinity;
  /** How many repaints this cache has done (for tests and profiling). */
  builds = 0;

  constructor(
    /** Extra tiles cached past each edge of the view. */
    private margin = 4,
    /** How soon (ms) to retry an incomplete paint. */
    private retry = 250,
    /** Stop retrying this long (ms) after the key or cached area changes:
     * art that still hasn't loaded by then has failed, and the fallback
     * stays. */
    private retryWindow = Infinity,
  ) {}

  /** Forces a repaint on the next draw. */
  invalidate() {
    this.key = "";
  }

  /**
   * Draws the cached tiles for `view` onto `c` (whose transform maps CSS
   * pixels, with `dpr` device pixels each). `paint` draws one tile in tile
   * units (0..24) and returns false if it couldn't draw it fully yet.
   * `xRange` limits the columns that exist (inclusive); rows below 0 are
   * never painted.
   */
  draw(c: CanvasRenderingContext2D, view: CacheView, dpr: number, key: string, now: number,
    xRange: [number, number], paint: (ctx: CanvasRenderingContext2D, x: number, y: number) => boolean) {
    if (typeof document === "undefined") return;
    const { left, bottom, n, s } = view;
    const vx0 = Math.floor(left) - 1, vx1 = Math.floor(left) + n, vy0 = Math.max(0, Math.floor(bottom) - 1), vy1 = Math.floor(bottom) + n;
    const covers = this.canvas && Math.max(vx0, xRange[0]) >= this.x0 && Math.min(vx1, xRange[1]) <= this.x1 && vy0 >= this.y0 && vy1 <= this.y1;
    const fullKey = `${key}|${s}|${dpr}`;
    const fresh = !covers || fullKey !== this.key;
    const retry = this.incomplete && now - this.builtAt > this.retry && now - this.windowStart < this.retryWindow;
    if (fresh || retry) {
      if (fresh) this.windowStart = now;
      this.build(view, dpr, fullKey, now, xRange, paint);
    }
    if (!this.canvas) return;
    const cols = this.x1 - this.x0 + 1, rows = this.y1 - this.y0 + 1;
    c.save();
    c.imageSmoothingEnabled = false;
    c.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height,
      (this.x0 - left) * s, (n - 1 - (this.y1 - bottom)) * s, cols * s, rows * s);
    c.restore();
  }

  private build(view: CacheView, dpr: number, key: string, now: number, xRange: [number, number],
    paint: (ctx: CanvasRenderingContext2D, x: number, y: number) => boolean) {
    const { left, bottom, n, s } = view, m = this.margin;
    this.x0 = Math.max(xRange[0], Math.floor(left) - 1 - m);
    this.x1 = Math.min(xRange[1], Math.floor(left) + n + m);
    this.y0 = Math.max(0, Math.floor(bottom) - 1 - m);
    this.y1 = Math.floor(bottom) + n + m;
    const cols = this.x1 - this.x0 + 1, rows = this.y1 - this.y0 + 1;
    const w = Math.max(1, Math.ceil(cols * s * dpr)), h = Math.max(1, Math.ceil(rows * s * dpr));
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d");
    }
    const cv = this.canvas, ctx = this.ctx;
    if (!ctx) return;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Same device-pixel scale as the screen, so the copy is one to one.
    const sx = w / (cols * s), sy = h / (rows * s);
    let complete = true;
    for (let y = this.y0; y <= this.y1; y++)
      for (let x = this.x0; x <= this.x1; x++) {
        ctx.setTransform(sx, 0, 0, sy, 0, 0);
        ctx.translate((x - this.x0) * s, (this.y1 - y) * s);
        ctx.scale(s / 24, s / 24);
        ctx.save();
        if (!paint(ctx, x, y)) complete = false;
        ctx.restore();
      }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.key = key;
    this.incomplete = !complete;
    this.builtAt = now;
    this.builds++;
  }
}
