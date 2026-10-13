import type { Tile, Torch } from "./entities.ts";
import type { GameLook } from "./theme-collection.ts";
import { forEachViewTile, tileTransform, toTileSpace, type FrameContext } from "./render-frame.ts";
import { NEON_BOARD } from "./neon-board.ts";
import { TERMINAL_BOARD } from "./terminal-board.ts";
import { DESKTOP_BOARD } from "./desktop-board.ts";
import { GLYPH_BOARD } from "./glyph-board.ts";
import { EMBER_BOARD } from "./ember-board.ts";
import { YANG_BOARD, YIN_BOARD } from "./zen-board.ts";

/** How a Game theme other than Classic draws the dungeon board in place of
 * its lit art: the ground, each tile's contents, torches and the hero, each
 * in tile space (24x24) but the ground. Lighting, glows and decor are off
 * while one is worn, until each has a version of its own. */
export type ThemedBoard = {
  /** The background, floor and walls over the whole board. */
  ground(f: FrameContext): void;
  /** One tile's contents (also as they rise off the board). */
  contents(c: CanvasRenderingContext2D, t: Tile): void;
  /** The Heart Door's heart on its own, as its toll rises off the door. */
  heart(c: CanvasRenderingContext2D): void;
  torch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch): void;
  hero(c: CanvasRenderingContext2D): void;
  /** Drawn over the whole board after the hero, before the feedback
   * overlays. */
  over?(f: FrameContext): void;
};

/** The Game theme looks that draw the board their own way. */
export type ThemedLook = Exclude<GameLook, "classic">;
export const THEMED_BOARDS: Readonly<Record<ThemedLook, ThemedBoard>> = {
  neon: NEON_BOARD, terminal: TERMINAL_BOARD, desktop: DESKTOP_BOARD,
  glyph: GLYPH_BOARD, ember: EMBER_BOARD,
  yang: YANG_BOARD, yin: YIN_BOARD,
};
/** How a Game theme look draws the board, or null for Classic's lit art. */
export const themedBoardOf = (look: GameLook): ThemedBoard | null => (look === "classic" ? null : THEMED_BOARDS[look]);

/** The dungeon board in a Game theme's own art: ground, contents (the enemy struck leaning
 * into its lunge), torches, then the route and the hero. */
export function drawThemedBoard(f: FrameContext, board: ThemedBoard, lunge: { x: number; y: number; dx: number; dy: number }, drawRoute: () => void) {
  const c = f.c;
  board.ground(f);
  forEachViewTile(f, (x, y) => {
    const t = f.world.tile(x, y);
    if (!t || t.kind === "wall" || t.kind === "floor") return;
    const leaning = x === lunge.x && y === lunge.y;
    c.save();
    toTileSpace(c, f, leaning ? x + lunge.dx : x, leaning ? y + lunge.dy : y);
    board.contents(c, t);
    c.restore();
  });
  for (const t of f.torches) {
    c.save();
    toTileSpace(c, f, t.x, t.y);
    board.torch(c, f, t);
    c.restore();
  }
  drawRoute();
  c.save();
  c.setTransform(tileTransform(f, f.playerX, f.playerY));
  board.hero(c);
  c.restore();
  board.over?.(f);
}
