import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { provisionPrice } from "../src/loadout.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { Enemy, Tile } from "../src/entities.ts";

const slime = (hp: number, defense = 0): Tile => ({ kind: "enemy", enemy: { name: "Slime", hp, attack: 5, defense, tier: 1, strength: "normal" } as Enemy });

/** Lays the floor of `g`'s world: the hero's tile (0, 0), open floor at
 * (1, 0) and `foe` at (3, 0). Undo builds the floor afresh, so a test lays
 * it again after one. */
function lay(g: Game, foe: Tile) {
  (g.world as RoomWorld).cells = new Map<string, Tile>([["0,0", { kind: "floor" }], ["1,0", { kind: "floor" }], ["2,0", { kind: "floor" }], ["3,0", foe]]);
}
/** A Tower run on seed 7 with `bombs` Bomb provisions, the hero at (0, 0)
 * with ATK 10, `foe` two tiles off. */
function withBombs(bombs: number, foe: Tile = slime(30)) {
  const s = defaults();
  s.upgrades.inspirationUndos = 1;
  s.provisions.bomb = bombs;
  const g = new Game(s);
  g.newRun({ seed: 7 });
  lay(g, foe);
  Object.assign(g.run.player, { x: 0, y: 0, attack: 10 });
  return g;
}

test("a Bomb costs 100 Gold, and each one after a hundred times the last", () => {
  const s = defaults();
  assert.deepEqual([0, 1, 2, 3].map((n) => provisionPrice({ provisions: { ...s.provisions, bomb: n } }, "bomb")), [100, 10_000, 1_000_000, 100_000_000]);
});

test("a run carries a Bomb for each one owned; none owned, there is none to arm", () => {
  const none = withBombs(0);
  assert.equal(none.arm("bomb"), "unavailable");
  const g = withBombs(2);
  assert.equal(g.bombsLeft, 2);
  assert.equal(g.arm("bomb"), "armed");
  assert.equal(g.armed, "bomb");
  assert.equal(g.arm("bomb"), "disarmed", "pressed again, it is put away");
  assert.equal(g.armed, null);
  const forest = withBombs(3);
  forest.newRun({ outside: true, seed: 1 });
  assert.equal(forest.bombsLeft, 3, "the forest shows what the next run carries");
  assert.equal(forest.arm("bomb"), "unavailable", "and throws none");
});

test("a Bomb deals the enemy on its tile the hero's ATK, its DEF no help, and goes off nowhere else", () => {
  const g = withBombs(1, slime(30, 8));
  g.arm("bomb");
  assert.equal(g.useArmed(1, 0), "invalid", "no enemy there");
  assert.equal(g.armed, "bomb", "still armed");
  assert.equal(g.bombsLeft, 1, "and not spent");
  assert.equal(g.useArmed(3, 0), "used");
  assert.equal(g.world.tile(3, 0).enemy!.hp, 20);
  assert.equal(g.bombsLeft, 0);
  assert.equal(g.run.bombsUsed, 1);
  assert.equal(g.armed, null);
  assert.deepEqual([g.bombed?.x, g.bombed?.y], [3, 0], "the explosion's tile");
  assert.match(g.message, /Bomb · .* −10 HP/);
  assert.equal(g.arm("bomb"), "spent");
  assert.deepEqual(decode(JSON.stringify(g.save)).tower.run!.bombsUsed, 1, "it saves");
});

test("a Bomb that fells its enemy clears it and pays the kill, once though undo takes the Bomb back", () => {
  const g = withBombs(1, slime(10));
  const kills = g.run.kills, gold = g.save.gold;
  g.arm("bomb");
  assert.equal(g.useArmed(3, 0), "used");
  assert.equal(g.world.tile(3, 0).kind, "floor");
  assert.equal(g.run.kills, kills + 1);
  assert.match(g.message, /Bomb · .* defeated/);
  const paid = g.save.gold;
  assert.ok(paid >= gold);
  assert.ok(g.undo());
  lay(g, slime(10));
  assert.equal(g.bombsLeft, 1, "undo gives the Bomb back");
  assert.equal(g.world.tile(3, 0).kind, "enemy");
  g.arm("bomb");
  assert.equal(g.useArmed(3, 0), "used");
  assert.equal(g.save.gold, paid, "the kill's Gold isn't paid twice");
});

test("a Bomb bought inside a run is thrown in it at once", () => {
  const g = withBombs(0);
  g.save.upgrades.gear = 1;
  g.save.gold = 100;
  assert.ok(g.gear.buyProvision("bomb"));
  assert.equal(g.save.gold, 0);
  assert.equal(g.bombsLeft, 1);
  assert.equal(g.arm("bomb"), "armed");
});
