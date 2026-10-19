import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boardFont, loadSpriteFont, onSpriteFontLoaded, spriteFontRevision } from "../src/sprite-font.ts";

test("the custom font is bundled and board text preserves the original look when off", () => {
  const font = readFileSync(new URL("../assets/fonts/TowerPixel/TowerPixel-Regular.woff2", import.meta.url));
  assert.equal(font.toString("ascii", 0, 4), "wOF2");
  assert.equal(font.readUInt32BE(8), font.length);
  assert.equal(boardFont(false, 13.2, "bold", "Cinzel, serif"), "bold 13.2px Cinzel, serif");
  assert.equal(boardFont(undefined, 17), "700 17px Cinzel");
  assert.equal(boardFont(true, 13.2), '700 13px "Tower Pixel", monospace');
});

test("one asynchronous font load invalidates text fitting after it is ready", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  let complete!: (faces: unknown[]) => void, requests = 0, notified = 0;
  Object.defineProperty(globalThis, "document", { configurable: true, value: { fonts: {
    load(font: string) { requests++; assert.equal(font, '16px "Tower Pixel"'); return new Promise(resolve => { complete = resolve; }); },
  } } });
  try {
    const before = spriteFontRevision(); onSpriteFontLoaded(() => notified++);
    const first = loadSpriteFont(), again = loadSpriteFont();
    assert.equal(first, again); assert.equal(requests, 1); assert.equal(notified, 0);
    complete([{}]); await first;
    assert.equal(spriteFontRevision(), before + 1); assert.equal(notified, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
