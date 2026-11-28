import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { BoardPopups, countedAmount } from "../src/render/board-popups.ts";
import type { FrameContext } from "../src/render/render-frame.ts";
import type { Gain } from "../src/shown.ts";
import type { Tile } from "../src/entities.ts";

// What a pickup raises: an ATK or DEF shard rises as "+N" beside its sprite,
// a potion that healed only as its blue heal number over the hero.

/** A Tower run with the hero at (0, 0) and `tile` at (1, 0). */
function beside(tile: Tile, hp = 100) {
  const g = new Game(defaults());
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let x = 0; x < 4; x++) w.cells.set(`${x},0`, x === 1 ? tile : { kind: "floor" });
  w.torches = [];
  Object.assign(g.run.player, { x: 0, y: 0, hp, maxHp: 100 });
  g.gains = [];
  return g;
}
const tileGains = (g: Game) => g.gains.filter((gain) => gain.art && "tile" in gain.art);

test("an ATK or DEF shard rises with the amount it added", () => {
  for (const kind of ["attack", "defense"] as const) {
    const g = beside({ kind }), before = g.run.player[kind];
    assert.ok(g.move(1, 0));
    const [gain] = tileGains(g);
    assert.ok(gain, `${kind}: the shard rises`);
    const added = g.run.player[kind] - before;
    assert.ok(added > 0);
    assert.equal(countedAmount(gain), `+${added}`, `${kind}: its amount beside it`);
  }
});

test("a potion raises no sprite, only its heal", () => {
  const hurt = beside({ kind: "potion" }, 40);
  assert.ok(hurt.move(1, 0));
  assert.deepEqual(tileGains(hurt), [], "no potion rises");
  assert.ok(hurt.lastHeal && hurt.lastHeal.to > hurt.lastHeal.from, "the heal rises over the hero");
  const full = beside({ kind: "potion" }, 100);
  assert.ok(full.move(1, 0));
  assert.deepEqual(tileGains(full), [], "none at full HP either");
  assert.equal(full.lastHeal, null);
});

test("only shards and keys past one are counted", () => {
  const gain = (text: string, tile: Tile, spent?: true): Gain => ({ x: 0, y: 0, text, art: { tile, ...(spent ? { spent } : {}) } });
  assert.equal(countedAmount(gain("+3 attack", { kind: "attack" })), "+3");
  assert.equal(countedAmount(gain("+1.5 DEF", { kind: "defense" })), "+1.5");
  assert.equal(countedAmount(gain("−2 attack", { kind: "attack" })), null, "a loss rises as before");
  assert.equal(countedAmount(gain("+1 Gold Key", { kind: "key", color: "yellow" })), null, "one key rises alone");
  assert.equal(countedAmount(gain("+2 Gold Keys", { kind: "key", color: "yellow" })), "+2");
  assert.equal(countedAmount(gain("−1 Gold Key", { kind: "key", color: "yellow" }, true)), null, "a key a door took");
  assert.equal(countedAmount(gain("+35 HP", { kind: "potion" })), null);
});

test("a counted shard writes its amount on the board", () => {
  const texts: string[] = [];
  const c = new Proxy({ fillText: (text: string) => texts.push(text) } as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => ({ width: 0 })),
    set: (t, k, v) => ((t[k] = v), true),
  }) as unknown as CanvasRenderingContext2D;
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => c }) };
  const popups = new BoardPopups();
  popups.update({ run: { seed: 1 }, gains: [{ x: 1, y: 1, text: "+4 attack", art: { tile: { kind: "attack" } } }], fight: null, lastHeal: null } as never, 0);
  const look = { mode: "tower", height: 30, seed: 1, outside: false, entranceX: 8, reduceMotion: true, themed: null };
  popups.draw({ c, now: 100, left: 0, bottom: 0, n: 17, s: 24, look } as unknown as FrameContext);
  assert.ok(texts.includes("+4"));
});
