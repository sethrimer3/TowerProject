import {chromium,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {fixClock} from "./fixed-clock.mjs";

const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await fixClock(page);page.setDefaultNavigationTimeout(120000);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=> {
    const fixture=sessionStorage.getItem("trialFixture");
    if(fixture){localStorage.setItem("towerdelve.v1",fixture);sessionStorage.removeItem("trialFixture");}
  });
  const world=page.locator("#world"),read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")));
  const trial=async()=>(await read()).provingGrounds;
  const reload=async()=>{await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});};
  async function fixture(patch) {
    await page.evaluate(async patch=> {
      const save=JSON.parse(localStorage.getItem("towerdelve.v1"));
      if(patch.trial)Object.assign(save.provingGrounds,patch.trial);
      if(patch.access)Object.assign(save.trialAccess,patch.access);
      if(patch.profilePoints!==undefined)save.profile.earned.trialPoints=patch.profilePoints;
      if(patch.delve) {
        const {Game}=await import("/src/state.ts");save.upgrades.delve=1;
        const other=new Game(structuredClone(save));other.switchMode("delve");save.delve=other.save.delve;
      }
      sessionStorage.setItem("trialFixture",JSON.stringify(save));
    },patch);await reload();
  }
  async function clickTile(x,y) {
    await expect(world).toHaveAttribute("data-trial-view-room",(await trial()).room);
    await expect(world).toHaveAttribute("data-trial-camera-moving","false",{timeout:10000});
    const view=await world.evaluate(c=>({left:Number(c.dataset.trialViewLeft),bottom:Number(c.dataset.trialViewBottom)}));
    const box=await world.boundingBox();
    await world.click({position:{x:box.width*(x-view.left+.5)/17,y:box.height*(view.bottom+17-y-.5)/17}});
  }
  async function oneHit(mode,level,playing=mode!=="manual",extra={}) {
    const s=await trial();
    await fixture({...extra,trial:{mode,level,room:"arena",status:"active",playing,
      hand:mode==="manual"?[]:[...(s.displayHand??["stairs","monster"])],
      player:{...s.player,x:12,y:11,hp:s.player.maxHp},elemental:{x:12,y:12,incorporeal:false,teleport:null},
      bossHp:s.player.attack,steps:1,slimes:[],beam:null,scorches:{},destroyed:{},consumed:[]}});
    await expect(world).toHaveAttribute("data-trial-level",String(level));
  }
  mkdirSync("test-results/proving-grounds",{recursive:true});
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});
  await page.evaluate(async()=> {
    const {Game}=await import("/src/state.ts"),{defaults}=await import("/src/save/save.ts");
    const g=new Game(defaults());g.newRun({outside:true,seed:12});
    g.run.player.x=10;g.run.player.y=5;g.save.settings.oneTapMove=true;
    g.save.settings.reduceMotion=true;g.save.upgrades.onTheJob=1;
    g.save.upgrades.cardDoorKey=1;g.save.upgrades.cardEnemy=1;g.save.upgrades.autoClimb=1;
    g.save.hand=["stairs","door","key","monster"];
    for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
    sessionStorage.setItem("trialFixture",JSON.stringify(g.save));
  });await reload();
  await expect(page.locator("#enter-run")).toBeVisible();
  // Walk south across the gold square from above; the forest's help text
  // overlays the square itself at this phone width.
  const forest=await world.boundingBox();await world.click({position:{x:forest.width*10.5/20,y:forest.height*18.5/20}});
  await expect(page.locator("#trial-heading")).toHaveText("Proving Grounds Trials");
  await expect(page.locator("dialog .trial-choice")).toHaveCount(2);
  await expect(page.locator("#trial-level")).toHaveCount(0);
  await expect(page.locator("#trial-key-balance")).toHaveText("Trial keys: 2 / 2");
  const tower=(await read()).tower.run;
  await page.locator("#trial-light-elemental").click();
  await expect(page.locator("#trial-difficulty")).toHaveText("Difficulty 1 · Difficulty multiplier ×1.0");
  await expect(page.locator("#trial-reward")).toContainText("1 Trial Point");
  await expect(page.locator("[data-trial-attempt]")).toHaveCount(3);
  for(const width of [320,390,1024]) {
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator("dialog").screenshot({path:`test-results/proving-grounds/control-picker-${width}.png`});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator("#trial-mode-manual").click();
  await expect(world).toHaveAttribute("data-trial-mode","manual");
  expect((await read()).trialAccess.spent).toBe(1);
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator("#stats")).toBeVisible();await expect(page.locator("#training-bar")).toBeVisible();
  await expect(page.locator('#hand .hand-card[aria-disabled="true"]')).toHaveCount(4);
  await expect(page.locator("[data-trial-move], #trial-overlay .trial-controls")).toHaveCount(0);
  await expect(page.locator("#trial-wait")).toBeVisible();
  await expect(page.locator("#auto")).toBeDisabled();
  // A distant tile click walks four real moves through staging, then clears its route.
  await clickTile(4,6);await expect(world).toHaveAttribute("data-trial-room","arena");
  expect((await trial()).steps).toBe(0);
  await clickTile(13,2);await expect.poll(async()=>(await trial()).player.x).toBe(13);
  await clickTile(14,3);await expect.poll(async()=>(await trial()).player.y).toBe(3);
  expect((await trial()).steps).toBe(3);
  await page.locator("#trial-wait").click();expect((await trial()).steps).toBe(4);
  // Purchases and resume still use the isolated trial Game, preserving a paused Delve too.
  const s=await trial();await fixture({trial:{purchases:{silver:100,training:{}}},delve:true});
  const delve=(await read()).delve.run;
  await page.locator('[data-run-group="offense"]').click();await page.locator('[data-run-train="attack"]').click();
  expect((await trial()).player.attack).toBeGreaterThan(s.player.attack);
  await page.locator('[data-run-tab="hand"]').click();
  const purchases=(await trial()).purchases;await reload();expect((await trial()).purchases).toEqual(purchases);
  expect((await read()).trialAccess.spent).toBe(1);
  await page.locator(".shell").screenshot({path:"test-results/proving-grounds/manual-tile-movement.png"});
  await oneHit("manual",1);await clickTile(12,12);
  await expect(page.locator("#message")).toContainText("+1 Trial Point");
  expect((await read()).trialAccess.points).toBe(1);expect((await read()).trialAccess.progress["light-elemental"].cleared).toBe(1);
  await reload();expect((await read()).trialAccess.points).toBe(1);
  await expect(page.locator("#message")).toContainText("already claimed");
  await page.locator("#trial-retry").click();
  await expect(page.locator("#trial-difficulty")).toHaveText("Difficulty 2 · Difficulty multiplier ×1.1");
  await page.locator("#trial-mode-cards").click();await expect(world).toHaveAttribute("data-trial-mode","cards");
  await page.locator("#auto").click();await expect(page.locator("#auto")).toHaveAttribute("aria-label","Play the hand");
  await expect(page.locator("#trial-wait")).not.toBeVisible();
  const paused=await trial();await clickTile(4,6);await page.keyboard.press("ArrowUp");
  expect(await trial()).toEqual(paused);await reload();expect((await trial()).playing).toBe(false);
  await page.locator("#auto").click();await expect(world).toHaveAttribute("data-trial-room","arena",{timeout:15000});
  await expect.poll(async()=>(await trial()).steps,{timeout:15000}).toBeGreaterThan(0);
  await page.locator("#auto").click();
  await oneHit("cards",2,true);await expect(page.locator("#message")).toContainText("+2 Trial Points",{timeout:10000});
  expect((await read()).trialAccess.points).toBe(3);expect((await read()).trialAccess.spent).toBe(2);
  await page.locator("#trial-retry").click();
  await expect(page.locator("#trial-difficulty")).toContainText("Difficulty 3");
  for(const mode of ["manual","cards","hybrid"])await expect(page.locator(`#trial-mode-${mode}`)).toBeDisabled();
  await page.locator("#trial-mode-hybrid").dispatchEvent("click");
  expect((await read()).trialAccess.spent).toBe(2);expect((await trial()).level).toBe(2);
  // Already-open pickers refill at UTC midnight and can enter the same trial in a new mode.
  await page.clock.setFixedTime(new Date("2026-10-06T00:00:00Z"));
  await expect(page.locator("#trial-key-balance")).toHaveText("Trial keys: 2 / 2",{timeout:5000});
  await page.locator("#trial-mode-hybrid").click();await expect(world).toHaveAttribute("data-trial-mode","hybrid");
  await expect(page.locator('#hand .hand-card[aria-disabled="false"]')).toHaveCount(4);
  await expect(page.locator("#trial-wait")).toBeVisible();
  await page.locator("#auto").click();
  await clickTile(6,2);await expect.poll(async()=>(await trial()).player.x).toBe(6);
  expect((await trial()).player.y).toBe(2);expect((await trial()).playing).toBe(false);
  // Queue an override while cards are playing, then pause them in the same
  // task. Autoplay must not race the coordinate assertion after arrival.
  await page.evaluate(()=> {
    document.querySelector("#auto").click();
    const canvas=document.querySelector("#world"),box=canvas.getBoundingClientRect();
    const s=JSON.parse(localStorage.getItem("towerdelve.v1")).provingGrounds;
    const init={bubbles:true,pointerId:1,pointerType:"mouse",clientX:box.left+box.width*(7-s.player.x+8.5)/17,clientY:box.top+box.height*(s.player.y-2+8.5)/17};
    canvas.dispatchEvent(new PointerEvent("pointerdown",init));canvas.dispatchEvent(new PointerEvent("pointerup",init));
    document.querySelector("#auto").click();
  });
  await expect.poll(async()=>(await trial()).player.x).toBe(7);
  expect((await trial()).player.y).toBe(2);
  await clickTile(4,6);await expect(world).toHaveAttribute("data-trial-room","arena");
  await page.locator("#trial-wait").click();expect((await trial()).steps).toBe(1);
  await page.locator("#auto").click();await expect.poll(async()=>(await trial()).steps,{timeout:10000}).toBeGreaterThan(1);
  await page.locator("#auto").click();
  await oneHit("hybrid",3,false);await clickTile(12,12);
  await expect(page.locator("#message")).toContainText("+3 Trial Points");
  expect((await read()).trialAccess.points).toBe(6);expect((await read()).profile.earned.trialPoints).toBe(6);
  // Replaying a previously completed saved result in another mode cannot pay or regress progress.
  await fixture({trial:{level:2,mode:"cards",playing:false}});
  expect((await read()).trialAccess.points).toBe(6);expect((await read()).trialAccess.progress["light-elemental"].cleared).toBe(3);
  // The requested difficulty-five example pays exactly five points, not a flat reward or five Gems.
  await oneHit("manual",5,false,{access:{points:10,progress:{"light-elemental":{cleared:4,claimed:[1,2,3,4]}}},profilePoints:10});
  await clickTile(12,12);await expect(page.locator("#message")).toContainText("+5 Trial Points");
  expect((await read()).trialAccess.points).toBe(15);expect((await read()).gems).toBe(0);
  await reload();expect((await read()).trialAccess.points).toBe(15);
  await page.locator("#trial-retry").click();
  await expect(page.locator("#trial-difficulty")).toHaveText("Difficulty 6 · Difficulty multiplier ×1.5");
  await expect(page.locator("#trial-reward")).toContainText("6 Trial Points");
  await page.locator("#trial-list-back").click();await expect(page.locator("dialog .trial-choice")).toHaveCount(2);
  await expect(page.locator("#trial-light-elemental")).toContainText("Next: Difficulty 6");
  await page.locator("#trial-menu-leave").click();
  const returned=await read();expect(returned.tower.run).toEqual(tower);expect(returned.delve.run).toEqual(delve);
  expect(returned.provingGrounds).toBeUndefined();expect(returned.trialAccess.points).toBe(15);
  await expect(page.locator("#enter-run")).toBeVisible();await expect(page.locator("#trial-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log("Trials: two boss entries, three controls, tile routes without arrows, cards-only input guard, hybrid overrides/resume, automatic shared difficulty, one-time weighted Trial Points, midnight keys, isolated purchases/runs and 320/390/1024px passed.");
} finally {await browser.close();}
