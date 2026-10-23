import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=> {
    const fixture=sessionStorage.getItem("trialFixture");
    if(fixture) {localStorage.setItem("towerdelve.v1",fixture);sessionStorage.removeItem("trialFixture");}
  });
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/");
  await page.evaluate(async()=> {
    const {Game}=await import("/src/state.ts"),{defaults}=await import("/src/save.ts");
    const g=new Game(defaults());g.newRun({outside:true,seed:12});
    g.run.player.x=9;g.run.player.y=4;
    for(const k of Object.keys(g.save.tutorials))g.save.tutorials[k]=true;
    sessionStorage.setItem("trialFixture",JSON.stringify(g.save));
  });
  await page.reload();await page.evaluate(()=>document.activeElement?.blur());
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#trial-heading")).toHaveText("Proving Grounds Trials");
  const tower=await page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")).tower.run);
  await page.locator("#trial-light-elemental").click();
  await expect(page.locator("#trial-board")).toHaveAttribute("data-room","staging");
  for(let i=0;i<4;i++)await page.keyboard.press("ArrowUp");
  await expect(page.locator("#trial-board")).toHaveAttribute("data-room","arena");
  for(let i=0;i<10;i++)await page.locator('[data-trial-move="0,0"]').click();
  let trial=await page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")).provingGrounds);
  expect(trial.steps).toBe(10);expect(trial.player.hp).toBeLessThan(trial.player.maxHp);
  expect(Object.keys(trial.scorches).length).toBeGreaterThan(30);
  await expect(page.locator("#trial-vitals")).toContainText("northeast–southwest");
  await page.reload();await expect(page.locator("#trial-board")).toHaveAttribute("data-steps","10");
  for(let i=0;i<10;i++)await page.keyboard.press("Space");
  await expect(page.locator("#trial-board")).toHaveAttribute("data-steps","20");
  await expect(page.locator("#trial-vitals")).toContainText("east–west");
  mkdirSync("test-results/proving-grounds",{recursive:true});
  await page.locator("dialog").screenshot({path:"test-results/proving-grounds/arena-mobile.png"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // Bring a still-active saved attempt beside the boss and verify combat UI.
  await page.evaluate(()=> {
    const save=JSON.parse(localStorage.getItem("towerdelve.v1")),s=save.provingGrounds;
    s.player.x=25;s.player.y=24;s.bossHp=s.player.attack;s.steps=20;s.player.hp=s.player.maxHp;
    sessionStorage.setItem("trialFixture",JSON.stringify(save));
  });
  await page.reload();await expect(page.locator("#trial-board")).toHaveAttribute("data-room","arena");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#trial-status")).toContainText("Trial complete");
  await page.locator("#trial-retry").click();
  await expect(page.locator("#trial-board")).toHaveAttribute("data-room","staging");
  await page.locator("#trial-leave").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")));
  expect(after.tower.run).toEqual(tower);expect(after.provingGrounds).toBeUndefined();
  expect(errors).toEqual([]);
  console.log("Proving Grounds: golden square, menu, staging stairs, ten-turn beams, rotation, scars, reload, boss victory, retry, mobile layout and safe return passed.");
} finally { await browser.close(); }
