import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true,channel:'msedge'});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(() => { const fixture = sessionStorage.getItem('logFixture'); if (fixture) { localStorage.setItem('towerincramental.v1', fixture); sessionStorage.removeItem('logFixture'); } });
await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173/');
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
await page.locator('[data-tab="delve"]').click();
await page.getByRole('button',{name:'Adventure log',exact:true}).click();
assert.match(await page.locator('#modal').innerText(),/3 Inspiration/);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
assert.deepEqual(errors,[]); await browser.close(); console.log('Log and chest browser checks passed on Tower and Delve at 390px.');
