import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { addCardXp, CARD_LEVEL_XP, cardLevel, cardPoints, cardSheen, decodeCardXp, MAX_CARD_LEVEL, MAX_CARD_XP } from "../src/card-levels.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { CardId } from "../src/cards.ts";
import type { Save } from "../src/save-shape.ts";

test("the schedule: 25 levels in steps of five, double the first draft's", () => {
  assert.equal(MAX_CARD_LEVEL, 25);
  assert.deepEqual(CARD_LEVEL_XP.slice(0, 5), [200, 400, 600, 800, 1000]);
  assert.deepEqual(CARD_LEVEL_XP.slice(20), [12500, 14500, 17000, 20000, 23500]);
  assert.equal(MAX_CARD_XP, 170_500);
});

test("a card's level, its XP into the next and what that costs", () => {
  assert.deepEqual(cardLevel(0), { level: 0, into: 0, needed: 200 });
  assert.deepEqual(cardLevel(199), { level: 0, into: 199, needed: 200 });
  assert.deepEqual(cardLevel(200), { level: 1, into: 0, needed: 400 });
  assert.deepEqual(cardLevel(700), { level: 2, into: 100, needed: 600 });
  assert.deepEqual(cardLevel(MAX_CARD_XP - 1), { level: 24, into: 23499, needed: 23500 });
  assert.deepEqual(cardLevel(MAX_CARD_XP), { level: 25, into: 0, needed: 0 });
  assert.deepEqual(cardLevel(MAX_CARD_XP * 2), { level: 25, into: 0, needed: 0 });
  assert.equal(cardPoints(700), 2, "a point a level");
});

test("the sheen: silver from level 15, gold at the cap", () => {
  assert.deepEqual([cardSheen(14), cardSheen(15), cardSheen(24), cardSheen(25)], ["", "silver", "silver", "gold"]);
});

test("XP added reports each level crossed and stops at the cap", () => {
  const xp: Partial<Record<CardId, number>> = {};
  assert.deepEqual(addCardXp(xp, "door", 199), []);
  assert.deepEqual(addCardXp(xp, "door", 1), [1]);
  assert.deepEqual(addCardXp(xp, "door", 1000), [2, 3]);
  assert.deepEqual(addCardXp(xp, "door", MAX_CARD_XP), [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);
  assert.equal(xp.door, MAX_CARD_XP);
  assert.deepEqual(addCardXp(xp, "door", 1), [], "nothing past the cap");
});

test("the decoder keeps known cards' whole XP, the cap at most, and drops the rest", () => {
  assert.deepEqual(decodeCardXp({ door: 12.7, key: 0, nope: 5, stairs: -3, monster: MAX_CARD_XP + 9, heal: "7" }), { door: 12, monster: MAX_CARD_XP });
  assert.deepEqual(decodeCardXp(null), {});
  const save = defaults();
  save.cardXp = { stairs: 450 };
  assert.deepEqual(decode(JSON.stringify(save)).cardXp, { stairs: 450 });
  assert.deepEqual(defaults().cardXp, {});
});

/** A Tower corridor along the bottom row, the stairs at its east end, a
 * yellow key at (2, 0), and the hero at its west end holding `hand`. */
function corridor(hand: CardId[], edit: (save: Save) => void = () => {}) {
  const save = defaults();
  save.upgrades.inspirationUndos = 1;
  save.upgrades.keySiphon = 1;
  save.training.hp = 3;
  edit(save);
  const g = new Game(save);
  g.newRun({ seed: 7 });
  g.run.hand = hand;
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let x = 0; x < 6; x++) w.cells.set(`${x},0`, { kind: "floor" });
  w.cells.set("2,0", { kind: "key", color: "yellow" });
  w.cells.set("6,0", { kind: "stairs" });
  w.torches = [];
  Object.assign(g.run.player, { x: 0, y: 0 });
  return g;
}

test("a card gains an XP each time it activates: on reaching its target, and acting in place", () => {
  const g = corridor(["key", "stairs"]);
  g.autoTurn();
  assert.equal(g.save.cardXp.key, undefined, "on its way, nothing");
  g.autoTurn();
  assert.equal(g.run.player.x, 2);
  assert.equal(g.save.cardXp.key, 1, "the key reached");
  const siphon = corridor(["keySiphon", "stairs"]);
  siphon.autoTurn();
  assert.equal(siphon.save.cardXp.keySiphon, 1);
});

test("undo takes an activation's XP back", () => {
  const g = corridor(["keySiphon", "stairs"]);
  g.autoTurn();
  assert.equal(g.save.cardXp.keySiphon, 1);
  assert.ok(g.undo());
  assert.equal(g.save.cardXp.keySiphon, undefined);
});

test("a level reached is queued for the hand's animation, and undo empties the queue", () => {
  const g = corridor(["keySiphon", "stairs"], (s) => (s.cardXp = { keySiphon: 199 }));
  g.autoTurn();
  assert.deepEqual(g.cardLevelUps, [{ card: "keySiphon", level: 1 }]);
  assert.ok(g.undo());
  assert.deepEqual(g.cardLevelUps, []);
  assert.equal(g.save.cardXp.keySiphon, 199);
});

test("ARCHER, which never activates, gains an XP a new floor: two for a floor Skip climbs past", () => {
  const g = corridor(["stairs", "archer"]);
  g.advanceTowerRoom();
  assert.equal(g.save.cardXp.archer, 1);
  g.advanceTowerRoom(true);
  assert.equal(g.save.cardXp.archer, 3);
  assert.equal(g.save.cardXp.stairs, undefined, "taking the stairs by itself is no activation");
});

test("ARCHER gains an XP for each of the Delve's equivalent floors passed", () => {
  const save = defaults();
  save.upgrades.delve = 1;
  const g = new Game(save);
  g.switchMode("delve");
  g.newRun({ seed: 3 });
  g.run.hand = ["stairs", "archer"];
  g.run.maxHeight = 35;
  (g as unknown as { payDelveFloors(from: number, at: { x: number; y: number }): void }).payDelveFloors(0, g.run.player);
  assert.equal(g.save.cardXp.archer, 3);
});
