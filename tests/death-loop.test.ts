import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { deathLoopFrame, DEATH_LOOP } from '../src/ui/death-loop.ts';
import { infinityPixels, infinityPixelAt, infinityPixelLight } from '../src/ui/infinity-pixels.ts';
import { Renderer } from '../src/render/rendering.ts';
import { decodePng } from '../tools/ui-atlas-png.mjs';

test('death loop draws once, holds the complete symbol, then reveals the world', () => {
  assert.equal(deathLoopFrame(0).phase, 'fade-in');
  assert.equal(deathLoopFrame(0).opacity, 0);
  assert.equal(deathLoopFrame(DEATH_LOOP.fadeIn / 2).opacity, 0.5);
  assert.equal(deathLoopFrame(DEATH_LOOP.fadeIn / 2).frame, 0);
  assert.equal(deathLoopFrame(DEATH_LOOP.fadeIn).phase, 'black');
  assert.equal(deathLoopFrame(DEATH_LOOP.fadeIn).opacity, 1);
  assert.equal(deathLoopFrame(0).frame, 0);
  assert.equal(deathLoopFrame(1000).phase, 'drawing');
  assert.ok(deathLoopFrame(1000).frame > 0 && deathLoopFrame(1000).frame < 47);
  assert.equal(deathLoopFrame(DEATH_LOOP.fadeIn + 2000).frame, 47);
  assert.equal(deathLoopFrame(DEATH_LOOP.fadeIn + 2000).reveal, false);
  const reveal = DEATH_LOOP.fadeIn + DEATH_LOOP.lead + DEATH_LOOP.draw + DEATH_LOOP.hold;
  assert.deepEqual([deathLoopFrame(reveal).reveal, deathLoopFrame(reveal).opacity], [true, 1]);
  assert.equal(deathLoopFrame(reveal).phase, 'burst');
  assert.equal(deathLoopFrame(reveal + DEATH_LOOP.burst).opacity, 1);
  assert.equal(deathLoopFrame(reveal + DEATH_LOOP.burst).phase, 'absorb');
  assert.equal(deathLoopFrame(reveal + DEATH_LOOP.burst + DEATH_LOOP.pull / 2).opacity, 0.5);
  assert.deepEqual([deathLoopFrame(reveal + DEATH_LOOP.fade).done, deathLoopFrame(reveal + DEATH_LOOP.fade).opacity], [true, 0]);
});

test('reduced motion uses a brief still infinity sign', () => {
  assert.equal(deathLoopFrame(0, true).opacity, 0);
  assert.equal(deathLoopFrame(40, true).opacity, 0.5);
  assert.equal(deathLoopFrame(40, true).frame, 0);
  for (const time of [80, 100, 319]) {
    assert.equal(deathLoopFrame(time, true).frame, 47);
    assert.equal(deathLoopFrame(time, true).reveal, false);
  }
  assert.equal(deathLoopFrame(320, true).reveal, true);
  assert.equal(deathLoopFrame(480, true).done, true);
});

test('the native drawing sheet starts empty and ends in a pale complete infinity', () => {
  const { width, height, pixels } = decodePng(readFileSync(new URL('../public/assets/style/death-infinity.png', import.meta.url)));
  assert.deepEqual([width, height], [768, 240]);
  const counts = [];
  for (let frame = 0; frame < 48; frame++) {
    let count = 0;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 96; x++) {
      const at = ((Math.floor(frame / 8) * 40 + y) * width + frame % 8 * 96 + x) * 4;
      assert.ok(pixels[at + 3] === 0 || pixels[at + 3] === 255);
      if (!pixels[at + 3]) continue;
      count++;
      assert.deepEqual([...pixels.subarray(at, at + 4)], [238, 224, 183, 255]);
      if (frame === 47) assert.ok(x >= 3 && x < 93 && y >= 3 && y < 37, 'finished art keeps native padding');
    }
    counts.push(count);
  }
  assert.equal(counts[0], 0);
  assert.ok(counts[47] > 180 && counts[47] < 900);
  assert.ok(counts[12] < counts[24] && counts[24] < counts[36] && counts[36] < counts[47]);
});


test('half the visible texels become reproducible particles and reach the exact spawn', () => {
  const rgba = [238,224,183,255, 0,0,0,0, 238,224,183,255, 255,255,255,255];
  const pixels = infinityPixels(rgba, 2);
  assert.equal(pixels.length, 2);
  assert.deepEqual(pixels, infinityPixels(rgba, 2));
  assert.equal(pixels[0].color, 'rgb(238, 224, 183)');
  for (const scale of [2,3,4]) for (const target of [{x:10,y:700}, {x:900,y:150}]) for (const pixel of pixels) {
    const origin = {x:30,y:100};
    assert.deepEqual(infinityPixelAt(pixel, origin, scale, target, 0, 0), {x:origin.x+pixel.x*scale,y:origin.y+pixel.y*scale,alpha:1});
    const scattered = infinityPixelAt(pixel, origin, scale, target, 1, 0);
    assert.ok(Math.hypot(scattered.x-origin.x-pixel.x*scale, scattered.y-origin.y-pixel.y*scale)>10*scale);
    assert.deepEqual(infinityPixelAt(pixel, origin, scale, target, 1, 1), {...target,alpha:0});
    const midway = infinityPixelAt(pixel, origin, scale, target, 1, .75);
    assert.ok(Math.hypot(midway.x-target.x,midway.y-target.y) < Math.hypot(scattered.x-target.x,scattered.y-target.y));
    assert.ok(midway.alpha>0 && midway.alpha<1);
  }
});

test('spawn destination measures the new board and its camera offset after responsive resizing', () => {
  let box = {left:100,top:200,width:340,height:340};
  const renderer = {canvas:{getBoundingClientRect:()=>box},density:17,target:()=>({left:3,bottom:5}),game:{run:{player:{x:11,y:5}}}};
  const measure = () => Renderer.prototype.heroClientPoint.call(renderer as unknown as Renderer);
  assert.deepEqual(measure(), {x:270,y:530});
  box = {left:400,top:20,width:510,height:510};
  assert.deepEqual(measure(), {x:655,y:515});
});


test('absorption progressively warms ivory to gold and increases its glow', () => {
  assert.deepEqual(infinityPixelLight(0), {color:'rgb(238, 224, 183)',glow:0});
  assert.deepEqual(infinityPixelLight(1), {color:'rgb(255, 196, 64)',glow:1});
  for (const t of [.25,.5,.75]) assert.equal(infinityPixelLight(t).glow, t);
});


test('particle opacity follows the approach and is exactly zero at the destination', () => {
  const pixel = {x:0,y:0,dx:0,dy:0,curl:0,delay:0,color:'white'};
  const origin = {x:0,y:0}, target = {x:1000,y:0};
  let previous = 1;
  for (const pull of [0,.25,.5,.75,.9,.99,1]) {
    const p = infinityPixelAt(pixel,origin,1,target,1,pull);
    assert.ok(p.alpha <= previous, 'opacity never increases while approaching');
    previous = p.alpha;
  }
  const half = infinityPixelAt(pixel,origin,1,target,1,Math.sqrt(.5));
  assert.ok(Math.abs(half.x-500)<1e-9);
  assert.ok(half.alpha<=.251,'the fade is already visible halfway to the player');
  assert.ok(infinityPixelAt(pixel,origin,1,target,1,.99).alpha < .001,'overlapping pixels become faint before arrival');
  assert.deepEqual(infinityPixelAt(pixel,origin,1,target,1,1), {...target,alpha:0});
});
