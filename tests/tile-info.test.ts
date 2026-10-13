import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { tileInfo, tileInfoLine } from "../src/ui/tile-info.ts";
import { MODES } from "../src/modes.ts";
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

test("an enemy's box shows its stats as icons, what each strike does each way, and its Gold", () => {
  const { g } = board([[1, { kind: "enemy", enemy: { name: "Slime", hp: 40, attack: 12, defense: 3, tier: 0, strength: "elite" } }]]);
  delete (g.run as { outside?: unknown }).outside;
  Object.assign(g.run.player, { attack: 10, defense: 4, hp: 500, maxHp: 500, parry: 50, lifesteal: 20 });
  const body = tileInfo(g, 1, 0).body;
  assert.doesNotMatch(body, /HP \d|ATK \d|DEF \d/, "icons, not words");
  assert.match(body, /alt="HP"[^>]*> 40</);
  // 12 ATK less 4 DEF is 8, halved by the parry; each 7-damage strike heals 20% of it.
  assert.match(body, /alt="ATK"[^>]*> 12 \(<span class="hit-hurt">-4<\/span> <span class="hit-heal">\+1\.4<\/span>\)/);
  assert.match(body, /alt="DEF"[^>]*> 3 \(<span class="hit-hurt">-7<\/span>\)/);
  const gold = g.enemyGold(1, 0);
  assert.ok(gold > 0);
  assert.match(body, new RegExp(`alt="Gold"[^>]*> <span class="hit-gold">${gold}</span>`));
  assert.match(tileInfoLine(tileInfo(g, 1, 0)), /HP 40 · ATK 12 \( -4 \+1\.4 \) · DEF 3 \( -7 \) · Gold/, "the status row still names each stat");
  g.save.tower.lootedTiles[MODES.tower.lootKey(g.run as never, 1, 0)] = true;
  assert.equal(g.enemyGold(1, 0), 0);
  assert.doesNotMatch(tileInfo(g, 1, 0).body, /alt="Gold"/, "a looted enemy pays nothing, so shows none");
});
