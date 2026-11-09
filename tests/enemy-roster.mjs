// Standalone browser check: node tests/enemy-roster.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
const server = await createServer({server:{host:'127.0.0.1',port:5194}});
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium'});
mkdirSync('test-results/enemy-roster',{recursive:true});
try {
  for(const experimentalAtlas of [true,false]) {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const page = await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({experimentalAtlas})=>{
      if(!localStorage.getItem('towerdelve.v1'))localStorage.setItem('towerdelve.v1',JSON.stringify({version:3,settings:{experimentalAtlas,reduceMotion:true}}));
    },{experimentalAtlas});
    await page.goto(base);
    await page.locator('#app').waitFor({state:'visible',timeout:60000});
    await page.locator('#run-menu-toggle').click();
    await page.locator('#auto-settings').click();
    await page.locator('#legacy-enemies').waitFor({state:'visible'});
    assert.equal(await page.locator('#legacy-enemies').isChecked(),false);
    await page.locator('#legacy-enemies').check();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdelve.v1')).settings.legacyEnemies),true);
    await page.reload();
    await page.locator('#app').waitFor({state:'visible',timeout:60000});
    await page.locator('#run-menu-toggle').click();
    await page.locator('#auto-settings').click();
    assert.equal(await page.locator('#legacy-enemies').isChecked(),true);
    await page.locator('#legacy-enemies').uncheck();
    const drawn = await page.evaluate(async()=>{
      const { getTowerGateEnemy,enemyTitle }=await import('/src/enemies/scaling.ts');
      const { kitEnemy,preloadKitImage }=await import('/src/sprites/kit.ts');
      const { ENEMY_ROSTER }=await import('/src/enemies/roster.ts');
      const { paintEnemy }=await import('/src/render/tile-painters.ts');
      const { Game }=await import('/src/state.ts');
      const { defaults }=await import('/src/save/save.ts');
      const { Renderer }=await import('/src/render/rendering.ts');
      await Promise.all(ENEMY_ROSTER.map(e=>preloadKitImage(e.id)));
      const e={...getTowerGateEnemy(500,'elite','defenseHeavy'),armored:true};
      await preloadKitImage(kitEnemy(e,true));
      const c=document.createElement('canvas');c.width=c.height=40;const ctx=c.getContext('2d');
      const capture=legacy=>{ctx.clearRect(0,0,40,40);ctx.save();ctx.translate(8,8);paintEnemy(ctx,{kind:'enemy',enemy:e},legacy);ctx.restore();return c.toDataURL();};
      const modern=capture(false),legacy=capture(true),modernAgain=capture(false);
      // Compare the actual cached-enemy blit with an explicit nearest-neighbor
      // reference at fractional board scales, including inherited smoothing.
      const sampling=[];
      for(const scale of [1,1.25,1.5])for(const legacy of [false,true])for(const inherited of [false,true]) {
        const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
        const target=canvas.getContext('2d');target.setTransform(scale,0,0,scale,8.25,8.5);
        target.imageSmoothingEnabled=inherited;
        const blit=target.drawImage.bind(target);let smooth,expected;
        target.drawImage=(source,...args)=>{
          smooth=target.imageSmoothingEnabled;
          const reference=document.createElement('canvas');reference.width=reference.height=96;
          const rc=reference.getContext('2d');rc.putImageData(target.getImageData(0,0,96,96),0,0);
          rc.setTransform(target.getTransform());rc.imageSmoothingEnabled=false;rc.drawImage(source,...args);
          expected=reference.toDataURL();blit(source,...args);
        };
        paintEnemy(target,{kind:'enemy',enemy:e},legacy);
        sampling.push({scale,legacy,inherited,smooth,matches:canvas.toDataURL()===expected,restored:target.imageSmoothingEnabled===inherited});
      }
      const save=defaults();save.settings.reduceMotion=true;save.settings.decorOff=true;
      const game=new Game(save);game.newRun({outside:false,seed:321});
      game.run.changes[`${game.run.player.x},${game.run.player.y+1}`]={kind:'enemy',enemy:e};
      const board=document.createElement('canvas');board.style.width='390px';board.style.height='390px';document.body.append(board);
      const renderer=new Renderer(board,game),run=JSON.stringify(game.run);
      const frame=legacy=>{save.settings.legacyEnemies=legacy;for(let i=0;i<5;i++)renderer.draw(1000);return board.toDataURL();};
      const boardModern=frame(false),boardLegacy=frame(true),boardAgain=frame(false);
      const preserved=run===JSON.stringify(game.run);board.remove();
      return {modern,legacy,modernAgain,boardModern,boardLegacy,boardAgain,preserved,sampling,name:enemyTitle(e),oldName:enemyTitle(e,true)};
    });
    assert.notEqual(drawn.modern,drawn.legacy,'rosters must render different silhouettes');
    assert.equal(drawn.modern,drawn.modernAgain,'switching restores exact modern pixels');
    for(const sample of drawn.sampling) {
      assert.equal(sample.smooth,false,`cached enemy must disable smoothing: ${JSON.stringify(sample)}`);
      assert.ok(sample.matches,`cached enemy must match nearest-neighbor pixels: ${JSON.stringify(sample)}`);
      assert.ok(sample.restored,'enemy drawing must restore the caller’s canvas state');
    }
    assert.notEqual(drawn.boardModern,drawn.boardLegacy,'the live board must invalidate cached contents and lighting');
    assert.equal(drawn.boardModern,drawn.boardAgain,'the live board must restore modern content and lighting');
    assert.ok(drawn.preserved,'switching must not mutate the saved run');
    assert.match(drawn.name,/Runic Iron Tortoise/);
    assert.notEqual(drawn.name,drawn.oldName);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`test-results/enemy-roster/settings-${experimentalAtlas?'atlas':'individual'}.png`});
    await context.close();
  }
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  await page.goto(`${base}assets/enemy-roster/preview.html`);
  assert.equal(await page.locator('article').count(),126);
  await page.screenshot({path:'test-results/enemy-roster/bestiary.png',fullPage:true});
  console.log('Passed: modern/legacy rendering, repeat switching, saved setting, atlas and individual-image modes, 126-entry preview.');
} finally {await browser.close();await server.close();}
