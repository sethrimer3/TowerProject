// Lifespring in the real app (node tests/lifespring.mjs, dev server running): the
// rings on the Tower's board, spinning, blue on a new activation, and the card's
// tables; review images in test-results/lifespring/.
import {chromium,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

const OUT="test-results/lifespring";
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{const s=sessionStorage.getItem("springFixture");if(s){localStorage.setItem("towerdelve.v1",s);sessionStorage.removeItem("springFixture");}});
  const world=page.locator("#world");
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});

  /** A fresh run holding Lifespring with `spring` as its state. */
  async function inside(spring) {
    await page.evaluate(async(spring)=> {
      const {defaults}=await import("/src/save/save.ts"),{Game}=await import("/src/state.ts");
      const g=new Game(defaults());g.newRun({seed:21});
      for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
      g.save.upgrades.onTheJob=1;
      g.save.arcana.owned.lifespring=[3,1,0];
      g.run.lifespring=spring;
      sessionStorage.setItem("springFixture",JSON.stringify(g.save));
    },spring);
    await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});
    await page.waitForTimeout(800);
  }
  /** The board's pixels. */
  const pixels=()=>world.evaluate(c=>{
    const copy=document.createElement("canvas");copy.width=c.width;copy.height=c.height;
    const d=copy.getContext("2d",{willReadFrequently:true});d.drawImage(c,0,0);
    return Array.from(d.getImageData(0,0,c.width,c.height).data.filter((_,i)=>i%16<4));
  });
  const moved=(a,b)=>a.reduce((n,v,i)=>n+(Math.abs(v-b[i])>6?1:0),0);

  await inside({timer:100,pool:5000});
  await world.screenshot({path:`${OUT}/green.png`});
  const first=await pixels();
  await page.waitForTimeout(500);
  await world.screenshot({path:`${OUT}/green-later.png`});
  const later=await pixels();
  const spun=moved(first,later);
  console.log("pixels changed as the rings spun:",spun);
  expect(spun).toBeGreaterThan(50);
  await inside({timer:100,pool:5000,tint:3});
  await world.screenshot({path:`${OUT}/blue.png`});

  // The card's tables.
  await inside({timer:100,pool:5000,health:25});
  await page.locator('[data-run-tab="arcana"]').click();
  const card=page.locator('.arcana-card[data-arcanum="lifespring"]');
  await expect(card.locator(".arcana-cooldown span")).toHaveText("100");
  await card.locator(".drill-name").click();
  const modal=page.locator("dialog[open]");
  for(const name of ["HP Pool","Health Bonus","Damage Amplification","Gold Bonus","Cell Bonus","DEF Reduction"])await expect(modal.getByRole("cell",{name,exact:true})).toBeVisible();
  await modal.screenshot({path:`${OUT}/card.png`});
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  // Max HP's card shows how far Health Bonus has raised it.
  await page.locator('[data-run-group="defense"]').click();
  await page.locator('[data-drill="hp"] .drill-name').click();
  await expect(page.locator("#drill-tip")).toContainText("Lifespring ×1.25 of ×5");

  // Real turns: a wave's ring as the cooldown runs out, then the rings as they form.
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")).tower.run.lifespring);
  // Only the hand moves the hero inside a climb: pressing its card takes the turns.
  const play=()=>page.locator("#hand .hand-card").first().click();
  await inside({timer:1});
  await play();
  await page.waitForTimeout(150);
  await world.screenshot({path:`${OUT}/wave.png`});
  await page.waitForTimeout(1200);
  const waved=await read();
  console.log("after the cooldown ran out:",waved);
  expect(waved.timer).toBeGreaterThan(1);
  await inside({timer:100,wait:1});
  await play();
  await page.waitForTimeout(150);
  await world.screenshot({path:`${OUT}/forming.png`});
  await page.waitForTimeout(1200);
  const formed=await read();
  console.log("after the field formed:",formed);
  expect(formed.pool).toBeGreaterThan(0);

  // The Toggles row shows once it is held.
  await page.evaluate(()=>document.querySelector("#auto-settings").click());
  await page.locator("#toggles-open").click();
  await expect(page.getByText("Lifespring damage on enemies")).toBeVisible();
  expect(errors).toEqual([]);
  console.log("ok");
} finally {
  await browser.close();
}
