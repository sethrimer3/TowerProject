import {chromium,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {fixClock} from "./fixed-clock.mjs";

const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await fixClock(page);const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{const s=sessionStorage.getItem("keymasterFixture");if(s){localStorage.setItem("towerdelve.v1",s);sessionStorage.removeItem("keymasterFixture");}});
  const world=page.locator("#world"),read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1"))),trial=async()=>(await read()).provingGrounds;
  async function patch(changes) {
    await page.evaluate(changes=> {
      const save=JSON.parse(localStorage.getItem("towerdelve.v1")),s=save.provingGrounds;
      for(const [id,v] of Object.entries(changes))if(["player","keymaster"].includes(id))Object.assign(s[id],v);else s[id]=v;
      sessionStorage.setItem("keymasterFixture",JSON.stringify(save));
    },changes);await page.reload({waitUntil:"domcontentloaded"});await expect(world).toHaveAttribute("data-trial-room","arena");
  }
  async function tile(x,y) {
    const s=await trial(),box=await world.boundingBox();
    await world.click({position:{x:box.width*(x-s.player.x+8.5)/17,y:box.height*(s.player.y-y+8.5)/17}});
  }
  mkdirSync("test-results/keymaster",{recursive:true});
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});
  await page.evaluate(async()=> {
    const {Game}=await import("/src/state.ts"),{defaults}=await import("/src/save.ts");
    const g=new Game(defaults());g.newRun({outside:true,seed:12});g.run.player.x=10;g.run.player.y=5;g.run.player.keys.yellow=7;
    g.save.settings.oneTapMove=true;g.save.settings.uiSprites=true;g.save.settings.devMode=true;g.save.settings.reduceMotion=false;
    for(const id of Object.keys(g.save.tutorials))g.save.tutorials[id]=true;
    g.save.trialAccess.points=10;g.save.profile.earned.trialPoints=10;
    g.save.trialAccess.progress["light-elemental"]={cleared:4,claimed:[1,2,3,4]};
    sessionStorage.setItem("keymasterFixture",JSON.stringify(g.save));
  });await page.reload({waitUntil:"domcontentloaded"});
  const box=await world.boundingBox();await world.click({position:{x:box.width*10.5/20,y:box.height*18.5/20}});
  await expect(page.locator("#trial-heading")).toHaveText("Proving Grounds Trials");
  const tower=(await read()).tower.run;
  await expect(page.locator("dialog .trial-choice")).toHaveCount(2);
  await expect(page.locator("#trial-light-elemental")).toContainText("Difficulty 5");
  await page.locator("#trial-keymaster").click();await expect(page.locator("#trial-heading")).toHaveText("Trial 2 — Keymaster");
  await expect(page.locator("#trial-difficulty")).toContainText("Difficulty 1");
  for(const width of [320,390,1024]) {
    await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator("dialog").screenshot({path:`test-results/keymaster/picker-${width}.png`});
  }
  await page.setViewportSize({width:390,height:844});await page.locator("#trial-mode-manual").click();
  await expect(page.locator("#height")).toHaveText("2");await tile(4,6);
  await expect(world).toHaveAttribute("data-trial-room","arena");
  expect((await trial()).keymaster.keys).toBe(0);expect((await trial()).keymaster.mimics).toHaveLength(2);
  await patch({player:{x:12,y:11,maxHp:1000,hp:1000,attack:10,defense:0},bossMaxHp:240,bossHp:240,steps:1});
  await tile(12,12);await expect.poll(async()=>(await trial()).keymaster.hits).toBe(1);
  const hit=await trial();expect(hit.keymaster.drops.reduce((n,p)=>n+p.count,0)).toBe(3);
  expect(hit.elemental.incorporeal).toBe(false);expect(hit.beam).toBeNull();expect(hit.slimes).toEqual([]);
  await page.locator(".shell").screenshot({path:"test-results/keymaster/boss-keys-mimics.png"});
  const drop=hit.keymaster.drops[0];await tile(drop.x,drop.y);await expect.poll(async()=>(await trial()).keymaster.keys).toBeGreaterThan(0);
  const mimic=(await trial()).keymaster.mimics[0];
  await patch({player:{x:mimic.x,y:mimic.y-1,hp:1000},steps:1,keymaster:{keys:1,useKeys:true}});
  await tile(mimic.x,mimic.y);await expect.poll(async()=>(await trial()).keymaster.keys).toBe(0);
  expect((await trial()).player.hp).toBe(1000);expect((await trial()).keymaster.mimics.some(m=>m.id===mimic.id)).toBe(false);
  const tough=(await trial()).keymaster.mimics[0];
  await patch({player:{x:tough.x,y:tough.y-1},steps:2,keymaster:{keys:2,useKeys:true}});
  await page.locator("#trial-key-use").click();await expect(page.locator("#trial-key-use")).toHaveAttribute("aria-pressed","false");
  await tile(tough.x,tough.y);await expect.poll(async()=>(await trial()).player.hp).toBeLessThan(1000);
  expect((await trial()).keymaster.keys).toBe(2);expect((await trial()).keymaster.mimics.some(m=>m.id===tough.id)).toBe(true);
  await page.reload({waitUntil:"domcontentloaded"});await expect(page.locator("#trial-key-use")).toHaveAttribute("aria-pressed","false");
  const doors=[{x:12,y:24},{x:24,y:12},{x:12,y:0},{x:0,y:12}];
  for(const [i,p] of doors.entries()) {
    await patch({player:{x:p.x===0?1:p.x===24?23:12,y:p.y===0?1:p.y===24?23:12,hp:1000},keymaster:{keys:4-i},steps:3});
    if(i===0)for(const width of [320,390,1024]) {
      await page.setViewportSize({width,height:844});await page.locator(".shell").screenshot({path:`test-results/keymaster/north-door-${width}.png`});
    }
    await page.setViewportSize({width:390,height:844});const hp=(await trial()).bossHp;
    await tile(p.x,p.y);await expect.poll(async()=>(await trial()).keymaster.doors.length).toBe(i+1);
    await expect.poll(async()=>(await trial()).bossHp).toBe(hp-48);
    expect((await trial()).keymaster.doors[i].hit).toBe(true);
    await page.reload({waitUntil:"domcontentloaded"});expect((await trial()).bossHp).toBe(hp-48);
    await page.locator("#trial-wait").click();expect((await trial()).bossHp).toBe(hp-48);
  }
  expect((await trial()).bossHp).toBe(38); // One initial strike, then four fixed 48-HP bursts.
  await patch({player:{x:12,y:11,hp:1000}});
  for(let i=0;i<4;i++){await tile(12,12);await expect.poll(async()=>(await trial()).keymaster.hits).toBe(i+2);}
  await expect(page.locator("#message")).toContainText("+1 Trial Point");expect((await read()).trialAccess.points).toBe(11);
  await page.reload({waitUntil:"domcontentloaded"});expect((await read()).trialAccess.points).toBe(11);
  await page.locator("#trial-retry").click();await expect(page.locator("#trial-difficulty")).toContainText("Difficulty 2");
  await page.locator("#trial-mode-cards").click();await page.locator("#auto").click();
  // Restore a paused arena to verify cards-only input authority, then let its real boss card win.
  await page.evaluate(()=> {
    const save=JSON.parse(localStorage.getItem("towerdelve.v1")),s=save.provingGrounds;
    s.room="arena";s.player.x=12;s.player.y=11;s.bossHp=s.player.attack;s.hand=["bossEnemy"];s.playing=false;
    sessionStorage.setItem("keymasterFixture",JSON.stringify(save));
  });await page.reload({waitUntil:"domcontentloaded"});
  const paused=await trial();await tile(12,12);await page.keyboard.press("ArrowUp");expect(await trial()).toEqual(paused);
  await page.locator("#auto").click();await expect(page.locator("#message")).toContainText("+2 Trial Points",{timeout:10000});
  await page.locator("#trial-retry").click();await page.locator("#trial-mode-hybrid").click();
  await page.locator("#auto").click();
  await page.evaluate(()=> {
    const save=JSON.parse(localStorage.getItem("towerdelve.v1")),s=save.provingGrounds;
    s.room="arena";s.player.x=12;s.player.y=11;s.bossHp=s.player.attack;s.hand=["bossEnemy"];s.playing=false;
    sessionStorage.setItem("keymasterFixture",JSON.stringify(save));
  });await page.reload({waitUntil:"domcontentloaded"});await tile(12,12);
  await expect(page.locator("#message")).toContainText("+3 Trial Points");
  const won=await read();expect(won.trialAccess.points).toBe(16);expect(won.trialAccess.progress["keymaster"].cleared).toBe(3);
  expect(won.trialAccess.progress["light-elemental"].cleared).toBe(4);
  await page.locator("#trial-leave").click();expect((await read()).tower.run).toEqual(tower);
  await expect(page.locator("#enter-run")).toBeVisible();expect(errors).toEqual([]);
  console.log("Keymaster: Trial 2 picker, native arena at 320/390/1024px, dropped/collected keys, paid/free mimic combat, key reservation, four delayed door impacts, reload receipts, three controls, independent progression/rewards and ordinary-run isolation passed.");
} finally {await browser.close();}
