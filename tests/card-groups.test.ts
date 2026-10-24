import { test } from "node:test";
import assert from "node:assert/strict";
import { keptLinks, linkedToNext, planHand, toggleLink, type CardId, type HandAt } from "../src/cards/cards.ts";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { unlockAt } from "../src/goals.ts";
import type { Board } from "../src/board.ts";
import type { Run } from "../src/runs.ts";
import type { Tile } from "../src/entities.ts";

// Card Groups (Tower II floor 80's Goal): cards linked side by side in the
// hand share one priority, the closest target of any of them taken first.

const LEGEND: Record<string, Tile> = {
  "#": { kind: "wall" }, ".": { kind: "floor" }, "@": { kind: "floor" }, P: { kind: "potion" },
  K: { kind: "key", color: "yellow" }, B: { kind: "key", color: "blue" }, A: { kind: "attack" },
};

/** A one-row board, `@` the hero. */
function row(tiles: string, links?: readonly boolean[]): HandAt {
  const world: Board = {
    width: tiles.length,
    floor: 0,
    tile: (x, y) => (y === 0 ? LEGEND[tiles[x] ?? "#"] : LEGEND["#"]),
    step: (x, y, dx, dy) => (x + dx < 0 || x + dx >= tiles.length || y + dy !== 0 ? null : { x: x + dx, y: 0 }),
    clear: () => {},
  };
  const player = { x: tiles.indexOf("@"), y: 0, hp: 100, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };
  return { world, run: { player } as Run, links };
}
const played = (at: HandAt, hand: readonly CardId[], only?: number) => {
  const plan = planHand(at, hand, "tower", only);
  return plan && { card: hand[plan.card], steps: plan.path.length };
};

test("a group heads for the closest target of any of its cards", () => {
  const hand: CardId[] = ["yellowKey", "blueKey", "heal"];
  assert.deepEqual(played(row("@...K.B"), hand), { card: "yellowKey", steps: 4 }, "alone, the first card leads");
  assert.deepEqual(played(row("@...K.B", [true, false]), hand), { card: "yellowKey", steps: 4 });
  assert.deepEqual(played(row("@.B..K", [true, false]), hand), { card: "blueKey", steps: 2 }, "the nearer key, whichever card wants it");
  assert.deepEqual(played(row("@P.B..K", [true, false]), hand), { card: "blueKey", steps: 3 }, "a card after the group waits its turn");
  assert.deepEqual(played(row("@P.B..K", [true, true]), hand), { card: "heal", steps: 1 }, "three cards linked share one priority");
  assert.deepEqual(played(row("B.@.K", [true, false]), hand), { card: "yellowKey", steps: 2 }, "of targets tied, the earlier card's");
});

test("a group with nothing to do gives way to the cards after it, and Focus plans its card alone", () => {
  const hand: CardId[] = ["yellowKey", "blueKey", "heal"];
  assert.deepEqual(played(row("@..P", [true, false]), hand), { card: "heal", steps: 3 });
  assert.deepEqual(played(row("@.B.K", [true, false]), hand, 0), { card: "yellowKey", steps: 4 }, "a focused card ignores its group");
});

test("a link holds only while both its cards stay side by side", () => {
  const hand: CardId[] = ["stairs", "yellowKey", "blueKey", "monster"];
  let links = toggleLink(hand, [], 1);
  assert.deepEqual(links, [["yellowKey", "blueKey"]]);
  assert.deepEqual(linkedToNext(hand, links), [false, true, false, false]);
  links = toggleLink(hand, links, 2);
  assert.deepEqual(linkedToNext(hand, links), [false, true, true, false], "a group of three");
  assert.deepEqual(toggleLink(hand, links, 1), [["blueKey", "monster"]], "pressed again, a link comes undone");
  assert.deepEqual(keptLinks(["yellowKey", "stairs", "blueKey", "monster"], links), [["blueKey", "monster"]], "a card moved out of place breaks its links");
  assert.deepEqual(keptLinks(["stairs", "blueKey", "yellowKey", "monster"], links), [], "even swapped, side by side");
});

/** A Game in the forest with the Card Groups Goal claimed. */
function forest(claimed = true) {
  const save = defaults();
  save.upgrades.combatStance = 1;
  save.upgrades.buildout = 1;
  if (claimed) {
    const at = unlockAt("cardGroups");
    save.goals.claimed[at.tower] = [at.floor];
  }
  const g = new Game(save);
  g.newRun({ outside: true, seed: 1 });
  return g;
}

test("the Deck links cards once Card Groups is claimed, and a move or a removal breaks them", () => {
  assert.equal(forest(false).deck.link(0), false, "not before the Goal is claimed");
  const g = forest();
  const hand = [...g.save.hand];
  assert.ok(g.deck.link(0));
  assert.ok(g.deck.link(1));
  assert.deepEqual(g.save.cardLinks, [[hand[0], hand[1]], [hand[1], hand[2]]]);
  assert.equal(g.deck.link(hand.length - 1), false, "the last card has no card after it to link to");
  assert.ok(g.deck.arrange(2, 3));
  assert.deepEqual(g.save.cardLinks, [[hand[0], hand[1]]], "the moved card's link is gone");
  assert.ok(g.deck.remove(hand[1] === "stairs" ? hand[0] : hand[1]));
  assert.deepEqual(g.save.cardLinks, [], "and a removed card's");
  assert.ok(g.deck.link(0));
  assert.deepEqual(decode(JSON.stringify(g.save)).cardLinks, g.save.cardLinks, "kept across a reload");
});

test("a run keeps the groups it went in with", () => {
  const g = forest();
  assert.ok(g.deck.link(0));
  assert.deepEqual(g.handRules.links.slice(0, 2), [true, false], "in the forest, the saved links");
  g.enterRun();
  assert.equal(g.run.outside, false);
  assert.deepEqual(g.run.links, g.save.cardLinks);
  assert.equal(g.deck.link(1), false, "not inside a run");
  g.save.cardLinks = [];
  assert.deepEqual(g.handRules.links.slice(0, 2), [true, false], "a later change waits for the next run");
  const loaded = new Game(decode(JSON.stringify(g.save)));
  assert.deepEqual(loaded.run.links, g.run.links, "and survives a reload");
});
