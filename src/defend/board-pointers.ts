/** Pointer gestures on the DEFEND board, as a small state machine:
 * - idle: nothing is held.
 * - viewing: board pointers move the camera, one panning, two pinch-zooming.
 * - dragging: a palette item, placed structure, keep, city tile or bomb
 *   follows the pointer under a ghost icon until it is released (dropped
 *   where it is) or cancelled.
 * A pointer landing on the board while a gesture is under way joins the view
 * gesture. It ends a building drag, but a bomb stays held, and while a drag
 * lasts every pointer steers it and the first one lifted drops it.
 * What a press picks up and what a drop does are the page's decisions. */
import { dragIcon, type Drag } from "./drag-rules.ts";
import { CELLS_W, SUB, TILES_H, tileKey } from "./grid.ts";
import type { Layout } from "./layout.ts";
import type { DefendRenderer } from "./render.ts";
import { paintIcon } from "./structure-art.ts";

/** Where a drag's pointer is: its client point, its board position in cells,
 * and whether it is over the board or the palette. */
export type DragPointer = { x: number; y: number; cellX: number; cellY: number; overBoard: boolean; overPalette: boolean };

/** A drag in progress: what is carried, the layouts it could make keyed by
 * tile, where its pointer is and the tile under it. */
export type DragSession = {
  drag: Drag;
  legal: Map<string, Layout>;
  moved: boolean;
  pointer: DragPointer;
  hover: string | null;
  ghost: HTMLCanvasElement;
};

export type PointerHost = {
  renderer(): DefendRenderer | null;
  /** Starts a drag (through `begin`) for whatever a board press lands on,
   * returning false when the press should move the view instead. */
  pickUp(e: PointerEvent): boolean;
  /** A drag was released where its pointer is. */
  drop(session: DragSession): void;
};

type Point = { x: number; y: number };

export class BoardPointers {
  /** Board pointers moving the view, at their last client points. */
  private touches = new Map<number, Point>();
  /** The drag in progress, if any. */
  session: DragSession | null = null;

  constructor(private host: PointerHost) {
    window.addEventListener("pointermove", (e) => this.move(e));
    window.addEventListener("pointerup", (e) => this.up(e));
    window.addEventListener("pointercancel", (e) => this.cancel(e));
  }

  /** A press on the board. */
  down(e: PointerEvent) {
    if (e.button !== 0) return;
    if (this.touches.size || this.session) return this.join(e);
    if (this.host.pickUp(e)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  /** A second pointer turns whatever was happening into a pinch. */
  private join(e: PointerEvent) {
    if (this.session && this.session.drag.from !== "bomb") this.end();
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  /** Starts dragging `drag`, which could make the `legal` layouts. */
  begin(drag: Drag, legal: Map<string, Layout>, e: PointerEvent) {
    e.preventDefault();
    const pointer = { x: 0, y: 0, cellX: 0, cellY: 0, overBoard: false, overPalette: false };
    this.session = { drag, legal, moved: false, pointer, hover: null, ghost: ghostIcon(drag) };
    this.move(e);
  }

  private move(e: PointerEvent) {
    const s = this.session;
    if (!s && this.touches.has(e.pointerId)) return this.view(e);
    const renderer = this.host.renderer();
    if (!s || !renderer) return;
    s.moved = true;
    const c = eventCell(renderer, e);
    s.pointer = {
      x: e.clientX,
      y: e.clientY,
      cellX: c.fx,
      cellY: c.fy,
      overBoard: c.inside,
      overPalette: !!(document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.("#defend-palette"),
    };
    s.hover = c.inside ? tileKey(Math.floor(c.cx / SUB), Math.floor(c.cy / SUB)) : null;
    s.ghost.style.left = `${e.clientX}px`;
    s.ghost.style.top = `${e.clientY}px`;
  }

  private up(e: PointerEvent) {
    this.touches.delete(e.pointerId);
    const s = this.session;
    if (!s) return;
    this.move(e);
    this.host.drop(s);
    this.end();
  }

  private cancel(e: PointerEvent) {
    this.touches.delete(e.pointerId);
    this.end();
  }

  /** Drops the drag in progress without placing it. */
  end() {
    this.session?.ghost.remove();
    this.session = null;
  }

  /** Board pointers: one drags the view, two pinch-zoom it. */
  private view(e: PointerEvent) {
    const renderer = this.host.renderer()!;
    const before = [...this.touches.values()].map((p) => ({ ...p }));
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = [...this.touches.values()];
    if (after.length >= 2) {
      const [a, b] = before,
        [c, d] = after;
      renderer.panBy((c.x + d.x - a.x - b.x) / 2, (c.y + d.y - a.y - b.y) / 2);
      const d0 = Math.hypot(a.x - b.x, a.y - b.y);
      if (d0 > 0) renderer.zoomAt((c.x + d.x) / 2, (c.y + d.y) / 2, Math.hypot(c.x - d.x, c.y - d.y) / d0);
    } else {
      const prev = before[0];
      renderer.panBy(e.clientX - prev.x, e.clientY - prev.y);
    }
  }
}

/** The board cell under a pointer, clamped to the board, with its exact
 * position in cells and whether it is really on the board. */
export function eventCell(renderer: DefendRenderer, e: PointerEvent) {
  const { fx, fy } = renderer.toCell(e.clientX, e.clientY);
  const H = TILES_H * SUB;
  const r = renderer.canvas.getBoundingClientRect();
  const onCanvas = e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
  return {
    cx: Math.max(0, Math.min(CELLS_W - 1, Math.floor(fx))),
    cy: Math.max(0, Math.min(H - 1, Math.floor(fy))),
    fx,
    fy,
    inside: onCanvas && fx >= 0 && fy >= 0 && fx < CELLS_W && fy < H,
  };
}

/** The icon that follows the pointer while `drag` is held. */
function ghostIcon(drag: Drag) {
  const g = document.createElement("canvas");
  g.width = g.height = 48;
  g.className = "defend-drag-ghost";
  paintIcon(g, dragIcon(drag));
  document.body.appendChild(g);
  return g;
}
