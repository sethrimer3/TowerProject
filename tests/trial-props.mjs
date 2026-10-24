import {chromium,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {fixClock} from "./fixed-clock.mjs";

const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await fixClock(page);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=> {
    const fixture=sessionStorage.getItem("trialPropsFixture");
    if(fixture){localStorage.setItem("towerdelve.v1",fixture);sessionStorage.removeItem("trialPropsFixture");}
  });
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});
  const world=page.locator("#world"),wait=page.locator("#trial-wait");
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("towerdelve.v1")));
  async function scene(kind) {
    await page.evaluate(async(kind)=> {
      const {Game}=await import("/src/state.ts"),{defaults}=await import("/src/save/save.ts");
      const {startTrial,trialStep,propDestroyed}=await import("/src/proving-grounds/trial.ts");
      const g=new Game(defaults());g.newRun({outside:true,seed:12});
      for(const key of Object.keys(g.save.tutorials))g.save.tutorials[key]=true;
      g.save.settings.reduceMotion=true;

      const s=startTrial({maxHp:1000,attack:10,defense:0},"manual",g.hand,12,kind.startsWith("slime")?45:30);
      s.room="arena";s.player.x=12;s.player.y=4;s.elemental.x=12;s.elemental.y=16;
      if(kind==="lit" || kind==="dark") {
        s.steps=40;
        if(kind==="dark")s.destroyed["12,1"]=10;
      } else if(kind.startsWith("slime")) {
        const target={x:kind==="slimeTorch"?12:11,y:1},from={x:target.x,y:2};
        s.steps=2;s.slimes=[{id:1,...from,from:{...from},jumped:2}];
        let found=false;
        for(let seed=0;seed<500;seed++) {
          s.seed=seed;const copy=structuredClone(s);trialStep(copy,0,0);
          if(propDestroyed(copy,target)){found=true;break;}
        }
        if(!found)throw Error("No seed landed on the edge prop");
      } else {
        s.steps=9;s.elemental.x=kind==="beamCrate"?11:12;s.elemental.y=7;
      }
      g.save.provingGrounds=s;
      sessionStorage.setItem("trialPropsFixture",JSON.stringify(g.save));
    },kind);
    await page.reload({waitUntil:"domcontentloaded"});
    await expect(world).toHaveAttribute("data-trial-room","arena");
  }
  const brightness=()=>world.evaluate(canvas=> {
    // Floor tile (12,2), just above the torch at (12,1), with the hero at (12,4).
    const pixels=canvas.getContext("2d").getImageData(198,246,12,12).data;
    let sum=0;for(let i=0;i<pixels.length;i+=4)sum+=pixels[i]+pixels[i+1]+pixels[i+2];return sum;
  });
  mkdirSync("test-results/proving-grounds-props",{recursive:true});
  await scene("lit");
  await expect.poll(brightness).toBeGreaterThan(0);
  const lit=await brightness();
  for(const width of [320,1024]) {
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator(".shell").screenshot({path:`test-results/proving-grounds-props/edge-${width}.png`});
  }
  await scene("dark");
  // Wait for the first trial frame after the HUD attaches.
  await expect.poll(brightness).toBeGreaterThan(0);
  await expect.poll(brightness).toBeLessThan(lit*.75);
  await world.screenshot({path:"test-results/proving-grounds-props/torch-out.png"});
  for(const [kind,key] of [["beamTorch","12,1"],["beamCrate","11,1"],["slimeTorch","12,1"],["slimeCrate","11,1"]]) {
    await scene(kind);
    const before=await read();
    await wait.click();
    const saved=await read();
    expect(saved.provingGrounds.destroyed[key]).toBe(kind.startsWith("slime")?3:10);
    expect(saved.tower.run).toEqual(before.tower.run);
    expect(saved.provingGrounds.consumed).toEqual([]);
    await page.reload({waitUntil:"domcontentloaded"});
    await expect(world).toHaveAttribute("data-trial-room","arena");
    expect((await read()).provingGrounds.destroyed).toEqual(saved.provingGrounds.destroyed);
    await world.screenshot({path:`test-results/proving-grounds-props/${kind}.png`});
  }
  expect(errors).toEqual([]);
  console.log("Trial edge props: floor torches/crates/potions at 320/1024px, extinguished torch lighting, beam and slime destruction of both types, reload persistence and isolated Tower run passed.");
} finally {await browser.close();}
