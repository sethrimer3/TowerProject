// node tests/relic-sprites.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
const server=await createServer({server:{host:'127.0.0.1',port:5196}});
await server.listen();
const base=server.resolvedUrls.local[0];
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/usr/bin/chromium'});
mkdirSync('test-results/relic-sprites',{recursive:true});
try {
  for(const experimentalAtlas of [true,false]) {
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}assets/relics/preview.html`);
    const samples=await page.evaluate(async experimentalAtlas=>{
      const {defaults}=await import('/src/save/save.ts');
      const {Game}=await import('/src/state.ts');
      const {RELICS}=await import('/src/economy/relics.ts');
      const {RELIC_ART}=await import('/src/sprites/relics.ts');
      const save=defaults();save.settings.experimentalAtlas=experimentalAtlas;save.settings.reduceMotion=true;
      save.relics=Object.keys(RELICS);
      const game=new Game(save);game.newRun({outside:true,seed:641});
      localStorage.setItem('towerdelve.v1',JSON.stringify(save));
      return ['newYear.2027.free1','blizzard.2027.premium2','tower.9.legendary'].map(id=>({...RELIC_ART[id],catalogId:id}));
    },experimentalAtlas);
    await page.goto(base);
    await page.locator('#app').waitFor({state:'visible',timeout:60000});
    await page.locator('#run-menu-toggle').click();
    await page.locator('#relics-button').click();
    assert.equal(await page.locator('.relic-cell').count(),126);
    const artOf=locator=>locator.locator('.relic-icon').evaluate(el=>el.querySelector('img')?.getAttribute('src')??el.querySelector('.atlas-region')?.getAttribute('style'));
    const shown=new Set();
    for(const sample of samples) {
      const cell=page.locator(`[data-relic="${sample.catalogId}"]`);
      assert.match(await cell.textContent(),new RegExp(sample.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
      const listArt=await artOf(cell);assert.ok(listArt);shown.add(listArt);
      if(!experimentalAtlas)assert.ok(listArt.includes(sample.id+'.png'));
      await cell.click();
      const popup=page.locator('.relic-pop');await popup.waitFor({state:'visible'});
      assert.equal(await popup.locator('.card-reveal-text b').textContent(),sample.name);
      assert.equal(await artOf(popup),listArt,'list and enlarged view must show the same artifact');
      if(sample.rarity==='legendary')assert.equal(await popup.locator('.relic-legendary').count(),0);
      await page.screenshot({path:`test-results/relic-sprites/${sample.rarity}-${experimentalAtlas?'atlas':'individual'}.png`});
      await popup.click();
    }
    assert.equal(shown.size,3,'sample relics must not share a generic pendant');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdelve.v1')).relics.length),126);
    assert.deepEqual(errors,[]);
    await context.close();
  }
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  await page.goto(`${base}assets/relics/preview.html`);
  assert.equal(await page.locator('article').count(),126);
  await page.screenshot({path:'test-results/relic-sprites/catalog.png',fullPage:true});
  console.log('Passed: all 126 owned relics, distinct rare/epic/legendary artwork, matching collection/popups, both loading modes and unchanged ownership.');
} finally {await browser.close();await server.close();}
