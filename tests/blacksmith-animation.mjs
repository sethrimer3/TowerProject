import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
const server=await createServer({server:{host:'127.0.0.1',port:5194},logLevel:'error'});await server.listen();
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true});
mkdirSync('test-results/blacksmith',{recursive:true});
try{
 const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]);await page.locator('#hp').waitFor();
 const result=await page.evaluate(async()=>{
  const {drawBlacksmith}=await import('/src/outside.ts');
  const {drawBlacksmithMotion}=await import('/src/sprites/blacksmith.ts');
  const {forestSpriteScene}=await import('/tests/render-scenes.ts');
  const {Renderer}=await import('/src/render/rendering.ts');
  const canvas=document.createElement('canvas');canvas.width=360;canvas.height=400;canvas.style.cssText='position:fixed;left:0;top:0;width:360px;height:400px;z-index:99999';document.body.append(canvas);
  const c=canvas.getContext('2d');const pixels=()=>[...c.getImageData(0,0,360,400).data];
  const draw=(now,animate)=>{c.setTransform(1,0,0,1,0,0);c.fillStyle='#17251c';c.fillRect(0,0,360,400);c.setTransform(4,0,0,4,30,80-216*4);drawBlacksmith(c,6,true,now,animate);return pixels()};
  const still0=draw(0,false),still1=draw(1700,false);
  draw(0,true);const fire0=[...c.getImageData(174,254,36,36).data],sign0=[...c.getImageData(222,200,90,84).data];
  draw(170,true);const fire1=[...c.getImageData(174,254,36,36).data];
  draw(1800,true);const sign1=[...c.getImageData(222,200,90,84).data];
  const opacity=[];let alpha=1;
  const probe=new Proxy(c,{get(t,p){if(p==='drawImage')return(image,...args)=>{if(image.src?.endsWith('blacksmith-smoke.png'))opacity.push(alpha)};const v=t[p];return typeof v==='function'?v.bind(t):v},set(t,p,v){if(p==='globalAlpha')alpha=v;else t[p]=v;return true}});
  drawBlacksmithMotion(probe,0,0,1800);
  // Exercise the actual forest renderer and both saved motion preferences.
  const {g}=forestSpriteScene('tower');g.save.settings.reduceMotion=false;g.save.settings.spriteAnimations=true;
  const world=document.createElement('canvas'),renderer=new Renderer(world,g),ctx=world.getContext('2d');let animated=0,staticDraws=0;
  const original=ctx.drawImage.bind(ctx);ctx.drawImage=(image,...args)=>{if(image.src?.endsWith('blacksmith-fire.png'))animated++;if(image.src?.endsWith('/blacksmith.png'))staticDraws++;return original(image,...args)};
  renderer.draw(0);renderer.draw(170);const enabled=animated;
  g.save.settings.reduceMotion=true;renderer.draw(900);const reduced=animated,staticReduced=staticDraws;
  g.save.settings.reduceMotion=false;g.save.settings.spriteAnimations=false;renderer.draw(1300);
  draw(1800,true);
  return {still:JSON.stringify(still0)===JSON.stringify(still1),fire:JSON.stringify(fire0)!==JSON.stringify(fire1),wind:JSON.stringify(sign0)!==JSON.stringify(sign1),opacity,enabled,reduced,staticReduced,staticDraws};
 });
 assert.ok(result.still);assert.ok(result.fire);assert.ok(result.wind);
 assert.equal(result.opacity.length,3);assert.ok(result.opacity.every(a=>a>=0&&a<=.065));
 assert.ok(result.enabled>0);assert.equal(result.reduced,result.enabled);assert.ok(result.staticReduced>0);assert.ok(result.staticDraws>result.staticReduced);
 await page.screenshot({path:'test-results/blacksmith/preview.png'});
 console.log('Blacksmith fire, sign sway, faint smoke, static fallback, Animations and Reduce motion passed.');
}finally{await browser.close();await server.close();}
