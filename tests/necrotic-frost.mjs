// Necrotic Frost in the real app (node tests/necrotic-frost.mjs, dev server running):
// the field's shade, two rings and bubbles under what stands on the floor, in the Tower
// and two trials, the Settings toggle, its card, a real activation and the Necro tag;
// review images in test-results/necrotic-frost/.
import {chromium,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

const OUT="test-results/necrotic-frost";
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{const s=sessionStorage.getItem("frostFixture");if(s){localStorage.setItem("towerdelve.v1",s);sessionStorage.removeItem("frostFixture");}});
  const world=page.locator("#world");
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});

  /** A fresh run holding Necrotic Frost, its state `frost`. */
  async function inside(frost) {
    await page.evaluate(async(frost)=> {
      const {defaults}=await import("/src/save/save.ts"),{Game}=await import("/src/state.ts");
      const g=new Game(defaults());g.newRun({seed:21});
      for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
      g.save.upgrades.onTheJob=1;
      g.save.arcana.owned.necroticFrost=[3,1,0];
      g.run.necroticFrost=frost;
      sessionStorage.setItem("frostFixture",JSON.stringify(g.save));
    },frost);
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

  // No field: nothing of it shows. A field, then two: each changes more of the board.
  await inside({timer:100});
  await world.screenshot({path:`${OUT}/tower-none.png`});
  const none=await pixels();
  await inside({timer:100,casts:1,fields:[{id:1,angle:9000,left:20}]});
  await world.screenshot({path:`${OUT}/tower-field.png`});
  const one=await pixels(),changed=moved(none,one);
  console.log("Tower pixels one field changed:",changed);
  expect(changed).toBeGreaterThan(200);
  // The bubbles keep moving by themselves, with no turn taken.
  await page.waitForTimeout(500);
  const later=await pixels();
  console.log("Pixels the bubbles changed in half a second:",moved(one,later));
  expect(moved(one,later)).toBeGreaterThan(5);
  await inside({timer:100,casts:2,fields:[{id:1,angle:9000,left:20},{id:2,angle:21000,left:20}]});
  await world.screenshot({path:`${OUT}/tower-two.png`});
  expect(moved(none,await pixels())).toBeGreaterThan(changed);

  // The rings' colours and the shade, painted alone on a blank canvas.
  const painted=await page.evaluate(async()=> {
    const {paintFrostField}=await import("/src/render/effects/necrotic-frost.ts");
    const canvas=document.createElement("canvas");canvas.width=canvas.height=200;
    const c=canvas.getContext("2d",{willReadFrequently:true});
    paintFrostField(c,100,100,80,4,24,0,1,true);
    const at=(x,y)=>Array.from(c.getImageData(x,y,1,1).data);
    return {center:at(100,100),outer:at(180,100),inner:at(174,100),outside:at(190,100)};
  });
  console.log("Painted:",JSON.stringify(painted));
  expect(painted.outside[3]).toBe(0);
  expect(Math.abs(painted.center[3]-51)).toBeLessThanOrEqual(1);
  expect(painted.center[2]).toBeGreaterThan(painted.center[1]);
  expect(painted.outer[1]).toBeGreaterThan(painted.outer[0]);
  expect(painted.outer[1]).toBeGreaterThan(painted.outer[2]);
  expect(painted.inner[2]).toBeGreaterThan(painted.inner[1]);

  // The card: its cooldown's bar, its damage and its attributes.
  await inside({timer:100,casts:1,fields:[{id:1,angle:9000,left:20}]});
  await page.locator('[data-run-tab="arcana"]').click();
  const card=page.locator('.arcana-card[data-arcanum="necroticFrost"]');
  await expect(card.locator(".arcana-cooldown span")).toHaveText("100");
  await card.locator(".drill-name").click();
  const modal=page.locator("dialog[open]");
  for(const name of ["ATK Mult","Duration","Cooldown"])await expect(modal.getByRole("cell",{name,exact:true})).toBeVisible();
  await modal.screenshot({path:`${OUT}/card.png`});
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  // The Toggles menu holds its toggle, and it saves.
  await page.evaluate(()=>document.getElementById("auto-settings").click());
  await page.locator("#toggles-open").click();
  await expect(page.locator("#necro-damage")).toBeChecked();
  await page.locator("#settings").screenshot({path:`${OUT}/toggles.png`});
  await page.locator("#necro-damage").uncheck();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")).settings.necroDamage)).toBe(false);

  // Unowned, it doesn't show.
  await page.evaluate(()=> {
    const save=JSON.parse(localStorage.getItem("towerdelve.v1"));delete save.arcana.owned.necroticFrost;
    sessionStorage.setItem("frostFixture",JSON.stringify(save));
  });
  await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});
  await page.evaluate(()=>document.getElementById("auto-settings").click());
  await page.locator("#toggles-open").click();
  await expect(page.locator("#toggles-back")).toBeVisible();
  await expect(page.locator("#necro-damage")).toHaveCount(0);

  // A real turn with its cooldown running out sets the field off.
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")).tower.run.necroticFrost);
  await inside({timer:1,casts:3});
  const before=await pixels();
  await page.locator("#hand .hand-card").first().click();
  await page.waitForTimeout(700);
  await world.screenshot({path:`${OUT}/tower-fired.png`});
  await expect.poll(async()=>(await read())?.fields?.length??0,{timeout:5000}).toBeGreaterThan(0);
  expect((await read()).casts).toBeGreaterThanOrEqual(4);
  expect(moved(before,await pixels())).toBeGreaterThan(200);

  // A trial's arena, with no darkness (Keymaster) and with it (Light Elemental).
  async function trial(id,fields) {
    await page.evaluate(async({id,fields})=> {
      const {defaults}=await import("/src/save/save.ts"),{Game}=await import("/src/state.ts"),{startTrial}=await import("/src/proving-grounds/trial.ts");
      const g=new Game(defaults());g.newRun({outside:true,seed:12});
      for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
      g.save.arcana.owned.necroticFrost=[3,1,0];
      const s=startTrial({maxHp:10000,attack:50,defense:0},"manual",[],12,1,id);
      s.room="arena";s.player.x=12;s.player.y=7;s.playing=false;s.bossHp=s.bossMaxHp=1e7;
      s.arcana={run:{toggles:0,off:[],timers:{}},beamTurns:0,frost:fields?{timer:100,casts:1,fields}:{timer:100}};
      g.save.provingGrounds=s;sessionStorage.setItem("frostFixture",JSON.stringify(g.save));
    },{id,fields});
    await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});
    await expect(world).toHaveAttribute("data-trial-view-room","arena");
    await page.waitForTimeout(600);
  }
  for(const id of ["keymaster","light-elemental"]) {
    await trial(id,null);
    const clear=await pixels();
    await trial(id,[{id:1,angle:4500,left:20}]);
    await world.screenshot({path:`${OUT}/trial-${id}.png`});
    const shown=moved(clear,await pixels());
    console.log(`${id} pixels the field changed:`,shown);
    expect(shown).toBeGreaterThan(100);
  }
  expect(errors).toEqual([]);
  console.log("Necrotic Frost browser checks passed; review images in",OUT);
} finally {
  await browser.close();
}
