import { test } from "node:test";
import assert from "node:assert/strict";
import { decode } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { CARD_LEVEL_XP } from "../src/cards/levels.ts";
import { raiseNode } from "../src/cards/trees.ts";
import { playedSave } from "./first-skills.ts";

/** XP enough for `levels` card levels. */
const xpFor = (levels: number) => CARD_LEVEL_XP.slice(0, levels).reduce((a, b) => a + b, 0);

/** A game in the forest with the Deck open and its lessons on the hand done. */
function forest() {
  const g = new Game(playedSave());
  g.newRun({ outside: true, seed: 1 });
  Object.assign(g.save.tutorials, { deck: true, removeCard: true, addCard: true, enter: true, climb: true });
  g.save.upgrades.combatStance = 1;
  return g;
}

test("a card level-up dots the Deck tab, counting the cards with points to spend, until the page shows", () => {
  const g = forest();
  assert.equal(g.notices.waiting("deck"), false);
  g.save.cardXp.door = xpFor(2);
  g.save.cardXp.key = xpFor(1);
  assert.ok(g.notices.waiting("deck"));
  assert.equal(g.notices.deckCount(), 2, "two cards with points, not three points");
  assert.equal(g.notices.shown("deck"), true);
  assert.equal(g.notices.waiting("deck"), false, "opening the Deck dismisses the dot, points left or not");
  raiseNode(g.save, "door", "doorCost");
  assert.equal(g.notices.waiting("deck"), false, "spending brings no dot");
  g.save.cardXp.monster = xpFor(1);
  assert.ok(g.notices.waiting("deck"), "the next level-up brings it back");
  assert.equal(g.notices.deckCount(), 3);
});

test("a card new to the deck counts on the Deck tab's dot too", () => {
  const g = forest();
  g.save.upgrades.cardHeal = 1;
  assert.equal(g.notices.deckCount(), 1);
  g.save.cardXp.heal = xpFor(1);
  assert.equal(g.notices.deckCount(), 2, "the same card, new and with a point, counts once each");
});

test("a card wears NEW until the player meets it, and the starting hand never does", () => {
  const g = forest();
  for (const id of g.save.hand) assert.equal(g.notices.isNew(id), false);
  g.save.upgrades.cardHeal = 1;
  g.notices.shown("deck");
  assert.ok(g.notices.isNew("heal"), "opening the page leaves NEW on");
  assert.equal(g.notices.met("heal"), true);
  assert.equal(g.notices.isNew("heal"), false);
  assert.equal(g.notices.met("heal"), false, "nothing new the second time");
});

test("the card points lesson waits in either forest for a card with points, after the Deck's own lessons", () => {
  const g = forest();
  assert.equal(g.cardPointsLesson, null);
  g.save.cardXp.door = xpFor(1);
  g.save.cardXp.key = xpFor(3);
  assert.equal(g.cardPointsLesson, "key", "the card with the most points");
  assert.equal(g.boardLesson, "cards");
  g.save.tutorials.enter = false;
  assert.equal(g.boardLesson, "enter", "the Tower's note to try again comes first");
  g.save.tutorials.enter = true;
  g.save.tutorials.deck = false;
  assert.equal(g.cardPointsLesson, null, "the hand's order is taught first");
  g.save.tutorials.deck = true;
  g.save.upgrades.combatStance = 0;
  assert.equal(g.cardPointsLesson, null, "the Deck must be open");
  g.save.upgrades.combatStance = 1;
  g.save.upgrades.delve = 1;
  g.switchMode("delve", true);
  assert.equal(g.boardLesson, "cards", "the Delve's forest too");
  g.save.tutorials.cardPoints = true;
  assert.equal(g.boardLesson, null);
});

test("the card points lesson never shows inside a run, and points only at cards the Deck page shows", () => {
  const g = forest();
  g.save.upgrades.cardHeal = 1;
  g.save.cardXp.heal = xpFor(2);
  assert.equal(g.cardPointsLesson, null, "without Buildout the deck's cards don't show");
  g.save.upgrades.buildout = 1;
  assert.equal(g.cardPointsLesson, "heal");
  g.save.cardXp.door = xpFor(2);
  assert.equal(g.cardPointsLesson, "door", "of equal points, the hand's first");
  g.newRun({ seed: 2 });
  assert.equal(g.cardPointsLesson, null);
  assert.notEqual(g.boardLesson, "cards");
});

test("a save decodes its card lesson and NEW marks: met its deck, seen its levels, and taught once a point was spent", () => {
  const old = playedSave() as any;
  old.upgrades.combatStance = 1;
  old.upgrades.cardHeal = 1;
  old.cardXp = { door: xpFor(2) };
  old.cardTrees = { door: { doorCost: 1 } };
  delete old.seen.met;
  delete old.seen.cardLevels;
  delete old.tutorials.cardPoints;
  const d = decode(JSON.stringify(old));
  assert.ok(d.seen.met.includes("heal"), "a save from before NEW has met its deck");
  assert.equal(d.seen.cardLevels, 2, "and seen its cards' levels");
  assert.equal(d.tutorials.cardPoints, true, "a point already spent needs no lesson");
  const fresh = decode(JSON.stringify(playedSave()));
  assert.equal(fresh.tutorials.cardPoints, false);
  assert.deepEqual(fresh.seen.met, playedSave().seen.met);
});
