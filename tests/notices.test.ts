import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { xpForLevel } from "../src/config.ts";

/** A game in the forest, its Deck lessons done. */
function forest() {
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 1 });
  Object.assign(g.save.tutorials, { deck: true, removeCard: true, addCard: true });
  return g;
}

test("the first Inspiration puts a dot on the Upgrades tab until the page is shown", () => {
  const g = forest();
  assert.equal(g.notices.waiting("upgrades"), false);
  g.save.tower.inspiration = 1;
  assert.equal(g.notices.waiting("upgrades"), true);
  assert.equal(g.notices.shown("upgrades"), true);
  assert.equal(g.notices.waiting("upgrades"), false);
  assert.equal(g.notices.shown("upgrades"), false, "nothing new the second time");
});

test("the Gear skill dots the Gear tab until shown, and Equipment opened dots it until that tab shows", () => {
  const g = forest();
  assert.equal(g.notices.shown("gear"), false, "nothing to see before the skill");
  g.save.upgrades.gear = 1;
  assert.equal(g.notices.waiting("gear"), true);
  g.notices.shown("gear");
  assert.equal(g.notices.waiting("gear"), false);
  g.save.equipment.unlocked = true;
  assert.ok(g.notices.waiting("gear") && g.notices.waiting("equipment"));
  g.notices.shown("gear");
  assert.ok(g.notices.waiting("gear"), "opening the page on Provisions leaves Equipment unseen");
  assert.equal(g.notices.shown("equipment"), true);
  assert.ok(!g.notices.waiting("gear") && !g.notices.waiting("equipment"));
});

test("a level-up with points to spend dots the run's Research button and hamburger until the page shows, and the next brings it back", () => {
  const g = forest();
  g.save.xp = xpForLevel(1);
  assert.ok(g.notices.waiting("research"), "the Research tab shows points to spend");
  assert.equal(g.notices.waiting("run-research"), false, "the run's button is never dotted in the forest");
  assert.ok(g.enterRun());
  assert.ok(g.notices.waiting("run-research") && g.notices.waiting("run-menu"));
  assert.equal(g.notices.shown("research"), true);
  assert.ok(!g.notices.waiting("run-research") && !g.notices.waiting("run-menu"));
  assert.ok(g.notices.waiting("research"), "the tab's dot stays while points can be spent");
  g.save.xp = xpForLevel(2);
  assert.ok(g.notices.waiting("run-research"), "the next level-up");
});

test("the Research page's Training tab is dotted after a level-up until it shows", () => {
  const g = forest();
  g.save.xp = xpForLevel(1);
  assert.ok(g.notices.waiting("training"));
  g.notices.shown("research");
  assert.ok(g.notices.waiting("training"), "showing the Archives tab leaves it");
  assert.equal(g.notices.shown("training"), true);
  assert.equal(g.notices.waiting("training"), false);
  g.save.xp = xpForLevel(2);
  assert.ok(g.notices.waiting("training"));
});

test("a card new to the deck dots the Deck tab until the page shows, as does a lesson waiting", () => {
  const g = forest();
  g.save.upgrades.combatStance = 1;
  assert.equal(g.notices.waiting("deck"), false);
  g.save.upgrades.cardHeal = 1;
  assert.ok(g.notices.waiting("deck"));
  assert.equal(g.notices.shown("deck"), true);
  assert.equal(g.notices.waiting("deck"), false);
  g.save.tutorials.deck = false;
  assert.ok(g.notices.waiting("deck"), "the first lesson waits behind the tab");
});

test("showing a tree clears its dot and records it seen", () => {
  const g = forest();
  g.save.treeNotices.inspiration = true;
  g.save.tower.inspiration = 1;
  assert.ok(g.notices.waiting("inspiration") && g.notices.waiting("upgrades"));
  g.notices.shown("upgrades");
  assert.ok(g.notices.waiting("upgrades"), "opening the page on another tree leaves it");
  assert.equal(g.notices.shown("inspiration"), true);
  assert.equal(g.save.treeNotices.inspiration, false);
  assert.ok(!g.notices.waiting("inspiration") && !g.notices.waiting("upgrades"));
  assert.equal(g.notices.shown("inspiration"), false);
});
