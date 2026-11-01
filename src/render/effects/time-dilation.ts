import { tileCenter, type FrameContext } from "../render-frame.ts";

/** Time Dilation's field: a faint light blue disc, to show its range without
 * hiding the floor, and a solid thin rim. */
const FIELD_COLOR = "#8fd8ff";
const FIELD_ALPHA = 0.1;

/** The field round (x, y), `radius` wide, its rim `rim` thick. One arc a frame. */
export function paintDilationField(c: CanvasRenderingContext2D, x: number, y: number, radius: number, rim: number) {
  c.save();
  c.fillStyle = c.strokeStyle = FIELD_COLOR;
  c.lineWidth = rim;
  c.beginPath();
  c.arc(x, y, radius, 0, Math.PI * 2);
  c.globalAlpha = FIELD_ALPHA;
  c.fill();
  c.globalAlpha = 1;
  c.stroke();
  c.restore();
}

/** What the board shows of Time Dilation: the field round the hero as drawn, out
 * to its `reach` in hundredths of a tile, while one stands. */
export function drawDilationField(f: FrameContext, field: { reach: number } | undefined) {
  if (!field) return;
  const { x, y } = tileCenter(f, f.playerX, f.playerY);
  paintDilationField(f.c, x, y, (f.s * field.reach) / 100, Math.max(1, f.s / 24));
}
