import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { tileInfo } from "../src/ui/tile-info.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

/** A Tower floor holding just the given tiles in its bottom row. */
function board(tiles: [number, object][]) {
  const g = new Game(defaults());
  const w = g.world as RoomWorld;
  w.cells = new Map(tiles.map(([x, t]) => [`${x},0`, t as never]));
  w.torches = [];
  return { g, w };
}

test("a pickup's box shows its icon and what it gives, not the stat before and after", () => {
  const { g } = board([[1, { kind: "key", color: "yellow" }], [2, { kind: "potion", amount: 35 }], [3, { kind: "attack" }]]);
  Object.assign(g.run.player, { hp: 50, maxHp: 60 });
  const key = tileInfo(g, 1, 0).body, potion = tileInfo(g, 2, 0).body, shard = tileInfo(g, 3, 0);
  assert.match(key, /<img[^>]*key_yellow[^>]*> \+1</);
  assert.doesNotMatch(key, /→/);
  assert.match(potion, /potion_flat[^>]*> \+35 HP/, "the full heal, not what max HP leaves room for");
  assert.doesNotMatch(potion, /→/);
  assert.match(shard.body, /upgrade_attack[^>]*> \+\d+(\.\d+)? ATK/);
});

test("a floor tile holding a lit torch is named Torch", () => {
  const { g, w } = board([[1, { kind: "floor" }], [2, { kind: "floor" }]]);
  w.torches = [{ x: 2, y: 0, lightRadius: 3, active: true } as never];
  assert.equal(tileInfo(g, 1, 0).title, "Floor");
  assert.equal(tileInfo(g, 2, 0).title, "Torch");
  w.torches[0].active = false;
  assert.equal(tileInfo(g, 2, 0).title, "Floor", "a torch put out is floor again");
});
