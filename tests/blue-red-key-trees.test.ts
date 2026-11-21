import { givePowers, type GivenPowers } from "./powers-helper.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { powerBonus } from "../src/cards/powers.ts";
import { doorKeyScale } from "../src/doors.ts";
import { resolveStep, BASE_RULES, type StepEffect } from "../src/step-effects.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { KeyColor, Player, Tile } from "../src/entities.ts";

const key = (color: KeyColor): Tile => ({ kind: "key", color });
const keyed = (keys: KeyColor[]): Tile => ({ kind: "door", color: keys[0], door: { type: "keys", keys, mode: "all" } });
const hero: Player = { x: 0, y: 0, hp: 50, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };

/** A Tower run on seed 7 whose hand's trees are `trees`, the hero at (0, 0)
 * with `tiles` beside it from (1, 0) on. */
function beside(trees: GivenPowers, tiles: Tile[]) {
  const g = new Game(defaults());
  g.newRun({ seed: 7 });
  g.run.handLevels = givePowers(trees);
  const cells = new Map<string, Tile>([["0,0", { kind: "floor" }]]);
  tiles.forEach((t, i) => cells.set(`${i + 1},0`, t));
  cells.set(`${tiles.length + 1},0`, { kind: "floor" });
  (g.world as RoomWorld).cells = cells;
  Object.assign(g.run.player, { x: 0, y: 0, hp: 50, maxHp: 100, keys: { yellow: 0, blue: 0, red: 0 } });
  return g;
}

test("each key colour's tree heals, pays and finds for keys of its colour only", () => {
  const healed = (tile: Tile, rules: Partial<typeof BASE_RULES>) => (resolveStep(hero, tile, { ...BASE_RULES, ...rules }) as StepEffect).player.hp;
  assert.equal(healed(key("blue"), { keyHeal: 1, blueKeyHeal: 2, redKeyHeal: 3 }), 53);
  assert.equal(healed(key("red"), { keyHeal: 1, blueKeyHeal: 2, redKeyHeal: 3 }), 54);
  const take = (trees: GivenPowers, tile: Tile) => {
    const g = beside(trees, [tile]), silver = g.run.silver ?? 0;
    assert.ok(g.move(1, 0));
    return { silver: Math.round(((g.run.silver ?? 0) - silver) * 1e6) / 1e6, keys: g.run.player.keys[tile.color!] };
  };
  assert.deepEqual(take({ blueKey: { blueKeySilver: 0.2, blueKeyFind: 10 } }, key("blue")), { silver: 0.2, keys: 1.1 });
  assert.deepEqual(take({ blueKey: { blueKeySilver: 0.2, blueKeyFind: 10 } }, key("red")), { silver: 0, keys: 1 });
  assert.deepEqual(take({ key: { keyFind: 10 }, redKey: { redKeyFind: 30 } }, key("red")), { silver: 0, keys: 1.43 }, "KEY's +10% times RED KEY's +30%");
});

test("BLUE KEY's and RED KEY's door cuts take their colour's key on any door, each its own factor", () => {
  const off = { yellowKey: 10, blueKey: 20, redKey: 30, all: 10 };
  assert.deepEqual(doorKeyScale(keyed(["blue", "red"]), 1, off), { yellow: 0.81, blue: 0.72, red: 0.63 });
  const g = beside({ redKey: { redDoorCost: 5 } }, [keyed(["red"])]);
  g.run.player.keys.red = 1;
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.keys.red, 0.05);
});

test("the key trees' Max HP adds into one card factor", () => {
  assert.equal(powerBonus(givePowers({ yellowKey: { maxHp: 5 }, blueKey: { maxHp: 10 }, redKey: { maxHp: 15 } })).maxHp, 30);
});

test("Locksmith Blue and Master Red Key roll for keys of their colour", () => {
  const two = beside({ blueKey: { blueDoubleKey: 100 } }, [key("blue")]);
  assert.ok(two.move(1, 0));
  assert.equal(two.run.player.keys.blue, 2);
  const notRed = beside({ blueKey: { blueDoubleKey: 100 } }, [key("red")]);
  assert.ok(notRed.move(1, 0));
  assert.equal(notRed.run.player.keys.red, 1);
  const g = beside({ redKey: { redMasterKey: 100 } }, [key("red"), keyed(["red"]), keyed(["blue"]), keyed(["yellow", "red"])]);
  assert.ok(g.move(1, 0));
  assert.deepEqual([2, 3, 4].map((x) => g.world.tile(x, 0).kind), ["floor", "door", "floor"], "every door with a red lock, none without");
  assert.match(g.message, /Master Red Key · 2 doors opened/);
});
