// Regression: a fully packed atlas once reported 0/0 progress and poisoned
// the animated room's progress, leaving the game hidden forever.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
const server=await createServer({server:{host:'127.0.0.1',port:5196,strictPort:true},logLevel:'error'});
await server.listen();
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true});
try {
 const page=await browser.newPage();
 await page.goto(server.resolvedUrls.local[0]);
 await page.locator('#hp').waitFor({timeout:30000});
 const completed=await page.evaluate(async()=>{
  const {LoadingScreen}=await import('/src/ui/loading-screen.ts');
  const root=document.createElement('section');
  root.innerHTML='<canvas class="loading-stones"></canvas><canvas class="loading-torch"></canvas><canvas class="loading-room"></canvas>';
  document.body.append(root);
  const loading=new LoadingScreen(root,()=>false,7);
  loading.progress(0/0);
  await new Promise(requestAnimationFrame);
  loading.progress(Infinity);
  loading.progress(-Infinity);
  loading.progress(0.92);
  const done=await Promise.race([loading.complete().then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),5000))]);
  loading.stop();root.remove();return done;
 });
 assert.equal(completed,true,'normal-motion loading must finish after invalid progress followed by readiness');
 console.log('Loading screen completes after non-finite progress with normal animations.');
}finally{await browser.close();await server.close()}
