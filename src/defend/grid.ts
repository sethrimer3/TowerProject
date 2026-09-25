/** DEFEND board geometry. The board is a 9 × 13 grid of large "tiles" (the
 * unit the player builds with). Each tile is subdivided into a 7 × 7 block
 * of "cells" — the unit the procedural city, walls, pathfinding and the
 * simulation all work in. */

export const TILES_W = 9;
export const TILES_H = 13;
/** Cells per tile edge. */
export const SUB = 7;
export const CELLS_W = TILES_W * SUB;
export const CELLS_H = TILES_H * SUB;
export const CELL_COUNT = CELLS_W * CELLS_H;
/** The top tile row is the enemies' spawn lane: nothing can be built there. */
export const SPAWN_ROW = 0;
/** How many cells thick the automatic city wall is. It sits just outside the
 * city tiles, so every city tile keeps its full 7 × 7 interior. */
export const WALL_THICKNESS = 2;

export type TilePos = { tx: number; ty: number };
export type Rect = { x: number; y: number; w: number; h: number };

export const tileKey = (tx: number, ty: number) => `${tx},${ty}`;
export function parseTileKey(key: string): TilePos {
  const [tx, ty] = key.split(",").map(Number);
  return { tx, ty };
}
export const tileInBounds = (tx: number, ty: number) =>
  tx >= 0 && tx < TILES_W && ty >= 0 && ty < TILES_H;
export const cellInBounds = (cx: number, cy: number) =>
  cx >= 0 && cx < CELLS_W && cy >= 0 && cy < CELLS_H;
export const cellIndex = (cx: number, cy: number) => cy * CELLS_W + cx;
export const cellX = (i: number) => i % CELLS_W;
export const cellY = (i: number) => Math.floor(i / CELLS_W);

/** A rect's cells that lie on the board, row by row. */
export function rectCells(r: Rect): number[] {
  const out: number[] = [];
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) if (cellInBounds(x, y)) out.push(cellIndex(x, y));
  return out;
}

/** Cells orthogonally touching a rect's outside edge. */
export function sideCells(r: Rect): number[] {
  const out: number[] = [];
  const add = (x: number, y: number) => {
    if (cellInBounds(x, y)) out.push(cellIndex(x, y));
  };
  for (let x = r.x; x < r.x + r.w; x++) {
    add(x, r.y - 1);
    add(x, r.y + r.h);
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    add(r.x - 1, y);
    add(r.x + r.w, y);
  }
  return out;
}
export const tileOfCell = (cx: number, cy: number): TilePos => ({
  tx: Math.floor(cx / SUB),
  ty: Math.floor(cy / SUB),
});

export const ORTHO: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Stable 32-bit hash of a few integers — used instead of a sequential RNG
 * stream wherever generation should stay put when unrelated parts of the
 * city change. */
export function hash(...n: number[]): number {
  let h = 0x811c9dc5;
  for (const v of n) {
    h = Math.imul(h ^ (v | 0), 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}
/** `hash` mapped onto [0, 1). */
export const hash01 = (...n: number[]) => hash(...n) / 4294967296;

/** Small seeded PRNG (mulberry32) for the simulation, where a stream is fine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
