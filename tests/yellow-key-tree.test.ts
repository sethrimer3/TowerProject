import { givePowers, holdPowers, type GivenPowers } from "./powers-helper.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { MAX_CARD_XP } from "../src/cards/levels.ts";
import { compounded } from "../src/cards/powers.ts";
import { doorKeyScale } from "../src/doors.ts";
import { resolveStep, BASE_RULES, type StepEffect } from "../src/step-effects.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { KeyColor, Player, Tile } from "../src/entities.ts";

const yellow: Tile = { kind: "key", color: "yellow" }, blue: Tile = { kind: "key", color: "blue" };
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

test("GOLD KEY's Key Heal and Key Overheal add to KEY's for a gold key only", () => {
  const healed = (tile: Tile, rules: Partial<typeof BASE_RULES>, player: Partial<Player> = {}) => (resolveStep({ ...hero, ...player }, tile, { ...BASE_RULES, ...rules }) as StepEffect).player.hp;
  assert.equal(healed(yellow, { keyHeal: 2, yellowKeyHeal: 3 }), 55);
  assert.equal(healed(blue, { keyHeal: 2, yellowKeyHeal: 3 }), 52, "not a blue key");
  assert.equal(healed(yellow, { yellowKeyOverheal: 10, overheal: 1500 }, { hp: 100 }), 115, "10% of a 150 HP ceiling");
  const g = beside({ yellowKey: { yellowKeyHeal: 4 } }, [yellow]);
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, 54);
});

test("GOLD KEY's Key Gold and Key Find multiply KEY's and the key cards', its Key Silver and Key Chest add to KEY's", () => {
  assert.equal(compounded(10, 10), 21);
  assert.equal(compounded(0, 5), 5);
  const take = (trees: GivenPowers, tile: Tile = yellow) => {
    const g = beside(trees, [tile]), gold = g.save.gold, silver = g.run.silver ?? 0;
    assert.ok(g.move(1, 0));
    return { gold: g.save.gold - gold, silver: snap6((g.run.silver ?? 0) - silver), keys: g.run.player.keys[tile.color!] };
  };
  const plain = take({}), both = take({ key: { keyGold: 10, keySilver: 0.2 }, yellowKey: { yellowKeyGold: 10, yellowKeySilver: 0.3 } });
  assert.equal(both.gold, snap6(plain.gold * 1.1 * 1.1), "KEY's +10% times GOLD KEY's +10%");
  assert.equal(both.silver, 0.5, "0.2 and 0.3");
  assert.equal(take({ yellowKey: { yellowKeyGold: 10, yellowKeySilver: 0.3 } }, blue).silver, 0, "a blue key gets none");
  // KEY's Key Find, 1% a level, times GOLD KEY's.
  assert.equal(take({ key: { keyFind: 10 }, yellowKey: { yellowKeyFind: 10 } }).keys, 1.21);
  assert.equal(take({ key: { keyFind: 10 }, yellowKey: { yellowKeyFind: 10 } }, blue).keys, 1.1);
  // Key Chest: KEY's chance and GOLD KEY's added, for a gold key.
  const chest = beside({ key: { keyChest: 50 }, yellowKey: { yellowKeyChest: 50 } }, [yellow]);
  assert.ok(chest.move(1, 0));
  assert.equal(chest.world.tile(1, 0).kind, "openedChest", "50% and 50%: certain");
});

test("GOLD KEY's Gold Key Cost cuts the gold key any door takes, its own factor on DOOR's and GOLD DOOR's cuts", () => {
  assert.deepEqual(doorKeyScale(keyed(["yellow"]), 1, { yellowKey: 10, yellow: 20, all: 10 }), { yellow: 0.63, blue: 0.7, red: 0.7 });
  assert.equal(doorKeyScale(keyed(["blue"]), 1, { yellow: 20, all: 10 }), 0.9, "one amount with no key colour's cut");
  const g = beside({ yellowKey: { yellowDoorCost: 5 } }, [keyed(["yellow"])]);
  g.run.player.keys.yellow = 1;
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.keys.yellow, 0.05);
  // A door of two colours: only its gold key costs less.
  const two = beside({ yellowKey: { yellowDoorCost: 5 } }, [keyed(["yellow", "blue"])]);
  Object.assign(two.run.player.keys, { yellow: 1, blue: 1 });
  assert.ok(two.move(1, 0));
  assert.deepEqual([two.run.player.keys.yellow, two.run.player.keys.blue], [0.05, 0]);
  assert.match(two.message, /1\.95 keys spent/);
  // A Steel Door taking a gold key.
  const steel = beside({ yellowKey: { yellowDoorCost: 5 } }, [{ kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "any" } }]);
  steel.run.player.keys.yellow = 0.95;
  assert.ok(steel.move(1, 0));
  assert.equal(steel.run.player.keys.yellow, 0);
});

test("GOLD KEY's Max HP raises the hero's for the run, its own factor, training bought inside raised too", () => {
  const s = defaults();
  holdPowers(s, "yellowKey", { yellowKeyFind: 4, yellowDoorCost: 1, maxHp: 20 });
  s.hand = [...s.hand.filter((c) => c !== "yellowKey"), "yellowKey"];
  const g = new Game(s), plain = new Game(defaults());
  g.newRun({ seed: 7 });
  plain.newRun({ seed: 7 });
  assert.equal(g.run.player.maxHp, snap6(plain.run.player.maxHp * 1.2));
  assert.equal(g.run.player.hp, g.run.player.maxHp, "at full HP");
});

test("GOLD KEY's Locksmith Gold adds to KEY's Locksmith, one roll", () => {
  const walk = (trees: GivenPowers) => {
    const g = beside(trees, Array.from({ length: 12 }, () => yellow));
    return Array.from({ length: 12 }, () => {
      const before = g.run.player.keys.yellow;
      assert.ok(g.move(1, 0));
      return g.run.player.keys.yellow - before;
    });
  };
  const summed = walk({ key: { doubleKey: 30 }, yellowKey: { yellowDoubleKey: 20 } });
  assert.deepEqual(summed, walk({ key: { doubleKey: 50 } }), "as KEY's Locksmith at 50%");
  assert.ok(summed.includes(1) && summed.includes(2));
  assert.deepEqual(walk({ key: { doubleKey: 50 }, yellowKey: { yellowDoubleKey: 50 } }).filter((n) => n !== 2), [], "50% and 50%: certain");
});

test("GOLD KEY's Locksmith Gold makes a gold key two; Master Gold Key opens the floor's doors with a gold lock", () => {
  const two = beside({ yellowKey: { yellowDoubleKey: 100 } }, [yellow]);
  assert.ok(two.move(1, 0));
  assert.equal(two.run.player.keys.yellow, 2);
  const notBlue = beside({ yellowKey: { yellowDoubleKey: 100 } }, [blue]);
  assert.ok(notBlue.move(1, 0));
  assert.equal(notBlue.run.player.keys.blue, 1);
  const g = beside({ yellowKey: { yellowMasterKey: 100 } }, [yellow, keyed(["yellow"]), keyed(["red"]), keyed(["yellow", "blue"])]);
  assert.ok(g.move(1, 0));
  assert.deepEqual([2, 3, 4].map((x) => g.world.tile(x, 0).kind), ["floor", "door", "floor"], "every door with a gold lock, none without");
  assert.match(g.message, /Master Gold Key · 2 doors opened/);
  const blueKey = beside({ yellowKey: { yellowMasterKey: 100 } }, [blue, keyed(["yellow"])]);
  assert.ok(blueKey.move(1, 0));
  assert.equal(blueKey.world.tile(2, 0).kind, "door", "only a gold key");
});

const snap6 = (n: number) => Math.round(n * 1e6) / 1e6;
