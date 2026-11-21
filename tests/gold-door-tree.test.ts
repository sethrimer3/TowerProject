import { givePowers, type GivenPowers } from "./powers-helper.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { MAX_CARD_XP } from "../src/cards/levels.ts";
import { freeUpChances, powerBonus } from "../src/cards/powers.ts";
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
function beside(door: Tile, trees: GivenPowers, player: Partial<Player> = {}) {
  const s = defaults();
  const g = new Game(s);
  g.newRun({ seed: 7 });
  g.run.handLevels = givePowers(trees);
  lay(g, door);
  Object.assign(g.run.player, { x: 0, y: 0, hp: 50, maxHp: 100, keys: { yellow: 2, blue: 2, red: 2 } }, player);
  return g;
}

test("a door has a gold lock when gold is among the colours it needs; a Steel Door, taking any key, has none", () => {
  assert.ok(goldLocked(keyed(["yellow"])));
  assert.ok(goldLocked(keyed(["yellow", "red"], true)));
  for (const t of [keyed(["blue"]), steel(), wood, { kind: "door", door: { type: "fullHp" } } as Tile]) assert.equal(goldLocked(t), false);
});

test("GOLD DOOR's Gold and Silver add to DOOR's, from doors with a gold lock only", () => {
  const found = (door: Tile, trees: GivenPowers) => {
    const g = beside(door, trees), gold = g.save.gold, silver = g.run.silver ?? 0;
    assert.ok(g.move(1, 0));
    return [g.save.gold - gold, (g.run.silver ?? 0) - silver];
  };
  const [plainGold] = found(keyed(["yellow", "blue"]), {});
  const [gold, silver] = found(keyed(["yellow", "blue"]), { yellowDoor: { yellowLockGold: 20, yellowLockSilver: 0.5 } });
  assert.ok(gold > plainGold, "more Gold");
  assert.ok(silver > 0, "Silver found");
  assert.deepEqual(found(keyed(["blue"]), { yellowDoor: { yellowLockGold: 20, yellowLockSilver: 0.5 } }), found(keyed(["blue"]), {}), "a blue door pays as without it");
  assert.deepEqual(found(keyed(["yellow"]), { yellowDoor: { yellowLockGold: 10 }, door: { doorGold: 10 } }), found(keyed(["yellow"]), { door: { doorGold: 20 } }), "added into DOOR's Door Gold");
});

test("GOLD DOOR's Gold Door Heal adds to DOOR's Door Heal for a door with a gold lock, after a Heart Door's drain", () => {
  const heal = (door: Tile, rules = {}) => (resolveStep(hero, door, { ...BASE_RULES, yellowLockHeal: 4, ...rules }) as StepEffect).healed;
  assert.equal(heal(keyed(["yellow"])), 4);
  assert.equal(heal(keyed(["yellow"]), { doorHeal: 1 }), 5);
  assert.equal(heal(keyed(["blue"]), { doorHeal: 1 }), 1, "DOOR's alone on a blue door");
  assert.equal((resolveStep(hero, keyed(["yellow", "blue"], true), { ...BASE_RULES, yellowLockHeal: 4 }) as StepEffect).player.hp, 5, "drained to 1, then healed");
  const g = beside(keyed(["yellow"]), { yellowDoor: { yellowLockHeal: 1 } });
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, 51);
});

test("GOLD DOOR's Gold Key Cost is GOLD KEY's: less of each gold key a door takes", () => {
  assert.equal(powerBonus(givePowers({ yellowDoor: { yellowDoorCost: 3 }, yellowKey: { yellowDoorCost: 2 } })).yellowDoorCost, 5);
  const g = beside(keyed(["yellow", "blue"]), { yellowDoor: { yellowDoorCost: 10 } });
  assert.ok(g.move(1, 0));
  assert.deepEqual(g.run.player.keys, { yellow: 1.1, blue: 1, red: 2 });
});

test("GOLD DOOR's Gold Knock opens a door with a gold lock for nothing, adding to Secret Knock", () => {
  const free = beside(keyed(["yellow", "red"]), { yellowDoor: { yellowLockKnock: 100 } });
  assert.ok(free.move(1, 0));
  assert.deepEqual(free.run.player.keys, { yellow: 2, blue: 2, red: 2 });
  assert.match(free.message, /Secret Knock/);
  const blue = beside(keyed(["blue"]), { yellowDoor: { yellowLockKnock: 100 } });
  assert.ok(blue.move(1, 0));
  assert.equal(blue.run.player.keys.blue, 1, "a blue door takes its key");
});

test("GOLD DOOR's Gold Door Chest leaves a treasure chest where a door with a gold lock stood", () => {
  const chest = (door: Tile) => {
    const g = beside(door, { yellowDoor: { yellowLockChest: 100 } });
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

test("a run fixes GOLD DOOR's Lock Pick in its door odds and saves them; it adds to DOOR's", () => {
  const s = defaults();
  // Epic at level 40: its Lock Pick power holds all ten levels.
  s.cardXp.yellowDoor = MAX_CARD_XP;
  s.cardAscension.yellowDoor = 3;
  s.hand = [...s.hand, "yellowDoor"];
  const g = new Game(s);
  g.newRun({ seed: 3 });
  assert.deepEqual(g.run.doorOdds, { skeleton: 0, lockPick: 10 });
  assert.deepEqual(decode(JSON.stringify(g.save)).tower.run!.doorOdds, { skeleton: 0, lockPick: 10 });
  assert.equal(powerBonus(givePowers({ yellowDoor: { lockPick: 2 }, door: { lockPick: 1 } })).lockPick, 3);
  assert.deepEqual(freeUpChances(powerBonus(givePowers({ yellowDoor: { freeUtilityChance: 1 } }))), { utility: 100 });
});
