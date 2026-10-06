import { test } from "node:test";
import assert from "node:assert/strict";
import { FrameLoop, type FrameLoopHost } from "../src/frame-loop.ts";

test("an error in one part of a frame never stops the loop, research or saving", () => {
  const frames: ((time: number) => void)[] = [];
  const g = globalThis as any;
  g.requestAnimationFrame = (f: (time: number) => void) => frames.push(f);
  g.document = { hidden: false };
  const errors: unknown[] = [], reportError = console.error;
  console.error = (e: unknown) => errors.push(e);
  let ticks = 0, saves = 0;
  const fail = () => {
    throw new Error("broken page");
  };
  const host = {
    tab: () => "research",
    researchFrame: fail,
    archivesTick: () => {
      ticks++;
      fail();
    },
    save: () => saves++,
  } as unknown as FrameLoopHost;
  try {
    new FrameLoop(host).start();
    for (let time = 500; time <= 20_500; time += 500) frames.shift()!(time);
  } finally {
    console.error = reportError;
  }
  assert.equal(frames.length, 1, "the next frame is always asked for");
  assert.equal(ticks, 13, "the Archives tick every 1.5 s of these frames all along");
  assert.equal(saves, 1, "and the game autosaves");
  assert.ok(errors.length > 0, "errors are reported");
});
