import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HeroIdleAnimation, keyShineFrame, potionBubbleFrame, deathSkullFrame, HERO_FACINGS } from "../src/sprites/animations.ts";
import { paintContents, paintHero } from "../src/tile-painters.ts";
import { drawStruckDown, DEFEAT_MS } from "../src/render/effects/struck-down.ts";
import type { FrameContext } from "../src/render-frame.ts";

test("ambient strips use native frames and every required facing ships", () => {
  for (const [id, frames] of [["ambient-potion-bubbles", 5], ["ambient-key-shine", 5], ["ambient-death-skull", 6], ...HERO_FACINGS.map(facing => [`ambient-hero-${facing}`, 4])] as [string, number][]) {
    const bytes = readFileSync(new URL(`../public/assets/style/${id}.png`, import.meta.url));
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [frames * 24, 24]);
  }
});

test("pickup animations are repeatable, staggered and quiet, with key glints visible less than three percent of the time", () => {
  const sample = (fn: typeof keyShineFrame, x: number, y: number) => Array.from({ length: 3600 }, (_, i) => fn(x, y, i * 100, 47));
  const keys = sample(keyShineFrame, -3, 8), potions = sample(potionBubbleFrame, -3, 8);
  assert.deepEqual(keys, sample(keyShineFrame, -3, 8));
  assert.notDeepEqual(keys, sample(keyShineFrame, 4, 9));
  assert.notDeepEqual(potions, sample(potionBubbleFrame, 4, 9));
  assert.ok(keys.filter(Boolean).length / keys.length < .03);
  assert.ok(potions.filter(Boolean).length / potions.length < .23);
  assert.deepEqual(new Set(keys), new Set([0, 1, 2, 3, 4]));
  assert.deepEqual(new Set(potions), new Set([0, 1, 2, 3, 4]));
});

test("hero idle waits, animates, and resets on movement, combat, facing or toggles", () => {
  const idle = new HeroIdleAnimation();
  assert.equal(idle.frame(1000, true, "down@1,2"), 0);
  assert.equal(idle.frame(1699, true, "down@1,2"), 0);
  assert.equal(idle.frame(2020, true, "down@1,2"), 1);
  assert.equal(idle.frame(2340, true, "down@1,2"), 2);
  assert.equal(idle.frame(2341, false, "down@1,2"), 0);
  assert.equal(idle.frame(2342, true, "down@1,2"), 0);
  assert.equal(idle.frame(4000, true, "up@1,2"), 0);
  assert.equal(idle.frame(4400, true, "up@1,3"), 0);
  assert.equal(deathSkullFrame(280, true), 2);
  assert.equal(deathSkullFrame(2000, true), 5);
  assert.equal(deathSkullFrame(2000, false), 0);
});

test("the actual painters gate pickup, hero and death frames and retain static and legacy fallbacks", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  class ReadyImage { src = ""; complete = true; naturalWidth = 144; naturalHeight = 24; }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ReadyImage });
  const calls: (string | number)[][] = [];
  const c = new Proxy({}, { set: () => true, get: (_, key) => key === "drawImage"
    ? (image: ReadyImage, ...args: number[]) => calls.push([image.src.split("/").at(-1)!, ...args])
    : key === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {} }) as CanvasRenderingContext2D;
  try {
    const tile = { kind: "key" as const, color: "blue" as const };
    let time = 0; while (!keyShineFrame(1, 2, time, 47) && time < 40000) time += 50;
    const art = { x: 1, y: 2, time, seed: 47, spritesOff: false, reduceMotion: false, area1: false, styledSprites: true, spriteAnimations: true };
    paintContents(c, tile, art);
    assert.deepEqual(calls.map(call => call[0]), ["key-blue.png", "ambient-key-shine.png"]);
    for (const override of [{ spriteAnimations: false }, { reduceMotion: true }, { lifted: true }]) {
      calls.length = 0; paintContents(c, tile, { ...art, ...override });
      assert.deepEqual(calls.map(call => call[0]), ["key-blue.png"]);
    }
    calls.length = 0; paintHero(c, false, true, { dx: -1, dy: 0 }, 2);
    assert.equal(calls[0][0], "ambient-hero-left.png"); assert.equal(calls[0][1], 48);
    calls.length = 0; paintHero(c, false, true, { dx: -1, dy: 0 }); assert.equal(calls[0][0], "hero-left.png");
    const f = { c, look: { styledSprites: true, spritesOff: false, reduceMotion: false, spriteAnimations: true }, playerX: 1, playerY: 2, left: 0, bottom: 0, n: 3, s: 24 } as FrameContext;
    calls.length = 0; drawStruckDown(f, 280); assert.equal(calls[0][0], "ambient-death-skull.png"); assert.equal(calls[0][1], 48);
    f.look.reduceMotion = true; calls.length = 0; drawStruckDown(f, 280); assert.equal(calls[0][1], 0);
    f.look.reduceMotion = false; f.look.spriteAnimations = false; calls.length = 0; drawStruckDown(f, 280); assert.equal(calls[0][1], 0);
    calls.length = 0; drawStruckDown(f, DEFEAT_MS); assert.equal(calls.length, 0);
    f.look.styledSprites = false; calls.length = 0; drawStruckDown(f, 280); assert.equal(calls.length, 0, "legacy skull stays procedural");
  } finally {
    if (original) Object.defineProperty(globalThis, "Image", original); else Reflect.deleteProperty(globalThis, "Image");
  }
});
