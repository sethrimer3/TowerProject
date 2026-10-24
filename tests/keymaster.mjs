import {chromium,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {fixClock} from "./fixed-clock.mjs";

const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await fixClock(page);const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{const s=sessionStorage.getItem("keymasterFixture");if(s){localStorage.setItem("towerdelve.v1",s);sessionStorage.removeItem("keymasterFixture");}});
  const world=page.locator("#world"),read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1"))),trial=async()=>(await read()).provingGrounds;
  async function reload(){await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});}
  async function patch(changes) {
    await page.evaluate(changes=> {
      const save=JSON.parse(localStorage.getItem("towerdelve.v1")),s=save.provingGrounds;
      for(const [id,v] of Object.entries(changes))if(["player","keymaster"].includes(id))Object.assign(s[id],v);else s[id]=v;
      sessionStorage.setItem("keymasterFixture",JSON.stringify(save));
    },changes);await reload();await expect(world).toHaveAttribute("data-trial-room","arena");
  }
  async function tile(x,y) {
    await expect(world).toHaveAttribute("data-trial-view-room",(await trial()).room);
    await expect(world).toHaveAttribute("data-trial-camera-moving","false",{timeout:10000});
    const view=await world.evaluate(c=>({left:Number(c.dataset.trialViewLeft),bottom:Number(c.dataset.trialViewBottom)}));
    const box=await world.boundingBox();
    await world.click({position:{x:box.width*(x-view.left+.5)/17,y:box.height*(view.bottom+17-y-.5)/17}});
  }
  mkdirSync("test-results/keymaster",{recursive:true});
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});
  await page.evaluate(async()=> {
    const {Game}=await import("/src/state.ts"),{defaults}=await import("/src/save/save.ts");
    const g=new Game(defaults());g.newRun({outside:true,seed:12});g.run.player.x=10;g.run.player.y=5;g.run.player.keys.yellow=7;
    g.save.settings.oneTapMove=true;g.save.settings.devMode=true;g.save.settings.reduceMotion=false;
    for(const id of Object.keys(g.save.tutorials))g.save.tutorials[id]=true;
    g.save.trialAccess.points=10;g.save.profile.earned.trialPoints=10;
    g.save.trialAccess.progress["light-elemental"]={cleared:4,claimed:[1,2,3,4]};
    sessionStorage.setItem("keymasterFixture",JSON.stringify(g.save));
  });await reload();
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
  expect(hit.elemental.incorporeal).toBe(true);expect(hit.beam).toBeNull();expect(hit.slimes).toEqual([]);
  await page.locator(".shell").screenshot({path:"test-results/keymaster/boss-keys-mimics.png"});
  const beforeMove=await trial();await page.locator("#trial-wait").click();
  const odd=await trial();expect(odd.elemental).toEqual(beforeMove.elemental);expect(odd.keymaster.mimics).toEqual(beforeMove.keymaster.mimics);
  await page.locator("#trial-wait").click();const moved=await trial();
  const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);expect(distance(moved.elemental,odd.elemental)).toBe(1);
  for(const m of moved.keymaster.mimics)expect(distance(m,odd.keymaster.mimics.find(p=>p.id===m.id))).toBe(1);
  await reload();expect((await trial()).elemental).toEqual(moved.elemental);
  await expect(world).toHaveAttribute("data-trial-phase","incorporeal");
  await patch({keymaster:{mimics:[]}});
  const drop=hit.keymaster.drops[0];await tile(drop.x,drop.y);await expect.poll(async()=>(await trial()).keymaster.keys).toBeGreaterThan(0);
  const mimic={id:1,x:17,y:13,hp:60,maxHp:60};
  await patch({player:{x:mimic.x,y:mimic.y-1,hp:1000},steps:1,elemental:{x:12,y:12,incorporeal:false,teleport:null},keymaster:{keys:1,useKeys:true,mimics:[mimic],spawned:1}});
  await tile(mimic.x,mimic.y);await expect.poll(async()=>(await trial()).keymaster.keys).toBe(0);
  expect((await trial()).player.hp).toBe(1000);expect((await trial()).keymaster.mimics.some(m=>m.id===mimic.id)).toBe(false);
  const tough={id:2,x:17,y:13,hp:60,maxHp:60};
  await patch({player:{x:tough.x,y:tough.y-1},steps:2,keymaster:{keys:2,useKeys:true,mimics:[tough],spawned:2}});
  await page.locator("#trial-key-use").click();await expect(page.locator("#trial-key-use")).toHaveAttribute("aria-pressed","false");
  await tile(tough.x,tough.y);await expect.poll(async()=>(await trial()).player.hp).toBeLessThan(1000);
  expect((await trial()).keymaster.keys).toBe(2);expect((await trial()).keymaster.mimics.some(m=>m.id===tough.id)).toBe(true);
  await reload();await expect(page.locator("#trial-key-use")).toHaveAttribute("aria-pressed","false");
  const doors=[{x:12,y:24},{x:24,y:12},{x:12,y:0},{x:0,y:12}];
  for(const [i,p] of doors.entries()) {
    await patch({player:{x:p.x===0?1:p.x===24?23:12,y:p.y===0?1:p.y===24?23:12,hp:1000},keymaster:{keys:4-i,mimics:[]}});
    if(i===0)for(const width of [320,390,1024]) {
      await page.setViewportSize({width,height:844});await page.locator(".shell").screenshot({path:`test-results/keymaster/north-door-${width}.png`});
    }
    await page.setViewportSize({width:390,height:844});const hp=(await trial()).bossHp;
    await tile(p.x,p.y);await expect.poll(async()=>(await trial()).keymaster.doors.length).toBe(i+1);
    await expect.poll(async()=>(await trial()).bossHp).toBe(hp-48);
    expect((await trial()).keymaster.doors[i].hit).toBe(true);
    await reload();expect((await trial()).bossHp).toBe(hp-48);
    await page.locator("#trial-wait").click();expect((await trial()).bossHp).toBe(hp-48);
    while((await trial()).elemental.incorporeal)await page.locator("#trial-wait").click();
    expect((await trial()).steps%10).toBe(0);
  }
  expect((await trial()).bossHp).toBe(38); // One initial strike, then four fixed 48-HP bursts.
  await patch({player:{x:12,y:11,hp:1000},elemental:{x:12,y:12,incorporeal:false,teleport:null},bossHp:10,keymaster:{mimics:[]}});
  await tile(12,12);await expect.poll(async()=>(await trial()).status).toBe("won");
  await expect.poll(async()=>(await read()).trialAccess.points).toBe(11);await expect(page.locator("#message")).toContainText("Difficulty 1 cleared");
  await reload();expect((await read()).trialAccess.points).toBe(11);
  await page.locator("#trial-retry").click();await expect(page.locator("#trial-difficulty")).toContainText("Difficulty 2");
  await page.locator("#trial-mode-cards").click();await page.locator("#auto").click();
  // Restore a paused arena to verify cards-only input authority, then let its real boss card win.
  await page.evaluate(()=> {
    const save=JSON.parse(localStorage.getItem("towerdelve.v1")),s=save.provingGrounds;
    s.room="arena";s.player.x=12;s.player.y=11;s.bossHp=s.player.attack;s.hand=["bossEnemy"];s.playing=false;
    sessionStorage.setItem("keymasterFixture",JSON.stringify(save));
  });await reload();
  const paused=await trial();await tile(12,12);await page.keyboard.press("ArrowUp");expect(await trial()).toEqual(paused);
  await page.locator("#auto").click();await expect.poll(async()=>(await read()).trialAccess.points,{timeout:10000}).toBe(13);await expect(page.locator("#message")).toContainText("Difficulty 2 cleared");
  await page.locator("#trial-retry").click();await page.locator("#trial-mode-hybrid").click();
  await page.locator("#auto").click();
  await page.evaluate(()=> {
    const save=JSON.parse(localStorage.getItem("towerdelve.v1")),s=save.provingGrounds;
    s.room="arena";s.player.x=12;s.player.y=11;s.bossHp=s.player.attack;s.hand=["bossEnemy"];s.playing=false;
    sessionStorage.setItem("keymasterFixture",JSON.stringify(save));
  });await reload();await tile(12,12);
  await expect.poll(async()=>(await read()).trialAccess.points).toBe(16);await expect(page.locator("#message")).toContainText("Difficulty 3 cleared");
  const won=await read();expect(won.trialAccess.points).toBe(16);expect(won.trialAccess.progress["keymaster"].cleared).toBe(3);
  expect(won.trialAccess.progress["light-elemental"].cleared).toBe(4);
  await page.locator("#trial-leave").click();expect((await read()).tower.run).toEqual(tower);
  await expect(page.locator("#enter-run")).toBeVisible();expect(errors).toEqual([]);
  console.log("Keymaster: Trial 2 picker, native arena at 320/390/1024px, ghost teleport, two-step chase/retreat, ten-step reformation, dropped/collected keys, paid/free mimic combat, key reservation, four delayed door impacts, reload receipts, three controls, independent progression/rewards and ordinary-run isolation passed.");
} finally {await browser.close();}
