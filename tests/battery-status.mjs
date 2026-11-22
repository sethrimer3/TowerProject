// Real stalled-hand HUD regression: layout must not leak status/inspection text.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { fixClock } from './fixed-clock.mjs';
import { openMenu } from './run-menu.mjs';
const server=await createServer({server:{host:'127.0.0.1',port:5217},logLevel:'error'});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/usr/bin/chromium'});
mkdirSync('test-results/battery-status',{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await fixClock(page);
  await page.addInitScript(()=>{
    globalThis.__handStartsPaused=true;
    const fixture=sessionStorage.getItem('__batteryStatusFixture');
    if(fixture){localStorage.setItem('towerdelve.v1',fixture);sessionStorage.removeItem('__batteryStatusFixture');}
  });
  const ready=async()=>{await page.locator('#boot-loading').waitFor({state:'hidden',timeout:120000});await page.locator('#hp').waitFor({state:'attached'});};
  await page.goto(server.resolvedUrls.local[0]);await ready();
  for(const [width,height,hand] of [[390,844,'right'],[900,480,'right'],[900,480,'left'],[1280,800,'left']]) {
    await page.setViewportSize({width,height});
    await page.evaluate(async hand=>{
      const {defaults}=await import('/src/save/save.ts'),{Game}=await import('/src/state.ts');
      const s=defaults();Object.keys(s.tutorials).forEach(k=>s.tutorials[k]=true);
      s.upgrades.cardEnemy=1; // Keep the first-enemy lesson out of this status-line regression.
      Object.assign(s.settings,{batterySaver:true,batteryWhite:100,infoDisplay:'status',reduceMotion:true,transition:'instant',weatherSound:false,hand});
      const g=new Game(s);g.newRun({seed:7});
      for(let room=0;room<20&&!g.handStuck;room++) { g.autoTurn(); if(!g.handStuck)g.advanceTowerRoom(); }
      if(!g.handStuck)throw Error('No stalled stairs-only hand found');
      sessionStorage.setItem('__batteryStatusFixture',JSON.stringify(g.save));
    },hand);
    await page.reload();await ready();
    const alert=page.locator('#battery-hud .battery-alert');
    if(!await alert.count())await page.locator('#battery-hud [data-press="auto"]').click();
    await alert.waitFor({timeout:15000});
    assert.match(await page.locator('#message').textContent(),/No card can move/);
    assert.equal(await page.locator('#status-row').isVisible(),false,'stalled message is hidden inside the board frame');
    await page.locator('#inspect').evaluate(e=>{e.textContent='Floor inspection details';e.hidden=false;});
    assert.equal(await page.locator('#inspect').isVisible(),false,'populated inspection text is hidden too');
    assert.equal(await alert.evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(255, 59, 59)');
    await page.screenshot({path:`test-results/battery-status/${width}-${hand}.png`,fullPage:true});
    await alert.click();await page.locator('#confirm').waitFor();
    assert.match(await page.locator('#modal').innerText(),/No card can act/i,'the red caution sign still opens the explanation and End Run');
    await page.locator('#cancel').click();
    await page.locator('#battery-hud [data-exit]').click();
    assert.equal(await page.locator('#status-row').isVisible(),true,'normal mode keeps its status messages');
    if(width>=640)assert.equal(await page.locator('#status-row').evaluate(e=>e.parentElement.id),'side-info');
    await openMenu(page);await page.locator('#auto-settings').click();
    await page.locator('#battery-saver').check();await page.locator('#settings-back').click();
    assert.equal(await page.locator('#status-row').isVisible(),false,'live re-entry hides text again after layout moves it');
    assert.equal(await page.locator('#inspect').isVisible(),false);
    assert.ok(await alert.isVisible());
    console.log(`Battery status/inspection hidden, red caution actionable, normal text restored and live layout switching passed: ${width}×${height}, ${hand}.`);
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();await server.close();}
