import {chromium,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {fixClock} from "./fixed-clock.mjs";
import {openMenu} from "./run-menu.mjs";

const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
let releaseHero;
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await fixClock(page);const errors=[];page.on("pageerror",e=>errors.push(e.message));
  const heroGate=new Promise(resolve=>releaseHero=resolve);
  await page.route("**/assets/style/hero-down.png",async route=>{await heroGate;await route.continue();});
  await page.addInitScript(()=> {
    const fixture=sessionStorage.getItem("trialSpritesFixture");
    if(fixture){localStorage.setItem("towerdelve.v1",fixture);sessionStorage.removeItem("trialSpritesFixture");}
    window.__trialImages=new Set();
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(image,...args) {
      if(this.canvas.id==="world" && this.canvas.dataset.trialMode && image instanceof HTMLImageElement)window.__trialImages.add(new URL(image.src).pathname);
      return draw.call(this,image,...args);
    };
  });
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});
  const world=page.locator("#world");
  async function attach() {
    await expect(world).toHaveAttribute("data-trial-mode","manual");
  }
  async function scene(settings={},room="staging") {
    await page.evaluate(async({settings,room})=> {
      const {Game}=await import("/src/state.ts"),{defaults}=await import("/src/save.ts");
      const {startTrial}=await import("/src/proving-grounds/trial.ts");
      const g=new Game(defaults());g.newRun({outside:true,seed:12});
      Object.assign(g.save.settings,{uiSprites:true,reduceMotion:true},settings);
      g.save.themes.push("neonUi","neonGame");
      for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
      const s=startTrial({maxHp:1000,attack:10,defense:0},"manual",g.hand,12,30);
      if(room==="arena"){s.room=room;s.player.x=12;s.player.y=4;s.elemental.x=12;s.elemental.y=7;s.steps=9;}
      g.save.provingGrounds=s;sessionStorage.setItem("trialSpritesFixture",JSON.stringify(g.save));
    },{settings,room});
    await page.reload({waitUntil:"domcontentloaded"});await attach();
  }
  const drawn=()=>page.evaluate(()=>[...window.__trialImages]);
  const image=async id=>await expect.poll(drawn).toContain(`/assets/style/${id}.png`);
  const png=()=>world.evaluate(c=>c.toDataURL());
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")));
  const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  async function clear(){await page.evaluate(()=>window.__trialImages.clear());await frames();}
  await scene();await image("stairs");await image("dungeon-floor-masonry-0");
  expect((await drawn()).includes("/assets/style/hero-down.png")).toBe(false);
  // The legacy hero remains visible while the PNG is deliberately delayed.
  expect(await world.evaluate(c=>c.getContext("2d").getImageData(192,192,24,24).data.some((v,i)=>i%4!==3&&v>0))).toBe(true);
  releaseHero();await image("hero-down");
  const literal=await page.evaluate(async()=> {
    const target=document.getElementById("world").getContext("2d");
    return await Promise.all([["hero-down",192,192],["stairs",192,96]].map(async([id,x,y])=> {
      const image=new Image();image.src=`./assets/style/${id}.png`;await image.decode();
      const ref=document.createElement("canvas");ref.width=ref.height=24;ref.getContext("2d").drawImage(image,0,0);
      const expected=ref.getContext("2d").getImageData(0,0,24,24).data,actual=target.getImageData(x,y,24,24).data;
      let opaque=0,mismatch=0;
      for(let i=0;i<expected.length;i+=4)if(expected[i+3]===255){opaque++;if(expected[i]!==actual[i]||expected[i+1]!==actual[i+1]||expected[i+2]!==actual[i+2])mismatch++;}
      return {id,opaque,mismatch};
    }));
  });
  for(const item of literal){expect(item.opaque).toBeGreaterThan(30);expect(item.mismatch).toBe(0);}
  const before=await png(),attempt=(await read()).provingGrounds;
  async function toggle(id,on) {
    await openMenu(page);await page.locator("#auto-settings").click();
    await page.locator(`#${id}`).setChecked(on);await page.locator("#settings-back").click();await clear();
  }
  await toggle("ui-sprites",false);expect(await png()).not.toBe(before);
  expect((await drawn()).some(url=>url.startsWith("/assets/style/hero-"))).toBe(false);
  await toggle("ui-sprites",true);await image("hero-down");expect(await png()).toBe(before);
  await toggle("sprites-off",true);expect(await png()).not.toBe(before);
  await toggle("sprites-off",false);await image("hero-down");expect(await png()).toBe(before);
  expect((await read()).provingGrounds).toEqual(attempt);
  await page.keyboard.press("ArrowRight");await image("hero-right");
  await scene({uiTheme:"neon"});await image("hero-down");
  await scene({gameTheme:"neon"});await frames();
  expect((await drawn()).some(url=>url.startsWith("/assets/style/hero-"))).toBe(false);
  await scene({spriteAnimations:true},"arena");
  for(const id of ["hero-down","crate","potion-blue","torch-animation","dungeon-floor-masonry-0"])await image(id);
  mkdirSync("test-results/trial-sprites",{recursive:true});
  for(const width of [320,390,1024]) {
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator(".shell").screenshot({path:`test-results/trial-sprites/enabled-${width}.png`});
  }
  await page.locator('[data-trial-move="0,0"]').click();
  expect((await read()).provingGrounds.destroyed["12,1"]).toBe(10);
  await page.evaluate(()=> {
    const save=JSON.parse(localStorage.getItem("towerdelve.v1"));save.provingGrounds.steps=49;save.provingGrounds.elemental.x=11;
    sessionStorage.setItem("trialSpritesFixture",JSON.stringify(save));
  });
  await page.reload({waitUntil:"domcontentloaded"});await attach();
  await page.locator('[data-trial-move="0,0"]').click();await image("crate-broken");
  expect((await read()).provingGrounds.destroyed["11,1"]).toBe(50);
  expect(errors).toEqual([]);
  console.log("Trial sprites: actual PNG hero/stairs/terrain/props, literal native texels, delayed loading, live settings and exact restoration, hero facing, independent themes, 320/390/1024px and destroyed-prop sprites passed.");
} finally {releaseHero?.();await browser.close();}
