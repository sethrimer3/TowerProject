/** The player-authored city layout (which tiles are city, where the keep is,
 * which tile each defensive structure was dropped on) plus the rules that
 * decide what is legal. The exact cell position of each structure is never
 * stored — `fitLayout` derives it deterministically, so the same layout
 * always produces the same city. */
import {
  CELL_COUNT,
  CELLS_H,
  CELLS_W,
  ORTHO,
  SPAWN_ROW,
  SUB,
  TILES_H,
  TILES_W,
  WALL_THICKNESS,
  cellIndex,
  cellX,
  cellY,
  hash01,
  parseTileKey,
  rectCells,
  sideCells,
  tileInBounds,
  tileKey,
  type Rect,
  type TilePos,
} from "./grid.ts";
import { STRUCTURES, type StructureKind } from "./catalog.ts";

export type PlacedKind = Exclude<StructureKind, "keep">;
export type PlacedStructure = { uid: number; kind: PlacedKind; tx: number; ty: number };

export type Layout = {
  keep: TilePos;
  /** City tiles other than the keep's own tile (the keep always counts as one). */
  cityTiles: string[];
  structures: PlacedStructure[];
  nextUid: number;
};

export type FittedStructure = {
  /** 0 is reserved for the keep. */
  uid: number;
  kind: StructureKind;
  tx: number;
  ty: number;
  rect: Rect;
  inside: boolean;
};

export type Fit =
  | { ok: true; structures: FittedStructure[]; city: Uint8Array; wall: Uint8Array }
  | { ok: false; reason: string };

export const KEEP_UID = 0;

export function defaultLayout(): Layout {
  return {
    keep: { tx: Math.floor(TILES_W / 2), ty: TILES_H - 4 },
    cityTiles: [],
    structures: [],
    nextUid: 1,
  };
}

export function cloneLayout(l: Layout): Layout {
  return {
    keep: { ...l.keep },
    cityTiles: [...l.cityTiles],
    structures: l.structures.map((s) => ({ ...s })),
    nextUid: l.nextUid,
  };
}

export function cityTileSet(l: Layout): Set<string> {
  return new Set([tileKey(l.keep.tx, l.keep.ty), ...l.cityTiles]);
}

export const isCityTile = (l: Layout, tx: number, ty: number) => cityTileSet(l).has(tileKey(tx, ty));

/** Whether a set of tiles is one orthogonally-connected blob containing `root`. */
export function tilesConnected(tiles: Set<string>, root: TilePos): boolean {
  if (!tiles.has(tileKey(root.tx, root.ty))) return false;
  const seen = new Set([tileKey(root.tx, root.ty)]);
  const stack = [root];
  while (stack.length) {
    const { tx, ty } = stack.pop()!;
    for (const [dx, dy] of ORTHO) {
      const k = tileKey(tx + dx, ty + dy);
      if (tiles.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push({ tx: tx + dx, ty: ty + dy });
      }
    }
  }
  return seen.size === tiles.size;
}

/** Cell mask of the city (1 = inside a city tile). */
export function cityMask(l: Layout): Uint8Array {
  const city = new Uint8Array(CELL_COUNT);
  for (const k of cityTileSet(l)) {
    const { tx, ty } = parseTileKey(k);
    for (const i of rectCells({ x: tx * SUB, y: ty * SUB, w: SUB, h: SUB })) city[i] = 1;
  }
  return city;
}

/** The city wall: every non-city cell within `WALL_THICKNESS` (Chebyshev) of
 * a city cell. The board edge is impassable, so no wall is needed there. */
export function wallMask(city: Uint8Array): Uint8Array {
  const wall = new Uint8Array(CELL_COUNT);
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      const i = cellIndex(cx, cy);
      if (!city[i] && nearCity(city, cx, cy)) wall[i] = 1;
    }
  return wall;
}

/** Whether any city cell lies within `WALL_THICKNESS` of (cx, cy). */
function nearCity(city: Uint8Array, cx: number, cy: number): boolean {
  const r = WALL_THICKNESS;
  const x0 = Math.max(0, cx - r),
    x1 = Math.min(CELLS_W - 1, cx + r);
  for (let y = Math.max(0, cy - r); y <= Math.min(CELLS_H - 1, cy + r); y++)
    for (let x = x0; x <= x1; x++) if (city[cellIndex(x, y)]) return true;
  return false;
}

/** The cells fitting has to work with, and what it has claimed so far. */
type FitSpace = {
  city: Uint8Array;
  wall: Uint8Array;
  /** Footprints plus a one-cell ring around each, so structures never touch
   * and there is always room for a street between them. */
  blocked: Uint8Array;
  foot: Uint8Array;
};

/** A structure to fit onto its tile. */
type Placement = { uid: number; kind: StructureKind; tx: number; ty: number; inside: boolean };

/** Work out the exact cell rectangle of every structure, oldest first, so
 * adding a new structure never shuffles the ones already standing. Fails if
 * something cannot fit, or if any in-city structure would be cut off from
 * the keep's streets. */
export function fitLayout(l: Layout): Fit {
  const city = cityMask(l);
  const space: FitSpace = { city, wall: wallMask(city), blocked: new Uint8Array(CELL_COUNT), foot: new Uint8Array(CELL_COUNT) };
  const cityTiles = cityTileSet(l);
  const fitted: FittedStructure[] = [];
  for (const s of fitOrder(l)) {
    const f = fitStructure({ ...s, inside: cityTiles.has(tileKey(s.tx, s.ty)) }, space);
    if (typeof f === "string") return { ok: false, reason: f };
    fitted.push(f);
  }
  const cut = cutOff(fitted, space);
  if (cut) return { ok: false, reason: `The ${STRUCTURES[cut.kind].name.toLowerCase()} would be cut off from the streets.` };
  return { ok: true, structures: fitted, city, wall: space.wall };
}

/** The keep, then every structure oldest first. */
function fitOrder(l: Layout): { uid: number; kind: StructureKind; tx: number; ty: number }[] {
  return [{ uid: KEEP_UID, kind: "keep", tx: l.keep.tx, ty: l.keep.ty }, ...[...l.structures].sort((a, b) => a.uid - b.uid)];
}

/** Fits one structure and claims its cells, or says why it can't go there. */
function fitStructure(p: Placement, space: FitSpace): FittedStructure | string {
  if (!tileInBounds(p.tx, p.ty) || p.ty === SPAWN_ROW) return "Nothing can be built on the spawn row.";
  const def = STRUCTURES[p.kind];
  if (!p.inside && !def.outsideOk) return `${def.name} must be inside the city limits.`;
  const rect = bestRect(p, space);
  if (!rect) return `No room for the ${def.name.toLowerCase()} there.`;
  for (const i of rectCells({ x: rect.x - 1, y: rect.y - 1, w: rect.w + 2, h: rect.h + 2 })) space.blocked[i] = 1;
  for (const i of rectCells(rect)) space.foot[i] = 1;
  return { uid: p.uid, kind: p.kind, tx: p.tx, ty: p.ty, rect, inside: p.inside };
}

/** City cells beside a rect that no structure stands on. */
const openSides = (r: Rect, space: FitSpace) => sideCells(r).filter((i) => space.city[i] && !space.foot[i]);

/** The first in-city structure that can't reach the keep through open city
 * cells, if any. */
function cutOff(fitted: FittedStructure[], space: FitSpace): FittedStructure | undefined {
  const reach = new Uint8Array(CELL_COUNT);
  const stack = openSides(fitted[0].rect, space);
  for (const i of stack) reach[i] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    for (const n of openSides({ x: cellX(i), y: cellY(i), w: 1, h: 1 }, space))
      if (!reach[n]) {
        reach[n] = 1;
        stack.push(n);
      }
  }
  return fitted.find((f) => f.inside && f.uid !== KEEP_UID && !openSides(f.rect, space).some((i) => reach[i]));
}

/** The free spot on the structure's tile closest to where it aims to stand. */
function bestRect(p: Placement, space: FitSpace): Rect | null {
  const target = aimPoint(p);
  // In the city, a structure needs at least one open side for a street.
  const needsStreet = p.inside && p.kind !== "keep";
  let best: Rect | null = null;
  let bestScore = Infinity;
  for (const r of candidateRects(p)) {
    if (!rectUsable(r, space, p.inside)) continue;
    if (needsStreet && !openSides(r, space).length) continue;
    const score = Math.hypot(r.x + r.w / 2 - target.x, r.y + r.h / 2 - target.y) + hash01(p.uid, r.x, r.y) * 0.25;
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** City structures gravitate to the tile's middle (jittered a touch);
 * outside towers pick a spot off-centre so they look placed by hand. */
function aimPoint({ uid, kind, tx, ty, inside }: Placement) {
  const x0 = tx * SUB,
    y0 = ty * SUB;
  if (kind === "keep") return { x: x0 + SUB / 2, y: y0 + SUB / 2 };
  if (inside) return { x: x0 + SUB / 2 + (hash01(uid, 11) - 0.5) * 2, y: y0 + SUB / 2 + (hash01(uid, 12) - 0.5) * 2 };
  return { x: x0 + 1.5 + hash01(uid, 13) * (SUB - 3), y: y0 + 1.5 + hash01(uid, 14) * (SUB - 3) };
}

/** Every position of every orientation of the structure on its tile. */
function* candidateRects({ uid, kind, tx, ty }: Placement): Generator<Rect> {
  const { w, h } = STRUCTURES[kind];
  const shapes = w === h ? [[w, h]] : hash01(uid, 15) < 0.5 ? [[w, h], [h, w]] : [[h, w], [w, h]];
  for (const [sw, sh] of shapes)
    for (let y = ty * SUB; y + sh <= (ty + 1) * SUB; y++) for (let x = tx * SUB; x + sw <= (tx + 1) * SUB; x++) yield { x, y, w: sw, h: sh };
}

/** Whether a structure may stand on every cell of `r`: unclaimed, not wall,
 * and on the right side of the city limits. */
function rectUsable(r: Rect, space: FitSpace, inside: boolean): boolean {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (!usable(space, cellIndex(x, y), inside)) return false;
  return true;
}

const usable = (space: FitSpace, i: number, inside: boolean) => !space.blocked[i] && !space.wall[i] && !!space.city[i] === inside;

// ── Edits ────────────────────────────────────────────────────────────────
// Every edit returns the new layout, or null when it would be illegal.

export function placeCityTile(l: Layout, tx: number, ty: number): Layout | null {
  if (!tileInBounds(tx, ty) || ty === SPAWN_ROW) return null;
  const tiles = cityTileSet(l);
  if (tiles.has(tileKey(tx, ty))) return null;
  if (!ORTHO.some(([dx, dy]) => tiles.has(tileKey(tx + dx, ty + dy)))) return null;
  const next = cloneLayout(l);
  next.cityTiles.push(tileKey(tx, ty));
  return fitLayout(next).ok ? next : null;
}

/** Remove a city tile. Structures on it go back to the palette; returns their
 * kinds alongside the new layout. */
export function removeCityTile(l: Layout, tx: number, ty: number): { layout: Layout; returned: PlacedKind[] } | null {
  const key = tileKey(tx, ty);
  if (!l.cityTiles.includes(key)) return null;
  const next = cloneLayout(l);
  next.cityTiles = next.cityTiles.filter((k) => k !== key);
  if (!tilesConnected(cityTileSet(next), next.keep)) return null;
  const returned = next.structures.filter((s) => s.tx === tx && s.ty === ty).map((s) => s.kind);
  next.structures = next.structures.filter((s) => !(s.tx === tx && s.ty === ty));
  return fitLayout(next).ok ? { layout: next, returned } : null;
}

/** Move a city tile (and whatever stands on it stays behind as returned
 * items — callers only move empty tiles). */
export function moveCityTile(l: Layout, from: TilePos, to: TilePos): Layout | null {
  const removed = removeCityTile(l, from.tx, from.ty);
  if (!removed || removed.returned.length) return null;
  return placeCityTile(removed.layout, to.tx, to.ty);
}

/** Place a new structure, which takes the next uid. */
export function placeStructure(l: Layout, kind: PlacedKind, tx: number, ty: number): Layout | null {
  const next = withStructure(l, { uid: l.nextUid, kind, tx, ty });
  if (next) next.nextUid++;
  return next;
}

function withStructure(l: Layout, s: PlacedStructure): Layout | null {
  const next = cloneLayout(l);
  next.structures.push(s);
  return fitLayout(next).ok ? next : null;
}

export function removeStructure(l: Layout, uid: number): Layout {
  const next = cloneLayout(l);
  next.structures = next.structures.filter((s) => s.uid !== uid);
  return next;
}

/** Move an existing structure to another tile, keeping its uid (and so its
 * priority over newer structures). */
export function moveStructure(l: Layout, uid: number, tx: number, ty: number): Layout | null {
  const s = l.structures.find((p) => p.uid === uid);
  if (!s) return null;
  return withStructure(removeStructure(l, uid), { ...s, tx, ty });
}

/** The keep can move onto any other city tile; the two tiles swap roles. */
export function moveKeep(l: Layout, tx: number, ty: number): Layout | null {
  const key = tileKey(tx, ty);
  if (!l.cityTiles.includes(key)) return null;
  const next = cloneLayout(l);
  next.cityTiles = next.cityTiles.filter((k) => k !== key);
  next.cityTiles.push(tileKey(l.keep.tx, l.keep.ty));
  next.keep = { tx, ty };
  return fitLayout(next).ok ? next : null;
}

export function placedCount(l: Layout, kind: PlacedKind | "cityTile"): number {
  return kind === "cityTile" ? l.cityTiles.length : l.structures.filter((s) => s.kind === kind).length;
}
