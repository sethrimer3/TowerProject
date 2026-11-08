import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { RELICS, PREVIEW_RELICS } from "../src/economy/relics.ts";
import { RELIC_ART, relicSpriteId } from "../src/sprites/relics.ts";
import { relicIcon } from "../src/ui/dom.ts";
import { decodePng } from "../tools/ui-atlas-png.mjs";

test("every live relic has one distinct named sprite, including previews and tower rewards", () => {
  assert.deepEqual(Object.keys(RELIC_ART).sort(), Object.keys(RELICS).sort());
  assert.equal(Object.keys(RELIC_ART).length, 126);
  const ids = new Set<string>();
  for (const [id, def] of Object.entries(RELICS)) {
    const art = RELIC_ART[id as keyof typeof RELIC_ART];
    assert.equal(art.name, def.name, id);
    assert.equal(art.rarity, def.rarity, id);
    assert.equal(relicSpriteId(def), art.id, id);
    assert.ok(relicIcon(def).includes(`${art.id}.png`), id);
    if (def.rarity === "legendary") assert.ok(!relicIcon(def).includes("relic-legendary"), "do not recolor a real legendary artifact");
    ids.add(art.id);
  }
  assert.equal(ids.size, 126);
  for (const def of Object.values(PREVIEW_RELICS)) assert.ok(relicSpriteId(def), def.name);
});

test("generic navigation and future relics retain their rarity fallback", () => {
  assert.match(relicIcon("rare"), /relic-rare.png/);
  assert.match(relicIcon("epic"), /relic-epic.png/);
  assert.match(relicIcon({name:"Future Relic",rarity:"legendary"}), /relic-legendary/);
  assert.equal(relicSpriteId({name:"Future Relic"}), undefined);
});

test("126 unique individual PNGs use the game palette, binary alpha and exact padded atlas regions", () => {
  const root = new URL("../public/assets/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("relics/atlas.json", root), "utf8"));
  const atlas = decodePng(readFileSync(new URL("relics/atlas.png", root)));
  const words = readFileSync(new URL("../assets/ui-sprites/palette.ppm", import.meta.url), "utf8").replace(/#[^\n]*/g, "").trim().split(/\s+/).slice(4).map(Number);
  const palette = new Set(Array.from({length:words.length/3}, (_,i)=>words.slice(i*3,i*3+3).join(",")));
  const images = new Set<string>(), occupied = new Set<string>();
  for (const [id, art] of Object.entries(RELIC_ART)) {
    const region = manifest.regions[id], p = decodePng(readFileSync(new URL(`style/${art.id}.png`,root)));
    assert.equal(region.name, RELICS[id]!.name);
    assert.equal(p.width,24); assert.equal(p.height,24);
    images.add(p.pixels.toString("base64"));
    let visible = 0;
    for(let y=0;y<24;y++)for(let x=0;x<24;x++) {
      const i=(y*24+x)*4,a=((region.y+y)*atlas.width+region.x+x)*4;
      assert.deepEqual(p.pixels.subarray(i,i+4),atlas.pixels.subarray(a,a+4),id);
      assert.ok(p.pixels[i+3]===0||p.pixels[i+3]===255,id);
      if(p.pixels[i+3]){visible++;assert.ok(palette.has([...p.pixels.subarray(i,i+3)].join(",")),id);}
      if(x===0||y===0||x===23||y===23)assert.equal(p.pixels[i+3],0,id);
    }
    assert.ok(visible>30,id);
    for(let y=region.y-2;y<region.y+26;y++)for(let x=region.x-2;x<region.x+26;x++) {
      const key=`${x},${y}`;assert.ok(!occupied.has(key),`overlap: ${id}`);occupied.add(key);
      if(x<region.x||y<region.y||x>=region.x+24||y>=region.y+24)assert.equal(atlas.pixels[(y*atlas.width+x)*4+3],0,id);
    }
  }
  assert.equal(images.size,126,"every relic has different pixels");
});
