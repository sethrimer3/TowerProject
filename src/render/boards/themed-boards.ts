import type { ThemedBoard } from "./themed-board.ts";
import { drawFlyers } from "../../flyer-art.ts";
import type { GameLook } from "../../theme-collection.ts";
import { forEachViewTile, tileTransform, toTileSpace, type FrameContext } from "../../render-frame.ts";
import { NEON_BOARD } from "./neon-board.ts";
import { TERMINAL_BOARD } from "./terminal-board.ts";
import { DESKTOP_BOARD } from "./desktop-board.ts";
import { GLYPH_BOARD } from "./glyph-board.ts";
import { EMBER_BOARD } from "./ember-board.ts";
import { YANG_BOARD, YIN_BOARD } from "./zen-board.ts";
import { KURO_BOARD, SHIRO_BOARD } from "./bare-board.ts";
import { ARCADE_BOARD } from "./arcade-board.ts";
import { SYSTEM_BOARD } from "./system-board.ts";
import { KROZ_BOARD } from "./kroz-board.ts";
import { ORBIT_BOARD } from "./orbit-board.ts";
import { PIXEL_BOARD } from "./pixel-board.ts";
import { DOODLE_BOARD } from "./doodle-board.ts";
import { MURK_BOARD } from "./murk-board.ts";

/** The Game theme looks that draw the board their own way. */
export type ThemedLook = Exclude<GameLook, "classic">;
export const THEMED_BOARDS: Readonly<Record<ThemedLook, ThemedBoard>> = {
  neon: NEON_BOARD, terminal: TERMINAL_BOARD, desktop: DESKTOP_BOARD,
  glyph: GLYPH_BOARD, ember: EMBER_BOARD,
  yang: YANG_BOARD, yin: YIN_BOARD,
  shiro: SHIRO_BOARD, kuro: KURO_BOARD,
  arcade: ARCADE_BOARD,
  system: SYSTEM_BOARD,
  kroz: KROZ_BOARD,
  orbit: ORBIT_BOARD,
  pixel: PIXEL_BOARD,
  doodle: DOODLE_BOARD,
  murk: MURK_BOARD,
};
/** How a Game theme look draws the board, or null for Classic's lit art. */
export const themedBoardOf = (look: GameLook): ThemedBoard | null => (look === "classic" ? null : THEMED_BOARDS[look]);

/** The dungeon board in a Game theme's own art: ground, contents (the enemy struck leaning
 * into its lunge), torches, then the route and the hero. */
export function drawThemedBoard(f: FrameContext, board: ThemedBoard, lunge: { x: number; y: number; dx: number; dy: number }, drawRoute: () => void, hero: { x: number; y: number }, wrap: number) {
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
  board.hero(c, f.heroFacing);
  c.restore();
  drawFlyers(f, hero, wrap, (ctx, t) => board.contents(ctx, t), true);
  board.over?.(f);
}
