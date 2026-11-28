// Real canvas transforms, DOM feedback and pointer taps at phone/desktop sizes.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
const server=await createServer({server:{host:'127.0.0.1',port:5227},logLevel:'error'});
await server.listen();
const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH||process.env.PW_EXECUTABLE;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'})});
mkdirSync('test-results/zoom-overlay',{recursive:true});
try {
 for(const config of [
  {width:390,dpr:2,mode:'tower',legacy:false,pixelPerfect:false},
  {width:1100,dpr:1,mode:'tower',legacy:true,pixelPerfect:true},
  {width:390,dpr:3,mode:'delve',legacy:false,pixelPerfect:true},
 ]) {
  const page=await browser.newPage({viewport:{width:config.width,height:1000},deviceScaleFactor:config.dpr});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__zoom_overlay',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><link rel="stylesheet" href="/src/styles/style.css"></head><body style="margin:20px"><div id="board-frame" class="board" style="width:min(440px,calc(100vw - 40px));height:min(440px,calc(100vw - 40px));border:3px solid #464c55;box-sizing:content-box"><canvas id="world"></canvas><div id="tile-highlight" class="tile-highlight" hidden></div><div id="inspect-box" class="inspect-box" hidden></div><div id="route-box" class="inspect-box" hidden></div></div></body></html>`}));
  await page.goto(`${server.resolvedUrls.local[0]}__zoom_overlay`);
  await page.evaluate(async config=>{
   const {Game}=await import('/src/state.ts'),{defaults}=await import('/src/save/save.ts');
   const {Renderer}=await import('/src/render/rendering.ts'),{BoardOverlay}=await import('/src/ui/board-overlay.ts');
   const g=new Game(defaults());g.save.upgrades.breakthrough=1;
   if(config.mode==='delve')g.switchMode('delve');
   g.newRun({outside:false,seed:123});
   Object.assign(g.save.settings,{infoDisplay:'popup',legacyHighlight:config.legacy,pixelPerfect:config.pixelPerfect,reduceMotion:true});
   const renderer=new Renderer(document.querySelector('#world'),g),overlay=new BoardOverlay(g,renderer);
   let now=1000;const draw=()=>{renderer.draw(now+=16);overlay.track();};draw();
   renderer.canvas.addEventListener('pointerup',e=>{const p=renderer.position(e.clientX,e.clientY);overlay.tap(p.x,p.y);overlay.track();window.selected=p;});
   window.fixture={g,renderer,overlay,draw};
  },config);
  // Select a tile in the lower-right of the actual board, then retain that
  // selection while zooming, panning and resizing. Text remains ordinary UI.
  await page.evaluate(()=>document.fonts.ready);
  const box=await page.locator('#world').boundingBox();
  await page.mouse.click(box.x+box.width*.68,box.y+box.height*.68);
  const check=async(label,visible=true)=>{
   const result=await page.evaluate(()=>{
    const {renderer:r}=window.fixture,p=window.selected,c=r.canvas.getBoundingClientRect(),s=c.width/r.density;
    const glow=document.querySelector('#tile-highlight'),b=glow.getBoundingClientRect(),tip=document.querySelector('#inspect-box'),t=tip.getBoundingClientRect();
    const style=getComputedStyle(tip),trace=glow.querySelector('canvas');
    return {actual:{x:b.x,y:b.y,w:b.width,h:b.height},expected:{x:c.x+(p.x-r.left)*s,y:c.y+(r.density-1-p.y+r.bottom)*s,w:s,h:s},font:style.fontSize,tipWidth:t.width,above:t.bottom<=b.y-7,visible:getComputedStyle(glow).visibility!=='hidden',traceWidth:trace?.getBoundingClientRect().width,cell:s};
   });
   assert.equal(result.visible,visible,label+' visibility '+JSON.stringify(result));
   if(visible){for(const key of ['x','y','w','h'])assert.ok(Math.abs(result.actual[key]-result.expected[key])<.1,`${label}: ${key} ${JSON.stringify(result)}`);assert.ok(result.above,label+' text stays above tile');if(!config.legacy)assert.ok(result.traceWidth>result.cell,'trace canvas expands with the tile');}
   return result;
  };
  await page.evaluate(async()=>{await document.fonts.ready;window.fixture.overlay.refresh();});
  const before=await check('unzoomed');
  await page.evaluate(()=>{const {renderer:r,draw}=window.fixture,b=document.querySelector('#tile-highlight').getBoundingClientRect();for(let i=0;i<4;i++)r.zoomStep(1,b.x+b.width/2,b.y+b.height/2);draw();});
  const zoom=await check('zoomed');assert.ok(zoom.cell>before.cell*2,'tile grows with zoom');assert.equal(zoom.font,before.font,'UI text never scales');assert.equal(zoom.tipWidth,before.tipWidth,'same description retains UI width');
  // A fresh tap near the bottom-right also maps through the zoomed canvas.
  await page.evaluate(()=>window.fixture.overlay.hide());
  const frame=await page.locator('#board-frame').boundingBox();await page.mouse.click(frame.x+frame.width*.8,frame.y+frame.width*.8);await check('zoomed bottom-right tap');
  await page.evaluate(()=>{window.fixture.renderer.panBy(-22,-17);window.fixture.draw();});await check('panned');
  await page.locator('#board-frame').screenshot({path:`test-results/zoom-overlay/${config.mode}-${config.width}-${config.legacy?'legacy':'traced'}.png`});
  await page.evaluate(()=>{window.fixture.renderer.panBy(100000,100000);window.fixture.draw();});await check('offscreen',false);
  await page.evaluate(()=>{const {renderer:r,draw}=window.fixture;for(let i=0;i<30;i++)r.zoomStep(-1,100,100);draw();});await check('zoomed back out');
  await page.setViewportSize({width:config.width+50,height:1000});await page.evaluate(()=>window.fixture.draw());await check('resized');
  assert.deepEqual(errors,[]);await page.close();console.log(`Zoomed selection, trace, fixed-size text, pan and resize pass: ${JSON.stringify(config)}`);
 }
} finally {await browser.close();await server.close();}
