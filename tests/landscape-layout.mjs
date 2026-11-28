// Real shell geometry at ultrawide, desktop, tablet and phone sizes.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {fixClock} from './fixed-clock.mjs';
import {openMenu} from './run-menu.mjs';
const server=await createServer({server:{host:'127.0.0.1',port:5228},logLevel:'error'});await server.listen();
const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH||process.env.PW_EXECUTABLE;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'})});
mkdirSync('test-results/landscape-layout',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:3840,height:1440}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await fixClock(page);
 await page.addInitScript(()=>{globalThis.__handHeld=true;globalThis.__handStartsPaused=true;const fixture=sessionStorage.getItem('__layoutFixture');if(fixture){localStorage.setItem('towerdelve.v1',fixture);sessionStorage.removeItem('__layoutFixture');}});
 await page.goto(server.resolvedUrls.local[0]);await page.locator('#boot-loading').waitFor({state:'hidden',timeout:120000});
 const seed=async(outside,hand,uiTheme='medieval')=>{
  await page.evaluate(async({outside,hand,uiTheme})=>{
   const {defaults}=await import('/src/save/save.ts'),{Game}=await import('/src/state.ts');
   const s=defaults();Object.keys(s.tutorials).forEach(k=>s.tutorials[k]=true);
   Object.assign(s.settings,{hand,uiTheme,autoLandscape:true,reduceMotion:true,transition:'instant',weatherSound:false});
   Object.assign(s.upgrades,{autoClimb:1,cardDoorKey:1,cardEnemy:1});
   const g=new Game(s);g.newRun({outside,seed:7});sessionStorage.setItem('__layoutFixture',JSON.stringify(g.save));
  },{outside,hand,uiTheme});
  await page.reload();await page.locator('#boot-loading').waitFor({state:'hidden',timeout:120000});await page.evaluate(()=>document.fonts.ready);
 };
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const fit=async(label)=>{
  await settle();
  const result=await page.evaluate(()=>{
   const rect=s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,r:b.right,b:b.bottom};};
   return {landscape:document.documentElement.classList.contains('layout-landscape'),shell:rect('.shell'),board:rect('#board-frame'),stats:rect('#stats'),nav:rect('nav'),columns:['.hud-controls','.player-stats','.height','.actions'].map(rect),overflow:document.documentElement.scrollWidth>innerWidth,viewport:{w:innerWidth,h:innerHeight}};
  });
  const inside=(a,b,name)=>assert.ok(a.x>=b.x-1&&a.r<=b.r+1&&a.y>=b.y-1&&a.b<=b.b+1,`${label}: ${name} ${JSON.stringify(result)}`);
  const viewport={x:0,y:0,r:result.viewport.w,b:result.viewport.h};
  inside(result.shell,viewport,'shell fits viewport');inside(result.board,result.shell,'board fits shell');inside(result.stats,result.shell,'HUD fits shell');inside(result.nav,result.shell,'navigation fits shell');
  assert.ok(Math.abs(result.board.w-result.board.h)<1,label+' board remains square');assert.ok(!result.overflow,label+' no horizontal page overflow');
  if(result.landscape){
   assert.ok(result.stats.w>=339,`${label}: HUD has usable width: ${JSON.stringify(result)}`);
   for(const column of result.columns)inside(column,result.stats,'HUD column fits');
   assert.ok(result.board.r<=result.stats.x+1||result.stats.r<=result.board.x+1,label+' board and HUD do not overlap');
  }
  return result;
 };
 for(const hand of ['right','left'])for(const outside of [false,true]){
  await seed(outside,hand);
  for(const [width,height] of [[3840,1440],[3440,1440],[2560,1080],[5120,1440],[1920,1080],[2048,754],[1500,900],[1499,900],[1280,800],[1024,768],[844,390],[640,360],[390,844]]){
   await page.setViewportSize({width,height});await fit(`${hand} ${outside?'forest':'run'} ${width}x${height}`);
   if(width===3840||width===844)await page.screenshot({path:`test-results/landscape-layout/${hand}-${outside?'forest':'run'}-${width}.png`});
  }
  // The same running page must recover when it returns from portrait to an ultrawide window.
  await page.setViewportSize({width:3840,height:1440});await fit(`${hand} return to ultrawide`);
  await openMenu(page);await page.locator('#auto-settings').click();await page.locator('#settings').waitFor({state:'visible'});await settle();
  const settings=await page.locator('#settings').boundingBox();assert.ok(settings.x>=0&&settings.x+settings.width<=3841,'settings remains on screen');
  await page.screenshot({path:`test-results/landscape-layout/${hand}-${outside?'forest':'run'}-settings.png`});
  await page.locator('#settings-back').click();await fit(`${hand} return from settings`);
  console.log(`Landscape layout fits at 13 viewport sizes: ${hand}, ${outside?'forest':'run'}`);
 }
 // The free Classic UI shares the same width budget as the default look.
 await seed(false,'right','classic');await fit('classic ultrawide');
 assert.deepEqual(errors,[]);
} finally {await browser.close();await server.close();}
