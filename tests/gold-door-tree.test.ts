import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { MAX_CARD_XP } from "../src/card-levels.ts";
import { CARD_TREES, cardMaxLevel, freeUpChances, treeBonus, type CardTreeLevels } from "../src/card-trees.ts";
import { goldLocked, withDoorOdds } from "../src/doors.ts";
import { resolveStep, BASE_RULES, type StepEffect } from "../src/step-effects.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { KeyColor, Player, Tile } from "../src/entities.ts";

const keyed = (keys: KeyColor[], heart = false): Tile => ({ kind: "door", color: keys[0], door: { type: "keys", keys, mode: "all", ...(heart ? { heart: true as const } : {}) } });
const steel = (heart = false): Tile => ({ kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "any", ...(heart ? { heart: true as const } : {}) } });
const wood: Tile = { kind: "door", door: { type: "wood", durability: 20 } };
const hero: Player = { x: 0, y: 0, hp: 50, maxHp: 100, attack: 10, defense: 0, shroud: 0, keys: { yellow: 2, blue: 2, red: 2 } };

const lay = (g: Game, door: Tile) => ((g.world as RoomWorld).cells = new Map([["0,0", { kind: "floor" }], ["1,0", door], ["2,0", { kind: "floor" }]]));
/** A Tower run on seed 7 whose hand's trees are `trees`, the hero at (0, 0)
 * with `door` beside it at (1, 0). */
function beside(door: Tile, trees: CardTreeLevels, player: Partial<Player> = {}) {
  const s = defaults();
  s.upgrades.inspirationUndos = 1;
  const g = new Game(s);
  g.newRun({ seed: 7 });
  g.run.cardTrees = trees;
  lay(g, door);
  Object.assign(g.run.player, { x: 0, y: 0, hp: 50, maxHp: 100, keys: { yellow: 2, blue: 2, red: 2 } }, player);
  return g;
}

test("GOLD DOOR's tree: two tracks through every rarity, 10 levels to start and 60 once card buys open them all", () => {
  const nodes = CARD_TREES.yellowDoor!;
  assert.deepEqual(nodes.map((n) => [n.id, n.rarity, n.levels, n.max]), [
    ["doorGold", "common", 5, 10], ["doorSilver", "uncommon", 0, 5], ["goldBonus", "rare", 0, 5], ["freeUtility", "epic", 0, 5], ["doorChest", "legendary", 0, 5],
    ["doorCost", "common", 5, 10], ["doorHeal", "uncommon", 0, 5], ["transmute", "rare", 0, 5], ["lockPick", "epic", 0, 5], ["knock", "legendary", 0, 5],
  ]);
  assert.equal(cardMaxLevel({}, "yellowDoor"), 10);
  assert.equal(cardMaxLevel({ yellowDoor: Object.fromEntries(nodes.map((n) => [n.id, n.max - n.levels])) }, "yellowDoor"), 60);
});

test("a door has a gold lock when gold is among the colours it needs; a Steel Door, taking any key, has none", () => {
  assert.ok(goldLocked(keyed(["yellow"])));
  assert.ok(goldLocked(keyed(["yellow", "red"], true)));
  for (const t of [keyed(["blue"]), steel(), wood, { kind: "door", door: { type: "fullHp" } } as Tile]) assert.equal(goldLocked(t), false);
});

test("GOLD DOOR's Gold and Silver add to DOOR's, from doors with a gold lock only", () => {
  const found = (door: Tile, trees: CardTreeLevels) => {
    const g = beside(door, trees), gold = g.save.gold, silver = g.run.silver ?? 0;
    assert.ok(g.move(1, 0));
    return [g.save.gold - gold, (g.run.silver ?? 0) - silver];
  };
  const [plainGold] = found(keyed(["yellow", "blue"]), {});
  const [gold, silver] = found(keyed(["yellow", "blue"]), { yellowDoor: { doorGold: 10, doorSilver: 5 } });
  assert.ok(gold > plainGold, "more Gold");
  assert.ok(silver > 0, "Silver found");
  assert.deepEqual(found(keyed(["blue"]), { yellowDoor: { doorGold: 10, doorSilver: 5 } }), found(keyed(["blue"]), {}), "a blue door pays as without it");
  assert.deepEqual(found(keyed(["yellow"]), { yellowDoor: { doorGold: 5 }, door: { doorGold: 5 } }), found(keyed(["yellow"]), { door: { doorGold: 10 } }), "added into DOOR's Door Gold");
});

test("GOLD DOOR's Gold Door Heal adds to DOOR's Door Heal for a door with a gold lock, after a Heart Door's drain", () => {
  const heal = (door: Tile, rules = {}) => (resolveStep(hero, door, { ...BASE_RULES, yellowLockHeal: 4, ...rules }) as StepEffect).healed;
  assert.equal(heal(keyed(["yellow"])), 4);
  assert.equal(heal(keyed(["yellow"]), { doorHeal: 1 }), 5);
  assert.equal(heal(keyed(["blue"]), { doorHeal: 1 }), 1, "DOOR's alone on a blue door");
  assert.equal((resolveStep(hero, keyed(["yellow", "blue"], true), { ...BASE_RULES, yellowLockHeal: 4 }) as StepEffect).player.hp, 5, "drained to 1, then healed");
  const g = beside(keyed(["yellow"]), { yellowDoor: { doorHeal: 2 } });
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, 51);
});

test("GOLD DOOR's Gold Key Cost is GOLD KEY's: less of each gold key a door takes", () => {
  assert.equal(treeBonus({ yellowDoor: { doorCost: 3 }, yellowKey: { doorCost: 2 } }).yellowDoorCost, 5);
  const g = beside(keyed(["yellow", "blue"]), { yellowDoor: { doorCost: 10 } });
  assert.ok(g.move(1, 0));
  assert.deepEqual(g.run.player.keys, { yellow: 1.1, blue: 1, red: 2 });
});

test("GOLD DOOR's Gold Knock opens a door with a gold lock for nothing, adding to Secret Knock", () => {
  const free = beside(keyed(["yellow", "red"]), { yellowDoor: { knock: 100 } });
  assert.ok(free.move(1, 0));
  assert.deepEqual(free.run.player.keys, { yellow: 2, blue: 2, red: 2 });
  assert.match(free.message, /Secret Knock/);
  const blue = beside(keyed(["blue"]), { yellowDoor: { knock: 100 } });
  assert.ok(blue.move(1, 0));
  assert.equal(blue.run.player.keys.blue, 1, "a blue door takes its key");
});

test("GOLD DOOR's Gold Door Chest leaves a treasure chest where a door with a gold lock stood", () => {
  const chest = (door: Tile) => {
    const g = beside(door, { yellowDoor: { doorChest: 500 } });
    assert.ok(g.move(1, 0));
    return g.world.tile(1, 0).kind;
  };
  assert.equal(chest(keyed(["yellow"])), "openedChest");
  assert.equal(chest(keyed(["red"])), "floor");
});

test("GOLD DOOR's Transmute makes Wooden and Steel Doors Gold Doors as floors are generated", () => {
  const odds = { skeleton: 0, lockPick: 0, transmute: 100 };
  assert.deepEqual(withDoorOdds(wood, 3, 4, 9, odds, () => 12), keyed(["yellow"]));
  assert.deepEqual(withDoorOdds(steel(), 3, 4, 9, odds, () => 12), keyed(["yellow"]));
  assert.deepEqual(withDoorOdds(steel(true), 3, 4, 9, odds, () => 12), keyed(["yellow"], true), "a Heart Door's drain kept");
  for (const t of [keyed(["blue"]), { kind: "door", door: { type: "fullHp" } } as Tile]) assert.equal(withDoorOdds(t, 3, 4, 9, odds, () => 12), t, "only Wooden and Steel Doors");
  // On real floors: every Wooden and Steel Door goes at 100%, a higher chance only remakes more.
  const doors = (transmute: number) => {
    const out: Tile[] = [];
    for (let room = 0; room < 60; room++) for (const t of new RoomWorld(5, room, {}, 0, 2, undefined, undefined, undefined, { skeleton: 0, lockPick: 0, transmute }).cells.values()) if (t.kind === "door") out.push(t);
    return out;
  };
  const plainOrSteel = (t: Tile) => t.door?.type === "wood" || (t.door?.type === "keys" && t.door.mode === "any");
  assert.ok(doors(0).some(plainOrSteel));
  assert.equal(doors(100).filter(plainOrSteel).length, 0);
  const some = doors(30), more = doors(60);
  assert.ok(some.filter(plainOrSteel).length > more.filter(plainOrSteel).length);
  some.forEach((t, i) => plainOrSteel(t) || assert.deepEqual(more[i], t, "a door remade at 30% is remade at 60%"));
});

test("a run fixes GOLD DOOR's Transmute in its door odds and saves them; its Lock Pick adds to DOOR's", () => {
  const s = defaults();
  s.cardXp.yellowDoor = MAX_CARD_XP;
  s.hand = [...s.hand, "yellowDoor"];
  s.cardTrees = { yellowDoor: { doorCost: 5, doorHeal: 1, transmute: 3 } };
  s.cardBuys.opened = { yellowDoor: { doorHeal: 1, transmute: 3 } };
  const g = new Game(s);
  g.newRun({ seed: 3 });
  assert.deepEqual(g.run.doorOdds, { skeleton: 0, lockPick: 0, transmute: 12 });
  assert.deepEqual(decode(JSON.stringify(g.save)).tower.run!.doorOdds, { skeleton: 0, lockPick: 0, transmute: 12 });
  assert.equal(treeBonus({ yellowDoor: { lockPick: 2 }, door: { lockPick: 1 } }).lockPick, 3);
  assert.deepEqual(freeUpChances(treeBonus({ yellowDoor: { freeUtility: 2 } })), { utility: 100 });
});
