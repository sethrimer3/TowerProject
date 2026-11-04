import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {createServer} from 'vite';
import {mkdirSync} from 'node:fs';
const server=await createServer({server:{host:'127.0.0.1',port:5203},logLevel:'error'});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/usr/bin/chromium'});
mkdirSync('test-results/trial-voyage',{recursive:true});
try {
 for(const width of [390,1024]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{globalThis.__handHeld=true;const fixture=sessionStorage.getItem('voyageFixture');if(fixture){localStorage.setItem('towerdelve.v1',fixture);sessionStorage.removeItem('voyageFixture');}});
  await page.goto(server.resolvedUrls.local[0]);await page.locator('#boot-loading').waitFor({state:'hidden',timeout:120000});
  async function load(level) {
   await page.evaluate(async level=>{
    const {Game}=await import('/src/state.ts'),{defaults}=await import('/src/save/save.ts'),{xpForLevel}=await import('/src/progression/xp.ts');
    const s=defaults();s.xp=xpForLevel(level);s.settings.weatherSound=false;s.upgrades.onTheJob=1;
    for(const k of Object.keys(s.tutorials))s.tutorials[k]=true;s.tutorials.enemy=false;
    const g=new Game(s);g.newRun({outside:true,seed:7});g.travelForest(-1);g.forestArrivalFrame(0);g.forestArrivalFrame(1000);
    Object.assign(g.run.player,{x:14,y:7});sessionStorage.setItem('voyageFixture',JSON.stringify(g.save));
   },level);
   await page.reload();await page.locator('#boot-loading').waitFor({state:'hidden',timeout:120000});
   await page.evaluate(async()=>{const {Game}=await import('/src/state.ts');const orig=Game.prototype.walkTo;Game.prototype.walkTo=function(...args){window.voyageGame=this;return orig.apply(this,args);};});
  }
  async function dock() {const b=await page.locator('#world').boundingBox();await page.locator('#world').click({position:{x:6.5*b.width/20,y:12.5*b.width/20}});}
  await load(9);await dock();await expect(page.locator('#fisherman-close')).toBeVisible();await expect(page.locator('#modal p')).toContainText('level 10');await expect(page.locator('#trial-voyage')).toHaveCount(0);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>voyageGame.run.player.x===14);
  await load(10);await dock();await expect(page.locator('#trial-voyage')).toBeVisible();
  await expect(page.locator('#trial-heading')).toHaveCount(0);
  await page.waitForFunction(()=>document.querySelector('#trial-voyage')?.dataset.phase==='ocean');
  await expect(page.locator('#trial-heading')).toHaveCount(0);
  const first=await page.locator('#trial-voyage canvas').screenshot({path:`test-results/trial-voyage/boat-${width}.png`});
  await expect(page.locator('#trial-heading')).toHaveText('Proving Grounds Trials');
  const second=await page.locator('#trial-voyage canvas').screenshot();assert.notDeepEqual(first,second,'ocean and sail animate');
  await page.screenshot({path:`test-results/trial-voyage/menu-${width}.png`});
  await page.locator('#trial-menu-leave').click();await expect(page.locator('#trial-voyage')).toHaveCount(0);
  await page.waitForFunction(()=>voyageGame.run.player.x===14);assert.deepEqual(await page.evaluate(()=>voyageGame.facing),{dx:1,dy:0});
  await expect(page.locator('.voyage-return')).toHaveCount(0);
  await dock();await expect(page.locator('#trial-heading')).toHaveText('Proving Grounds Trials');
  await page.locator('#trial-magic-tower').click();await page.locator('#trial-mode-manual').click();
  await expect(page.locator('#world')).toHaveAttribute('data-trial-mode','manual');await expect(page.locator('#trial-voyage')).toHaveCount(0);
  assert.equal(await page.evaluate(()=>voyageGame.save.trialAccess.spent),1);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!voyageGame.save.provingGrounds && voyageGame.run.player.x===14);
  await dock();await expect(page.locator('#trial-heading')).toHaveText('Proving Grounds Trials');
  await page.keyboard.press('Escape');await expect(page.locator('#trial-voyage')).toHaveCount(0);
  await page.waitForFunction(()=>voyageGame.run.player.x===14);
  assert.equal(await page.evaluate(()=>voyageGame.save.trialAccess.spent),1,'browsing and closing the menu costs no trial key');
  assert.deepEqual(errors,[]);await page.close();console.log(`Trial voyage passed at ${width}px`);
 }
} finally {await browser.close();await server.close();}
