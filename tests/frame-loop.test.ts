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

test("an encounter can own the shared board without ordinary drawing or automove",()=> {
  const frames:((time:number)=>void)[]=[];
  const g=globalThis as any;
  g.requestAnimationFrame=(f:(time:number)=>void)=>frames.push(f);g.document={hidden:false};
  let trial=0,ordinary=0;
  const host={tab:()=>"tower",boardFrame:()=>{trial++;return true;},
    renderer:{draw:()=>ordinary++},game:{auto:true,autoTurn:()=>ordinary++},
    purse:()=>{},highlight:()=>{},archivesTick:()=>{},save:()=>{}} as unknown as FrameLoopHost;
  new FrameLoop(host).start();
  for(const time of [100,200,300])frames.shift()!(time);
  assert.equal(trial,3);assert.equal(ordinary,0);
});

/** Runs the frame loop for `seconds` on a display of `hz`, Automove playing
 * at `rate` steps a second, with Battery saver on or off, and counts the
 * turns taken and the frames drawn. Timers and display frames run on one
 * fake clock: a display frame comes at the next refresh after it is asked for. */
function playFor(seconds: number, hz: number, rate: number, batterySaver = false) {
  const g = globalThis as any, period = 1000 / hz;
  let now = 0;
  const queue: { at: number; run: () => void }[] = [];
  // Refreshes are counted, not summed, so rounding never asks for the same one twice.
  const nextRefresh = (t: number) => (Math.floor(t / period + 1e-6) + 1) * period;
  const realNow = performance.now, realTimeout = g.setTimeout, realClear = g.clearTimeout;
  Object.defineProperty(performance, "now", { value: () => now, configurable: true, writable: true });
  g.requestAnimationFrame = (f: (time: number) => void) => queue.push({ at: nextRefresh(now), run: () => f(now) });
  g.setTimeout = (f: () => void, wait: number) => { const t = { at: now + wait, run: f }; queue.push(t); return t; };
  g.clearTimeout = (t: object) => { const i = queue.indexOf(t as never); if (i >= 0) queue.splice(i, 1); };
  g.document = { hidden: false, documentElement: { style: { setProperty() {} } } };
  let turns = 0, frames = 0;
  const game = {
    auto: true, paused: false, lessonHolds: false, fallen: false, fights: {}, route: [], moveRate: rate,
    save: { settings: { batterySaver, batteryWhite: 100 } }, autoTurn: () => turns++,
  };
  const host = {
    tab: () => "tower", game, modal: { open: false }, renderer: { draw: () => frames++, isIdle: () => true, hush() {} },
    purse() {}, highlight() {}, update() {}, archivesTick() {}, save() {},
  } as unknown as FrameLoopHost;
  try {
    new FrameLoop(host).start();
    while (queue.length) {
      queue.sort((a, b) => a.at - b.at);
      const next = queue.shift()!;
      if (next.at > seconds * 1000) break;
      now = next.at;
      next.run();
    }
  } finally {
    Object.defineProperty(performance, "now", { value: realNow, configurable: true, writable: true });
    g.setTimeout = realTimeout;
    g.clearTimeout = realClear;
  }
  return { turns, frames };
}

test("Automove keeps its rate on any display: each turn falls due an interval after the last fell due", () => {
  for (const [hz, rate] of [[60, 9], [60, 15], [30, 15], [120, 11], [60, 7]] as const) {
    const { turns } = playFor(10, hz, rate);
    assert.ok(Math.abs(turns - rate * 10) <= 1, `${rate} steps a second at ${hz} Hz took ${turns} turns in 10 s`);
  }
});

test("Battery saver draws a frame for every turn Automove takes, however fast it plays", () => {
  for (const [hz, rate] of [[60, 15], [60, 9], [30, 15], [60, 3]] as const) {
    const { turns, frames } = playFor(10, hz, rate, true);
    assert.ok(Math.abs(turns - rate * 10) <= 1, `${rate} steps a second at ${hz} Hz took ${turns} turns in 10 s`);
    assert.ok(frames >= turns, "a frame drawn for each turn");
    assert.ok(frames < hz * 10 * 0.6, `and still well under the display's rate (${frames} frames)`);
  }
});
