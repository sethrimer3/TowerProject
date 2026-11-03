import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {openMenu} from './run-menu.mjs';
const manifest=JSON.parse(readFileSync('public/assets/atlases/ui.json'));
const packed=new Set(Object.keys(manifest.regions));
const server=await createServer({server:{host:'127.0.0.1',port:5193},logLevel:'error'});await server.listen();
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true});
mkdirSync('test-results/ui-atlas',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),requests=[],errors=[];
 page.on('request',r=>requests.push(new URL(r.url()).pathname.replace(/^\/(?:public\/)?/,'')));
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{globalThis.__handHeld=true;globalThis.__handStartsPaused=true;const raw=sessionStorage.getItem('__atlasFixture');if(raw){localStorage.setItem('towerdelve.v1',raw);sessionStorage.removeItem('__atlasFixture')}});
 await page.goto(server.resolvedUrls.local[0]);await page.locator('#hp').waitFor({timeout:30000});
 await page.evaluate(async()=>{
  const {defaults}=await import('/src/save/save.ts'),{Game}=await import('/src/state.ts');
  const s=defaults();Object.keys(s.tutorials).forEach(k=>s.tutorials[k]=true);
  Object.assign(s.upgrades,{combatStance:1,buildout:1});Object.assign(s.settings,{reduceMotion:true,weatherSound:false,transition:'instant'});
  const g=new Game(s);g.newRun({outside:true,seed:7});sessionStorage.setItem('__atlasFixture',JSON.stringify(g.save));
 });
 await page.reload();await page.locator('#hp').waitFor();
 const originalIcon=await page.locator('.purse .gem-icon').first().screenshot();
 assert.ok(requests.some(p=>packed.has(p)),'individual UI images load when off');
 assert.ok(!requests.includes(manifest.image),'atlas is not loaded when off');
 await openMenu(page);await page.locator('#auto-settings').click();
 assert.equal(await page.locator('#experimental-atlas').isChecked(),false);
 requests.length=0;
 await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator('#experimental-atlas').click()]);
 await page.locator('#hp').waitFor({timeout:30000});
 assert.equal(requests.filter(p=>p===manifest.image).length,1,'one atlas image request when enabled');
 assert.deepEqual(requests.filter(p=>packed.has(p)),[],'no original packed UI requests at startup');
 assert.ok(await page.locator('html').evaluate(e=>e.classList.contains('experimental-atlas')));
 assert.ok(await page.locator('.atlas-region').count()>10);
 assert.deepEqual(await page.locator('.purse .gem-icon').first().screenshot(),originalIcon,'atlas icon matches original rendered pixels');
 const themes=await page.evaluate(async()=> (await import('/src/save/settings.ts')).SETTINGS.uiTheme.choices.map(([id])=>id));
 for(const uiTheme of themes){
  await page.evaluate(async uiTheme=>{
   const {defaults}=await import('/src/save/save.ts'),{applyUiTheme}=await import('/src/ui/medieval.ts'),{THEME_IDS}=await import('/src/theme-collection.ts');
   const s=defaults();s.settings.uiTheme=uiTheme;s.settings.experimentalAtlas=true;s.themes=[...THEME_IDS];applyUiTheme(s);
  },uiTheme);
  await page.evaluate(()=>new Promise(requestAnimationFrame));
 }
 await page.evaluate(async()=>{const {defaults}=await import('/src/save/save.ts'),{applyUiTheme}=await import('/src/ui/medieval.ts');applyUiTheme(defaults())});
 assert.deepEqual(requests.filter(p=>packed.has(p)),[],'all UI themes retain atlas-only image sources');
 await page.locator('[data-tab="deck"]').click();
 await page.screenshot({path:'test-results/ui-atlas/deck-390.png'});
 await page.setViewportSize({width:1280,height:900});
 await page.locator('[data-tab="upgrades"]').click();
 await page.screenshot({path:'test-results/ui-atlas/tree-1280.png'});
 await page.locator('[data-tab="board"]').click();
 await openMenu(page);await page.locator('#auto-settings').click();
 assert.equal(await page.locator('#experimental-atlas').isChecked(),true);
 assert.deepEqual(requests.filter(p=>packed.has(p)),[],'navigation also stays atlas-only');
 requests.length=0;
 await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator('#experimental-atlas').click()]);
 await page.locator('#hp').waitFor({timeout:30000});
 assert.ok(requests.some(p=>packed.has(p)),'disabling restores individual UI path');
 assert.ok(!requests.includes(manifest.image));assert.deepEqual(errors,[]);
 const recovery=await browser.newPage(),recoveryRequests=[];
 const raw=await page.evaluate(()=>localStorage.getItem('towerdelve.v1'));
 await recovery.addInitScript(raw=>{
  if(!localStorage.getItem('towerdelve.v1')){const s=JSON.parse(raw);s.settings.experimentalAtlas=true;localStorage.setItem('towerdelve.v1',JSON.stringify(s));sessionStorage.setItem('towerdelve.bootRetries','2');}
 },raw);
 recovery.on('request',r=>recoveryRequests.push(new URL(r.url()).pathname.replace(/^\/(?:public\/)?/,'')));
 await recovery.route('**/assets/atlases/ui.png*',r=>r.abort());
 await recovery.goto(server.resolvedUrls.local[0],{waitUntil:'domcontentloaded'});
 await recovery.locator('#boot-disable-atlas').waitFor({state:'visible'});
 assert.deepEqual(recoveryRequests.filter(p=>packed.has(p)),[],'failed atlas does not silently load originals');
 recoveryRequests.length=0;
 await Promise.all([recovery.waitForNavigation({waitUntil:'domcontentloaded'}),recovery.locator('#boot-disable-atlas').click()]);
 await recovery.locator('#hp').waitFor({timeout:30000});
 assert.ok(recoveryRequests.some(p=>packed.has(p)),'explicit recovery restores original sprites');
 assert.equal(await recovery.evaluate(()=>JSON.parse(localStorage.getItem('towerdelve.v1')).settings.experimentalAtlas),false);
 await recovery.close();
 console.log(`Atlas toggle passed: ${packed.size} original UI images replaced by one atlas; navigation and restoring originals passed.`);
}finally{await browser.close();await server.close()}
