import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fixClock } from "./fixed-clock.mjs";
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await fixClock(page);
  page.setDefaultNavigationTimeout(120_000);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=> {
    const fixture=sessionStorage.getItem("trialFixture");
    if(fixture) {localStorage.setItem("towerdelve.v1",fixture);sessionStorage.removeItem("trialFixture");}
  });
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});
  await page.evaluate(async()=> {
    const {Game}=await import("/src/state.ts"),{defaults}=await import("/src/save.ts");
    const g=new Game(defaults());g.newRun({outside:true,seed:12});
    g.run.player.x=9;g.run.player.y=4;g.save.settings.oneTapMove=true;
    for(const k of Object.keys(g.save.tutorials))g.save.tutorials[k]=true;
    sessionStorage.setItem("trialFixture",JSON.stringify(g.save));
  });
  await page.reload({waitUntil:"domcontentloaded"});
  const board=page.locator("#world");
  await expect(page.locator("#enter-run")).toBeVisible();
  const bounds=await board.boundingBox();
  // The current game walks the forest by taps; keyboard movement is Dev-only.
  await board.click({position:{x:bounds.width*10.5/20,y:bounds.height*15.5/20}});
  await expect(page.locator("#trial-heading")).toHaveText("Proving Grounds Trials");
  const tower=await page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")).tower.run);
  await page.locator("#trial-light-elemental").click();
  await expect(page.locator("#trial-board")).toHaveAttribute("data-room","staging");
  for(let i=0;i<4;i++)await page.keyboard.press("ArrowUp");
  await expect(page.locator("#trial-board")).toHaveAttribute("data-room","arena");
  for(let i=0;i<10;i++)await page.locator('[data-trial-move="0,0"]').click();
  let trial=await page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")).provingGrounds);
  expect(trial.steps).toBe(10);expect(trial.player.hp).toBeLessThan(trial.player.maxHp);
  expect(Object.keys(trial.scorches).length).toBeGreaterThan(20);
  expect(trial.slimes.length).toBeGreaterThan(0);
  expect(trial.mode).toBe("manual");
  await expect(page.locator("#trial-hand")).toHaveCount(0);
  await expect(page.locator("#trial-play")).toHaveCount(0);
  await expect(page.locator("#trial-vitals")).toContainText("northeast–southwest");
  await page.reload({waitUntil:"domcontentloaded"});await expect(page.locator("#trial-board")).toHaveAttribute("data-steps","10");
  for(let i=0;i<10;i++)await page.keyboard.press("Space");
  await expect(page.locator("#trial-board")).toHaveAttribute("data-steps","20");
  await expect(page.locator("#trial-vitals")).toContainText("east–west");
  mkdirSync("test-results/proving-grounds",{recursive:true});
  await page.locator("dialog").screenshot({path:"test-results/proving-grounds/arena-mobile.png"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // Bring a still-active saved attempt beside the boss and verify combat UI.
  await page.evaluate(()=> {
    const save=JSON.parse(localStorage.getItem("towerdelve.v1")),s=save.provingGrounds;
    s.player.x=12;s.player.y=11;s.slimes=[];s.bossHp=s.player.attack;s.steps=20;s.player.hp=s.player.maxHp;
    sessionStorage.setItem("trialFixture",JSON.stringify(save));
  });
  await page.reload({waitUntil:"domcontentloaded"});await expect(page.locator("#trial-board")).toHaveAttribute("data-room","arena");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#trial-status")).toContainText("Trial complete");
  await page.locator("#trial-retry").click();
  await expect(page.locator("#trial-board")).toHaveAttribute("data-room","staging");
  await page.locator("#trial-leave").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")));
  expect(after.tower.run).toEqual(tower);expect(after.provingGrounds).toBeUndefined();
  // Re-enter for the separate card trial and verify input authority through
  // real keyboard, tap and swipe events while its automatic clock is paused.
  await board.click({position:{x:bounds.width*9.5/20,y:bounds.height*15.5/20}});
  await board.click({position:{x:bounds.width*10.5/20,y:bounds.height*15.5/20}});
  await expect(page.locator("#trial-light-elemental-cards")).toBeVisible();
  await expect(page.locator("#trial-light-elemental")).toContainText("No cards");
  await page.locator("#trial-light-elemental-cards").click();
  await expect(page.locator("#trial-board")).toHaveAttribute("data-mode","cards");
  await expect(page.locator("[data-trial-move]")).toHaveCount(0);
  await expect(page.locator("#trial-hand li")).toHaveCount(4);
  await page.locator("#trial-play").click();
  await expect(page.locator("#trial-play")).toHaveText("Resume autoplay");
  const readTrial=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")).provingGrounds);
  await page.locator("#trial-play").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#trial-play")).toHaveText("Pause autoplay");
  await page.keyboard.press("Space");
  await expect(page.locator("#trial-play")).toHaveText("Resume autoplay");
  await page.locator("#trial-board").focus();
  const paused=await readTrial();
  for(const key of ["ArrowUp","ArrowLeft","w","Space"])await page.keyboard.press(key);
  const cv=page.locator("#trial-board"),box=await cv.boundingBox();
  await cv.click({position:{x:box.width*.75,y:box.height*.5}});
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.25);await page.mouse.up();
  expect(await readTrial()).toEqual(paused);
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.locator("#trial-play")).toHaveText("Resume autoplay");
  expect(await readTrial()).toEqual(paused);
  await page.locator("#trial-play").click();
  await expect(page.locator("#trial-board")).toHaveAttribute("data-room","arena",{timeout:10000});
  await expect.poll(async()=>(await readTrial()).steps,{timeout:10000}).toBeGreaterThanOrEqual(3);
  await page.locator("#trial-play").click();
  trial=await readTrial();expect(trial.slimes.length).toBeGreaterThan(0);
  await page.locator("dialog").screenshot({path:"test-results/proving-grounds/cards-mobile.png"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const width of [320,1024]) {
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.locator("#trial-play")).toBeVisible();
  }
  await page.evaluate(()=> {
    const save=JSON.parse(localStorage.getItem("towerdelve.v1")),s=save.provingGrounds;
    s.player.x=12;s.player.y=11;s.slimes=[];s.bossHp=s.player.attack;s.player.hp=s.player.maxHp;s.playing=true;
    sessionStorage.setItem("trialFixture",JSON.stringify(save));
  });
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.locator("#trial-status")).toContainText("Trial complete",{timeout:10000});
  await expect(page.locator("#trial-play")).toBeDisabled();
  await page.locator("#trial-retry").click();
  await expect(page.locator("#trial-board")).toHaveAttribute("data-room","staging");
  await expect(page.locator("#trial-board")).toHaveAttribute("data-mode","cards");
  await expect(page.locator("[data-trial-move]")).toHaveCount(0);
  await page.locator("#trial-leave").click();
  const returned=await page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")));
  expect(returned.tower.run).toEqual(tower);expect(returned.provingGrounds).toBeUndefined();
  expect(errors).toEqual([]);
  console.log("Proving Grounds: both trial modes, automatic card movement, blocked manual card input, jumping slimes, beams, reload, victory, mobile layout and safe return passed.");
} finally { await browser.close(); }
