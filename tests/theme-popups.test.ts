import { test } from "node:test";
import assert from "node:assert/strict";
import { BoardPopups } from "../src/board-popups.ts";
import { THEMED_BOARDS, type ThemedLook } from "../src/themed-boards.ts";
import { NEON } from "../src/neon-board.ts";
import { TERMINAL } from "../src/terminal-board.ts";
import { DESKTOP } from "../src/desktop-board.ts";
import { GLYPH } from "../src/glyph-board.ts";
import { EMBER } from "../src/ember-board.ts";
import { YANG, YIN } from "../src/zen-board.ts";
import { KURO, SHIRO } from "../src/bare-board.ts";
import type { FrameContext } from "../src/render-frame.ts";
import type { GainArt } from "../src/state.ts";

// A reward rising off a board drawn in a Game theme but Classic wears the
// theme's own art, not the sprites.

/** A context that records every colour it strokes and fills with, and the
 * text it writes. */
function recorder() {
  const strokes: string[] = [], fills: string[] = [], texts: string[] = [];
  const c = new Proxy({ fillText: (text: string) => texts.push(text) } as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => ({ width: 0 })),
    set: (t, k, v) => {
      if (k === "strokeStyle") strokes.push(String(v));
      if (k === "fillStyle") fills.push(String(v));
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { c, strokes, fills, texts };
}
// The classic sprites bake their outlines on offscreen canvases.
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => recorder().c }) };

function drawn(art: GainArt, look: ThemedLook | null) {
  const r = recorder(), popups = new BoardPopups();
  popups.update({ run: { seed: 1 }, gains: [{ x: 1, y: 1, text: "+1", art }], fight: null, lastHeal: null } as never, 0);
  const boardLook = { mode: "tower", height: 30, seed: 1, outside: false, entranceX: 8, spritesOff: true, reduceMotion: true, area1: false, themed: look && THEMED_BOARDS[look] };
  popups.draw({ c: r.c, now: 100, left: 0, bottom: 0, n: 17, s: 24, look: boardLook } as unknown as FrameContext);
  return r;
}
const strokesOf = (art: GainArt, neon: boolean) => drawn(art, neon ? "neon" : null).strokes;

test("a potion picked up on a Neon board rises as the neon potion", () => {
  const potion: GainArt = { tile: { kind: "potion", hp: 35 } as never };
  assert.ok(strokesOf(potion, true).includes(NEON.potion), "the neon potion's colour");
  assert.ok(!strokesOf(potion, false).includes(NEON.potion), "the classic board keeps its own art");
});

test("shards picked up on a Neon board rise as the neon shards", () => {
  assert.ok(strokesOf({ tile: { kind: "attack", amount: 1 } as never }, true).includes(NEON.attack));
  assert.ok(strokesOf({ tile: { kind: "defense", amount: 1 } as never }, true).includes(NEON.defense));
});

test("a Heart Door's toll on a Neon board rises as the neon heart", () => {
  assert.ok(strokesOf({ heart: true }, true).includes(NEON.heart));
});

test("a potion picked up on a Terminal board rises as its !, and on a Desktop board as its flask", () => {
  const potion: GainArt = { tile: { kind: "potion", hp: 35 } as never };
  assert.ok(drawn(potion, "terminal").texts.includes("!"));
  assert.ok(!drawn(potion, null).texts.includes("!"), "the classic board keeps its own art");
  assert.ok(drawn(potion, "desktop").fills.includes(DESKTOP.red));
});

test("a Heart Door's toll rises as each Game theme's heart", () => {
  const terminal = drawn({ heart: true }, "terminal");
  assert.ok(terminal.texts.includes("<3") && terminal.fills.includes(TERMINAL.heart));
  assert.ok(drawn({ heart: true }, "desktop").fills.includes(DESKTOP.red));
});

test("a potion picked up on a Glyph or Ember board rises as its glowing !", () => {
  const potion: GainArt = { tile: { kind: "potion", hp: 35 } as never };
  const glyph = drawn(potion, "glyph"), ember = drawn(potion, "ember");
  assert.ok(glyph.texts.includes("!") && glyph.fills.includes(GLYPH.red));
  assert.ok(ember.texts.includes("!") && ember.fills.includes(EMBER.cream));
});

test("a Heart Door's toll rises as the Glyph and Ember hearts", () => {
  for (const [look, color] of [["glyph", GLYPH.heart], ["ember", EMBER.heart]] as const) {
    const r = drawn({ heart: true }, look);
    assert.ok(r.texts.includes("<3") && r.fills.includes(color), look);
  }
});

test("a potion picked up on a Yang or Yin board rises as its tea bowl, a Heart Door's toll as its heart", () => {
  for (const [look, palette] of [["yang", YANG], ["yin", YIN]] as const) {
    assert.ok(drawn({ tile: { kind: "potion", hp: 35 } as never }, look).fills.includes(palette.moss), look);
    assert.ok(drawn({ heart: true }, look).strokes.includes(palette.heart), look);
  }
});

test("a potion picked up on a Shiro or Kuro board rises as its plus, a Heart Door's toll as its red square", () => {
  for (const [look, palette] of [["shiro", SHIRO], ["kuro", KURO]] as const) {
    assert.ok(drawn({ tile: { kind: "potion", hp: 35 } as never }, look).fills.includes(palette.heal), look);
    assert.ok(drawn({ heart: true }, look).strokes.includes(palette.heart), look);
  }
});
