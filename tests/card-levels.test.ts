import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { addCardXp, BASE_MAX_LEVEL, CARD_LEVEL_XP, cardLevel, cardPoints, decodeCardXp, MAX_CARD_LEVEL, MAX_CARD_XP } from "../src/cards/levels.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { CardId } from "../src/cards/cards.ts";
import type { Save } from "../src/save/shape.ts";

/** The XP that reaches level `n`. */
const xpTo = (n: number) => CARD_LEVEL_XP.slice(0, n).reduce((a, b) => a + b, 0);

test("the schedule: 60 levels, half the first 25's XP, each later level's step 250 more", () => {
  assert.equal(MAX_CARD_LEVEL, 60);
  assert.equal(BASE_MAX_LEVEL, 10);
  assert.deepEqual(CARD_LEVEL_XP.slice(0, 5), [100, 200, 300, 400, 500]);
  assert.deepEqual(CARD_LEVEL_XP.slice(20, 25), [6250, 7250, 8500, 10000, 11750]);
  assert.deepEqual(CARD_LEVEL_XP.slice(25, 28), [13750, 16000, 18500]);
  for (let i = 25; i < 60; i++) assert.equal(CARD_LEVEL_XP[i] - CARD_LEVEL_XP[i - 1], CARD_LEVEL_XP[i - 1] - CARD_LEVEL_XP[i - 2] + 250, `level ${i + 1}`);
  assert.equal(CARD_LEVEL_XP[59], 230_500);
  assert.equal(MAX_CARD_XP, 3_541_500);
});

test("a card's level, its XP into the next and what that costs, under its max level", () => {
  assert.deepEqual(cardLevel(0), { level: 0, into: 0, needed: 100, capped: false });
  assert.deepEqual(cardLevel(99), { level: 0, into: 99, needed: 100, capped: false });
  assert.deepEqual(cardLevel(100), { level: 1, into: 0, needed: 200, capped: false });
  assert.deepEqual(cardLevel(350), { level: 2, into: 50, needed: 300, capped: false });
  assert.deepEqual(cardLevel(MAX_CARD_XP - 1), { level: 59, into: 230_499, needed: 230_500, capped: false });
  assert.deepEqual(cardLevel(MAX_CARD_XP), { level: 60, into: 0, needed: 0, capped: true });
  assert.deepEqual(cardLevel(MAX_CARD_XP * 2), { level: 60, into: 0, needed: 0, capped: true });
  assert.deepEqual(cardLevel(xpTo(12) + 5, 10), { level: 10, into: xpTo(12) + 5 - xpTo(10), needed: 1800, capped: true }, "the XP past the cap keeps counting");
  assert.deepEqual(cardLevel(xpTo(12) + 5, 11).level, 11, "and turns into levels as the cap rises");
  assert.equal(cardPoints(350), 2, "a point a level");
  assert.equal(cardPoints(xpTo(30), 10), 10, "no more than the cap's");
});

test("XP added reports each level crossed under the cap, and keeps counting past it to level 60's", () => {
  const xp: Partial<Record<CardId, number>> = {};
  assert.deepEqual(addCardXp(xp, "door", 99, 10), []);
  assert.deepEqual(addCardXp(xp, "door", 1, 10), [1]);
  assert.deepEqual(addCardXp(xp, "door", 500, 10), [2, 3]);
  assert.deepEqual(addCardXp(xp, "door", xpTo(20), 10), [4, 5, 6, 7, 8, 9, 10], "the cap stops the levels");
  assert.equal(xp.door, 600 + xpTo(20), "not the XP");
  const from = cardLevel(xp.door!).level;
  assert.equal(from, 20, "the same XP under no cap");
  assert.deepEqual(addCardXp(xp, "door", MAX_CARD_XP), Array.from({ length: 40 }, (_, i) => i + 21), "with no cap, every level on to 60");
  assert.equal(xp.door, MAX_CARD_XP);
  assert.deepEqual(addCardXp(xp, "door", 1), [], "nothing past level 60's");
});

test("the decoder keeps known cards' whole XP, level 60's at most, and drops the rest", () => {
  assert.deepEqual(decodeCardXp({ door: 12.7, key: 0, nope: 5, stairs: -3, monster: MAX_CARD_XP + 9, heal: "7" }), { door: 12, monster: MAX_CARD_XP });
  assert.deepEqual(decodeCardXp(null), {});
  const save = defaults();
  save.cardXp = { stairs: 450 };
  assert.deepEqual(decode(JSON.stringify(save)).cardXp, { stairs: 450 });
  assert.deepEqual(defaults().cardXp, {});
});

/** A Tower corridor along the bottom row, the stairs at its east end, a
 * gold key at (2, 0), and the hero at its west end holding `hand`. */
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
  const g = corridor(["keySiphon", "stairs"], (s) => (s.cardXp = { keySiphon: 99 }));
  g.autoTurn();
  assert.deepEqual(g.cardLevelUps, [{ card: "keySiphon", level: 1 }]);
  assert.ok(g.undo());
  assert.deepEqual(g.cardLevelUps, []);
  assert.equal(g.save.cardXp.keySiphon, 99);
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
