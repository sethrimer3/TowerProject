import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {decodePng} from "../tools/ui-atlas-png.mjs";
import {TILESET_EXAMPLES,exampleIndex,LAB_ROOM,LAB_SIZE,LAB_HERO,LAB_TORCHES,labTile} from "../src/tileset-lab.ts";
import {towerTileset} from "../src/sprites/dungeon.ts";

test("the showcase has nine tower references and three uniquely named, preview-only experiments",()=>{
  assert.equal(TILESET_EXAMPLES.length,12);
  assert.equal(new Set(TILESET_EXAMPLES.map(e=>e.id)).size,12);
  assert.equal(exampleIndex(-1),11);assert.equal(exampleIndex(12),0);
  const experiments=TILESET_EXAMPLES.filter(e=>e.experimental);
  assert.deepEqual(experiments.map(e=>e.id),["EXP-A","EXP-B","EXP-C"]);
  const values=readFileSync(new URL("../assets/ui-sprites/palette.ppm",import.meta.url),"utf8").replace(/#[^\n]*/g,"").trim().split(/\s+/).slice(4).map(Number);
  const palette=new Set(Array.from({length:values.length/3},(_,i)=>values.slice(i*3,i*3+3).join(",")));
  for(const part of ["floor","walls"] as const) {
    const files=experiments.map(e=>readFileSync(new URL(`../public/assets/style/${e.material![part]}.png`,import.meta.url)));
    assert.equal(new Set(files.map(f=>f.toString("base64"))).size,3);
    for(const file of files) {
      const {width,height,pixels}=decodePng(file);
      assert.deepEqual([width,height],[96,part==="floor"?96:720]);
      for(let i=0;i<pixels.length;i+=4) {
        assert.ok(pixels[i+3]===0||pixels[i+3]===255);
        if(pixels[i+3])assert.ok(palette.has([...pixels.subarray(i,i+3)].join(",")));
      }
    }
  }
  for(const tier of [10,11,12])assert.equal(towerTileset("tower",tier),undefined,"experiments never become playable towers");
});

test("the fixed room keeps all props and the hero on connected walkable tiles",()=>{
  assert.equal(LAB_ROOM.length,LAB_SIZE);assert.ok(LAB_ROOM.every(r=>r.length===LAB_SIZE));
  const seen=new Set<string>(),queue=[LAB_HERO];
  for(let i=0;i<queue.length;i++) {
    const p=queue[i],key=`${p.x},${p.y}`;if(seen.has(key))continue;seen.add(key);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const x=p.x+dx,y=p.y+dy;if(labTile(x,y).kind!=="wall"&&!seen.has(`${x},${y}`))queue.push({x,y});
    }
  }
  for(let y=0;y<LAB_SIZE;y++)for(let x=0;x<LAB_SIZE;x++)if(labTile(x,y).kind!=="wall")assert.ok(seen.has(`${x},${y}`));
  for(const t of LAB_TORCHES)assert.ok(seen.has(`${t.x},${t.y}`));
  assert.equal(labTile(-1,0).kind,"wall");assert.equal(labTile(0,LAB_SIZE).kind,"wall");
});
