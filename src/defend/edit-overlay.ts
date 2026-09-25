/** What DEFEND draws over the board while the player is building: the dim
 * gold tile grid, and for a drag, which tiles accept the item, the hovered
 * tile, the item's ghost and an aimed bomb's reach. */
import { SUB, TILES_H, TILES_W, tileKey, type Rect } from "./grid.ts";
import type { StructureKind } from "./catalog.ts";

export type Overlay = {
  /** Tile keys that accept the dragged item. */
  legal: Set<string>;
  hover: string | null;
  ghost: { rect: Rect; kind: StructureKind | "cityTile" } | null;
  /** A bomb being aimed: centre in cells. */
  bomb?: { x: number; y: number; r: number } | null;
};

/** Dim gold tile lines at `alpha`, `px` canvas pixels per cell. */
export function drawGrid(c: CanvasRenderingContext2D, px: number, alpha: number) {
  const T = px * SUB;
  const { width, height } = c.canvas;
  c.save();
  c.strokeStyle = `rgba(216,181,114,${alpha})`;
  c.lineWidth = 1;
  c.beginPath();
  for (let tx = 1; tx < TILES_W; tx++) {
    const x = Math.round(tx * T) + 0.5;
    c.moveTo(x, 0);
    c.lineTo(x, height);
  }
  for (let ty = 1; ty < TILES_H; ty++) {
    const y = Math.round(ty * T) + 0.5;
    c.moveTo(0, y);
    c.lineTo(width, y);
  }
  c.stroke();
  c.restore();
}

export function drawOverlay(c: CanvasRenderingContext2D, px: number, o: Overlay) {
  if (o.legal.size || o.ghost || o.hover !== null) drawTargets(c, px, o);
  if (o.ghost) drawGhost(c, px, o.ghost.rect);
  if (o.bomb) drawBombReach(c, px, o.bomb);
}

/** Shades the tiles that won't take the item and frames those that will,
 * the hovered one brightest. */
function drawTargets(c: CanvasRenderingContext2D, px: number, o: Overlay) {
  const T = px * SUB;
  for (let ty = 0; ty < TILES_H; ty++)
    for (let tx = 0; tx < TILES_W; tx++) {
      const key = tileKey(tx, ty);
      const x = Math.round(tx * T),
        y = Math.round(ty * T),
        s = Math.round((tx + 1) * T) - x;
      if (!o.legal.has(key)) {
        c.fillStyle = "rgba(0,0,0,0.38)";
        c.fillRect(x, y, s, s);
        continue;
      }
      const hover = key === o.hover;
      c.fillStyle = hover ? "rgba(242,201,76,0.16)" : "rgba(242,201,76,0.04)";
      c.fillRect(x, y, s, s);
      c.strokeStyle = hover ? "rgba(242,201,76,0.9)" : "rgba(242,201,76,0.38)";
      c.lineWidth = Math.max(1, px * (hover ? 0.16 : 0.08));
      c.strokeRect(x + c.lineWidth / 2, y + c.lineWidth / 2, s - c.lineWidth, s - c.lineWidth);
    }
}

function drawGhost(c: CanvasRenderingContext2D, px: number, r: Rect) {
  c.fillStyle = "rgba(242,210,122,0.45)";
  c.fillRect(r.x * px, r.y * px, r.w * px, r.h * px);
  c.strokeStyle = "#f2d27a";
  c.lineWidth = Math.max(1, px * 0.12);
  c.strokeRect(r.x * px, r.y * px, r.w * px, r.h * px);
}

function drawBombReach(c: CanvasRenderingContext2D, px: number, bomb: { x: number; y: number; r: number }) {
  c.strokeStyle = "rgba(255,150,60,0.9)";
  c.fillStyle = "rgba(255,120,40,0.15)";
  c.lineWidth = Math.max(1, px * 0.12);
  c.beginPath();
  c.arc(bomb.x * px, bomb.y * px, bomb.r * px, 0, Math.PI * 2);
  c.fill();
  c.stroke();
}
