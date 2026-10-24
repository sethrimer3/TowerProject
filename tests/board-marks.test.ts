import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_MARK_SPRITES, drawBoardMark } from "../src/sprites/board-marks.ts";
import type { FrameContext } from "../src/render/render-frame.ts";

test("board marks keep native density and preserve loading/off fallbacks", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const images: LoadingImage[] = [], draws: unknown[][] = [];
  class LoadingImage {
    src = ""; complete = false; naturalWidth = 0;
    constructor() { images.push(this); }
  }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: LoadingImage });
  const c = { save() {}, restore() {}, imageSmoothingEnabled: true, drawImage(...args: unknown[]) { draws.push(args); } };
  const f = { c, s: 48, look: { styledSprites: false } } as unknown as FrameContext;
  try {
    assert.equal(drawBoardMark(f, "target", 100, 200), false); assert.equal(images.length, 0);
    f.look.styledSprites = true;
    for (const kind of Object.keys(BOARD_MARK_SPRITES) as (keyof typeof BOARD_MARK_SPRITES)[]) {
      assert.equal(drawBoardMark(f, kind, 100, 200), false);
      const img = images.at(-1)!; img.complete = true; img.naturalWidth = BOARD_MARK_SPRITES[kind].size;
      assert.equal(drawBoardMark(f, kind, 100, 200), true);
      const side = img.naturalWidth * 2;
      assert.deepEqual(draws.at(-1)!.slice(1), [100 - side / 2, 200 - side / 2, side, side]);
      assert.equal(c.imageSmoothingEnabled, false);
    }
  } finally {
    if (original) Object.defineProperty(globalThis, "Image", original);
    else Reflect.deleteProperty(globalThis, "Image");
  }
});
