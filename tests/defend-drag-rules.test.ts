import { test } from "node:test";
import assert from "node:assert/strict";
import { STRUCTURES } from "../src/defend/catalog.ts";
import { tileKey } from "../src/defend/grid.ts";
import { cityTileSet, defaultLayout, placeCityTile, placeStructure, type Layout } from "../src/defend/layout.ts";
import { dragIcon, dropGhost, legalLayouts, liftsCityTile, refusal, type Drag } from "../src/defend/drag-rules.ts";

// A small city: the keep with a tile either side, and a two-tile spur above
// it whose lower tile holds the upper one on. A barracks stands left of the keep.
function city(): Layout {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [x, y] of [[tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty - 2]]) l = placeCityTile(l, x, y)!;
  return placeStructure(l, "barracks", tx - 1, ty)!;
}
const L = city();
const { tx: KX, ty: KY } = L.keep;
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

test("dragIcon names what a drag carries", () => {
  assert.equal(dragIcon({ from: "palette", item: "watchTower" }), "watchTower");
  assert.equal(dragIcon({ from: "structure", uid: 1, kind: "barracks" }), "barracks");
  assert.equal(dragIcon({ from: "cityTile", tile: { tx: 1, ty: 1 } }), "cityTile");
  assert.equal(dragIcon({ from: "keep" }), "keep");
  assert.equal(dragIcon({ from: "bomb" }), "bomb");
});

test("legalLayouts lists the layouts a drop makes, tile by tile", () => {
  assert.equal(legalLayouts({ from: "bomb" }, L).size, 0);
  const tiles = cityTileSet(L);
  const fresh = legalLayouts({ from: "palette", item: "cityTile" }, L);
  assert.ok(fresh.size > 0);
  for (const [key, next] of fresh) {
    const [x, y] = key.split(",").map(Number);
    assert.ok(!tiles.has(key) && y !== 0, key);
    assert.ok(ORTHO.some(([dx, dy]) => tiles.has(tileKey(x + dx, y + dy))), `${key} touches the city`);
    assert.ok(next.cityTiles.includes(key));
  }
  // Dropping the keep or a city tile back where it was changes nothing.
  assert.equal(legalLayouts({ from: "keep" }, L).get(tileKey(KX, KY)), L);
  assert.equal(legalLayouts({ from: "cityTile", tile: { tx: KX, ty: KY - 2 } }, L).get(tileKey(KX, KY - 2)), L);
});

test("dropGhost outlines a city tile, or the fitted structure", () => {
  const tile: Drag = { from: "palette", item: "cityTile" };
  const [key, next] = [...legalLayouts(tile, L)][0];
  const [x, y] = key.split(",").map(Number);
  assert.deepEqual(dropGhost(tile, next, key), { rect: { x: x * 7, y: y * 7, w: 7, h: 7 }, kind: "cityTile" });
  const tower: Drag = { from: "palette", item: "archerTower" };
  const [tkey, tnext] = [...legalLayouts(tower, L)][0];
  assert.equal(dropGhost(tower, tnext, tkey)?.kind, "archerTower");
});

test("refusal explains why a tile turns a drop away", () => {
  const far = tileKey(0, KY - 4);
  assert.match(refusal({ from: "keep" }, L, tileKey(KX, 0)), /top row/);
  assert.equal(refusal({ from: "palette", item: "cityTile" }, L, tileKey(KX, KY)), "That tile is already part of the city.");
  assert.equal(refusal({ from: "palette", item: "cityTile" }, L, far), "City tiles must touch the city along an edge.");
  assert.equal(refusal({ from: "cityTile", tile: { tx: KX + 1, ty: KY } }, L, tileKey(KX, KY)), "City tiles must touch the city along an edge.");
  assert.equal(refusal({ from: "keep" }, L, far), "The keep can only move onto another city tile.");
  assert.equal(refusal({ from: "palette", item: "barracks" }, L, far), `The ${STRUCTURES.barracks.name.toLowerCase()} must go inside the city limits.`);
  assert.equal(refusal({ from: "structure", uid: 1, kind: "barracks" }, L, far), `The ${STRUCTURES.barracks.name.toLowerCase()} must go inside the city limits.`);
  assert.equal(refusal({ from: "palette", item: "archerTower" }, L, far), "There isn't room for that there.");
  assert.equal(refusal({ from: "palette", item: "barracks" }, L, tileKey(KX, KY - 1)), "There isn't room for that there.");
});

test("only an empty city tile the city can do without lifts", () => {
  assert.equal(liftsCityTile(L, { tx: KX + 1, ty: KY }), true);
  assert.equal(liftsCityTile(L, { tx: KX, ty: KY - 2 }), true);
  assert.equal(liftsCityTile(L, { tx: KX - 1, ty: KY }), false, "holds the barracks");
  assert.equal(liftsCityTile(L, { tx: KX, ty: KY - 1 }), false, "holds the spur on");
  assert.equal(liftsCityTile(L, { tx: KX, ty: KY }), false, "the keep's own tile");
  assert.equal(liftsCityTile(L, { tx: 0, ty: KY - 4 }), false, "not a city tile");
});
