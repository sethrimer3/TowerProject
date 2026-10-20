import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { defaults, decode } from "../src/save.ts";
import { SQUARE_DOORS, squareDoorSprite } from "../src/sprite-options.ts";
import { paintContents, paintTorch } from "../src/tile-painters.ts";
import type { Tile, Torch } from "../src/entities.ts";

test("sprite sub-options are opt-in and preserve independent preferences through save reload", () => {
  for (const key of ["spriteAnimations", "squareDoors"] as const) {
    assert.equal(defaults().settings[key], false);
    assert.equal(decode(JSON.stringify({ version: 3, settings: { [key]: "true" } })).settings[key], false);
    const save = defaults(); save.settings[key] = true;
    for (const uiSprites of [false, true]) {
      save.settings.uiSprites = uiSprites;
      assert.equal(decode(JSON.stringify(save)).settings[key], true);
    }
  }
});

test("all six tile-sized door PNGs and the four-frame native torch strip ship", () => {
  for (const id of [...SQUARE_DOORS.map(kind => `square-door-${kind}`), "torch-animation"]) {
    const png = readFileSync(new URL(`../public/assets/style/${id}.png`, import.meta.url));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [id === "torch-animation" ? 96 : 24, 24]);
  }
  const door = (rule: Tile["door"]) => squareDoorSprite({ kind: "door", door: rule });
  assert.equal(door({ type: "keys", keys: ["yellow"], mode: "all" }), "square-door-yellow");
  assert.equal(door({ type: "keys", keys: ["blue", "red"], mode: "all", heart: true }), "square-door-steel");
  assert.equal(door({ type: "keys", keys: ["yellow"], mode: "any" }), "square-door-steel");
  assert.equal(door({ type: "fullHp" }), "square-door-heart");
  assert.equal(door({ type: "wood", durability: 10 }), "square-door-wood");
});

test("square-door toggles retain every lock mark and torch animations freeze for reduced motion", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "Image");
  class ReadyImage { src = ""; complete = true; naturalWidth = 96; naturalHeight = 24; }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ReadyImage });
  const calls: [string, ...number[]][] = [];
  const c = new Proxy({}, { set: () => true, get: (_, key) => key === "drawImage"
    ? (image: ReadyImage, ...args: number[]) => calls.push([image.src.split("/").at(-1)!, ...args]) : () => {} }) as CanvasRenderingContext2D;
  try {
    const tile: Tile = { kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "all", heart: true } };
    const art = { x: 0, y: 0, time: 0, spritesOff: false, reduceMotion: false, area1: false, styledSprites: true };
    paintContents(c, tile, { ...art, squareDoors: true });
    assert.deepEqual(calls.map(c => c[0]), ["square-door-steel.png", "heart.png", "key-yellow.png", "key-blue.png", "key-red.png"]);
    calls.length = 0; paintContents(c, tile, art); assert.equal(calls[0][0], "door-wood.png");
    const torch = { x: 2, y: 4 } as Torch;
    const frame = (now: number, reduced: boolean, animated: boolean) => {
      calls.length = 0; paintTorch(c, torch, now, reduced, false, true, animated); return [...calls[0]];
    };
    assert.equal(frame(0, false, false)[0], "torch.png");
    assert.equal(frame(0, false, true)[0], "torch-animation.png");
    assert.notDeepEqual(frame(0, false, true), frame(130, false, true));
    assert.deepEqual(frame(0, true, true), frame(130, true, true));
  } finally {
    if (previous) Object.defineProperty(globalThis, "Image", previous); else Reflect.deleteProperty(globalThis, "Image");
  }
});
