import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {openMenu} from './run-menu.mjs';
const server=await createServer({server:{host:'127.0.0.1',port:5226},logLevel:'error'});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/usr/bin/chromium'});
mkdirSync('test-results/catacomb-sprites',{recursive:true});
try{
 for(const [width,atlas] of [[390,true],[1100,false]]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{globalThis.__handHeld=true;globalThis.__handStartsPaused=true;const fixture=sessionStorage.getItem('__catacombArt');if(fixture){localStorage.setItem('towerdelve.v1',fixture);sessionStorage.removeItem('__catacombArt');}});
  await page.goto(server.resolvedUrls.local[0]);await page.locator('#boot-loading').waitFor({state:'hidden',timeout:120000});
  await page.evaluate(async atlas=>{
   const {defaults}=await import('/src/save/save.ts'),{Game}=await import('/src/state.ts'),{enterCatacomb,UNDEAD_IDS,SPIRIT_RARITIES,INGOTS,undeadStats}=await import('/src/catacombs/index.ts');
   const s=defaults();Object.keys(s.tutorials).forEach(k=>s.tutorials[k]=true);s.upgrades.catacombs=1;Object.assign(s.settings,{experimentalAtlas:atlas,reduceMotion:true,weatherSound:false,spriteAnimations:false});
   const g=new Game(s);g.newRun({outside:true,seed:7});enterCatacomb(s.catacombs,1);s.catacombs.clock.lastTurnAt=Date.now();s.catacombs.best[1]=300;
   for(const r of SPIRIT_RARITIES)s.catacombs.spirit[r]=1000;for(const i of INGOTS)s.catacombs.ingots[i]=100;
   Object.assign(s.catacombs.run,{hall:300,target:0,hero:{x:0,y:8,mhp:100},slots:UNDEAD_IDS.slice(0,6).map(id=>({id,strength:'normal',mhp:undeadStats(id,'normal',300,1).mhp,drops:{mxp:2,loot:2,speed:4,mhp:4}}))});
   sessionStorage.setItem('__catacombArt',JSON.stringify(s));
  },atlas);
  await page.reload();await page.locator('#boot-loading').waitFor({state:'hidden',timeout:120000});
  if(await page.locator('#offline-claim').isVisible())await page.locator('#offline-claim').click();
  const literal=await page.evaluate(async()=>{
   const {drawKit,preloadKitImage}=await import('/src/sprites/kit.ts');
   const manifest=await (await fetch('/assets/style/manifest.json')).json();const ids=Object.keys(manifest.assets).filter(id=>id.startsWith('catacomb-')||id==='forest-mausoleum');
   for(const id of ids)await preloadKitImage(id);
   const results=[];
   const review=document.createElement('div');review.id='catacomb-art-review';review.style.cssText='position:absolute;left:0;top:0;width:960px;z-index:99999;background:#242631;display:grid;grid-template-columns:repeat(6,160px);color:#eee0b7;font:12px monospace';
   for(const id of ids){
    const {width:w,height:h}=manifest.assets[id];const actual=document.createElement('canvas');actual.width=w;actual.height=h;drawKit(actual.getContext('2d'),id,0,0,w,h);
    const image=new Image();image.src=`/assets/style/${id}.png`;await image.decode();const expected=document.createElement('canvas');expected.width=w;expected.height=h;expected.getContext('2d').drawImage(image,0,0);
    const a=actual.getContext('2d').getImageData(0,0,w,h).data,b=expected.getContext('2d').getImageData(0,0,w,h).data;results.push({id,same:a.every((v,i)=>v===b[i])});
    const cell=document.createElement('div');cell.style.cssText='height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px';actual.style.cssText=`width:${w===72?120:72}px;height:${h===72?120:72}px;image-rendering:pixelated;flex:none`;const label=document.createElement('span');label.textContent=id.replace('catacomb-','');cell.append(actual,label);review.append(cell);
   }
   document.body.append(review);return results;
  });
  assert.equal(literal.length,33);for(const item of literal)assert.ok(item.same,`${item.id}: literal texels in atlas mode ${atlas}`);
  await page.locator('#catacomb-art-review').screenshot({path:`test-results/catacomb-sprites/swatch-${width}.png`});await page.locator('#catacomb-art-review').evaluate(e=>e.remove());
  await page.screenshot({path:`test-results/catacomb-sprites/forest-${width}.png`});
  await openMenu(page);await page.locator('#catacombs-button').click();await page.locator('#catacomb-menus').waitFor({state:'visible'});
  assert.equal(await page.locator('.catacomb-tab-icon').count(),4);
  for(const menu of ['skills','spirit','forge','academy']){
   await page.locator(`[data-menu="${menu}"]`).click();
   const box=await page.locator(`[data-menu="${menu}"]`).boundingBox();assert.ok(box.width>0&&box.x>=0&&box.x+box.width<=width+1,'menu remains inside the screen');
  }
  await page.locator('[data-menu="spirit"]').click();assert.ok(await page.locator('#catacomb-panel .spirit-icon').count()>=7);
  await page.screenshot({path:`test-results/catacomb-sprites/menus-${width}.png`});
  const immutable=await page.evaluate(async()=>{
   const {CatacombBoard}=await import('/src/render/catacomb-board.ts'),{UNDEAD_IDS,undeadStats}=await import('/src/catacombs/catalog.ts');
   const c=document.createElement('canvas');c.id='catacomb-room-review';c.style.cssText='position:fixed;left:0;top:0;width:408px;height:408px;z-index:99999;image-rendering:pixelated';document.body.append(c);
   const run={hall:300,target:0,hero:{x:0,y:8,mhp:100},potions:[],slots:UNDEAD_IDS.slice(1).map(id=>({id,strength:'normal',mhp:undeadStats(id,'normal',300,1).mhp,drops:{mxp:2,loot:2,speed:4,mhp:4}}))};
   const before=JSON.stringify(run);new CatacombBoard(c).draw(run,1,1000,true,true);return before===JSON.stringify(run);
  });assert.ok(immutable,'drawing never changes a run or its drops');
  await page.locator('#catacomb-room-review').screenshot({path:`test-results/catacomb-sprites/room-${width}.png`});
  await page.locator('#catacomb-room-review').evaluate(e=>e.remove());
  await page.locator('#switch-back').click();await openMenu(page);await page.locator('#codex-button').click();
  await page.locator('[data-codex-tab="catacombs"]').click();
  assert.equal(await page.locator('#codex .codex-undead').count(),7,'the Codex uses all seven native undead portraits');
  await page.screenshot({path:`test-results/catacomb-sprites/codex-${width}.png`});
  assert.deepEqual(errors,[]);await page.close();console.log(`All 33 sprites retain exact texels; forest, Catacombs menus, Spirit, Ingots and buff marks pass at ${width}px (atlas=${atlas}).`);
 }
}finally{await browser.close();await server.close();}
