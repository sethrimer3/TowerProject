import {chromium,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {fixClock} from "./fixed-clock.mjs";
import {openMenu} from "./run-menu.mjs";

const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await fixClock(page);const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{const s=sessionStorage.getItem("cameraFixture");if(s){localStorage.setItem("towerdelve.v1",s);sessionStorage.removeItem("cameraFixture");}});
  const world=page.locator("#world"),read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")));
  const trial=async()=>(await read()).provingGrounds;
  async function fixture(id="light-elemental",mode="manual",x=8,y=8) {
    await page.evaluate(async({id,mode,x,y})=> {
      const {defaults}=await import("/src/save/save.ts"),{Game}=await import("/src/state.ts"),{startTrial}=await import("/src/proving-grounds/trial.ts");
      const g=new Game(defaults());g.newRun({outside:true,seed:12});
      for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
      const s=startTrial({maxHp:10000,attack:10,defense:0},mode,["bossEnemy"],12,1,id);
      s.room="arena";s.player.x=x;s.player.y=y;s.playing=false;
      g.save.provingGrounds=s;sessionStorage.setItem("cameraFixture",JSON.stringify(g.save));
    },{id,mode,x,y});
    await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});
    await expect(world).toHaveAttribute("data-trial-view-room","arena");
    await expect(world).toHaveAttribute("data-trial-camera-moving","false");
  }
  async function tile(x,y) {
    await expect(world).toHaveAttribute("data-trial-camera-moving","false");
    const v=await world.evaluate(c=>({left:+c.dataset.trialViewLeft,bottom:+c.dataset.trialViewBottom})),b=await world.boundingBox();
    await world.click({position:{x:(x+.5-v.left)/17*b.width,y:(v.bottom+17-y-.5)/17*b.height}});
  }
  async function settings(transition,reduce) {
    await openMenu(page);await page.locator("#auto-settings").click();
    if(transition)await page.locator("#transition").selectOption(transition);
    if(reduce!==undefined)await page.locator("#motion").setChecked(reduce);
    await page.locator("#settings-back").click();await expect(world).toBeVisible();
  }
  mkdirSync("test-results/trial-camera",{recursive:true});
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});
  await fixture("keymaster","manual",12,2);
  await page.locator(".shell").screenshot({path:"test-results/trial-camera/entry-controls.png"});await tile(12,3);
  await expect.poll(async()=>(await trial()).player.y).toBe(3);expect((await trial()).keymaster.useKeys).toBe(true);
  await fixture();expect((await read()).settings.transition).toBe("smooth");
  await tile(8,14);
  const frames=await world.evaluate(async c=> {
    const out=[];for(let i=0;i<120;i++) {
      await new Promise(requestAnimationFrame);
      out.push({bottom:+c.dataset.trialViewBottom,hero:+c.dataset.trialHeroY});
    }return out;
  });
  expect(frames.some(p=>Math.abs(p.hero-Math.round(p.hero))>.01)).toBe(true);
  expect(frames.some(p=>Math.abs(p.bottom-Math.round(p.bottom))>.01)).toBe(true);
  expect((await trial()).player.y).toBe(14);
  await expect(world).toHaveAttribute("data-trial-camera-moving","false");
  expect(+(await world.getAttribute("data-trial-view-bottom"))).toBeGreaterThan(0);
  for(const width of [320,390,1024]) {
    await page.setViewportSize({width,height:844});await page.locator(".shell").screenshot({path:`test-results/trial-camera/follow-${width}.png`});
  }
  await page.setViewportSize({width:390,height:844});await fixture("light-elemental","manual",10,10);
  await tile(16,10);await expect.poll(async()=>Number(await world.getAttribute("data-trial-view-left"))%1).not.toBe(0);
  // Capture the actual visible view at pointer-up, before the trial handler.
  await page.evaluate(()=>window.addEventListener("pointerup",e=> {
    const c=document.querySelector("#world"),b=c.getBoundingClientRect();
    window.cameraClicked={x:Math.floor(+c.dataset.trialViewLeft+(e.clientX-b.left)/b.width*17),y:Math.ceil(+c.dataset.trialViewBottom+(1-(e.clientY-b.top)/b.height)*17)-1};
  },{once:true,capture:true}));
  const b=await world.boundingBox();await world.click({position:{x:b.width/2,y:b.height/2}});
  const clicked=await page.evaluate(()=>window.cameraClicked);
  await expect.poll(async()=>{const p=(await trial()).player;return {x:p.x,y:p.y};}).toEqual(clicked);
  await expect(world).toHaveAttribute("data-trial-camera-moving","false");
  await settings("instant");let p=(await trial()).player;await page.keyboard.press("ArrowUp");
  await expect.poll(async()=>(await trial()).player.y).toBe(p.y+1);
  await expect.poll(async()=>Number(await world.getAttribute("data-trial-hero-y"))).toBe(p.y+1);
  expect(Number(await world.getAttribute("data-trial-view-bottom"))).toBe(p.y+1-8);
  expect((await read()).settings.transition).toBe("instant");
  await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});
  expect((await read()).settings.transition).toBe("instant");
  await settings("fast");await page.keyboard.press("ArrowDown");await expect(world).toHaveAttribute("data-trial-camera-moving","true");
  await expect(world).toHaveAttribute("data-trial-camera-moving","false");
  await settings("smooth",true);p=(await trial()).player;await page.keyboard.press("ArrowLeft");
  await expect.poll(async()=>Number(await world.getAttribute("data-trial-hero-x"))).toBe(p.x-1);
  await expect(world).toHaveAttribute("data-trial-camera-moving","false");
  await fixture("keymaster","cards");await page.locator("#auto").click();
  await expect.poll(async()=>(await trial()).steps,{timeout:10000}).toBeGreaterThanOrEqual(2);
  await page.locator("#auto").click();const step=(await trial()).steps;
  await expect(world).toHaveAttribute("data-trial-camera-moving","false");expect((await trial()).steps).toBe(step);
  for(const name of ["data-trial-view-left","data-trial-view-bottom"]) {
    const n=Number(await world.getAttribute(name));expect(n>=-4 && n<=12).toBe(true);
  }
  await page.locator("#trial-leave").click();await expect(world).not.toHaveAttribute("data-trial-view-left");
  expect(errors).toEqual([]);
  console.log("Trial camera: Smooth by default, real hero/camera interpolation, fractional-view clicks, live Fast/Off/Reduce motion and persistence, bounded arenas, card autoplay, cleanup and 320/390/1024px passed.");
} finally {await browser.close();}
