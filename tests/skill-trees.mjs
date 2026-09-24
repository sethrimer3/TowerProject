import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({headless:true,channel:'msedge'});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(() => { const fixture = sessionStorage.getItem("__treeFixture"); if (fixture) { localStorage.setItem("towerincramental.v1", fixture); sessionStorage.removeItem("__treeFixture"); } });
await page.goto('http://127.0.0.1:5173/');
await expect(page.locator('[data-tab="delve"]')).toBeHidden();
await page.locator('[data-tab="upgrades"]').click();
await page.locator('[data-skill="delve"]').click();
await expect(page.locator('#tree-tooltip')).toContainText('Into the depths');
await expect(page.locator('#upgrades')).not.toContainText('WHAT REMAINS WHEN YOU FALL');
await expect(page.locator('#upgrades')).not.toContainText('Tap a skill for details');
await expect(page.locator('.tree-heading')).not.toContainText(/INSPIRATION|COURAGE/);
await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('towerincramental.v1'));s.tower.shards=100;s.delve.essence=100;sessionStorage.setItem('__treeFixture',JSON.stringify(s));});
await page.reload();await page.locator('[data-tab="upgrades"]').click();
for(const id of ['shardHp','shardAttack','shardDefense','delve']) {await page.locator(`[data-skill="${id}"]`).click();await page.locator(`[data-skill="${id}"]`).click();}
await page.locator('[data-tree="courage"]').click();
await page.locator('[data-skill="auto"]').click();
await expect(page.locator('#tree-tooltip')).toContainText('Automove');
await page.locator('[data-skill="auto"]').click();
await page.screenshot({path:'test-results/courage-tree.png',fullPage:true});
for(const mode of ['tower','delve']) {await page.locator(`[data-tab="${mode}"]`).click();await expect(page.locator('#auto-state')).toHaveText('OFF');await page.locator('#auto').click();await expect(page.locator('#auto-state')).toHaveText('ON');await page.locator('#auto').click();}
await page.reload();await page.locator('[data-tab="upgrades"]').click();
await page.screenshot({path:'test-results/inspiration-tree.png',fullPage:true});
for(const width of [320,390,1280]) {await page.setViewportSize({width,height:1000});for(const tree of ['inspiration','courage','legacy','wisdom','renown']) {await page.locator(`[data-tree="${tree}"]`).click();if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('overflow '+tree+' '+width);if(await page.locator('#upgrades').evaluate(el=>el.scrollHeight>el.clientHeight)) throw Error('vertical scroll '+tree+' '+width);}}
await page.setViewportSize({width:390,height:844});await page.locator('[data-tree="inspiration"]').click();
const viewport=page.locator('#tree-viewport'), box=await viewport.boundingBox();
await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width+600,box.y+box.height+600);await page.mouse.up();
const pan=await page.locator('#tree-map').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform));
if(Math.abs(pan.e)>0.5||Math.abs(pan.f)>0.5) throw Error('tree can be panned out of view at default zoom');
if(errors.length) throw Error(errors.join('\n'));
await browser.close();console.log('Skill tree browser progression, persistence, shared automove, and responsive layout passed');
