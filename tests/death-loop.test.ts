import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { deathLoopFrame, DEATH_LOOP } from '../src/ui/death-loop.ts';
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
  assert.equal(deathLoopFrame(reveal + DEATH_LOOP.fade / 2).opacity, 0.5);
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
