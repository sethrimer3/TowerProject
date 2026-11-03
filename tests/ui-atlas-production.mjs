// Run with node --experimental-transform-types tests/ui-atlas-production.mjs after npm run build.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preview} from 'vite';
import {chromium} from '@playwright/test';
import {defaults} from '../src/save/save.ts';
import {Game} from '../src/state.ts';
const manifest=JSON.parse(readFileSync('public/assets/atlases/ui.json')),packed=new Set(Object.keys(manifest.regions));
const save=defaults();Object.keys(save.tutorials).forEach(k=>save.tutorials[k]=true);
Object.assign(save.settings,{experimentalAtlas:true,reduceMotion:true,weatherSound:false});Object.assign(save.upgrades,{combatStance:1,buildout:1});
const game=new Game(save);game.newRun({outside:true,seed:7});
const mount='/TowerProject/';
const server=await preview({base:mount,preview:{host:'127.0.0.1',port:5192,strictPort:true},logLevel:'error'});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true});
try{
 const page=await browser.newPage(),requests=[],errors=[];
 page.on('request',r=>requests.push(new URL(r.url()).pathname.replace(mount,'')));
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 await page.addInitScript(raw=>{localStorage.setItem('towerdelve.v1',raw);globalThis.__handHeld=true;globalThis.__handStartsPaused=true},JSON.stringify(game.save));
 await page.goto(server.resolvedUrls.local[0]);await page.locator('#hp').waitFor({timeout:30000});
 await page.locator('[data-tab="deck"]').click();
 assert.ok(await page.locator('.atlas-region').count()>10);
 assert.equal(requests.filter(p=>p===manifest.image).length,1);
 assert.deepEqual(requests.filter(p=>packed.has(p)),[]);
 assert.deepEqual(errors,[]);
 console.log('Production /TowerProject/ path uses one atlas with no packed-original requests or load errors.');
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve))}
