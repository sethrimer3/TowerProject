// Voidwell in the real app (node tests/voidwell.mjs, dev server running): the vortex's
// see-through dark blue and its slow spin on the board, in the Tower and a trial, its
// card's cooldown bar, and a real activation; review images in test-results/voidwell/.
import {chromium,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

const OUT="test-results/voidwell";
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{const s=sessionStorage.getItem("wellFixture");if(s){localStorage.setItem("towerdelve.v1",s);sessionStorage.removeItem("wellFixture");}});
  const world=page.locator("#world");
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});

  /** A fresh run holding Voidwell, its state `well` with the vortex `dx`, `dy` from the hero. */
  async function inside(well,at) {
    await page.evaluate(async({well,at})=> {
      const {defaults}=await import("/src/save/save.ts"),{Game}=await import("/src/state.ts");
      const g=new Game(defaults());g.newRun({seed:21});
      for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
      g.save.upgrades.onTheJob=1;
      g.save.arcana.owned.voidwell=[5,1,0];
      g.run.voidwell=at?{...well,vortex:{x:g.run.player.x+at.dx,y:g.run.player.y+at.dy,left:12,floor:g.run.height+1}}:well;
      sessionStorage.setItem("wellFixture",JSON.stringify(g.save));
    },{well,at});
    await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});
    await page.waitForTimeout(800);
  }
  /** The board's pixels, every fourth. */
  const pixels=()=>world.evaluate(c=>{
    const copy=document.createElement("canvas");copy.width=c.width;copy.height=c.height;
    const d=copy.getContext("2d",{willReadFrequently:true});d.drawImage(c,0,0);
    return Array.from(d.getImageData(0,0,c.width,c.height).data.filter((_,i)=>i%16<4));
  });
  const moved=(a,b)=>a.reduce((n,v,i)=>n+(Math.abs(v-b[i])>2?1:0),0);

  // No vortex: nothing of it shows. A vortex changes the board, and keeps turning by itself.
  await inside({timer:150},null);
  await world.screenshot({path:`${OUT}/tower-none.png`});
  const none=await pixels();
  await inside({timer:150,casts:1},{dx:0.5,dy:3});
  await world.screenshot({path:`${OUT}/tower-vortex.png`});
  const one=await pixels(),changed=moved(none,one);
  console.log("Tower pixels the vortex changed:",changed);
  expect(changed).toBeGreaterThan(200);
  await page.waitForTimeout(500);
  const later=await pixels();
  console.log("Pixels its spin changed in half a second:",moved(one,later));
  expect(moved(one,later)).toBeGreaterThan(5);

  // Its colours, painted alone on a blank canvas: see-through, dark, and blue; it turns slowly.
  const painted=await page.evaluate(async()=> {
    const {paintVortex}=await import("/src/render/effects/voidwell.ts");
    const canvas=document.createElement("canvas");canvas.width=canvas.height=200;
    const c=canvas.getContext("2d",{willReadFrequently:true});
    paintVortex(c,100,100,80,2,0,true);
    const at=(x,y)=>Array.from(c.getImageData(x,y,1,1).data);
    const first=Array.from(c.getImageData(0,0,200,200).data);
    c.clearRect(0,0,200,200);
    paintVortex(c,100,100,80,2,500,false);
    const turned=Array.from(c.getImageData(0,0,200,200).data).filter((v,i)=>Math.abs(v-first[i])>2).length;
    return {inner:at(120,140),outside:at(195,100),turned};
  });
  console.log("Painted:",JSON.stringify(painted));
  expect(painted.outside[3]).toBe(0);
  expect(painted.inner[3]).toBeGreaterThan(60);
  expect(painted.inner[3]).toBeLessThan(200);
  expect(painted.inner[2]).toBeGreaterThan(painted.inner[0]);
  expect(painted.inner[0]).toBeLessThan(70);
  expect(painted.turned).toBeGreaterThan(50);

  // The card: its cooldown's bar, and its attributes.
  await page.locator('[data-run-tab="arcana"]').click();
  const card=page.locator('.arcana-card[data-arcanum="voidwell"]');
  await expect(card.locator(".arcana-cooldown span")).toHaveText("150");
  await card.locator(".drill-name").click();
  const modal=page.locator("dialog[open]");
  for(const name of ["Size","Duration","Cooldown"])await expect(modal.getByRole("cell",{name,exact:true})).toBeVisible();
  await modal.screenshot({path:`${OUT}/card.png`});
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  // A real turn with its cooldown running out opens one.
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")).tower.run.voidwell);
  await inside({timer:1,casts:3},null);
  const before=await pixels();
  await page.locator("#hand .hand-card").first().click();
  await page.waitForTimeout(700);
  await world.screenshot({path:`${OUT}/tower-fired.png`});
  await expect.poll(async()=>(await read())?.casts??0,{timeout:5000}).toBeGreaterThanOrEqual(4);
  expect((await read()).vortex).toBeTruthy();
  expect(moved(before,await pixels())).toBeGreaterThan(200);

  // A trial's arena.
  async function trial(vortex) {
    await page.evaluate(async({vortex})=> {
      const {defaults}=await import("/src/save/save.ts"),{Game}=await import("/src/state.ts"),{startTrial}=await import("/src/proving-grounds/trial.ts");
      const g=new Game(defaults());g.newRun({outside:true,seed:12});
      for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
      g.save.arcana.owned.voidwell=[5,1,0];
      const s=startTrial({maxHp:10000,attack:50,defense:0},"manual",[],12,1,"keymaster");
      s.room="arena";s.player.x=12;s.player.y=7;s.playing=false;s.bossHp=s.bossMaxHp=1e7;
      s.arcana={run:{toggles:0,off:[],timers:{}},beamTurns:0,voidwell:vortex?{timer:100,casts:1,vortex}:{timer:100}};
      g.save.provingGrounds=s;sessionStorage.setItem("wellFixture",JSON.stringify(g.save));
    },{vortex});
    await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});
    await expect(world).toHaveAttribute("data-trial-view-room","arena");
    await page.waitForTimeout(600);
  }
  await trial(null);
  const clear=await pixels();
  await trial({x:12.5,y:10,left:12,floor:0});
  await world.screenshot({path:`${OUT}/trial.png`});
  const shown=moved(clear,await pixels());
  console.log("Trial pixels the vortex changed:",shown);
  expect(shown).toBeGreaterThan(100);
  expect(errors).toEqual([]);
  console.log("Voidwell browser checks passed; review images in",OUT);
} finally {
  await browser.close();
}
