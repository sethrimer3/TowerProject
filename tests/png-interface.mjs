import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
const server=await createServer({server:{host:'127.0.0.1',port:5198},logLevel:'error'});await server.listen();
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true});
mkdirSync('test-results/png-interface',{recursive:true});
try {
 const page=await browser.newPage();const errors=[],missing=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\.svg(?:[?#]|$)|data:image\/svg/i.test(r.url()))missing.push(r.url())});page.on('response',r=>{if(r.status()>=400&&r.url().includes('assets/'))missing.push(r.url())});
 await page.addInitScript(()=>{globalThis.__handHeld=true;globalThis.__handStartsPaused=true;const f=sessionStorage.getItem('__pngFixture');if(f)localStorage.setItem('towerdelve.v1',f)});
 await page.goto(server.resolvedUrls.local[0]);await page.locator('#hp').waitFor();
 const availableThemes=await page.evaluate(async()=> (await import('/src/save/settings.ts')).SETTINGS.uiTheme.choices.map(([id])=>id));
 const themes=process.env.PNG_THEMES?availableThemes.filter(t=>process.env.PNG_THEMES.split(',').includes(t)):availableThemes;
 for(const width of [390,1280]) {
  await page.setViewportSize({width,height:900});
  for(const uiTheme of themes) {
   await page.evaluate(async uiTheme=>{
    const {defaults}=await import('/src/save/save.ts'),{Game}=await import('/src/state.ts'),{ARCANA}=await import('/src/arcana/arcana.ts');
    const s=defaults();Object.keys(s.tutorials).forEach(k=>s.tutorials[k]=true);
    Object.assign(s.upgrades,{archives:1,combatStance:1,buildout:1,equipment:1});
    Object.assign(s.settings,{devMode:true,reduceMotion:true,transition:'instant',weatherSound:false,uiTheme});
    if(!['medieval','classic'].includes(uiTheme))s.themes.push(`${uiTheme}Ui`);
    s.arcanite=10000;s.profile.earned.arcanite=10000;
    for(const id of Object.keys(ARCANA))s.arcana.owned[id]=[0,0,0];
    const g=new Game(s);g.newRun({outside:true,seed:7});sessionStorage.setItem('__pngFixture',JSON.stringify(g.save));
   },uiTheme);
   await page.reload();await page.locator('#hp').waitFor();
   await page.locator('[data-tab="gear"]').click();
   const tab=page.locator('[data-gear-tab="arcana"], [data-gear="arcana"]');
   if(await tab.count())await tab.first().click();
   else {const candidate=page.getByRole('button',{name:'Arcana',exact:true});if(await candidate.count())await candidate.click();}
   await page.locator('.arcana-row').first().waitFor();
   assert.equal(await page.locator('.arcana-row .arcanum-icon img').count(),9);
   await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
   const icons=await page.locator('.arcana-row .arcanum-icon').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),i=e.querySelector('img');return {w:r.width,h:r.height,ready:i.naturalWidth===24,display:getComputedStyle(i).display}}));
   assert.ok(icons.every(i=>i.w>=24&&i.h>=24&&i.ready&&i.display!=='none'),`${uiTheme}: readable PNG icons`);
   assert.equal(await page.locator('svg').count(),0,`${uiTheme}: no SVG DOM`);
   if(uiTheme==='medieval') {
    const upgrade=page.locator('[data-arcana-up="ricochetShot:0"]');
    const before=await upgrade.locator('b').first().textContent();
    await upgrade.click();
    await page.waitForFunction(before=>document.querySelector('[data-arcana-up="ricochetShot:0"] b')?.textContent!==before,before);
    await page.locator('[data-arcana-row="ricochetShot"] .arcana-row-icon').click();
    await page.locator('#modal[open] .arcana-info').waitFor();
    assert.equal(await page.locator('#modal .arcanum-icon img').count(),1);
    assert.equal(await page.locator('#modal svg').count(),0);
    await page.keyboard.press('Escape');
    await page.locator('#modal').waitFor({state:'hidden'});
   }
   if(['medieval','pixel','doodle','murk'].includes(uiTheme))await page.screenshot({path:`test-results/png-interface/${uiTheme}-${width}.png`});
   await page.locator('[data-tab="upgrades"]').click();
   const canvas=page.locator('.tree-connections');await canvas.waitFor();
   await page.waitForFunction(()=>document.querySelector('.tree-connections')?.dataset.painted==='true');
   assert.ok(await canvas.evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((n,i)=>i%4===3&&n>0)),`${uiTheme}: raster tree connections`);
   assert.equal(await page.locator('svg').count(),0);
   if(uiTheme==='medieval')await page.screenshot({path:`test-results/png-interface/tree-${width}.png`});
  }
  console.log(`Checked ${themes.length} themes at ${width}px.`);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);console.log('PNG Arcana, tree canvas, all themes and both layouts passed.');
}finally{await browser.close();await server.close();}
