import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { OUTSIDE_SPRITE_URLS, OUTSIDE_PATH_EDGE_URLS, OUTSIDE_START_Y, outsideSpriteKind, outsidePathEdges } from "../src/outside.ts";

test("outside sprite families have deploy-safe complete variant sets",()=>{
  assert.deepEqual(Object.fromEntries(Object.entries(OUTSIDE_SPRITE_URLS).map(([k,v])=>[k,v.length])),{grass:4,path:6,trees:3,boulders:2});
  for(const urls of [...Object.values(OUTSIDE_SPRITE_URLS), OUTSIDE_PATH_EDGE_URLS]) for(const url of urls) {
    assert.match(url,/assets\/tilesets\/outside\/.+\.png$/);
    const png = readFileSync(new URL(`../public${url}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 24);
    assert.equal(png.readUInt32BE(20), 24);
  }
});

test("dirt variations are distinct and all appear on seeded paths", () => {
  const hashes = OUTSIDE_SPRITE_URLS.path.map(url => createHash("sha256").update(readFileSync(new URL(`../public${url}`, import.meta.url))).digest("hex"));
  assert.equal(new Set(hashes).size, 6);
  const variants = new Set<number>();
  for (let seed = 1; seed <= 20; seed++) for (let y = 0; y < 12; y++) {
    const spot = { x: 8, y, seed, center: 8 };
    const selected = outsideSpriteKind({ kind: "floor" }, spot);
    assert.equal(selected.family, "path");
    assert.deepEqual(selected, outsideSpriteKind({ kind: "floor" }, spot));
    variants.add(selected.variant);
  }
  assert.deepEqual([...variants].sort(), [0, 1, 2, 3, 4, 5]);
});

test("grass fringes follow the path and leave crossroads and continuing roads joined", () => {
  const spot = { x: 8, y: 6, seed: 1, center: 8 };
  assert.deepEqual(outsidePathEdges(spot), [1, 3]);
  const roads = { blacksmith: true, hall: true, prev: false, next: false };
  assert.deepEqual(outsidePathEdges({ ...spot, y: OUTSIDE_START_Y, roads }), []);
  assert.deepEqual(outsidePathEdges({ ...spot, x: 3, y: OUTSIDE_START_Y, roads }), [0, 2, 3]);
  assert.deepEqual(outsidePathEdges({ ...spot, x: 3, y: OUTSIDE_START_Y, roads: { ...roads, prev: true } }), [0, 2]);
  assert.deepEqual(outsidePathEdges({ ...spot, x: 13, y: OUTSIDE_START_Y, roads: { ...roads, next: true } }), [0, 2]);
});
test("outside sprite selection is deterministic and separates blockers",()=>{
  assert.deepEqual(outsideSpriteKind({kind:"floor"},{x:3,y:4,seed:99,center:15}),outsideSpriteKind({kind:"floor"},{x:3,y:4,seed:99,center:15}));
  assert.match(outsideSpriteKind({kind:"wall"},{x:3,y:4,seed:99,center:15}).family,/^(trees|boulders)$/);
});
