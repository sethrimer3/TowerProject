import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodePng} from '../tools/ui-atlas-png.mjs';
import {UNDEAD_IDS,SPIRIT_RARITIES,INGOTS,DROP_IDS} from '../src/catacombs/catalog.ts';
import {undeadSprite,spiritSprite,ingotSprite,buffSprite,catacombMenuSprite,MAUSOLEUM_SPRITE} from '../src/sprites/catacombs.ts';
import {spiritIcon,ingotIcon} from '../src/ui/dom.ts';
const ids=[...UNDEAD_IDS.map(undeadSprite),...(['fragments',...SPIRIT_RARITIES] as const).map(spiritSprite),...INGOTS.flatMap(id=>[ingotSprite(id),ingotSprite(id,true)]),...DROP_IDS.map(buffSprite),...(['skills','spirit','forge','academy','catacombs'] as const).map(catacombMenuSprite),MAUSOLEUM_SPRITE];
test('all 33 Catacombs subjects are distinct native palette sprites with binary alpha and padding',()=>{
 assert.equal(ids.length,33);const hashes=new Set<string>();
 const words=readFileSync('assets/ui-sprites/palette.ppm','utf8').replace(/#[^\n]*/g,'').trim().split(/\s+/).slice(4).map(Number);
 const palette=new Set(Array.from({length:27},(_,i)=>words.slice(i*3,i*3+3).join(',')));
 const manifest=JSON.parse(readFileSync('public/assets/style/manifest.json','utf8')).assets;
 for(const id of ids){
  const data=readFileSync(`public/assets/style/${id}.png`),p=decodePng(data),size=id===MAUSOLEUM_SPRITE?72:id.includes('-buff-')?12:24;
  assert.deepEqual([p.width,p.height],[size,size],id);assert.deepEqual([manifest[id].width,manifest[id].height],[size,size],id);
  let visible=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const at=(y*size+x)*4,a=p.pixels[at+3];assert.ok(a===0||a===255,`${id}: binary alpha`);
   if(!a)continue;visible++;assert.ok(palette.has([...p.pixels.subarray(at,at+3)].join(',')),`${id}: shared palette`);
   assert.ok(x>0&&y>0&&x<size-1&&y<size-1,`${id}: intact transparent edge`);
  }
  assert.ok(visible>8,id);hashes.add(createHash('sha256').update(p.pixels).digest('hex'));
 }
 assert.equal(hashes.size,33,'every subject has its own art');
});
test('Spirit and ingot helpers select native subjects, including fragments and separate inventory ingots',()=>{
 for(const id of ['fragments',...SPIRIT_RARITIES])assert.ok(spiritIcon(id).includes(`catacomb-spirit-${id}`));
 for(const id of INGOTS)assert.ok(ingotIcon(id).includes(`catacomb-ingot-ui-${id}`));
});
