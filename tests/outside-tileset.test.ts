import test from "node:test";
import assert from "node:assert/strict";
import { OUTSIDE_SPRITE_URLS, outsideSpriteKind } from "../src/outside.ts";

test("outside sprite families have deploy-safe complete variant sets",()=>{
  assert.deepEqual(Object.fromEntries(Object.entries(OUTSIDE_SPRITE_URLS).map(([k,v])=>[k,v.length])),{grass:4,path:3,trees:3,boulders:2});
  for(const urls of Object.values(OUTSIDE_SPRITE_URLS)) for(const url of urls) assert.match(url,/assets\/tilesets\/outside\/.+\.png$/);
});
test("outside sprite selection is deterministic and separates blockers",()=>{
  assert.deepEqual(outsideSpriteKind({kind:"floor"},3,4,99,15),outsideSpriteKind({kind:"floor"},3,4,99,15));
  assert.match(outsideSpriteKind({kind:"wall"},3,4,99,15).family,/^(trees|boulders)$/);
});
