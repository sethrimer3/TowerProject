import { drawKit } from "./kit.ts";
import type { FrameContext } from "../render-frame.ts";

export const BOARD_MARK_SPRITES = {
  target: { id: "combat-mark-target", size: 16 },
  ignore: { id: "combat-mark-ignore", size: 16 },
  skip: { id: "combat-mark-skip", size: 12 },
  blocked: { id: "combat-mark-blocked", size: 12 },
} as const;
/** One native board pixel per tile unit, without stretching small symbols. */
export function drawBoardMark(f: FrameContext, kind: keyof typeof BOARD_MARK_SPRITES, x: number, y: number) {
  if (!f.look.styledSprites) return false;
  const mark = BOARD_MARK_SPRITES[kind], size = mark.size * f.s / 24;
  return drawKit(f.c, mark.id, x - size / 2, y - size / 2, size);
}
