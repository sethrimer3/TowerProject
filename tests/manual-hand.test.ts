import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { cost } from "../src/progression/upgrades.ts";
import { HAND_SLOT_GEMS, manualSlots, nextManualSlotGems } from "../src/cards/cards.ts";
import { decode } from "../src/save/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { Save } from "../src/save/shape.ts";
import { playedSave } from "./first-skills.ts";

/** A played save in the forest with Buildout and Manual Hand owned, GK
 * SIPHON and GOLD KEY in its deck. */
function forest(edit: (save: Save) => void = () => {}) {
  const save = playedSave();
  for (const id of ["buildout", "combatStance", "keySiphon", "cardYellowKey", "manualHand"] as const) save.upgrades[id] = 1;
  edit(save);
  const g = new Game(save);
  g.newRun({ outside: true, seed: 3 });
  return g;
}

test("Manual Hand costs 10 Inspiration and opens a Manual hand of one slot, more for the Auto hand's Gem prices", () => {
  assert.equal(cost("manualHand", 0), 10);
  const save = playedSave();
  assert.equal(manualSlots(save), 0, "none before the skill");
  assert.equal(nextManualSlotGems(save), null);
  save.upgrades.manualHand = 1;
  assert.equal(manualSlots(save), 1);
  assert.equal(nextManualSlotGems(save), HAND_SLOT_GEMS[0]);
  assert.equal(HAND_SLOT_GEMS[0], 50);
  const g = forest((s) => (s.gems = 200));
  assert.ok(g.deck.buySlot("manual"));
  assert.deepEqual([g.save.gems, g.save.manualSlots, g.deck.slots("manual"), g.deck.slotGems("manual")], [150, 1, 2, HAND_SLOT_GEMS[1]]);
  assert.equal(g.save.handSlots, 0, "the Auto hand's slots are its own");
});

test("deck cards go into either hand, never both; STAIRS never leaves the Auto hand; the switch moves a card while the other hand has room", () => {
  const g = forest(), deck = g.deck;
  assert.ok(deck.remove("monster"), "room in the Auto hand");
  assert.equal(deck.add("stairs", "manual"), false, "STAIRS is in the Auto hand");
  assert.equal(deck.canSwitch("stairs"), false);
  assert.ok(deck.add("keySiphon", "manual"));
  assert.deepEqual(g.save.manualHand, ["keySiphon"]);
  assert.equal(deck.add("keySiphon", "auto"), false, "already in a hand");
  assert.equal(deck.add("yellowKey", "manual"), false, "the Manual hand is full");
  assert.equal(deck.full("manual"), true);
  assert.ok(deck.canSwitch("keySiphon"), "the Auto hand has room");
  assert.ok(deck.switch("keySiphon"));
  assert.deepEqual([g.save.hand.at(-1), g.save.manualHand], ["keySiphon", []]);
  assert.ok(deck.add("yellowKey", "manual"));
  assert.equal(deck.canSwitch("keySiphon"), false, "the Manual hand is full");
  assert.ok(deck.remove("yellowKey"));
  assert.deepEqual(g.save.manualHand, []);
  // Without the skill there is no Manual hand to switch to.
  const before = forest((s) => (s.upgrades.manualHand = 0));
  assert.equal(before.deck.add("keySiphon", "manual"), false);
  assert.ok(before.deck.remove("monster"));
  assert.ok(before.deck.add("keySiphon"));
  assert.equal(before.deck.canSwitch("keySiphon"), false);
});

/** A Tower corridor along the bottom row, the stairs at its east end, the
 * hero at its west end; GK SIPHON in the Manual hand, STAIRS alone in the
 * hand, with Max HP training to siphon. */
function corridor(edit: (save: Save) => void = () => {}) {
  const save = playedSave();
  for (const id of ["keySiphon", "manualHand", "inspirationUndos"] as const) save.upgrades[id] = 1;
  save.training.hp = 3;
  save.hand = ["stairs"];
  save.manualHand = ["keySiphon"];
  edit(save);
  const g = new Game(save);
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let x = 0; x < 6; x++) w.cells.set(`${x},0`, { kind: "floor" });
  w.cells.set("6,0", { kind: "stairs" });
  w.torches = [];
  Object.assign(g.run.player, { x: 0, y: 0 });
  return g;
}

test("a run going inside holds the Manual hand apart from the hand, its slots after the hand's", () => {
  const g = corridor();
  assert.deepEqual([g.run.hand, g.run.manual], [["stairs"], ["keySiphon"]]);
  assert.deepEqual([g.hand, g.manualHand, g.held], [["stairs"], ["keySiphon"], ["stairs", "keySiphon"]]);
});

test("a Manual card never plays by itself: pressed, it acts, and no other card can be pressed until it has", () => {
  const g = corridor(), p = g.run.player, keys = p.keys.yellow;
  assert.ok(g.handRules.canAct("keySiphon"), "the siphon could act");
  g.autoTurn();
  assert.deepEqual([p.x, p.keys.yellow], [1, keys], "STAIRS moves the hero; the siphon waits");
  assert.equal(g.focus(1), "focused", "pressing the Manual card");
  assert.equal(g.focus(0), "busy", "STAIRS can't be pressed while it is pending");
  g.autoTurn();
  assert.deepEqual([p.x, p.keys.yellow], [1, keys + 1], "it trades in place");
  assert.equal(g.run.focused, undefined);
  g.autoTurn();
  assert.deepEqual([p.x, p.keys.yellow], [2, keys + 1], "and the hand plays on without it");
});

test("a pressed Manual card that moves leads the hero to its target before the hand plays on", () => {
  const g = corridor((s) => {
    s.upgrades.cardYellowKey = 1;
    s.manualHand = ["yellowKey"];
  });
  const w = g.world as RoomWorld, p = g.run.player;
  w.cells.set("0,1", { kind: "floor" });
  w.cells.set("0,2", { kind: "key", color: "yellow" });
  const keys = p.keys.yellow;
  assert.equal(g.focus(1), "focused");
  assert.equal(g.focus(0), "busy");
  g.autoTurn();
  assert.deepEqual([p.x, p.y], [0, 1], "toward the key, not the stairs");
  g.autoTurn();
  assert.deepEqual([p.x, p.y, p.keys.yellow > keys, g.run.focused], [0, 2, true, undefined]);
});

test("Manual cards are held: their bonuses count, and ARCHER there still makes the hero an Archer", () => {
  const g = corridor((s) => {
    s.upgrades.cardYellowKey = 1;
    s.manualHand = ["yellowKey"];
  });
  assert.ok((g.handBonus.keys.yellow?.percent ?? 0) > 0, "GOLD KEY's key bonus");
  assert.equal(g.isArcher, false);
  g.run.manual = ["archer"];
  assert.equal(g.isArcher, true);
});

test("the save keeps the Manual hand only with Manual Hand, and only cards the hand doesn't hold", () => {
  const save = playedSave();
  for (const id of ["keySiphon", "cardYellowKey", "manualHand"] as const) save.upgrades[id] = 1;
  save.manualSlots = 1;
  save.manualHand = ["keySiphon", "stairs", "door", "yellowKey", "yellowKey"];
  const back = decode(JSON.stringify(save));
  assert.deepEqual([back.manualHand, back.manualSlots], [["keySiphon", "yellowKey"], 1]);
  save.upgrades.manualHand = 0;
  assert.deepEqual(decode(JSON.stringify(save)).manualHand, []);
});
