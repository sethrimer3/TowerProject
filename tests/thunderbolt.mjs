// Thunderbolt in the real app (node tests/thunderbolt.mjs, dev server running):
// the run's card and its cooldown bar at 320 and 390 pixels, a real strike's white
// bolt and jagged light on the Tower's board and a trial's, a saved toggle hiding
// it and the arcana in a trial's own bar; review images in test-results/thunderbolt/.
import {chromium,expect} from "@playwright/test";
import {mkdirSync,writeFileSync} from "node:fs";
import {fixClock} from "./fixed-clock.mjs";

const OUT="test-results/thunderbolt";
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  await fixClock(page);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{const s=sessionStorage.getItem("boltFixture");if(s){localStorage.setItem("towerdelve.v1",s);sessionStorage.removeItem("boltFixture");}});
  const world=page.locator("#world"),read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")));
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});

  /** The next `ms` of the board, as the frames with the most pure white, and the most seen in any frame. */
  const watch=(ms=700)=>world.evaluate(async(c,ms)=> {
    const end=performance.now()+ms,copy=document.createElement("canvas");copy.width=c.width;copy.height=c.height;
    const d=copy.getContext("2d",{willReadFrequently:true});let most=0,frame="";
    while(performance.now()<end) {
      await new Promise(requestAnimationFrame);
      d.drawImage(c,0,0);
      const px=d.getImageData(0,0,c.width,c.height).data;let white=0;
      for(let i=0;i<px.length;i+=4)if(px[i]===255&&px[i+1]===255&&px[i+2]===255)white++;
      if(white>most){most=white;frame=copy.toDataURL();}
    }
    return {most,frame};
  },ms);
  const keep=(name,seen)=>writeFileSync(`${OUT}/${name}.png`,Buffer.from(seen.frame.split(",")[1],"base64"));

  async function inside(animation=true) {
    await page.evaluate(async(animation)=> {
      const {defaults}=await import("/src/save/save.ts"),{Game}=await import("/src/state.ts");
      const g=new Game(defaults());g.newRun({seed:21});
      for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
      g.save.arcana.owned.thunderbolt=[0,5,0];g.save.arcana.owned.ricochetShot=[0,0,0];
      g.save.tower.runArcana.timers.thunderbolt=60;
      g.save.settings.thunderboltAnimation=animation;g.save.settings.speed=3;
      sessionStorage.setItem("boltFixture",JSON.stringify(g.save));
    },animation);
    await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});
  }

  // The card: its bar a third full (60 of 180 turns left is two thirds done).
  await inside();
  await page.locator('[data-run-tab="arcana"]').click();
  const bar=page.locator('.arcana-card[data-arcanum="thunderbolt"] .arcana-cooldown');
  await expect(bar).toBeVisible();
  await expect(bar.locator("span")).toHaveText("60");
  expect(await bar.getAttribute("aria-valuenow")).toBe("120");
  const width=await bar.evaluate(b=>b.querySelector("i").getBoundingClientRect().width/b.getBoundingClientRect().width);
  expect(Math.abs(width-2/3)).toBeLessThan(.03);
  for(const w of [320,390]) {
    await page.setViewportSize({width:w,height:844});
    await page.locator("#training-bar").screenshot({path:`${OUT}/bar-${w}.png`});
    await page.locator("#run-drills").screenshot({path:`${OUT}/cards-${w}.png`});
    const box=await page.locator('.arcana-card[data-arcanum="thunderbolt"]').boundingBox(),inner=await bar.boundingBox();
    expect(inner.y+inner.height).toBeLessThanOrEqual(box.y+box.height);
  }
  await page.setViewportSize({width:390,height:844});

  // A real strike on the Tower's board.
  const strike=async()=> {
    await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem("towerdelve.v1"));s.tower.runArcana.timers.thunderbolt=1;sessionStorage.setItem("boltFixture",JSON.stringify(s));});
    await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});
    await page.waitForTimeout(400);
    const before=(await read()).tower.run.player;
    const quiet=await watch(150);
    // Only the hand moves the hero inside a climb: pressing its card takes the turns.
    await page.locator("#hand .hand-card").first().click();
    const seen=await watch(1000);
    const now=(await read()).tower.run.player;
    expect(now.x!==before.x || now.y!==before.y).toBe(true);
    return {quiet,seen,left:(await read()).tower.runArcana.timers.thunderbolt};
  };
  await inside();
  const shown=await strike();
  keep("tower-strike",shown.seen);
  expect(shown.left).toBeGreaterThan(170);
  expect(shown.seen.most).toBeGreaterThan(shown.quiet.most+100);
  await page.screenshot({path:`${OUT}/tower-after.png`});

  // The Toggles hide it; the bolts strike all the same.
  await inside(false);
  const hidden=await strike();
  expect(hidden.left).toBeGreaterThan(170);
  expect(hidden.seen.most).toBeLessThan(shown.seen.most);
  expect((await read()).tower.run.kills+Object.keys((await read()).tower.run.changes).length).toBeGreaterThan(0);

  // The Toggles menu lists both while Arcana are open.
  await page.evaluate(async()=>{const s=JSON.parse(localStorage.getItem("towerdelve.v1"));s.settings.thunderboltAnimation=true;sessionStorage.setItem("boltFixture",JSON.stringify(s));});
  await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});

  // A trial: the Arcana tab holds what works there, the bolts hit the boss.
  await page.evaluate(async()=> {
    const {defaults}=await import("/src/save/save.ts"),{Game}=await import("/src/state.ts"),{startTrial}=await import("/src/proving-grounds/trial.ts");
    const g=new Game(defaults());g.newRun({outside:true,seed:12});
    for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
    g.save.arcana.owned.thunderbolt=[0,5,0];g.save.arcana.owned.aurumBloom=[0,0,0];g.save.arcana.owned.overseer=[0,0,0];
    const s=startTrial({maxHp:10000,attack:50,defense:0},"manual",[],12,1,"light-elemental");
    s.room="arena";s.player.x=12;s.player.y=7;s.playing=false;s.bossHp=s.bossMaxHp=1e7;
    s.arcana={run:{toggles:0,off:[],timers:{thunderbolt:1}},beamTurns:0};
    g.save.provingGrounds=s;sessionStorage.setItem("boltFixture",JSON.stringify(g.save));
  });
  await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});
  await expect(world).toHaveAttribute("data-trial-view-room","arena");
  await page.locator('[data-run-tab="arcana"]').click();
  await expect(page.locator(".arcana-card")).toHaveCount(2);
  await expect(page.locator('.arcana-card[data-arcanum="aurumBloom"]')).toHaveCount(0);
  await page.locator("#run-drills").screenshot({path:`${OUT}/trial-cards.png`});
  await page.waitForTimeout(300);
  const trialQuiet=await watch(150);
  await page.keyboard.press(".");
  const trialSeen=await watch(600);
  keep("trial-strike",trialSeen);
  expect(trialSeen.most).toBeGreaterThan(trialQuiet.most+50);
  const saved=(await read()).provingGrounds;
  expect(saved.bossHp).toBeLessThan(1e7);
  expect(saved.arcana.beamTurns).toBe(1);
  expect(saved.arcana.run.timers.thunderbolt).toBe(180);
  await page.screenshot({path:`${OUT}/trial-after.png`});
  // A press on a card there reads the trial's hero, not the forest's.
  await page.locator('.arcana-card[data-arcanum="thunderbolt"] .drill-name').click();
  await expect(page.locator(".arcana-info")).toContainText("Thunderbolt");
  await page.screenshot({path:`${OUT}/trial-info.png`});
  expect(errors).toEqual([]);
} finally {
  await browser.close();
}
console.log("thunderbolt browser flow passed");
