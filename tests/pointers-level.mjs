import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
const server=await createServer({server:{host:'127.0.0.1',port:5222},logLevel:'error'});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/usr/bin/chromium'});
mkdirSync('test-results/pointers-level',{recursive:true});
try{
 for(const [width,atlas] of [[390,true],[1100,false]]){
  const page=await browser.newPage({viewport:{width,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(atlas=>{globalThis.__handHeld=true;globalThis.__handStartsPaused=true;localStorage.setItem('towerdelve.v1',JSON.stringify({settings:{experimentalAtlas:atlas}}));},atlas);
  await page.goto(server.resolvedUrls.local[0]);await page.locator('#boot-loading').waitFor({state:'hidden',timeout:120000});
  const result=await page.evaluate(async()=>{
   const {POINTER_SVG}=await import('/src/ui/dom.ts');
   if(innerWidth>600){const {defaults}=await import('/src/save/save.ts'),{applyUiTheme}=await import('/src/ui/medieval.ts');const s=defaults();s.themes.push('neonUi');s.settings.uiTheme='neon';applyUiTheme(s);}
   const root=document.createElement('div');root.id='pointer-review';root.style.cssText='position:fixed;left:0;top:0;width:360px;height:320px;background:#242631;z-index:99999;color:#eee0b7;display:grid;grid-template-columns:repeat(3,1fr)';document.body.append(root);
   const rows=[];
   for(const font of [8,16,24])for(const direction of ['enter','goals','cards']){
    const cell=document.createElement('div');cell.style.cssText=`position:relative;width:100px;height:90px;font-size:${font}px;`;cell.innerHTML=`<span style="position:absolute;top:4px;font-size:10px">${direction} / ${font}px</span><span class="forest-pointer ${direction} still" style="top:40px;left:45px;right:auto;bottom:auto;margin:0;animation:none">${POINTER_SVG}</span>`;root.append(cell);
    const p=cell.querySelector('.tutorial-pointer-art'),box=p.getBoundingClientRect();rows.push([direction,font,box.width,box.height]);
   }
   return rows;
  });
  for(const [direction,font,w,h] of result){assert.ok(Math.abs(w-h)<.01,`${direction} at ${font}px is square`);assert.equal(w,26);}
  await page.locator('#pointer-review').screenshot({path:`test-results/pointers-level/hands-${width}.png`});await page.locator('#pointer-review').evaluate(e=>e.remove());
  const effects=await page.evaluate(async()=>{
   const {drawLevelUp}=await import('/src/render/effects/level-up.ts');
   const canvas=document.createElement('canvas');canvas.id='level-review';canvas.width=canvas.height=408;canvas.style.cssText='position:fixed;left:0;top:0;width:360px;height:360px;background:#242631;z-index:99999;image-rendering:pixelated';document.body.append(canvas);
   const c=canvas.getContext('2d'),look={reduceMotion:false,styledSprites:true};
   const f={c,n:17,width:408,dpr:1,playerX:8,playerY:8,left:0,bottom:0,look};
   const names=['createRadialGradient','createLinearGradient','arc','fillText','strokeText'];const original={};let smoothCalls=0;
   for(const name of names){original[name]=CanvasRenderingContext2D.prototype[name];CanvasRenderingContext2D.prototype[name]=function(...args){smoothCalls++;return original[name].apply(this,args);};}
   const rect=CanvasRenderingContext2D.prototype.fillRect;let fractional=0;
   CanvasRenderingContext2D.prototype.fillRect=function(...a){if(a.some(v=>!Number.isInteger(v)))fractional++;return rect.apply(this,a);};
   try{
    const hashes=[];
    for(const age of [100,450,1100,1800,2200,3400]){c.clearRect(0,0,408,408);drawLevelUp(f,age,3);hashes.push([...c.getImageData(0,0,408,408).data].reduce((n,v,i)=>n+(i%4===3&&v?1:0),0));}
    c.clearRect(0,0,408,408);look.reduceMotion=true;drawLevelUp(f,100,3);const a=c.getImageData(0,0,408,408).data.slice();c.clearRect(0,0,408,408);drawLevelUp(f,450,3);const b=c.getImageData(0,0,408,408).data;
    const still=a.every((v,i)=>v===b[i]);look.reduceMotion=false;c.clearRect(0,0,408,408);drawLevelUp(f,450,3);
    return {smoothCalls,fractional,hashes,still};
   }finally{for(const name of names)CanvasRenderingContext2D.prototype[name]=original[name];CanvasRenderingContext2D.prototype.fillRect=rect;}
  });
  assert.equal(effects.smoothCalls,0,'level-up uses no gradients, curved particles or font antialiasing');assert.equal(effects.fractional,0,'all marks land on native pixels');assert.ok(effects.hashes.slice(0,5).every(n=>n>0));assert.equal(effects.hashes[5],0,'effect expires at its original deadline');assert.ok(effects.still,'reduced-motion frame stays still');
  await page.locator('#level-review').screenshot({path:`test-results/pointers-level/hero-${width}.png`});await page.locator('#level-review').evaluate(e=>e.remove());
  const card=await page.evaluate(async()=>{
   const {CardLevelUps}=await import('/src/ui/card-level-up.ts');const game={cardLevelUps:[{card:'stairs'}]};const fx=new CardLevelUps(game);fx.frame(1000);
   const layer=document.querySelector('.card-level-up'),glow=getComputedStyle(layer.querySelector('.card-level-up-glow')),icon=getComputedStyle(layer.querySelector('.card-level-up-icon'));
   const result={background:glow.backgroundImage,shadow:glow.boxShadow,filter:icon.filter,radius:glow.borderRadius};fx.frame(4000);return {...result,clean:!document.querySelector('.card-level-up')};
  });
  assert.equal(card.background,'none');assert.equal(card.filter,'none');assert.equal(card.radius,'0px');assert.ok(card.clean);
  assert.deepEqual(errors,[]);await page.close();console.log(`Square hands and pixel-art hero/card level-ups pass at ${width}px (atlas=${atlas}).`);
 }
}finally{await browser.close();await server.close();}
