// Phantasm in the real app (node tests/phantasm.mjs, dev server running): the ghosts'
// pixels and their alpha in the Tower and a trial, the Toggles' two controls, its card
// and a real activation; review images in test-results/phantasm/.
import {chromium,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

const OUT="test-results/phantasm";
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:"reduce"});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{const s=sessionStorage.getItem("phantasmFixture");if(s){localStorage.setItem("towerdelve.v1",s);sessionStorage.removeItem("phantasmFixture");}});
  const world=page.locator("#world");
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});

  /** A fresh run holding Phantasm, its state `phantasm`, its ghosts drawn at `alpha`. */
  async function inside(phantasm,alpha=0.5) {
    await page.evaluate(async({phantasm,alpha})=> {
      const {defaults}=await import("/src/save/save.ts"),{Game}=await import("/src/state.ts");
      const g=new Game(defaults());g.newRun({seed:21});
      for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
      g.save.upgrades.onTheJob=1;
      g.save.settings.phantasmAlpha=alpha;
      g.save.arcana.owned.phantasm=[3,1,0];
      g.run.phantasm=phantasm;
      sessionStorage.setItem("phantasmFixture",JSON.stringify(g.save));
    },{phantasm,alpha});
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
  /** The pixels of a box round (u, v), fractions of the board: small enough that the torches' flicker stays out of it. */
  const box=(u,v)=>world.evaluate((c,[u,v])=>{
    const copy=document.createElement("canvas");copy.width=c.width;copy.height=c.height;
    const d=copy.getContext("2d",{willReadFrequently:true});d.drawImage(c,0,0);
    const size=Math.round(c.width*0.05);
    return Array.from(d.getImageData(Math.round(c.width*u-size/2),Math.round(c.height*v-size/2),size,size).data);
  },[u,v]);
  const ring={timer:100,turns:30,ring:4,ghosts:[0,1,2,3]};

  // None out: nothing shows. Out: they change the board, more when more solid; at alpha 0, not at all.
  // The hero stands near the board's foot: the first ghost rides up and right of it, the last up and left.
  const spots=[[0.53,0.92],[0.45,0.94]];
  const boxes=async()=>Promise.all(spots.map(([u,v])=>box(u,v)));
  await inside({timer:100,turns:30});
  await world.screenshot({path:`${OUT}/tower-none.png`});
  const none=await boxes();
  await inside(ring);
  await world.screenshot({path:`${OUT}/tower-half.png`});
  const half=await boxes();
  await inside(ring,1);
  await world.screenshot({path:`${OUT}/tower-solid.png`});
  const solid=await boxes();
  await inside(ring,0);
  const hidden=await boxes();
  spots.forEach((_,i)=> {
    console.log(`ghost ${i}: half ${moved(none[i],half[i])}, solid ${moved(half[i],solid[i])}, alpha 0 ${moved(none[i],hidden[i])}`);
    expect(moved(none[i],half[i])).toBeGreaterThan(100);
    expect(moved(half[i],solid[i])).toBeGreaterThan(100);
    expect(moved(none[i],hidden[i])).toBe(0);
  });

  // The card: its cooldown's bar and its attributes.
  await inside(ring);
  await page.locator('[data-run-tab="arcana"]').click();
  const card=page.locator('.arcana-card[data-arcanum="phantasm"]');
  await expect(card.locator(".arcana-cooldown span")).toHaveText("100");
  await card.locator(".drill-name").click();
  const modal=page.locator("dialog[open]");
  for(const name of ["ATK Mult","Quantity","Cooldown"])await expect(modal.getByRole("cell",{name,exact:true})).toBeVisible();
  await modal.screenshot({path:`${OUT}/card.png`});
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  // A real turn with its cooldown running out brings the ghosts.
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")).tower.run.phantasm);
  await inside({timer:1,turns:30});
  await page.locator("#hand .hand-card").first().click();
  await page.waitForTimeout(700);
  await world.screenshot({path:`${OUT}/tower-fired.png`});
  await expect.poll(async()=>(await read())?.ring??0,{timeout:5000}).toBe(4);

  // The Toggles menu holds the toggle and the slider, and the slider saves.
  await page.evaluate(()=>document.getElementById("auto-settings").click());
  await page.locator("#toggles-open").click();
  await expect(page.locator("#phantasm-damage")).toBeChecked();
  const slider=page.locator("#phantasm-alpha");
  await expect(slider).toHaveValue("0.5");
  await page.locator("#settings").screenshot({path:`${OUT}/toggles.png`});
  await slider.fill("0.25");
  await expect(page.locator("#phantasm-alpha-value")).toHaveText("0.25");
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")).settings.phantasmAlpha)).toBe(0.25);

  // Unowned, neither shows.
  await page.evaluate(async()=> {
    const {defaults}=await import("/src/save/save.ts"),{Game}=await import("/src/state.ts");
    const g=new Game(defaults());g.newRun({seed:21});
    for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
    sessionStorage.setItem("phantasmFixture",JSON.stringify(g.save));
  });
  await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});
  await page.evaluate(()=>document.getElementById("auto-settings").click());
  await page.locator("#toggles-open").click();
  await expect(page.locator("#toggles-back")).toBeVisible();
  await expect(page.locator("#phantasm-damage")).toHaveCount(0);
  await expect(page.locator("#phantasm-alpha")).toHaveCount(0);

  // A trial's arena, with its ghosts out and with none.
  async function trial(phantasm) {
    await page.evaluate(async(phantasm)=> {
      const {defaults}=await import("/src/save/save.ts"),{Game}=await import("/src/state.ts"),{startTrial}=await import("/src/proving-grounds/trial.ts");
      const g=new Game(defaults());g.newRun({outside:true,seed:12});
      for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
      g.save.arcana.owned.phantasm=[3,1,0];
      const s=startTrial({maxHp:10000,attack:50,defense:0},"manual",[],12,1,"keymaster");
      s.room="arena";s.player.x=12;s.player.y=7;s.playing=false;s.bossHp=s.bossMaxHp=1e7;
      s.arcana={run:{toggles:0,off:[],timers:{}},beamTurns:0,phantasm};
      g.save.provingGrounds=s;sessionStorage.setItem("phantasmFixture",JSON.stringify(g.save));
    },phantasm);
    await page.reload({waitUntil:"domcontentloaded"});await expect(world).toBeVisible({timeout:30000});
    await expect(world).toHaveAttribute("data-trial-view-room","arena");
    await page.waitForTimeout(600);
  }
  await trial({timer:100,turns:30});
  const clear=await pixels(),calm=moved(clear,await pixels());
  await trial(ring);
  await world.screenshot({path:`${OUT}/trial.png`});
  const inTrial=moved(clear,await pixels());
  console.log("Trial pixels the ghosts changed:",inTrial,"of",calm,"at rest");
  expect(inTrial).toBeGreaterThan(calm+30);
  expect(errors).toEqual([]);
  console.log("Phantasm browser checks passed; review images in",OUT);
} finally {
  await browser.close();
}
