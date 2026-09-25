/** Grid geometry shared by the Tower embedder and furnisher: chambers are
 * inclusive tile rectangles. */

export type Rect = { x1: number; y1: number; x2: number; y2: number };
export type XY = [number, number];
export const DIRS: XY[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const area = (r: Rect) => (r.x2 - r.x1 + 1) * (r.y2 - r.y1 + 1);
export const inRect = (r: Rect, x: number, y: number) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
export const minSide = (r: Rect) => Math.min(r.x2 - r.x1 + 1, r.y2 - r.y1 + 1);
export const centre = (r: Rect): XY => [(r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2];
