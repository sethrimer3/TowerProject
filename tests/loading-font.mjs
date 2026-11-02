import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
const server=await createServer({server:{host:'127.0.0.1',port:5199},logLevel:'error'});await server.listen();
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 let releaseFont,releaseArt;
 const fontGate=new Promise(r=>releaseFont=r),artGate=new Promise(r=>releaseArt=r);
 await page.route('**/TowerPixel-Regular.woff2',async r=>{await fontGate;await r.continue()});
 await page.route('**/assets/style/ad-screen.png',async r=>{await artGate;await r.continue()});
 await page.goto(server.resolvedUrls.local[0],{waitUntil:'domcontentloaded'});
 await page.locator('#boot-loading').waitFor();
 assert.equal(await page.locator('#boot-message').isVisible(),false,'no fallback loading text during delayed font');
 assert.equal(await page.locator('#boot-loading h1').isVisible(),false,'title also waits for pixel face');
 assert.equal(await page.locator('#app').isVisible(),false);
 releaseFont();
 await page.locator('#boot-loading.font-ready').waitFor();
 assert.ok(await page.locator('#boot-message').isVisible(),'loading text appears before artwork completes');
 assert.ok(await page.evaluate(()=>document.fonts.check('15px "Tower Pixel"')));
 for(const selector of ['#boot-message','#boot-loading h1','#boot-retry'])assert.match(await page.locator(selector).evaluate(e=>getComputedStyle(e).fontFamily),/^"Tower Pixel"/);
 assert.equal(await page.locator('#app').isVisible(),false,'font ready does not bypass artwork barrier');
 releaseArt();
 await page.locator('#boot-loading').waitFor({state:'detached',timeout:30000});
 assert.ok(await page.locator('#app').isVisible());
 // A permanently unavailable font still exposes the existing recovery action.
 const failed=await browser.newPage();
 await failed.addInitScript(()=>sessionStorage.setItem('towerdelve.bootRetries','2'));
 await failed.route('**/TowerPixel-Regular.woff2',r=>r.abort());
 await failed.goto(server.resolvedUrls.local[0],{waitUntil:'domcontentloaded'});
 await failed.locator('#boot-retry').waitFor({state:'visible'});
 assert.equal(await failed.locator('#app').isVisible(),false);
 assert.match(await failed.locator('#boot-message').textContent(),/Unable to load/);
 console.log('Loading text waits for Tower Pixel, appears while artwork is pending, and font failures retain Retry.');
} finally {await browser.close();await server.close();}
