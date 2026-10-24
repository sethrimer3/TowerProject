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
  const readSave=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")));
  const readTrial=async()=>(await readSave()).provingGrounds;
  const world=page.locator("#world");
  const reload=async()=>page.reload({waitUntil:"domcontentloaded"});
  const fixture=async(change)=> {
    await page.evaluate(change);await reload();
  };
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});
  await fixture(async()=> {
    const {Game}=await import("/src/state.ts"),{defaults}=await import("/src/save.ts");
    const g=new Game(defaults());g.newRun({outside:true,seed:12});
    g.run.player.x=9;g.run.player.y=4;g.save.settings.oneTapMove=true;g.save.upgrades.onTheJob=1;
    for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
    sessionStorage.setItem("trialFixture",JSON.stringify(g.save));
  });
  await expect(page.locator("#enter-run")).toBeVisible();
  async function tapForest(column) {
    const box=await world.boundingBox();
    await world.click({position:{x:box.width*(column+.5)/20,y:box.height*15.5/20}});
  }
  await tapForest(10);
  await expect(page.locator("#trial-heading")).toHaveText("Proving Grounds Trials");
  const tower=(await readSave()).tower.run;
  await page.locator("#trial-light-elemental").click();
  await expect(world).toHaveAttribute("data-trial-mode","manual");
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.locator("#stats")).toBeVisible();
  await expect(page.locator("nav")).toHaveClass(/in-run/);
  await expect(page.locator("#hand .hand-card")).toHaveCount(4);
  await expect(page.locator('#hand .hand-card[aria-disabled="true"]')).toHaveCount(4);
  await expect(page.locator("#auto")).toBeDisabled();
  await expect(page.locator("#training-bar")).toBeVisible();
  expect(await page.locator("#hand .hand-card").first().evaluate(c=>getComputedStyle(c,"::after").backgroundImage)).toContain("linear-gradient");
  for(let i=0;i<4;i++)await page.keyboard.press("ArrowUp");
  await expect(world).toHaveAttribute("data-trial-room","arena");
  for(let i=0;i<10;i++)await page.locator('[data-trial-move="0,0"]').click();
  let trial=await readTrial();expect(trial.steps).toBe(10);expect(trial.player.hp).toBeLessThan(trial.player.maxHp);
  await expect(page.locator("#hp")).toContainText(String(Math.ceil(trial.player.hp)));
  expect(trial.slimes.length).toBeGreaterThan(0);
  // The real purchase bar buys ranks with the isolated attempt's Silver.
  await fixture(async()=> {
    const save=JSON.parse(localStorage.getItem("towerdelve.v1"));save.provingGrounds.purchases.silver=100;
    const {Game}=await import("/src/state.ts");
    save.upgrades.delve=1;
    const other=new Game(structuredClone(save));other.switchMode("delve");
    save.delve=other.save.delve;
    sessionStorage.setItem("trialFixture",JSON.stringify(save));
  });
  const pausedDelve=(await readSave()).delve.run;
  const before=await readTrial();
  await page.locator('[data-run-group="offense"]').click();
  await expect(page.locator("#run-drills")).toBeVisible();
  await page.locator('[data-run-train="attack"]').click();
  trial=await readTrial();expect(trial.player.attack).toBeGreaterThan(before.player.attack);
  expect(trial.purchases.silver).toBeLessThan(before.purchases.silver);
  expect(trial.purchases.training.attack).toBe(1);
  await expect(page.locator("#attack")).toHaveText(String(Math.floor(trial.player.attack)));
  await page.locator('[data-run-group="offense"]').click();
  await expect(page.locator("#hand")).toBeVisible();
  await reload();expect((await readTrial()).purchases).toEqual(trial.purchases);
  expect((await readSave()).tower.run).toEqual(tower);
  mkdirSync("test-results/proving-grounds",{recursive:true});
  async function review(mode) {
    for(const width of [320,390,1024]) {
      await page.setViewportSize({width,height:844});
      await expect(page.locator("#stats")).toBeVisible();
      await expect(page.locator("#training-bar")).toBeVisible();
      const boardBox=await world.boundingBox(),handBox=await page.locator("#hand").boundingBox(),buyBox=await page.locator("#training-bar").boundingBox();
      expect(handBox.y).toBeGreaterThanOrEqual(boardBox.y+boardBox.height-2);
      expect(buyBox.y).toBeGreaterThanOrEqual(handBox.y+handBox.height-2);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.locator(".shell").screenshot({path:`test-results/proving-grounds/${mode}-${width}.png`});
    }
    await page.setViewportSize({width:390,height:844});
  }
  await review("manual");
  // Existing ghost behavior still runs inside the ordinary game screen.
  await fixture(()=> {
    const save=JSON.parse(localStorage.getItem("towerdelve.v1")),s=save.provingGrounds;
    s.player.x=12;s.player.y=11;s.slimes=[];s.steps=21;s.player.hp=s.player.maxHp;
    sessionStorage.setItem("trialFixture",JSON.stringify(save));
  });
  await page.keyboard.press("ArrowUp");
  await expect(world).toHaveAttribute("data-trial-phase","incorporeal");
  const ghost=await readTrial();expect(ghost.bossHp).toBe(ghost.bossMaxHp-ghost.player.attack);
  await reload();await expect(world).toHaveAttribute("data-trial-phase","incorporeal");
  for(let i=0;i<8;i++)await page.keyboard.press("Space");
  await expect(world).toHaveAttribute("data-trial-phase","corporeal");
  expect((await readTrial()).bossHp).toBe(ghost.bossHp);
  await page.locator("#trial-leave").click();
  await expect(world).not.toHaveAttribute("data-trial-mode",/./);
  await expect(page.locator("#enter-run")).toBeVisible();
  expect((await readSave()).tower.run).toEqual(tower);
  // A second trial uses the same real hand and play/pause controls.
  await tapForest(9);await tapForest(10);
  await expect(page.locator("#trial-light-elemental-cards")).toBeVisible();
  await page.locator("#trial-light-elemental-cards").click();
  await expect(world).toHaveAttribute("data-trial-mode","cards");
  await page.locator("#auto").click();
  await expect(page.locator("#auto")).toHaveAttribute("aria-label","Play the hand");
  await expect(page.locator('#hand .hand-card[aria-disabled="false"]')).toHaveCount(4);
  await expect(page.locator(".trial-controls")).not.toBeVisible();
  await world.focus();const paused=await readTrial();
  for(const key of ["ArrowUp","ArrowLeft","w","Space"])await page.keyboard.press(key);
  const box=await world.boundingBox();await world.click({position:{x:box.width*.75,y:box.height*.5}});
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.25);await page.mouse.up();
  expect(await readTrial()).toEqual(paused);
  await reload();await expect(page.locator("#auto")).toHaveAttribute("aria-label","Play the hand");
  await page.locator("#auto").click();
  await expect(world).toHaveAttribute("data-trial-room","arena",{timeout:15000});
  await expect.poll(async()=>(await readTrial()).steps,{timeout:10000}).toBeGreaterThanOrEqual(3);
  await page.locator("#auto").click();
  await review("cards");
  // Victory/retry keeps the same screen; Leave restores the ordinary forest.
  await fixture(()=> {
    const save=JSON.parse(localStorage.getItem("towerdelve.v1")),s=save.provingGrounds;
    s.player.x=12;s.player.y=11;s.slimes=[];s.elemental={x:12,y:12,incorporeal:false,teleport:null};
    s.bossHp=s.player.attack;s.player.hp=s.player.maxHp;s.playing=true;
    sessionStorage.setItem("trialFixture",JSON.stringify(save));
  });
  await expect(page.locator("#message")).toContainText("Trial complete",{timeout:15000});
  await expect(page.locator("#auto")).toBeDisabled();
  await page.locator("#trial-retry").click();
  await expect(world).toHaveAttribute("data-trial-room","staging");
  await expect(world).toHaveAttribute("data-trial-mode","cards");
  await page.locator("#trial-leave").click();
  const returned=await readSave();expect(returned.tower.run).toEqual(tower);expect(returned.delve.run).toEqual(pausedDelve);expect(returned.provingGrounds).toBeUndefined();
  await expect(page.locator("html")).not.toHaveClass(/trial-running/);
  await expect(page.locator("nav")).not.toHaveClass(/in-run/);
  await expect(page.locator("#trial-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log("Proving Grounds: shared HUD/board/cards/purchases, red X manual cards, real isolated training, 320/390/1024px, beams/ghosts, reload, card autoplay, blocked manual input, victory/retry and safe forest return passed.");
} finally {await browser.close();}
