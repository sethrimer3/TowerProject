import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode } from "../src/save/save.ts";
import { MAX_CARD_XP } from "../src/cards/levels.ts";
import { freeUpChances, treeBonus, type CardTreeLevels } from "../src/cards/trees.ts";
import { doorDiscount, withDoorOdds } from "../src/doors.ts";
import { resolveStep, BASE_RULES, HEART_DOOR_HP, type StepEffect } from "../src/step-effects.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { KeyColor, Player, Tile } from "../src/entities.ts";
import { playedSave } from "./first-skills.ts";

const keyed = (keys: KeyColor[], heart = false): Tile => ({ kind: "door", color: keys[0], door: { type: "keys", keys, mode: "all", ...(heart ? { heart: true as const } : {}) } });
const hero: Player = { x: 0, y: 0, hp: 50, maxHp: 100, attack: 10, defense: 0, shroud: 0, keys: { yellow: 2, blue: 2, red: 2 } };

/** Lays the floor of `g`'s world: (0, 0) and (2, 0) open, `door` between
 * them. Undo builds the floor afresh, so a test lays it again after one. */
const lay = (g: Game, door: Tile) => ((g.world as RoomWorld).cells = new Map([["0,0", { kind: "floor" }], ["1,0", door], ["2,0", { kind: "floor" }]]));
/** A Tower run on seed 7 whose hand's trees are `trees`, the hero at (0, 0)
 * with `door` beside it at (1, 0). */
function beside(door: Tile, trees: CardTreeLevels, player: Partial<Player> = {}) {
  const s = playedSave();
  s.upgrades.inspirationUndos = 1;
  const g = new Game(s);
  g.newRun({ seed: 7 });
  g.run.cardTrees = trees;
  lay(g, door);
  Object.assign(g.run.player, { x: 0, y: 0, hp: 50, maxHp: 100, keys: { yellow: 2, blue: 2, red: 2 } }, player);
  return g;
}

test("DOOR's Door Cost takes less of each key a door takes, and leaves the HP a door takes alone", () => {
  const yellow = keyed(["yellow"]), blue = keyed(["blue"]);
  assert.deepEqual(doorDiscount(blue, { all: 10 }), { keys: 0.9, toll: 1 });
  assert.deepEqual(doorDiscount(yellow, { yellow: 5, all: 10 }), { keys: 0.85, toll: 1 });
  const wood: Tile = { kind: "door", door: { type: "wood", durability: 20 } };
  assert.deepEqual(doorDiscount(wood, { all: 10 }), { keys: 0.9, toll: 1 }, "a Wooden Door's key, not its toll");
  assert.deepEqual(doorDiscount(wood, { wood: 5, all: 10 }), { keys: 0.85, toll: 0.95 }, "WOODEN DOOR's own cuts both");
  assert.deepEqual(doorDiscount(keyed(["blue"], true), { all: 10 }), { keys: 0.9, toll: 1 }, "nor a Heart Door's drain");
});

test("DOOR's Door Heal heals a share of max HP on each door, after a Heart Door's drain, up to max HP", () => {
  const heal = (door: Tile, hp = 50) => resolveStep({ ...hero, hp }, door, { ...BASE_RULES, doorHeal: 5 }) as StepEffect;
  assert.deepEqual([heal(keyed(["yellow"])).player.hp, heal(keyed(["yellow"])).healed], [55, 5]);
  assert.equal(heal({ kind: "door", door: { type: "fullHp" } }).player.hp, HEART_DOOR_HP + 5, "drained to 1, then healed");
  assert.deepEqual([heal(keyed(["yellow"]), 98).player.hp, heal(keyed(["yellow"]), 98).healed], [100, 2], "up to max HP");
  assert.equal(heal(keyed(["yellow"]), 100).healed, 0);
  assert.equal((resolveStep(hero, keyed(["yellow"])) as StepEffect).healed, 0, "none without the node");
  const g = beside({ kind: "door", door: { type: "fullHp" } }, { door: { doorHeal: 10 } });
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, HEART_DOOR_HP + 5);
});

test("DOOR's Door Silver finds Silver with each door opened", () => {
  const silverFrom = (doorSilver: number) => {
    const g = beside(keyed(["yellow"]), doorSilver ? { door: { doorSilver } } : {});
    const before = g.run.silver ?? 0;
    assert.ok(g.move(1, 0));
    return (g.run.silver ?? 0) - before;
  };
  assert.equal(silverFrom(0), 0);
  assert.ok(silverFrom(5) > 0);
});

test("DOOR's Secret Knock opens a door the hero can open for nothing: no keys, no HP", () => {
  const free = beside(keyed(["yellow", "blue"], true), { door: { secretKnock: 100 } });
  assert.ok(free.move(1, 0));
  assert.deepEqual([free.run.player.keys, free.run.player.hp], [{ yellow: 2, blue: 2, red: 2 }, 50]);
  assert.match(free.message, /Secret Knock/);
  const wood = beside({ kind: "door", door: { type: "wood", durability: 20 } }, { door: { secretKnock: 100 } }, { keys: { yellow: 0, blue: 0, red: 0 } });
  assert.ok(wood.move(1, 0));
  assert.equal(wood.run.player.hp, 50, "no toll");
  const locked = beside(keyed(["red"]), { door: { secretKnock: 100 } }, { keys: { yellow: 0, blue: 0, red: 0 } });
  assert.equal(locked.move(1, 0), false, "a door the hero can't open stays shut");
  const plain = beside(keyed(["yellow"]), {});
  assert.ok(plain.move(1, 0));
  assert.equal(plain.run.player.keys.yellow, 1, "without the node, the key is spent");
  // A door's roll is its tile's: undo and the same door rolls the same.
  const some = beside(keyed(["yellow"]), { door: { secretKnock: 50 } }), first = (some.move(1, 0), some.run.player.keys.yellow);
  assert.ok(some.undo());
  lay(some, keyed(["yellow"]));
  assert.ok(some.move(1, 0));
  assert.equal(some.run.player.keys.yellow, first);
});

test("DOOR's Door Chest leaves an opened treasure chest where the door stood, its loot paid once", () => {
  const g = beside(keyed(["yellow"]), { door: { doorChest: 500 } });
  const gold = g.save.gold;
  assert.ok(g.move(1, 0));
  assert.equal(g.world.tile(1, 0).kind, "openedChest");
  assert.equal(g.run.treasures, 1);
  assert.ok(g.save.gold > gold, "the chest's Gold");
  assert.ok(g.undo());
  lay(g, keyed(["yellow"]));
  assert.equal(g.world.tile(1, 0).kind, "door");
  const paid = g.save.gold;
  assert.ok(g.move(1, 0));
  assert.equal(g.save.gold, paid, "undo can't pay the chest twice");
  const none = beside(keyed(["yellow"]), {});
  assert.ok(none.move(1, 0));
  assert.equal(none.world.tile(1, 0).kind, "floor");
});

test("DOOR's Skeleton Key makes colour doors Wooden Doors, and Lock Pick takes the rarest lock off a door of two or three colours", () => {
  const wood = withDoorOdds(keyed(["yellow", "blue"], true), 3, 4, 9, { skeleton: 100, lockPick: 0 }, () => 12);
  assert.deepEqual(wood, { kind: "door", door: { type: "wood", durability: 12 } });
  assert.deepEqual(withDoorOdds(keyed(["yellow", "blue"], true), 3, 4, 9, { skeleton: 0, lockPick: 100 }, () => 12), keyed(["yellow"], true), "a yellow-blue door becomes a gold one");
  assert.deepEqual(withDoorOdds(keyed(["yellow", "blue", "red"]), 3, 4, 9, { skeleton: 0, lockPick: 100 }, () => 12).door, { type: "keys", keys: ["yellow", "blue"], mode: "all" });
  assert.deepEqual(withDoorOdds(keyed(["blue", "red"]), 3, 4, 9, { skeleton: 0, lockPick: 100 }, () => 12).door, { type: "keys", keys: ["blue"], mode: "all" });
  assert.deepEqual(withDoorOdds(keyed(["red"]), 3, 4, 9, { skeleton: 0, lockPick: 100 }, () => 12), keyed(["red"]), "one colour keeps its lock");
  const steel: Tile = { kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "any" } }, heart: Tile = { kind: "door", door: { type: "fullHp" } };
  for (const t of [steel, heart]) assert.equal(withDoorOdds(t, 3, 4, 9, { skeleton: 100, lockPick: 100 }, () => 12), t, "only colour doors");
  // On real floors (the second tower's, with doors of every colour): every colour door goes at 100%, a higher chance only remakes more, and the floor is the same each time.
  const doors = (odds?: { skeleton: number; lockPick: number }) => {
    const out: Tile[] = [];
    for (let room = 0; room < 60; room++) for (const t of new RoomWorld(5, room, {}, 0, 2, undefined, undefined, undefined, odds).cells.values()) if (t.kind === "door") out.push(t);
    return out;
  };
  const plain = doors(), all = doors({ skeleton: 100, lockPick: 0 }), some = doors({ skeleton: 30, lockPick: 0 }), more = doors({ skeleton: 60, lockPick: 0 });
  const colour = (t: Tile) => t.door?.type === "keys" && t.door.mode === "all";
  assert.ok(plain.some(colour));
  assert.equal(all.filter(colour).length, 0);
  assert.ok(all.every((t) => t.door?.type !== "wood" || t.door.durability > 0));
  assert.ok(some.filter(colour).length > more.filter(colour).length && more.filter(colour).length > 0);
  some.forEach((t, i) => colour(t) || assert.deepEqual(more[i], t, "a door remade at 30% is remade at 60%"));
  assert.deepEqual(doors({ skeleton: 30, lockPick: 0 }), some);
  assert.ok(doors({ skeleton: 0, lockPick: 100 }).every((t) => !colour(t) || t.door!.type === "keys" && t.door!.keys.length === 1));
});

test("a run fixes DOOR's door odds as it goes inside and saves them; its floors' doors are remade", () => {
  const s = playedSave();
  s.cardXp.door = MAX_CARD_XP;
  s.cardTrees = { door: { doorCost: 5, doorHeal: 1, skeletonKey: 1 } };
  s.cardBuys.opened = { door: { doorHeal: 1, skeletonKey: 1 } };
  const g = new Game(s);
  g.newRun({ seed: 3 });
  assert.deepEqual(g.run.doorOdds, { skeleton: 1, lockPick: 0 });
  assert.deepEqual(decode(JSON.stringify(g.save)).tower.run!.doorOdds, { skeleton: 1, lockPick: 0 });
  g.save.cardTrees = {};
  g.newRun({ seed: 3 });
  assert.equal(g.run.doorOdds, undefined);
});

test("DOOR's Free Utility gives a Free Utility chance, trained or not", () => {
  assert.deepEqual(freeUpChances(treeBonus({ door: { freeUtility: 4 } })), { utility: 200 });
  assert.deepEqual(freeUpChances(treeBonus({ door: { freeUtility: 2 }, heal: { freeDefense: 2 } })), { defense: 100, utility: 100 });
  assert.equal(freeUpChances(treeBonus({})), undefined);
});
