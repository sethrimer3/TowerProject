import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { ENTRANCE_Y } from "../src/outside.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { chooseStep } from "../src/automation.ts";
import { CONSUMABLES } from "../src/crafting.ts";
import { silverForKill } from "../src/config.ts";

/** A Tower floor of open tiles with `size` columns and rows, the player in
 * the corner and (when it fits) the stairs opposite. */
function arena(size = 5) {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1; // undo needs Rehearsed steps
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  if (size > 1) w.cells.set(`${size - 1},${size - 1}`, { kind: "stairs" });
  g.run.player.x = 0;
  g.run.player.y = 0;
  return g;
}

test("inside a run the hand plays, and a turn steps along the first card's path", () => {
  const g = arena();
  assert.ok(g.auto, "the hand plays from the start of a run");
  g.autoTurn();
  assert.equal(g.activeCard, 0, "STAIRS, first in the base hand, moves the hero");
  assert.equal(g.cardPlan?.path.length, 7, "it commits to the rest of the shortest path");
  assert.equal(Math.abs(g.run.player.x) + Math.abs(g.run.player.y), 1);
  for (let i = 0; i < 7; i++) g.autoTurn();
  assert.equal(g.run.height, 1, "the path ends on the stairs");
});

test("a hand with no card that can act pauses, lights End Run, and plays on after the player acts", () => {
  const g = arena(3);
  (g.world as RoomWorld).cells.set("2,2", { kind: "floor" });
  const tonic = CONSUMABLES[0].id;
  g.save.consumables[tonic] = 2;
  g.autoTurn();
  assert.ok(g.handStuck && !g.auto && g.activeCard === null && !g.fallen);
  assert.deepEqual([g.run.player.x, g.run.player.y], [0, 0]);
  assert.match(g.message, /^No card can move/);
  // Acting while nothing has changed leaves it paused.
  assert.ok(g.useConsumable(tonic));
  assert.ok(g.handStuck && !g.auto);
  // Once the floor has changed (here, a key appearing, as a skill might
  // make), the player's next action sets the hand playing again.
  (g.world as RoomWorld).cells.set("2,0", { kind: "key", color: "yellow" });
  assert.ok(g.useConsumable(tonic));
  assert.ok(!g.handStuck && g.auto);
  g.autoTurn();
  assert.equal(g.save.hand[g.activeCard!], "yellowKey");
  assert.deepEqual([g.run.player.x, g.run.player.y], [1, 0]);
});

test("pausing the hand keeps its path and the card that led, and playing on follows it", () => {
  const g = arena();
  g.autoTurn();
  const path = g.cardPlan!.path.map(s => ({ ...s }));
  g.toggleAuto();
  assert.ok(!g.auto);
  assert.equal(g.activeCard, 0);
  assert.deepEqual(g.cardPlan?.path, path, "the path waits while paused");
  g.toggleAuto();
  assert.ok(g.auto && g.activeCard === 0);
  const [x, y] = [g.run.player.x, g.run.player.y];
  g.autoTurn();
  assert.deepEqual([g.run.player.x - x, g.run.player.y - y], [path[0].dx, path[0].dy], "it takes the path's next step");
  assert.deepEqual(g.cardPlan?.path, path.slice(1));
});

test("undo pauses the hand and drops its path", () => {
  const g = arena();
  g.autoTurn();
  assert.ok(g.undo());
  assert.ok(!g.auto && g.cardPlan === null && g.activeCard === null);
  g.toggleAuto();
  assert.ok(g.auto);
  assert.equal(g.message, "The hand takes over.");
  g.toggleAuto();
  assert.equal(g.message, "Paused · the hand waits.");
});

test("inside a run only Dev mode lets the player move the hero", () => {
  const g = arena();
  assert.equal(g.stepManually(1, 0), false);
  g.walkTo(4, 4);
  assert.deepEqual([g.run.player.x, g.run.player.y, g.route.length], [0, 0, 0]);
  assert.equal(g.message, "The hand moves you inside a run.");
  g.save.settings.devMode = true;
  assert.ok(g.stepManually(1, 0));
});

test("an Automove turn in the forest takes the step automation chooses and names it", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 1 });
  assert.ok(!g.auto, "the player walks the forest");
  const step = chooseStep(g);
  assert.ok(step);
  const { x, y } = g.run.player;
  g.autoTurn();
  assert.deepEqual([g.run.player.x, g.run.player.y], [x + step.dx, y + step.dy]);
  assert.equal(g.message, step.label);
});

test("a manual step drops the queued route and Automove", () => {
  const g = arena();
  g.save.settings.devMode = true;
  g.walkTo(4, 4);
  g.toggleAuto();
  assert.ok(g.route.length === 0 && g.auto, "turning Automove on drops the route");
  g.walkTo(4, 4);
  assert.ok(g.route.length && !g.auto, "walking turns Automove off");
  g.toggleAuto();
  assert.ok(g.stepManually(1, 0));
  assert.deepEqual([g.run.player.x, g.run.player.y, g.route.length, g.auto], [1, 0, 0, false]);
});

test("a deck card dragged to the hand goes into its slot, in the forest with Buildout only", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 1 });
  g.save.upgrades.cardHeal = 1;
  assert.equal(g.deck.place("heal", 1), false, "not before Buildout");
  g.save.upgrades.buildout = 1;
  assert.ok(g.deck.remove("door"));
  assert.ok(g.deck.place("heal", 1));
  assert.deepEqual(g.save.hand, ["stairs", "heal", "yellowKey", "monster"]);
  assert.ok(g.deck.place("door", 3), "a full hand swaps the card there out");
  assert.deepEqual(g.save.hand, ["stairs", "heal", "yellowKey", "door"]);
  assert.equal(g.deck.place("monster", 0), false, "STAIRS stays");
  assert.equal(g.deck.place("heal", 2), false, "a card already in the hand");
  assert.equal(g.deck.place("monster", 4), false, "no such slot");
  g.enterRun();
  assert.equal(g.deck.place("monster", 1), false, "only in the forest");
});

test("in the forest Enter goes straight in, starting the run with the hand playing", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 1 });
  g.toggleAuto();
  assert.ok(!g.auto, "the forest has no play or pause");
  assert.ok(g.enterRun());
  assert.ok(!g.run.outside && g.auto);
  assert.equal(g.run.player.y, 0, "at the entrance");
  assert.equal(g.enterRun(), false, "only from the forest");
});

test("ending a run goes straight back to the forest with the next run", () => {
  const g = arena();
  const retired = g.run.seed;
  g.finish("Ascent retired");
  assert.ok(g.run.outside && g.run.seed !== retired && g.save.tower.run === g.run);
  assert.equal(g.fallen, false);
  assert.match(g.message, /^Ascent retired.*Follow the forest path to begin again\.$/);
});

test("erasing everything leaves a fresh save with a new run outside the Tower", () => {
  const g = arena();
  g.setDevMode(true);
  g.switchMode("delve");
  g.finish("Delve run ended");
  g.eraseAll();
  assert.equal(g.mode, "tower");
  assert.ok(g.run.outside && g.save.tower.run === g.run);
  // Everything but the new run and the Defend city's random seed.
  const fresh = defaults();
  fresh.tower.run = g.run;
  fresh.defend.seed = g.save.defend.seed;
  assert.deepEqual(g.save, fresh);
});

test("the Deck reorders the hand only with Combat Stance and in the forest, and a run keeps the hand it went in with", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 1 });
  assert.equal(g.deck.arrange(0, 2), false, "not before Combat Stance is bought");
  g.save.upgrades.combatStance = 1;
  assert.ok(g.deck.arrange(0, 2));
  const ordered = ["door", "yellowKey", "stairs", "monster"];
  assert.deepEqual(g.save.hand, ordered);
  assert.deepEqual(g.hand, ordered, "in the forest the hand is the one the next run takes");
  assert.equal(g.deck.arrange(0, 4), false);
  assert.equal(g.deck.arrange(-1, 0), false);
  g.walkTo(g.run.player.x, ENTRANCE_Y);
  for (let i = 0; i < 20 && g.route.length; i++) g.routeStep();
  assert.equal(g.run.outside, false);
  assert.deepEqual(g.run.hand, ordered, "the run saves the hand's order on the way in");
  assert.equal(g.deck.arrange(0, 1), false, "not inside a run");
  g.save.hand = ["stairs", "monster", "yellowKey", "door"];
  assert.deepEqual(g.hand, ordered, "a later change waits for the next run");
  const loaded = new Game(decode(JSON.stringify(g.save)));
  assert.deepEqual(loaded.hand, ordered, "and survives a reload");
});

test("Buildout moves cards between the deck and the hand in the forest, and STAIRS always stays", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 1 });
  assert.equal(g.deck.remove("monster"), false, "not before Buildout is bought");
  g.save.upgrades.buildout = 1;
  g.save.upgrades.cardHeal = 1;
  g.save.hand.push("heal");
  assert.equal(g.deck.remove("stairs"), false, "STAIRS can't leave the hand");
  assert.ok(g.deck.remove("monster"));
  assert.ok(g.deck.remove("heal"));
  assert.deepEqual(g.save.hand, ["stairs", "door", "yellowKey"]);
  assert.equal(g.deck.remove("heal"), false, "a card already in the deck");
  assert.ok(g.deck.add("monster"));
  assert.deepEqual(g.save.hand, ["stairs", "door", "yellowKey", "monster"], "an added card takes the first empty slot");
  assert.equal(g.deck.add("monster"), false, "a card already in the hand");
  assert.equal(g.deck.add("atkUp"), false, "a card the player doesn't own");
  assert.equal(g.deck.add("heal"), false, "four slots until Larger Hand");
  g.save.upgrades.largerHand = 1;
  assert.ok(g.deck.add("heal"));
  assert.equal(g.deck.add("heal"), false);
  assert.deepEqual(decode(JSON.stringify(g.save)).hand, ["stairs", "door", "yellowKey", "monster", "heal"], "the hand is saved as chosen");
  g.walkTo(g.run.player.x, ENTRANCE_Y);
  for (let i = 0; i < 20 && g.route.length; i++) g.routeStep();
  assert.equal(g.run.outside, false);
  assert.equal(g.deck.remove("heal"), false, "not inside a run");
});

/** An arena with the Focus skill and `uses` Focus uses left this run (of
 * the one a run gets). */
function focusArena(uses = 1) {
  const g = arena();
  g.save.upgrades.focus = 1;
  g.run.focusUsed = 1 - uses;
  return g;
}

test("Focus puts a hand card first, spending a use, until it reaches its target", () => {
  const g = focusArena();
  (g.world as RoomWorld).cells.set("2,0", { kind: "key", color: "yellow" });
  const key = g.hand.indexOf("yellowKey");
  g.autoTurn();
  assert.equal(g.activeCard, 0, "STAIRS leads before the focus");
  assert.equal(g.focus(key), "focused");
  assert.equal(g.focusLeft, 0);
  assert.equal(g.run.focused, "yellowKey");
  for (let i = 0; i < 6 && g.run.focused; i++) g.autoTurn();
  assert.equal(g.run.focused, undefined, "the focus ends at the key");
  assert.equal(g.run.player.keys.yellow, 1);
  g.autoTurn();
  assert.equal(g.activeCard, 0, "then the hand's order leads again");
  const loaded = new Game(decode(JSON.stringify(g.save)));
  assert.equal(loaded.focusLeft, 0, "the uses left are saved with the run");
});

test("Focus is refused without the skill, with no uses left, for the card already leading, or with no path, which costs nothing", () => {
  const locked = arena();
  assert.equal(locked.focus(2), "unavailable");
  const g = focusArena();
  g.autoTurn();
  assert.equal(g.focus(0), "active", "STAIRS is already moving the hero");
  assert.equal(g.focus(g.hand.indexOf("yellowKey")), "noPath", "there is no key on the floor");
  assert.equal(g.focusLeft, 1, "a failed focus costs nothing");
  const spent = focusArena(0);
  (spent.world as RoomWorld).cells.set("2,0", { kind: "key", color: "yellow" });
  assert.equal(spent.focus(spent.hand.indexOf("yellowKey")), "spent");
});

test("a focused card that loses its path hands the lead back", () => {
  const g = focusArena();
  const w = g.world as RoomWorld;
  w.cells.set("0,4", { kind: "key", color: "yellow" });
  assert.equal(g.focus(g.hand.indexOf("yellowKey")), "focused");
  g.autoTurn();
  w.cells.set("0,4", { kind: "floor" });
  g.cardPlan = null;
  g.autoTurn();
  assert.equal(g.run.focused, undefined);
  assert.match(g.message, /Focus lost/);
  assert.equal(g.hand[g.activeCard!], "stairs");
});

test("a run going inside gets its Focus uses once the skill is owned", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 1 });
  assert.equal(g.focusLeft, 0);
  g.save.upgrades.focus = 1;
  assert.equal(g.focusLeft, 1, "the forest shows what the next run gets");
  g.walkTo(g.run.player.x, ENTRANCE_Y);
  for (let i = 0; i < 20 && g.route.length; i++) g.routeStep();
  assert.equal(g.run.outside, false);
  assert.equal(g.run.focusUsed, 0);
  assert.equal(g.focusLeft, 1);
});

test("a beaten enemy pays Gold by its strength, once, whatever undo does", () => {
  for (const [strength, gold] of [["weak", 1], ["normal", 1], ["strong", 2], ["elite", 4]] as const) {
    const g = arena();
    g.save.settings.devMode = true;
    const w = g.world as RoomWorld, cells = new Map(w.cells);
    cells.set("1,0", { kind: "enemy", enemy: { name: "Cinder slime", hp: 1, attack: 0, defense: 0, tier: 1, strength } });
    w.cells = new Map(cells);
    assert.ok(g.stepManually(1, 0));
    assert.equal(g.save.gold, gold, strength);
    assert.equal(g.save.tower.runGold, gold);
    g.undo();
    // Undo rebuilds the real floor; lay the arena, enemy and all, back.
    (g.world as RoomWorld).cells = new Map(cells);
    assert.equal(g.run.player.x, 0);
    assert.ok(g.stepManually(1, 0));
    assert.equal(g.save.gold, gold, "undo never pays twice");
  }
});

test("silver: 1 for a weak enemy, 1 more every ten floors, times 2–5 by strength", () => {
  assert.deepEqual((["weak", "normal", "strong", "elite", "boss"] as const).map((s) => silverForKill(s, 0)), [1, 2, 3, 4, 5]);
  assert.equal(silverForKill("weak", 9), 1, "floor 10");
  assert.equal(silverForKill("weak", 10), 2, "floor 11");
  assert.equal(silverForKill("elite", 25), 12, "floor 26: 3 × 4");
});

test("a beaten enemy pays silver into the run, and undo takes it back", () => {
  const g = arena();
  g.save.settings.devMode = true;
  g.run.height = 10;
  const w = g.world as RoomWorld, cells = new Map(w.cells);
  cells.set("1,0", { kind: "enemy", enemy: { name: "Cinder slime", hp: 1, attack: 0, defense: 0, tier: 1, strength: "strong" } });
  w.cells = new Map(cells);
  assert.equal(g.silver, 0);
  assert.ok(g.stepManually(1, 0));
  assert.equal(g.run.silver, 6, "floor 11: 2 × 3 for a strong enemy");
  assert.ok(g.gains.some((gain) => gain.text === "+6 Silver"), "it rises off the enemy's tile");
  assert.equal(new Game(decode(JSON.stringify(g.save))).silver, 6, "saved with the run");
  g.undo();
  assert.equal(g.silver, 0, "undo takes the kill's silver back");
  g.newRun({ outside: true, seed: 1 });
  assert.equal(g.silver, 0, "a new run starts with none");
});

test("ending a run keeps the Gold found in it and says how much", () => {
  const g = new Game(defaults());
  g.switchMode("tower");
  g.newRun({ seed: 3 });
  g.save.gold = 40;
  g.save.tower.runGold = 12;
  g.finish("Ascent ended");
  assert.equal(g.save.gold, 40, "Gold is banked as it is found, and stays");
  assert.match(g.message, /12 Gold kept/);
  assert.equal(g.save.tower.runGold, 0, "the next run starts finding afresh");
});

test("undo stays on the floor it was taken on: climbing or going down forgets the history", () => {
  const save = defaults();
  save.upgrades.inspirationUndos = 1;
  save.archives.levels.undoCount = 4;
  const g = new Game(save);
  g.run.height = 3;
  const w = g.world as RoomWorld;
  w.cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "floor" }], ["2,0", { kind: "stairs" }]]);
  Object.assign(g.run.player, { x: 0, y: 0 });
  assert.ok(g.move(1, 0));
  assert.equal(save.tower.history.length, 1, "a step on the floor can be undone");
  assert.ok(g.move(1, 0));
  assert.equal(g.run.height, 4);
  assert.equal(save.tower.history.length, 0);
  assert.equal(g.undo(), false, "the climb can't be undone");
  assert.equal(g.run.height, 4);
  g.descendTowerRoom();
  assert.equal(g.run.height, 3);
  assert.deepEqual([save.tower.history.length, g.undo(), g.run.height], [0, false, 3], "nor the way down");
});

test("the forest's lessons: Enter until a run goes inside, then the Delve tab once Into the depths is owned", () => {
  const g = new Game(defaults());
  assert.equal(g.forestLesson, null, "a new game starts inside its first run");
  g.newRun({ outside: true });
  assert.equal(g.forestLesson, "enter");
  g.enterRun();
  assert.equal(g.forestLesson, null);
  g.newRun({ outside: true });
  assert.equal(g.forestLesson, null, "Enter is taught once");
  g.save.upgrades.delve = 1;
  assert.equal(g.forestLesson, "delve");
  g.switchMode("delve");
  assert.equal(g.forestLesson, null, "only the Tower's board teaches");
  g.switchMode("tower");
  assert.equal(g.forestLesson, null, "opening the Delve finishes its lesson");
  const saved = decode(JSON.stringify(g.save)).tutorials;
  assert.ok(saved.enter && saved.delve);
});
