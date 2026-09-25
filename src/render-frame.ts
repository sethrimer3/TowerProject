import type { Game } from "./state.ts";
import type { Torch } from "./entities.ts";
import type { BoardLook } from "./tile-painters.ts";

/** A glowing object this frame: tile position, color, reach (tiles), and strength. */
export type GlowSource = { x: number; y: number; rgb: readonly number[]; radius: number; strength: number; door?: boolean };
/** A box in CSS pixels on the board canvas. */
export type Rect = { x: number; y: number; w: number; h: number };

/** Everything the drawing passes share for one frame of the board: the
 * settled camera, the canvas, and what's in view. Built once per frame by
 * Renderer.draw and read-only to the passes. */
export type FrameContext = {
  /** The board's main context, in CSS pixels (device pixel ratio applied). */
  c: CanvasRenderingContext2D;
  now: number;
  /** Seconds since the previous frame (capped). */
  dt: number;
  dpr: number;
  /** The board's width (and height) in CSS pixels. */
  width: number;
  /** Tiles across the view, and each tile's size in CSS pixels. */
  n: number;
  s: number;
  /** The camera's bottom-left world tile (fractional while it glides). */
  left: number;
  bottom: number;
  /** The hero's drawn position (fractional while it glides). */
  playerX: number;
  playerY: number;
  game: Game;
  outside: boolean;
  reduceMotion: boolean;
  spritesOff: boolean;
  /** Which art the tiles use (see paintTile). */
  look: BoardLook;
  /** 0 at the default brightness, 1 at the darkest setting (dungeon only). */
  darkness: number;
  /** Torches near the view, gathered before the tile pass. */
  torches: Torch[];
  /** Wall tiles in view. */
  walls: [number, number][];
  /** Glowing objects in view (tile contents, then decor). */
  glows: GlowSource[];
};

/** 0 at the default brightness, 1 at the darkest setting (dungeon only). */
export function darknessOf(game: Game) {
  if (game.run.outside) return 0;
  return Math.max(0, Math.min(1, (100 - (game.save.settings.brightness ?? 100)) / 80));
}

/** Screen x of a world column's left edge. */
export const screenX = (f: FrameContext, wx: number) => (wx - f.left) * f.s;
/** Screen y of a world row's top edge (world y grows upward). */
export const screenY = (f: FrameContext, wy: number) => (f.n - (wy - f.bottom)) * f.s;
/** Screen position of a tile's top-left corner, for tile-space drawing. */
export const tileOrigin = (f: FrameContext, x: number, y: number) => ({ x: (x - f.left) * f.s, y: (f.n - 1 - (y - f.bottom)) * f.s });
/** Screen position of a tile's center. */
export const tileCenter = (f: FrameContext, x: number, y: number) => ({ x: (x - f.left + 0.5) * f.s, y: (f.n - 0.5 - (y - f.bottom)) * f.s });

/** Visits every tile in view plus a one-tile margin, bottom row first. */
export function forEachViewTile(view: { n: number; left: number; bottom: number }, visit: (x: number, y: number) => void) {
  for (let row = -1; row <= view.n; row++)
    for (let col = -1; col <= view.n; col++) {
      const x = col + Math.floor(view.left), y = Math.floor(view.bottom) + row;
      if (y < 0) continue;
      visit(x, y);
    }
}

/** Sets `ctx` to draw in 24x24 tile space at a (possibly fractional) tile. */
export function toTileSpace(ctx: CanvasRenderingContext2D, f: FrameContext, x: number, y: number) {
  const o = tileOrigin(f, x, y);
  ctx.translate(o.x, o.y);
  ctx.scale(f.s / 24, f.s / 24);
}

/** Sizes an offscreen canvas to `w` x `h` (creating it if needed). */
export function sized(cv: HTMLCanvasElement | null, w: number, h = w) {
  const c = cv ?? document.createElement("canvas");
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}
