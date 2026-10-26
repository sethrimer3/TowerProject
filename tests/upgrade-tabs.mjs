// Actual skill-tree selectors, including every Dev tree on narrow phones.
import {chromium,expect} from "@playwright/test";
import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {fixClock} from "./fixed-clock.mjs";

const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH} : {channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"})});
const out="test-results/upgrade-tabs";mkdirSync(out,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:320,height:844},deviceScaleFactor:1});
  await fixClock(page);const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=> {
    globalThis.__handHeld=true;globalThis.__handStartsPaused=true;
    const fixture=sessionStorage.getItem("upgradeTabsFixture");
    if(fixture){localStorage.setItem("towerdelve.v1",fixture);sessionStorage.removeItem("upgradeTabsFixture");}
  });
  const ready=async()=>{
    await page.locator("#boot-loading").waitFor({state:"hidden",timeout:120000});
    await expect(page.locator("#world")).toBeVisible({timeout:30000});
  };
  await page.goto(process.env.TEST_URL||"http://127.0.0.1:5173/",{waitUntil:"domcontentloaded"});
  await ready();
  const fixture=await page.evaluate(async()=> {
    const {Game}=await import("/src/state.ts"),{defaults}=await import("/src/save/save.ts");
    const g=new Game(defaults());g.setDevMode(true);
    for(const id of Object.keys(g.save.tutorials))g.save.tutorials[id]=true;
    g.save.settings.reduceMotion=true;g.newRun({outside:true,seed:7});
    return g.save;
  });
  async function open(theme,dev=true) {
    await page.evaluate(({fixture,theme,dev})=> {
      fixture.settings.uiTheme=theme;fixture.settings.devMode=dev;
      fixture.tower.inspiration=123456789;fixture.breakthrough=987654321;
      sessionStorage.setItem("upgradeTabsFixture",JSON.stringify(fixture));
    },{fixture,theme,dev});
    await page.reload({waitUntil:"domcontentloaded"});await ready();
    await page.addStyleTag({content:".research-toast { display:none!important }"});
    await page.locator('[data-tab="upgrades"]').click();
  }
  async function layout() {
    return page.evaluate(async()=> {
      const {TREES}=await import("/src/progression/skill-trees.ts");
      const names=Object.fromEntries(TREES.map(t=>[t.id,t.name]));
      const rect=r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height});
      const tabs=document.querySelector('[aria-label="Skill trees"]');
      return {tabs:rect(tabs.getBoundingClientRect()),overflow:document.documentElement.scrollWidth>innerWidth,
        viewport:rect(document.querySelector("#tree-viewport").getBoundingClientRect()),
        buttons:[...tabs.querySelectorAll("[data-tree]")].map(b=> {
          const walk=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);let node;
          while((node=walk.nextNode()) && node.textContent.trim()!==names[b.dataset.tree]){}
          if(!node)throw Error(`Missing tree name: ${b.dataset.tree}`);
          const range=document.createRange();range.selectNodeContents(node);
          const points=b.querySelector("small"),pointRange=document.createRange();
          if(points)pointRange.selectNodeContents(points);
          return {id:b.dataset.tree,box:rect(b.getBoundingClientRect()),label:rect(range.getBoundingClientRect()),
            lines:range.getClientRects().length,icon:rect(b.querySelector("img").getBoundingClientRect()),
            points:points?{...rect(points.getBoundingClientRect()),lines:pointRange.getClientRects().length}:null};
        })};
    });
  }
  function readable(s) {
    assert.equal(s.overflow,false,"the page must fit the viewport");
    assert.ok(s.viewport.height>=80,"tree map must retain usable room");
    for(const b of s.buttons) {
      assert.ok(b.box.height<=96,`${b.id}: selector grew to ${b.box.height}px`);
      assert.equal(b.lines,1,`${b.id}: name wraps into ${b.lines} lines`);
      assert.ok(b.label.left>=b.box.left+3 && b.label.right<=b.box.right-3,`${b.id}: label clipped by its button`);
      assert.ok(b.label.top>=b.icon.bottom+3,`${b.id}: name must be below the icon`);
      assert.ok(Math.abs((b.label.left+b.label.right-b.icon.left-b.icon.right)/2)<=1,`${b.id}: icon and name must be centered`);
      assert.ok(b.box.left>=s.tabs.left && b.box.right<=s.tabs.right+.5,`${b.id}: button overflows selector`);
      if(b.points) {
        assert.equal(b.points.lines,1,`${b.id}: points wrap into ${b.points.lines} lines`);
        assert.ok(b.points.right<=b.box.right-3 && b.points.bottom<=b.box.bottom-3,`${b.id}: points clipped`);
      }
    }
  }
  await open("medieval");
  for(const [width,height] of [[320,844],[390,844],[570,844],[647,844],[768,1024],[1024,844],[844,390]]) {
    await page.setViewportSize({width,height});
    await expect(page.locator("[data-tree]")).toHaveCount(6);
    await page.locator('[data-tree="renown"]').click();
    await page.locator("#upgrades").screenshot({path:`${out}/medieval-${width}x${height}.png`});
    readable(await layout());
    for(const id of ["inspiration","breakthrough","wayfinding","legacy","wisdom","renown"]) {
      await page.locator(`[data-tree="${id}"]`).click();
      await expect(page.locator(`[data-tree="${id}"]`)).toHaveAttribute("aria-pressed","true");
      await expect(page.locator(".tree-heading h3")).toContainText(id==="wayfinding"?"Wayfinding":id[0].toUpperCase()+id.slice(1));
      readable(await layout());
    }
  }
  for(const theme of ["classic","desktop","terminal"]) {
    await page.setViewportSize({width:320,height:844});await open(theme);
    readable(await layout());await page.locator("#upgrades").screenshot({path:`${out}/${theme}-320.png`});
  }
  await open("medieval",false);readable(await layout());
  assert.deepEqual(errors,[]);
  console.log("Upgrade tree selectors: single-line labels below centered icons, icons/points inside buttons, all six selections, responsive wrapping, short landscape, normal/Dev and four UI themes passed.");
} finally {await browser.close();}
