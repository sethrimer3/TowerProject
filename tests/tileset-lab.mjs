import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
import {createServer} from 'vite';
import {fixClock} from './fixed-clock.mjs';
import {openMenu} from './run-menu.mjs';
const server=await createServer({server:{host:'127.0.0.1',port:5210},logLevel:'error'});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/usr/bin/chromium'});
mkdirSync('test-results/tileset-lab',{recursive:true});
try {
 for(const width of [390,1100]) {
  const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await fixClock(page);
  await page.addInitScript(()=>{globalThis.__handHeld=true;const f=sessionStorage.getItem('labFixture');if(f){localStorage.setItem('towerdelve.v1',f);sessionStorage.removeItem('labFixture');}});
  await page.goto(server.resolvedUrls.local[0],{waitUntil:'domcontentloaded'});await page.locator('#boot-loading').waitFor({state:'hidden',timeout:120000});
  await page.evaluate(async()=>{
    const {Game}=await import('/src/state.ts'),{defaults}=await import('/src/save/save.ts');const s=defaults();
    for(const k of Object.keys(s.tutorials))s.tutorials[k]=true;s.tutorials.enemy=false;
    s.settings.reduceMotion=true;s.settings.weatherSound=false;
    const g=new Game(s);g.newRun({outside:false,seed:1103});sessionStorage.setItem('labFixture',JSON.stringify(g.save));
  });
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#boot-loading').waitFor({state:'hidden',timeout:120000});
  await openMenu(page);await page.locator('#auto-settings').click();
  await expect(page.getByRole('heading',{name:'Visual Settings',exact:true})).toBeVisible();
  const read=()=>page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('towerdelve.v1'));return {tower:s.tower,delve:s.delve,gold:s.gold,xp:s.xp,settings:s.settings};});
  const before=await read();assert.equal(before.settings.devMode,false,'screen accessible without gameplay cheats');
  await page.locator('#tileset-lab-open').click();const room=page.locator('#tileset-room');
  await expect(room).toHaveAttribute('data-example','EXP-A');await expect(page.locator('#tileset-counter')).toHaveText('10 / 12');
  await expect(page.locator('nav[aria-label="Main navigation"]')).toBeHidden();
  const hashes=new Map();
  for(let i=0;i<12;i++) {
    const id=await room.getAttribute('data-example');
    await expect(page.locator('#tileset-loading')).toBeHidden();
    hashes.set(id,await room.evaluate(c=>c.toDataURL()));
    if(id.startsWith('EXP-'))await page.screenshot({path:`test-results/tileset-lab/${id}-${width}.png`});
    await page.locator('#tileset-next').click();
  }
  assert.equal(hashes.size,12);assert.equal(new Set(hashes.values()).size,12,'each slide has distinct rendered materials');
  assert.equal(await room.evaluate(c=>c.toDataURL()),hashes.get('EXP-A'),'switching back restores exact pixels and cache identity');
  await page.keyboard.press('ArrowRight');await expect(room).toHaveAttribute('data-example','EXP-B');
  await page.keyboard.press('ArrowLeft');await expect(room).toHaveAttribute('data-example','EXP-A');
  await page.keyboard.press('Home');await expect(room).toHaveAttribute('data-example','T-I');
  await page.keyboard.press('ArrowLeft');await expect(room).toHaveAttribute('data-example','EXP-C');
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.locator('#tileset-copy').click();
  assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/EXP-C: Bone Reliquary/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'phone layout has no horizontal overflow');
  assert.deepEqual(await read(),before,'previewing and copying never changes the current run, currencies or settings');
  await page.keyboard.press('Escape');await expect(page.locator('#tileset-lab-open')).toBeVisible();
  await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible();
  await page.locator('#tileset-lab-open').click();await page.locator('#tileset-lab-back').click();
  await page.locator('#settings-back').click();await expect(page.locator('#world')).toBeVisible();assert.deepEqual(await read(),before);
  assert.deepEqual(errors,[]);await page.close();console.log(`Tileset Lab: all slides, arrows, keyboard, clipboard, run isolation and return passed at ${width}px`);
 }
} finally {await browser.close();await server.close();}
