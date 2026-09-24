/** The player-authored city layout (which tiles are city, where the keep is,
 * which tile each defensive structure was dropped on) plus the rules that
 * decide what is legal. The exact cell position of each structure is never
 * stored — `fitLayout` derives it deterministically, so the same layout
 * always produces the same city. */
import {
  CELL_COUNT,
  CELLS_W,
  CELLS_H,
  ORTHO,
  SPAWN_ROW,
  SUB,
  TILES_H,
  TILES_W,
  WALL_THICKNESS,
  cellIndex,
  hash01,
  parseTileKey,
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
    for (let y = 0; y < SUB; y++)
      for (let x = 0; x < SUB; x++) city[cellIndex(tx * SUB + x, ty * SUB + y)] = 1;
  }
  return city;
}

/** The city wall: every non-city cell within `WALL_THICKNESS` (Chebyshev) of
 * a city cell. The board edge is impassable, so no wall is needed there. */
export function wallMask(city: Uint8Array): Uint8Array {
  const wall = new Uint8Array(CELL_COUNT);
  const r = WALL_THICKNESS;
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      if (city[cellIndex(cx, cy)]) continue;
      search: for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx,
            y = cy + dy;
          if (x >= 0 && y >= 0 && x < CELLS_W && y < CELLS_H && city[cellIndex(x, y)]) {
            wall[cellIndex(cx, cy)] = 1;
            break search;
          }
        }
    }
  return wall;
}

/** Work out the exact cell rectangle of every structure, oldest first, so
 * adding a new structure never shuffles the ones already standing. Fails if
 * something cannot fit, or if any in-city structure would be cut off from
 * the keep's streets. */
export function fitLayout(l: Layout): Fit {
  const city = cityMask(l);
  const wall = wallMask(city);
  const cityTiles = cityTileSet(l);
  // `blocked` = footprints plus a one-cell ring around each, so structures
  // never touch and there is always room for a street between them.
  const blocked = new Uint8Array(CELL_COUNT);
  const foot = new Uint8Array(CELL_COUNT);
  const fitted: FittedStructure[] = [];
  const queue: { uid: number; kind: StructureKind; tx: number; ty: number }[] = [
    { uid: KEEP_UID, kind: "keep", tx: l.keep.tx, ty: l.keep.ty },
    ...[...l.structures].sort((a, b) => a.uid - b.uid),
  ];
  for (const s of queue) {
    if (!tileInBounds(s.tx, s.ty) || s.ty === SPAWN_ROW) return { ok: false, reason: "Nothing can be built on the spawn row." };
    const inside = cityTiles.has(tileKey(s.tx, s.ty));
    const def = STRUCTURES[s.kind];
    if (!inside && !def.outsideOk) return { ok: false, reason: `${def.name} must be inside the city limits.` };
    const rect = bestRect(s.uid, s.kind, s.tx, s.ty, inside, city, wall, blocked, foot);
    if (!rect) return { ok: false, reason: `No room for the ${def.name.toLowerCase()} there.` };
    for (let y = rect.y - 1; y <= rect.y + rect.h; y++)
      for (let x = rect.x - 1; x <= rect.x + rect.w; x++) {
        if (x < 0 || y < 0 || x >= CELLS_W || y >= CELLS_H) continue;
        blocked[cellIndex(x, y)] = 1;
        if (x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h) foot[cellIndex(x, y)] = 1;
      }
    fitted.push({ uid: s.uid, kind: s.kind, tx: s.tx, ty: s.ty, rect, inside });
  }
  // Every in-city structure must reach the keep through open city cells.
  const reach = new Uint8Array(CELL_COUNT);
  const keepRect = fitted[0].rect;
  const stack: number[] = [];
  const touch = (r: Rect, visit: (i: number) => boolean) => {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        for (const [dx, dy] of ORTHO) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H) continue;
          const i = cellIndex(nx, ny);
          if (city[i] && !foot[i] && visit(i)) return true;
        }
    return false;
  };
  touch(keepRect, (i) => {
    if (!reach[i]) {
      reach[i] = 1;
      stack.push(i);
    }
    return false;
  });
  while (stack.length) {
    const i = stack.pop()!;
    const cx = i % CELLS_W,
      cy = (i - cx) / CELLS_W;
    for (const [dx, dy] of ORTHO) {
      const nx = cx + dx,
        ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H) continue;
      const n = cellIndex(nx, ny);
      if (city[n] && !foot[n] && !reach[n]) {
        reach[n] = 1;
        stack.push(n);
      }
    }
  }
  for (const f of fitted) {
    if (!f.inside || f.uid === KEEP_UID) continue;
    if (!touch(f.rect, (i) => reach[i] === 1))
      return { ok: false, reason: `The ${STRUCTURES[f.kind].name.toLowerCase()} would be cut off from the streets.` };
  }
  return { ok: true, structures: fitted, city, wall };
}

function bestRect(
  uid: number,
  kind: StructureKind,
  tx: number,
  ty: number,
  inside: boolean,
  city: Uint8Array,
  wall: Uint8Array,
  blocked: Uint8Array,
  foot: Uint8Array,
): Rect | null {
  const def = STRUCTURES[kind];
  const x0 = tx * SUB,
    y0 = ty * SUB;
  // City structures gravitate to the tile's middle (jittered a touch);
  // outside towers pick a spot off-centre so they look placed by hand.
  const target =
    kind === "keep"
      ? { x: x0 + SUB / 2, y: y0 + SUB / 2 }
      : inside
        ? { x: x0 + SUB / 2 + (hash01(uid, 11) - 0.5) * 2, y: y0 + SUB / 2 + (hash01(uid, 12) - 0.5) * 2 }
        : { x: x0 + 1.5 + hash01(uid, 13) * (SUB - 3), y: y0 + 1.5 + hash01(uid, 14) * (SUB - 3) };
  const shapes: [number, number][] = def.w === def.h ? [[def.w, def.h]] : hash01(uid, 15) < 0.5 ? [[def.w, def.h], [def.h, def.w]] : [[def.h, def.w], [def.w, def.h]];
  let best: Rect | null = null;
  let bestScore = Infinity;
  for (const [w, h] of shapes)
    for (let y = y0; y + h <= y0 + SUB; y++)
      for (let x = x0; x + w <= x0 + SUB; x++) {
        let ok = true;
        for (let yy = y; ok && yy < y + h; yy++)
          for (let xx = x; xx < x + w; xx++) {
            const i = cellIndex(xx, yy);
            if (blocked[i] || wall[i] || (inside ? !city[i] : city[i])) {
              ok = false;
              break;
            }
          }
        if (!ok) continue;
        // In the city, the structure needs at least one open side for a street.
        if (inside && kind !== "keep") {
          let open = false;
          for (let yy = y - 1; !open && yy <= y + h; yy++)
            for (let xx = x - 1; xx <= x + w; xx++) {
              const edge = (yy === y - 1 || yy === y + h) !== (xx === x - 1 || xx === x + w);
              if (!edge || xx < 0 || yy < 0 || xx >= CELLS_W || yy >= CELLS_H) continue;
              const i = cellIndex(xx, yy);
              if (city[i] && !foot[i]) {
                open = true;
                break;
              }
            }
          if (!open) continue;
        }
        const score = Math.hypot(x + w / 2 - target.x, y + h / 2 - target.y) + hash01(uid, x, y) * 0.25;
        if (score < bestScore) {
          bestScore = score;
          best = { x, y, w, h };
        }
      }
  return best;
}

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

export function placeStructure(l: Layout, kind: PlacedKind, tx: number, ty: number, uid?: number): Layout | null {
  const next = cloneLayout(l);
  next.structures.push({ uid: uid ?? next.nextUid, kind, tx, ty });
  if (uid === undefined) next.nextUid++;
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
  return placeStructure(removeStructure(l, uid), s.kind, tx, ty, uid);
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
