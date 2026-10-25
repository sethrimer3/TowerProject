import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { freeUpChances, treeBonus, type CardTreeLevels } from "../src/cards/trees.ts";
import { doorDiscount } from "../src/doors.ts";
import { resolveStep, BASE_RULES, type StepEffect } from "../src/step-effects.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { World } from "../src/delve/world.ts";
import { depthAt, region } from "../src/delve/labyrinth.ts";
import type { KeyColor, Player, Tile } from "../src/entities.ts";

const key: Tile = { kind: "key", color: "yellow" };
const keyed = (keys: KeyColor[], heart = false): Tile => ({ kind: "door", color: keys[0], door: { type: "keys", keys, mode: "all", ...(heart ? { heart: true as const } : {}) } });
const hero: Player = { x: 0, y: 0, hp: 50, maxHp: 100, attack: 10, defense: 0, shroud: 0, keys: { yellow: 0, blue: 0, red: 0 } };

/** Lays the floor of `g`'s world: the hero's tile (0, 0), `tiles` from
 * (1, 0) on, and open floor after them. Undo builds the floor afresh, so a
 * test lays it again after one. */
function lay(g: Game, ...tiles: Tile[]) {
  const cells = new Map<string, Tile>([["0,0", { kind: "floor" }]]);
  tiles.forEach((t, i) => cells.set(`${i + 1},0`, t));
  cells.set(`${tiles.length + 1},0`, { kind: "floor" });
  (g.world as RoomWorld).cells = cells;
}
/** A Tower run on seed 7 whose hand's trees are `trees`, the hero at (0, 0)
 * with `tiles` beside it from (1, 0) on. */
function beside(trees: CardTreeLevels, tiles: Tile[] = [key], player: Partial<Player> = {}) {
  const s = defaults();
  s.upgrades.inspirationUndos = 1;
  const g = new Game(s);
  g.newRun({ seed: 7 });
  g.run.cardTrees = trees;
  lay(g, ...tiles);
  Object.assign(g.run.player, { x: 0, y: 0, hp: 50, maxHp: 100, keys: { yellow: 0, blue: 0, red: 0 } }, player);
  return g;
}

test("KEY's Key Heal heals a share of max HP with each key, up to max HP; Key Overheal a share of the Overheal ceiling, up to it", () => {
  const healed = (rules: Partial<typeof BASE_RULES>, player: Partial<Player> = {}) => {
    const out = resolveStep({ ...hero, ...player }, key, { ...BASE_RULES, ...rules }) as StepEffect;
    return [out.player.hp, out.healed];
  };
  assert.deepEqual(healed({}), [50, 0]);
  assert.deepEqual(healed({ keyHeal: 5 }), [55, 5]);
  assert.deepEqual(healed({ keyHeal: 5 }, { hp: 98 }), [100, 2], "up to max HP");
  assert.deepEqual(healed({ keyHeal: 5 }, { hp: 120 }), [120, 0], "never down from an overheal");
  assert.deepEqual(healed({ keyOverheal: 10, overheal: 1500 }, { hp: 100 }), [115, 15], "10% of a 150 HP ceiling");
  assert.deepEqual(healed({ keyOverheal: 10, overheal: 1500 }, { hp: 140 }), [150, 10], "up to the ceiling");
  assert.deepEqual(healed({ keyOverheal: 10 }, { hp: 95 }), [100, 5], "without Overheal, the ceiling is max HP");
  assert.deepEqual(healed({ keyHeal: 5, keyOverheal: 10, overheal: 1500 }, { hp: 50 }), [70, 20], "both, Key Heal first");
  // In a run, the heal rises off the key and counts as healed.
  const g = beside({ key: { keyHeal: 5 } });
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, 55);
  assert.ok(g.gains.some((gain) => gain.text === "+5 HP"));
});

test("KEY's Key Gold raises a key's Gold 2% a level, and Key Silver finds Silver with each key", () => {
  assert.equal(treeBonus({ key: { keyGold: 5 } }).keyGold, 10);
  const silverFrom = (levels: number) => {
    const g = beside(levels ? { key: { keyGold: 5, keySilver: levels } } : {});
    const before = g.silver;
    g.move(1, 0);
    return g.silver - before;
  };
  assert.equal(silverFrom(0), 0);
  assert.ok(silverFrom(5) > 0);
});

test("KEY's Free Utility gives a Free Utility chance, trained or not, adding to DOOR's", () => {
  assert.deepEqual(freeUpChances(treeBonus({ key: { freeUtility: 2 } })), { utility: 100 });
  assert.deepEqual(freeUpChances(treeBonus({ key: { freeUtility: 2 }, door: { freeUtility: 2 } })), { utility: 200 });
});

test("KEY's door costs: Wooden and Steel Doors' keys and HP, Heart Doors' keys and drain", () => {
  const wood: Tile = { kind: "door", door: { type: "wood", durability: 20 } };
  const steel: Tile = { kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "any" } };
  const heart: Tile = { kind: "door", door: { type: "fullHp" } };
  assert.deepEqual(doorDiscount(wood, { plain: 10 }), { keys: 0.9, toll: 0.9 });
  assert.deepEqual(doorDiscount(steel, { plain: 10 }), { keys: 0.9, toll: 1 });
  assert.equal(doorDiscount(heart, { hearts: 10 }).toll, 0.9);
  assert.deepEqual(doorDiscount(keyed(["blue"], true), { hearts: 10 }), { keys: 0.9, toll: 0.9 });
  assert.deepEqual(doorDiscount(keyed(["blue"]), { plain: 10, hearts: 10 }), { keys: 1, toll: 1 }, "a colour door is neither");
  assert.deepEqual(doorDiscount(wood, { plain: 10, wood: 5, all: 5 }), { keys: 0.8, toll: 0.85 }, "added into WOODEN DOOR's and DOOR's");
  assert.equal(doorDiscount(heart, { hearts: 10, heart: 20 }).toll, 0.7, "added into HEART DOOR's");
  // The run's hand reads them off the tree.
  const g = beside({ key: { keyFind: 4, plainDoorCost: 3, heartDoorCost: 2 } });
  assert.deepEqual(g.doorOff, { plain: 3, hearts: 2 });
  const broken = beside({ key: { keyFind: 4, plainDoorCost: 5 } }, [wood]);
  assert.ok(broken.move(1, 0));
  assert.equal(broken.run.player.hp, 50 - 19, "a 20 HP toll, 5% less");
});

test("KEY's Locksmith makes a key two, by the key's own roll", () => {
  const g = beside({ key: { locksmith: 500 } });
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.keys.yellow, 2);
  assert.match(g.gains[0].text, /\+2 gold key/);
  const plain = beside({});
  assert.ok(plain.move(1, 0));
  assert.equal(plain.run.player.keys.yellow, 1);
  // Undo and the same key rolls the same.
  const some = beside({ key: { locksmith: 50 } }), first = (some.move(1, 0), some.run.player.keys.yellow);
  assert.ok(some.undo());
  lay(some, key);
  assert.ok(some.move(1, 0));
  assert.equal(some.run.player.keys.yellow, first);
});

test("KEY's Master Key opens every door on a Tower floor as its key is picked up, each paying as a door opened for nothing", () => {
  const wood: Tile = { kind: "door", door: { type: "wood", durability: 20 } };
  const g = beside({ key: { masterKey: 500 }, door: { doorHeal: 4, doorSilver: 5 } }, [key, keyed(["red"]), wood]);
  (g.world as RoomWorld).cells.set("0,1", keyed(["yellow", "blue"], true));
  const gold = g.save.gold;
  assert.ok(g.move(1, 0));
  const none = beside({}, [key, keyed(["red"])]), noneGold = none.save.gold;
  assert.ok(none.move(1, 0));
  assert.equal(none.world.tile(2, 0).kind, "door");
  assert.deepEqual([g.world.tile(2, 0).kind, g.world.tile(3, 0).kind, g.world.tile(0, 1).kind], ["floor", "floor", "floor"]);
  assert.match(g.message, /Master Key · 3 doors opened/);
  // Each door's Gold, Door Silver and Door Heal: 2% of max HP a door.
  assert.ok(g.save.gold - gold > none.save.gold - noneGold, "the doors' Gold on top of the key's");
  for (const at of [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 1 }]) assert.ok(g.gains.some((gain) => gain.x === at.x && gain.y === at.y && /Gold/.test(gain.text)), `Gold at ${at.x},${at.y}`);
  assert.equal(g.gains.filter((gain) => /Silver/.test(gain.text)).length, 3);
  assert.equal(g.run.player.hp, 56, "three Door Heals, no toll or drain");
  // Undo takes it all back, and the doors' Gold can't pay twice.
  const paid = g.save.gold;
  assert.ok(g.undo());
  assert.equal(g.run.player.hp, 50);
  lay(g, key, keyed(["red"]), wood);
  (g.world as RoomWorld).cells.set("0,1", keyed(["yellow", "blue"], true));
  assert.ok(g.move(1, 0));
  assert.equal(g.save.gold, paid);
  assert.equal(g.run.player.hp, 56);
  assert.ok(g.move(1, 0) && g.move(1, 0), "the hero walks through");
});

test("KEY's Master Key opens the doors of a Delve area on the key's equivalent floor", () => {
  const s = defaults();
  s.upgrades.breakthrough = 1;
  const g = new Game(s);
  g.switchMode("delve");
  g.newRun({ seed: 5 });
  const world = g.world as World, floorOf = (x: number, y: number) => Math.floor(depthAt(world.seed, x, y, 0, world.tier) / 10);
  const doors = [...region(world.seed, 0, world.tier).metadata.keys()].map((k) => k.split(",").map(Number) as [number, number]).filter(([x, y]) => world.tile(x, y).kind === "door");
  assert.ok(doors.length > 0, "the first area has doors");
  const [x, y] = doors[0];
  const opened = world.floorDoors(x, y);
  assert.ok(opened.some((d) => d.x === x && d.y === y));
  assert.ok(opened.every((d) => world.tile(d.x, d.y).kind === "door" && floorOf(d.x, d.y) === floorOf(x, y)));
  assert.equal(opened.length, doors.filter(([dx, dy]) => floorOf(dx, dy) === floorOf(x, y)).length);
});

test("KEY's Key Chest leaves an opened treasure chest where a key lay, paid, by the key's own roll", () => {
  const g = beside({ key: { keyChest: 500 } }), treasures = g.run.treasures;
  assert.ok(g.move(1, 0));
  assert.equal(g.world.tile(1, 0).kind, "openedChest");
  assert.equal(g.run.treasures, treasures + 1);
  assert.equal(g.run.player.keys.yellow, 1, "the key is taken too");
  const plain = beside({});
  assert.ok(plain.move(1, 0));
  assert.equal(plain.world.tile(1, 0).kind, "floor");
  // Undo and the same key rolls the same, paying nothing again.
  const some = beside({ key: { keyChest: 250 } }), first = (some.move(1, 0), some.world.tile(1, 0).kind), gold = some.save.gold;
  assert.ok(some.undo());
  lay(some, key);
  assert.ok(some.move(1, 0));
  assert.equal(some.world.tile(1, 0).kind, first);
  assert.equal(some.save.gold, gold);
});
