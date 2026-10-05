import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true,channel:'msedge'});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(() => { const fixture = sessionStorage.getItem('logFixture'); if (fixture) { localStorage.setItem('towerdelve.v1', fixture); sessionStorage.removeItem('logFixture'); } });
await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173/');
assert.equal(await page.locator('.tower-heading').isVisible(),false);
// The left rail holds the purse: Gems, Gold, then Silver; the height column holds Log.
assert.deepEqual(await page.locator('.hud-controls .purse > span').evaluateAll((s) => s.map((e) => e.className)), ['gem-stat', 'gold-stat', 'silver-stat']);
assert.equal(await page.locator('.height .height-actions #log').count(), 1);
assert.equal(await page.locator('[data-hud-consumable]').count(),0);
await page.getByRole('button',{name:'Adventure log',exact:true}).click();
await page.getByRole('heading',{name:'Adventure log'}).waitFor();
assert.ok(await page.locator('#modal').innerText().then(t=>t.includes('Diamond')));
await page.screenshot({path:process.env.TEMP + '/tower-log-mobile.png'});
await page.locator('#log-close').click();
await page.evaluate(async()=>{
  const {Game}=await import('/src/state.ts'); const {defaults}=await import('/src/save.ts');
  const g=new Game(defaults()); g.save.upgrades.delve=1;
  const w=g.world;
  for(const [k,t] of w.cells) if(t.kind==='enemy'||t.kind==='door') { const [x,y]=k.split(',').map(Number); w.clear(x,y); }
  g.checkClear(); sessionStorage.setItem('logFixture',JSON.stringify(g.save));
});
await page.reload(); await page.screenshot({path:process.env.TEMP + '/tower-clear-chests-mobile.png'});
await page.getByRole('button',{name:'Adventure log',exact:true}).click();
assert.match(await page.locator('.floor-log').innerText(),/Silver.*Gold.*Platinum/);
await page.locator('#log-close').click();
// Inside a run the tabs are hidden: end the Tower run to reach the Delve.
await page.locator('#end-run').click(); await page.locator('#confirm').click();
await page.locator('[data-tab="delve"]').click();
assert.equal(await page.getByRole('button',{name:'Adventure log',exact:true}).count(),0);
assert.equal(await page.getByRole('button',{name:'Choose starting floor',exact:true}).count(),0);
assert.equal(await page.getByRole('button',{name:'Future Delve action 1',exact:true}).innerText(),'BUTTON 1');
// Inside a run End Run takes the second button's place; the ad's Gems stand under the purse.
assert.equal(await page.getByRole('button',{name:'Future Delve action 2',exact:true}).count(),0);
assert.equal(await page.getByRole('button',{name:'Claim 7 Gems',exact:true}).innerText(),'7\nCLAIM');
await page.getByRole('button',{name:'End current run',exact:true}).click();
assert.match(await page.locator('#modal').innerText(),/End this delve\?/);
await page.locator('#cancel').click();
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
assert.deepEqual(errors,[]); await browser.close(); console.log('Log, chest, and mode-specific HUD checks passed at 390px.');
