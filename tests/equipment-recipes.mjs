import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { startPreview, bounded } from "./snapshot-preview.mjs";
import { mkdirSync } from "node:fs";
import { fixClock } from "./fixed-clock.mjs";
const server = await startPreview(4191);
const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"})});
mkdirSync("test-results/equipment-recipes",{recursive:true});
try {
  const page = await browser.newPage({viewport:{width:390,height:844}}), errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("response",r=>{if(r.url().includes("/assets/style/")&&r.status()>=400) errors.push(`${r.status()} ${r.url()}`);});
  await fixClock(page);
  await page.addInitScript(()=>{
    globalThis.__handStartsPaused=true;globalThis.__handHeld=true;
    const s=sessionStorage.getItem("equipmentRecipeFixture");
    if(s){localStorage.setItem("towerdelve.v1",s);sessionStorage.removeItem("equipmentRecipeFixture");}
  });
  await page.goto(server.url,{waitUntil:"domcontentloaded",timeout:60000});await page.locator("#boot-loading").waitFor({state:"hidden",timeout:120000});await page.locator("#hp").waitFor({state:"attached",timeout:60000});
  async function seed(legacy=false,missing=false,theme="medieval") {
    await page.evaluate(async({legacy,missing,theme})=>{
      const {defaults}=await import("/snapshot/save.js"),{Game}=await import("/snapshot/state.js");
      const s=defaults();s.equipment.unlocked=true;s.gold=10000;s.settings.uiTheme=theme;
      Object.keys(s.tutorials).forEach(k=>s.tutorials[k]=true);
      Object.assign(s.settings,{reduceMotion:true,transition:"instant",weatherSound:false});
      Object.keys(s.equipment.materials).forEach(k=>s.equipment.materials[k]=100);
      if(missing)s.equipment.materials.whetstone=0;
      if(legacy)for(const def of ["woolCloak","wardensShield","bulwarkShield","dawnShield"])s.equipment.items.push({id:`e${s.equipment.nextId++}`,def,rarity:"common",level:1,slots:[{}]});
      const g=new Game(s);g.newRun({outside:true,seed:7});
      sessionStorage.setItem("equipmentRecipeFixture",JSON.stringify(g.save));
    },{legacy,missing,theme});
    await page.reload({waitUntil:"domcontentloaded",timeout:60000});
    try {await page.locator("#boot-loading").waitFor({state:"hidden",timeout:120000});await page.locator("#hp").waitFor({state:"attached",timeout:60000});}
    catch(error){console.error("Browser errors:",errors);console.error((await page.locator("body").innerText()).slice(0,2000));await page.screenshot({path:"test-results/equipment-recipes/startup-failure.png"});throw error;}
    await page.addStyleTag({content:".research-toast{display:none!important}"});
    await page.locator('[data-tab="gear"]').click();await page.locator('[data-geartab="equipment"]').click();
  }
  const save=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")));
  await seed();
  for(const width of [320,390,570,1024]) {
    await page.setViewportSize({width,height:844});
    await expect(page.locator("[data-eq-category]")).toHaveCount(5);
    await expect(page.locator("#equip-materials .mat-balance")).toHaveCount(5); // Gold + four materials.
    const boxes=await page.locator("[data-eq-category]").evaluateAll(es=>Object.fromEntries(es.map(e=>{
      const r=e.getBoundingClientRect();return [e.dataset.eqCategory,{x:r.x+r.width/2,y:r.y+r.height/2}];
    })));
    assert.ok(boxes.shield.x<boxes.chestplate.x&&boxes.chestplate.x<boxes.weapon.x);
    assert.ok(boxes.helmet.y<boxes.chestplate.y&&boxes.chestplate.y<boxes.boots.y);
    assert.ok(Math.abs(boxes.helmet.x-boxes.boots.x)<1);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator("#gear").screenshot({path:`test-results/equipment-recipes/plus-${width}.png`});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-eq-view="craft"]').click();
  await expect(page.locator("[data-eq-recipe]")).toHaveCount(5);
  await expect(page.locator('[data-eq-recipe="chestplate"] .eq-recipe-cost .sprite-icon.mat-icon')).toHaveCount(4);
  await page.locator("#gear").screenshot({path:"test-results/equipment-recipes/craft-390.png"});
  await page.locator('[data-eq-craft="chestplate"]').click();await page.locator("#eq-ok").click();
  assert.ok(Object.values((await save()).equipment.materials).every(n=>n===75));
  await page.locator('[data-eq-craft="shield"]').click();await page.locator("#eq-ok").click();
  const e=(await save()).equipment;assert.equal(e.materials.rivets,50);
  assert.ok(e.items.some(i=>i.def==="ironShield"));
  await page.locator('[data-eq-view="list"]').click();
  const shield=e.items.find(i=>i.def==="ironShield");
  await page.locator(`.eq-grid [data-eq-item="${shield.id}"]`).click();
  await page.locator('[data-eq-on="tower"]').click();await page.locator("#eq-close").click();
  assert.equal((await save()).equipment.equipped.tower.shield,shield.id);
  await seed(false,true);await page.locator('[data-eq-view="craft"]').click();
  await expect(page.locator('[data-eq-craft="chestplate"]')).toBeDisabled();
  await expect(page.locator('[data-eq-craft="shield"]')).toBeEnabled();
  await page.locator('[data-eq-view="pulls"]').click();
  await expect(page.locator('[data-eq-pullcat="cape"]')).toHaveCount(0);
  await seed(true);
  const cape=await page.locator('[data-eq-category="cape"]').boundingBox();
  const helmet=await page.locator('[data-eq-category="helmet"]').boundingBox();
  const left=await page.locator('[data-eq-category="shield"]').boundingBox();
  assert.ok(cape.x<helmet.x&&cape.y<left.y);
  await page.locator('[data-eq-view="craft"]').click();
  await expect(page.locator('[data-eq-recipe="cape"] .eq-recipe-cost .sprite-icon.mat-icon')).toHaveCount(2);
  await page.locator('[data-eq-view="list"]').click();
  await page.waitForFunction(()=>[...document.querySelectorAll("#gear .eq-grid img")].every(i=>i.complete&&i.naturalWidth));
  for(const theme of ["classic","desktop","terminal"]) {
    await page.setViewportSize({width:320,height:844});await seed(false,false,theme);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    for(const button of await page.locator(".eq-views button").all()) {
      const fits=await button.evaluate(b=>{const range=document.createRange();range.selectNodeContents(b);const r=range.getBoundingClientRect(),box=b.getBoundingClientRect();return r.left>=box.left&&r.right<=box.right;});
      assert.ok(fits,`${theme}: Equipment view label must fit its button`);
    }
  }
  assert.deepEqual(errors,[]);
  console.log("Equipment browser checks passed: five-slot plus, four materials, atomic crafting, locked pools, cape recipe, equipping, native sprites and mobile layouts.");
} finally {await bounded(browser.close());await bounded(server.close());}
