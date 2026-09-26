/** What carrying a city element can do on the DEFEND board, as pure
 * functions of the layout: the layout it makes on each tile, the outline it
 * shows there, why a tile refuses it, and which city tiles can be lifted. */
import { STRUCTURES, type PaletteItem } from "./catalog.ts";
import { SUB, TILES_H, TILES_W, tileKey, type Rect, type TilePos } from "./grid.ts";
import {
  cityTileSet,
  fitLayout,
  moveCityTile,
  moveKeep,
  moveStructure,
  placeCityTile,
  placeStructure,
  removeCityTile,
  type Layout,
  type PlacedKind,
} from "./layout.ts";
import type { Overlay } from "./edit-overlay.ts";
import type { IconItem } from "./structure-art.ts";

export type Drag =
  | { from: "palette"; item: PaletteItem }
  | { from: "structure"; uid: number; kind: PlacedKind }
  | { from: "cityTile"; tile: TilePos }
  | { from: "keep" }
  | { from: "bomb" };

/** The icon of what `drag` carries. */
export function dragIcon(drag: Drag): IconItem {
  if (drag.from === "palette") return drag.item;
  if (drag.from === "structure") return drag.kind;
  return drag.from;
}

/** Every layout dropping `drag` could make, keyed by the tile it lands on. */
export function legalLayouts(drag: Drag, layout: Layout): Map<string, Layout> {
  const out = new Map<string, Layout>();
  for (let ty = 0; ty < TILES_H; ty++)
    for (let tx = 0; tx < TILES_W; tx++) {
      const next = layoutAfter(drag, layout, tx, ty);
      if (next) out.set(tileKey(tx, ty), next);
    }
  return out;
}

/** The layout after dropping `drag` on tile (tx, ty), or null where it can't
 * go. Dropping a city tile or the keep back where it was keeps the layout. */
function layoutAfter(drag: Drag, layout: Layout, tx: number, ty: number): Layout | null {
  switch (drag.from) {
    case "palette":
      return drag.item === "cityTile" ? placeCityTile(layout, tx, ty) : placeStructure(layout, drag.item, tx, ty);
    case "structure":
      return moveStructure(layout, drag.uid, tx, ty);
    case "cityTile":
      return isTile(drag.tile, tx, ty) ? layout : moveCityTile(layout, drag.tile, { tx, ty });
    case "keep":
      return isTile(layout.keep, tx, ty) ? layout : moveKeep(layout, tx, ty);
    default:
      return null;
  }
}

const isTile = (t: TilePos, tx: number, ty: number) => t.tx === tx && t.ty === ty;

/** The outline shown where `drag` would land, in `next`, the layout it makes
 * on tile `key`: the tile itself for a city tile, else the fitted structure. */
export function dropGhost(drag: Drag, next: Layout, key: string): Overlay["ghost"] {
  const [tx, ty] = key.split(",").map(Number);
  if (dragIcon(drag) === "cityTile") return { rect: { x: tx * SUB, y: ty * SUB, w: SUB, h: SUB }, kind: "cityTile" };
  const fit = fitLayout(next);
  if (!fit.ok) return null;
  const uid = drag.from === "structure" ? drag.uid : drag.from === "keep" ? 0 : next.nextUid - 1;
  const f = fit.structures.find((s) => s.uid === uid);
  return f ? { rect: f.rect as Rect, kind: f.kind } : null;
}

/** Why tile `key` of `layout` refuses `drag`. */
export function refusal(drag: Drag, layout: Layout, key: string): string {
  const ty = Number(key.split(",")[1]);
  if (ty === 0) return "Nothing can be built on the top row — that's where the enemy gathers.";
  const inCity = cityTileSet(layout).has(key);
  const kind = dragIcon(drag);
  if (kind === "cityTile")
    return inCity && drag.from === "palette" ? "That tile is already part of the city." : "City tiles must touch the city along an edge.";
  if (kind === "keep") return "The keep can only move onto another city tile.";
  if (kind !== "bomb" && needsCity(kind, inCity)) return `The ${STRUCTURES[kind].name.toLowerCase()} must go inside the city limits.`;
  return "There isn't room for that there.";
}

function needsCity(kind: PlacedKind, inCity: boolean) {
  return !inCity && !STRUCTURES[kind].outsideOk;
}

/** Whether pressing city tile `tile` lifts it: only an empty tile whose
 * removal leaves the city whole does, and any other press pans the view. */
export function liftsCityTile(layout: Layout, tile: TilePos) {
  if (!layout.cityTiles.includes(tileKey(tile.tx, tile.ty))) return false;
  if (layout.structures.some((s) => s.tx === tile.tx && s.ty === tile.ty)) return false;
  return !!removeCityTile(layout, tile.tx, tile.ty);
}
