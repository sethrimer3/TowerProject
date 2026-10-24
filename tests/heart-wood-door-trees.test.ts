import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { MAX_CARD_XP } from "../src/cards/levels.ts";
import { CARD_TREES, cardMaxLevel, doorStat, freeUpChances, treeBonus, type CardTreeLevels } from "../src/cards/trees.ts";
import { hasLock, withDoorOdds } from "../src/doors.ts";
import { facing } from "../src/combat.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { Enemy, KeyColor, Player, Tile } from "../src/entities.ts";

const keyed = (keys: KeyColor[], heart = false): Tile => ({ kind: "door", color: keys[0], door: { type: "keys", keys, mode: "all", ...(heart ? { heart: true as const } : {}) } });
const steel = (heart = false): Tile => ({ kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "any", ...(heart ? { heart: true as const } : {}) } });
const wood: Tile = { kind: "door", door: { type: "wood", durability: 20 } };
const heart: Tile = { kind: "door", door: { type: "fullHp" } };

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
/** The hero after stepping into `door` with `trees`. */
function through(door: Tile, trees: CardTreeLevels, player: Partial<Player> = {}) {
  const g = beside(door, trees, player);
  assert.ok(g.move(1, 0));
  return g;
}

test("HEART DOOR's and WOODEN DOOR's trees: two tracks through every rarity, 10 levels to start and 60 once card buys open them all", () => {
  assert.deepEqual(CARD_TREES.heartDoor!.map((n) => [n.id, n.rarity, n.levels, n.max]), [
    ["doorGold", "common", 5, 10], ["doorSilver", "uncommon", 0, 5], ["goldBonus", "rare", 0, 5], ["freeDefense", "epic", 0, 5], ["doorChest", "legendary", 0, 5],
    ["doorCost", "common", 5, 10], ["transmute", "uncommon", 0, 5], ["shroudGrowth", "rare", 0, 5], ["lockPick", "epic", 0, 5], ["knock", "legendary", 0, 5],
  ]);
  assert.deepEqual(CARD_TREES.woodenDoor!.map((n) => [n.id, n.rarity, n.levels, n.max]), [
    ["doorGold", "common", 5, 10], ["doorSilver", "uncommon", 0, 5], ["goldBonus", "rare", 0, 5], ["freeDefense", "epic", 0, 5], ["doorChest", "legendary", 0, 5],
    ["doorCost", "common", 5, 10], ["durability", "uncommon", 0, 5], ["transmute", "rare", 0, 5], ["lockPick", "epic", 0, 5], ["druidicTalent", "legendary", 0, 5],
  ]);
  for (const card of ["heartDoor", "woodenDoor"] as const) {
    assert.equal(cardMaxLevel({}, card), 10);
    assert.equal(cardMaxLevel({ [card]: Object.fromEntries(CARD_TREES[card]!.map((n) => [n.id, n.max - n.levels])) }, card), 60);
  }
});

test("a Heart Door card's doors drain HP, keyed or not; a Wooden Door card's are Wooden Doors", () => {
  for (const t of [heart, keyed(["blue"], true), steel(true)]) assert.ok(hasLock(t, "heart"));
  for (const t of [keyed(["blue"]), steel(), wood]) assert.equal(hasLock(t, "heart"), false);
  assert.ok(hasLock(wood, "wood"));
  for (const t of [heart, steel(), keyed(["yellow"])]) assert.equal(hasLock(t, "wood"), false);
  assert.ok(hasLock(keyed(["yellow"], true), "yellow") && hasLock(keyed(["yellow"], true), "heart"), "a Gold Heart Door is both cards'");
});

test("the door cards' Gold, Silver, Chest and Knock add to DOOR's, each for its own doors", () => {
  const bonus = treeBonus({ door: { doorChest: 1 }, yellowDoor: { doorChest: 2 }, heartDoor: { doorChest: 3, doorGold: 4 }, woodenDoor: { doorChest: 4, lockPick: 5 } });
  assert.equal(doorStat(bonus, keyed(["yellow"], true), "Chest"), 1.2, "DOOR's, GOLD DOOR's and HEART DOOR's");
  assert.equal(doorStat(bonus, wood, "Chest"), 1);
  assert.equal(doorStat(bonus, keyed(["blue"]), "Chest"), 0.2, "DOOR's alone");
  assert.equal(doorStat(bonus, heart, "Gold"), 8);
  assert.equal(doorStat(bonus, wood, "Knock"), 5);
  assert.equal(doorStat(bonus, heart, "Knock"), 0);
});

test("HEART DOOR's and WOODEN DOOR's Gold and Silver come from their doors only", () => {
  const found = (door: Tile, trees: CardTreeLevels) => {
    const g = beside(door, trees), gold = g.save.gold, silver = g.run.silver ?? 0;
    assert.ok(g.move(1, 0));
    return [g.save.gold - gold, (g.run.silver ?? 0) - silver];
  };
  for (const [card, door] of [["heartDoor", heart], ["woodenDoor", wood]] as const) {
    const [plainGold] = found(door, {}), [gold, silver] = found(door, { [card]: { doorGold: 10, doorSilver: 5 } });
    assert.ok(gold > plainGold, `more Gold, ${card}`);
    assert.ok(silver > 0, `Silver found, ${card}`);
    assert.deepEqual(found(keyed(["blue"]), { [card]: { doorGold: 10, doorSilver: 5 } }), found(keyed(["blue"]), {}), "a blue door pays as without it");
  }
});

test("HEART DOOR's Door Cost cuts a Heart Door's drain, added to the card's own cut", () => {
  const hp = (door: Tile, trees: CardTreeLevels) => through(door, trees).run.player.hp;
  assert.equal(Math.round((hp(heart, { heartDoor: { doorCost: 10 } }) - hp(heart, {})) * 100) / 100, 4.9, "10% of the 49 HP drained");
  assert.equal(Math.round((hp(keyed(["blue"], true), { heartDoor: { doorCost: 10 } }) - hp(keyed(["blue"], true), {})) * 100) / 100, 4.9, "a Blue Heart Door's too");
  assert.equal(hp(keyed(["blue"]), { heartDoor: { doorCost: 10 } }), 50);
});

test("WOODEN DOOR's Door Cost cuts a Wooden Door's key, its Durability the HP breaking one down", () => {
  const keys = (trees: CardTreeLevels) => through(wood, trees).run.player.keys.yellow;
  assert.equal(Math.round((keys({ woodenDoor: { doorCost: 10 } }) - keys({})) * 100) / 100, 0.1);
  const none = { keys: { yellow: 0, blue: 0, red: 0 } };
  const hp = (trees: CardTreeLevels) => through(wood, trees, none).run.player.hp;
  assert.equal(Math.round((hp({ woodenDoor: { durability: 5 } }) - hp({})) * 100) / 100, 2, "10% of its 20 HP");
  assert.equal(hp({ woodenDoor: { doorCost: 10 } }), hp({}), "Door Cost leaves the HP alone");
  assert.equal(keys({ woodenDoor: { durability: 5 } }), keys({}), "Durability leaves the key alone");
});

test("Heart Knock opens a door draining HP for nothing, Wooden Lock Pick a Wooden Door, each adding to Secret Knock", () => {
  const knocked = through(heart, { heartDoor: { knock: 100 } });
  assert.equal(knocked.run.player.hp, 50);
  assert.match(knocked.message, /Secret Knock/);
  assert.deepEqual(through(wood, { woodenDoor: { lockPick: 100 } }).run.player.keys, { yellow: 2, blue: 2, red: 2 });
  assert.ok(through(wood, { heartDoor: { knock: 100 } }).run.player.keys.yellow < 2, "Heart Knock leaves a Wooden Door alone");
  assert.ok(through(heart, { woodenDoor: { lockPick: 100 } }).run.player.hp < 50, "Wooden Lock Pick leaves a Heart Door alone");
});

test("HEART DOOR's and WOODEN DOOR's Door Chests leave a treasure chest where their doors stood", () => {
  const chest = (door: Tile, trees: CardTreeLevels) => through(door, trees).world.tile(1, 0).kind;
  assert.equal(chest(heart, { heartDoor: { doorChest: 500 } }), "openedChest");
  assert.equal(chest(wood, { woodenDoor: { doorChest: 500 } }), "openedChest");
  assert.equal(chest(wood, { heartDoor: { doorChest: 500 } }), "floor");
  assert.equal(chest(heart, { woodenDoor: { doorChest: 500 } }), "floor");
});

test("WOODEN DOOR's Druidic Talent gives a gold key from an opened Wooden Door", () => {
  const plain = through(wood, {}).run.player.keys.yellow, g = through(wood, { woodenDoor: { druidicTalent: 100 } });
  assert.equal(g.run.player.keys.yellow, plain + 1);
  assert.match(g.message, /Druidic Talent/);
  assert.equal(through(wood, { woodenDoor: { druidicTalent: 100 } }, { keys: { yellow: 0, blue: 0, red: 0 } }).run.player.keys.yellow, 1, "broken down, too");
  assert.equal(through(heart, { woodenDoor: { druidicTalent: 100 } }).run.player.keys.yellow, 2, "a Heart Door gives none");
});

test("HEART DOOR's Shroud Growth adds shroud for the run with each drain paid", () => {
  const g = through(heart, { heartDoor: { shroudGrowth: 2 } });
  assert.equal(g.run.player.doorShroud, 0.1);
  lay(g, keyed(["blue"], true));
  delete g.run.changes["1,0"];
  Object.assign(g.run.player, { x: 0, y: 0, hp: 50 });
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.doorShroud, 0.2, "a Blue Heart Door's drain too");
  assert.equal(through(heart, { heartDoor: { shroudGrowth: 2, knock: 100 } }).run.player.doorShroud, undefined, "none for a door opened for nothing");
  assert.equal(through(keyed(["blue"]), { heartDoor: { shroudGrowth: 2 } }).run.player.doorShroud, undefined, "none for a door draining nothing");
  assert.equal(decode(JSON.stringify(g.save)).tower.run!.player.doorShroud, 0.2, "saved");
  const hero: Player = { x: 0, y: 0, hp: 50, maxHp: 100, attack: 10, defense: 0, shroud: 10, keys: { yellow: 0, blue: 0, red: 0 } };
  const enemy = { hp: 10, attack: 5, defense: 0, strength: "weak" } as Enemy;
  assert.equal(facing({ ...hero, doorShroud: 10 }, enemy).shroud, 11);
  assert.equal(facing({ ...hero, doorShroud: 10, foeShroud: { monster: 10 } }, enemy).shroud, 12, "added into one card factor with the trees' shroud");
});

test("Wooden Door Transmute makes Heart Doors taking no keys Wooden Doors, Heart Lock Pick takes keyed doors' drains, as floors are generated", () => {
  const odds = { skeleton: 0, lockPick: 0, wood: 100, heartPick: 100 };
  assert.deepEqual(withDoorOdds(heart, 3, 4, 9, odds, () => 12), { kind: "door", door: { type: "wood", durability: 12 } });
  assert.deepEqual(withDoorOdds(keyed(["blue"], true), 3, 4, 9, odds, () => 12), keyed(["blue"]));
  assert.deepEqual(withDoorOdds(steel(true), 3, 4, 9, odds, () => 12), steel());
  assert.deepEqual(withDoorOdds(keyed(["yellow", "red"], true), 3, 4, 9, { ...odds, lockPick: 100 }, () => 12), keyed(["yellow"]), "then DOOR's Lock Pick");
  for (const t of [keyed(["blue"]), wood, steel()]) assert.equal(withDoorOdds(t, 3, 4, 9, odds, () => 12), t, "doors draining nothing");
  // On real floors (Heart Doors come late in the Tower): every Heart Door taking no keys goes at 100%, a higher chance only remakes more.
  const doors = (wood: number) => {
    const out: Tile[] = [];
    for (const seed of [7, 11]) for (let room = 185; room < 200; room++)
      for (const t of new RoomWorld(seed, room, {}, 0, 2, undefined, undefined, undefined, { skeleton: 0, lockPick: 0, wood }).cells.values()) if (t.kind === "door") out.push(t);
    return out;
  };
  const isHeart = (t: Tile) => t.door?.type === "fullHp";
  assert.ok(doors(0).some(isHeart));
  assert.equal(doors(100).filter(isHeart).length, 0);
  const some = doors(30), more = doors(60);
  some.forEach((t, i) => isHeart(t) || assert.deepEqual(more[i], t, "a door remade at 30% is remade at 60%"));
});

test("a run fixes both cards' Wooden Door Transmute, added up, and Heart Lock Pick in its door odds and saves them", () => {
  const s = defaults();
  s.cardXp.heartDoor = MAX_CARD_XP;
  s.cardXp.woodenDoor = MAX_CARD_XP;
  s.hand = [...s.hand, "heartDoor", "woodenDoor"];
  s.cardTrees = { heartDoor: { doorCost: 5, transmute: 3, shroudGrowth: 1, lockPick: 1 }, woodenDoor: { doorCost: 5, durability: 1, transmute: 2 } };
  s.cardBuys.opened = { heartDoor: { transmute: 3, shroudGrowth: 1, lockPick: 1 }, woodenDoor: { durability: 1, transmute: 2 } };
  const g = new Game(s);
  g.newRun({ seed: 3 });
  assert.deepEqual(g.run.doorOdds, { skeleton: 0, lockPick: 0, wood: 14, heartPick: 1 });
  assert.deepEqual(decode(JSON.stringify(g.save)).tower.run!.doorOdds, { skeleton: 0, lockPick: 0, wood: 14, heartPick: 1 });
  assert.deepEqual(freeUpChances(treeBonus({ heartDoor: { freeDefense: 2 }, woodenDoor: { freeDefense: 2 } })), { defense: 200 });
});
