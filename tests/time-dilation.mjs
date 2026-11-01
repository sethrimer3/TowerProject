// Time Dilation in the real app (node tests/time-dilation.mjs, dev server running):
// the field's disc and rim under what stands on the floor, in the Tower and three
// trials, its card and a real activation; review images in test-results/time-dilation/.
import {chromium,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

const OUT="test-results/time-dilation";
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{const s=sessionStorage.getItem("dilationFixture");if(s){localStorage.setItem("towerdelve.v1",s);sessionStorage.removeItem("dilationFixture");}});
  const world=page.locator("#world");
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});

  /** A fresh run holding Time Dilation, its state `dilation`. */
  async function inside(dilation) {
    await page.evaluate(async(dilation)=> {
      const {defaults}=await import("/src/save/save.ts"),{Game}=await import("/src/state.ts");
      const g=new Game(defaults());g.newRun({seed:21});
      for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
      g.save.upgrades.onTheJob=1;
      g.save.arcana.owned.timeDilation=[3,6,0];
      g.run.timeDilation=dilation;
      sessionStorage.setItem("dilationFixture",JSON.stringify(g.save));
    },dilation);
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

  // No field: nothing of it shows. A field: its disc and rim change the board.
  await inside({timer:100});
  await world.screenshot({path:`${OUT}/tower-none.png`});
  const none=await pixels();
  await inside({timer:100,left:6});
  await world.screenshot({path:`${OUT}/tower-field.png`});
  const field=await pixels(),changed=moved(none,field);
  console.log("Tower pixels the field changed:",changed);
  expect(changed).toBeGreaterThan(200);

  // The card: its cooldown's bar, its effect and its attributes.
  await page.locator('[data-run-tab="arcana"]').click();
  const card=page.locator('.arcana-card[data-arcanum="timeDilation"]');
  await expect(card.locator(".arcana-cooldown span")).toHaveText("100");
  await expect(card).toContainText("50% · 8 turns");
  await card.locator(".drill-name").click();
  const modal=page.locator("dialog[open]");
  for(const name of ["Duration","Slowdown","Cooldown"])await expect(modal.getByRole("cell",{name,exact:true})).toBeVisible();
  await modal.screenshot({path:`${OUT}/card.png`});
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  // A real turn with its cooldown running out sets the field off.
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")).tower.run.timeDilation);
  await inside({timer:1});
  const before=await pixels();
  await page.locator("#hand .hand-card").first().click();
  await page.waitForTimeout(700);
  await world.screenshot({path:`${OUT}/tower-fired.png`});
  await expect.poll(async()=>(await read())?.left??0,{timeout:5000}).toBeGreaterThan(0);
  expect(moved(before,await pixels())).toBeGreaterThan(200);

  // A trial's arena, with no darkness (Keymaster) and with it (Light Elemental).
  async function trial(id,left) {
    await page.evaluate(async({id,left})=> {
      const {defaults}=await import("/src/save/save.ts"),{Game}=await import("/src/state.ts"),{startTrial}=await import("/src/proving-grounds/trial.ts");
      const g=new Game(defaults());g.newRun({outside:true,seed:12});
      for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
      g.save.arcana.owned.timeDilation=[3,6,0];
      const s=startTrial({maxHp:10000,attack:50,defense:0},"manual",[],12,1,id);
      s.room="arena";s.player.x=12;s.player.y=7;s.playing=false;s.bossHp=s.bossMaxHp=1e7;
      s.arcana={run:{toggles:0,off:[],timers:{}},beamTurns:0,dilation:left?{timer:100,left}:{timer:100}};
      g.save.provingGrounds=s;sessionStorage.setItem("dilationFixture",JSON.stringify(g.save));
    },{id,left});
    await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});
    await expect(world).toHaveAttribute("data-trial-view-room","arena");
    await page.waitForTimeout(600);
  }
  for(const id of ["keymaster","light-elemental","obelisk"]) {
    await trial(id,0);
    const clear=await pixels();
    await trial(id,6);
    await world.screenshot({path:`${OUT}/trial-${id}.png`});
    const shown=moved(clear,await pixels());
    console.log(`${id} pixels the field changed:`,shown);
    expect(shown).toBeGreaterThan(100);
  }
  expect(errors).toEqual([]);
  console.log("Time Dilation browser checks passed; review images in",OUT);
} finally {
  await browser.close();
}
