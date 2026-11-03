import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {decodePng} from '../tools/ui-atlas-png.mjs';
import {UI_ATLAS} from '../src/sprites/ui-atlas-data.ts';
import {defaults,decode} from '../src/save/save.ts';
import {WORLD_ATLAS} from '../src/sprites/world-atlas-data.ts';
import {SPRITE_ASSETS} from '../src/sprites/assets.ts';
for(const atlasData of [UI_ATLAS,WORLD_ATLAS])test(atlasData.image+' preserves every original RGBA texel with non-overlapping padded regions',()=>{
 const atlas=decodePng(readFileSync(new URL('../public/'+atlasData.image,import.meta.url))),occupied=new Uint8Array(atlas.width*atlas.height);
 assert.equal(atlas.width,atlasData.width);assert.equal(atlas.height,atlasData.height);
 assert.ok(Object.keys(atlasData.regions).length>100);
 for(const [path,r]of Object.entries(atlasData.regions)){
  const original=decodePng(readFileSync(new URL('../public/'+path,import.meta.url)));
  assert.deepEqual([original.width,original.height],[r.width,r.height],path);
  for(let y=0;y<r.height;y++){
   assert.deepEqual(atlas.pixels.subarray(((r.y+y)*atlas.width+r.x)*4,((r.y+y)*atlas.width+r.x+r.width)*4),original.pixels.subarray(y*r.width*4,(y+1)*r.width*4),path);
   for(let x=0;x<r.width;x++){const at=(r.y+y)*atlas.width+r.x+x;assert.equal(occupied[at],0,path);occupied[at]=1;}
  }
  for(let y=r.y-1;y<=r.y+r.height;y++)for(let x=r.x-1;x<=r.x+r.width;x++)if(x<r.x||x>=r.x+r.width||y<r.y||y>=r.y+r.height)assert.equal(atlas.pixels[(y*atlas.width+x)*4+3],0,`${path}: transparent gutter`);
 }
});
test('experimental Atlas is opt-in and survives save decoding',()=>{
 const save=defaults();assert.equal(save.settings.experimentalAtlas,false);
 save.settings.experimentalAtlas=true;
 const loaded=decode(JSON.stringify(save));assert.equal(loaded.settings.experimentalAtlas,true);
});

test('both atlases cover every startup sprite exactly once',()=>{const paths=[...Object.keys(UI_ATLAS.regions),...Object.keys(WORLD_ATLAS.regions)];assert.equal(new Set(paths).size,paths.length);assert.deepEqual(paths.sort(),[...SPRITE_ASSETS].sort());});
