import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { ENTRANCE_Y } from "../src/outside.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { chooseStep } from "../src/automation.ts";
import { silverForKill } from "../src/economy/kill-pay.ts";
import { withFirstSkills } from "./first-skills.ts";
import type { Tile } from "../src/entities.ts";
import { openTournament } from "./open-tournament.ts";

/** A save past a new game's first skills (`withFirstSkills`), its first
 * run's lesson done, so the hand plays as a run starts. */
function taught() {
  const s = withFirstSkills(defaults());
  s.tutorials.climb = true;
  return s;
}

/** A Tower floor of open tiles with `size` columns and rows, the player in
 * the corner and (when it fits) the stairs opposite. */
function arena(size = 5) {
  const g = new Game(taught());
  // No theme's Gold, so these figures are the mechanic's alone (theme-collection.test.ts covers it).
  g.save.themes = [];
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
  // Training for the run alone (On the Job) is a player action.
  g.save.upgrades.onTheJob = 1;
  g.run.silver = 1e9;
  g.autoTurn();
  assert.ok(g.handStuck && !g.auto && g.activeCard === null && !g.fallen);
  assert.deepEqual([g.run.player.x, g.run.player.y], [0, 0]);
  assert.match(g.message, /^No card can move/);
  // Acting while nothing has changed leaves it paused.
  assert.ok(g.trainInRun("attack"));
  assert.ok(g.handStuck && !g.auto);
  // Once the floor has changed (here, a key appearing, as a skill might
  // make), the player's next action sets the hand playing again.
  (g.world as RoomWorld).cells.set("2,0", { kind: "key", color: "yellow" });
  assert.ok(g.trainInRun("attack"));
  assert.ok(!g.handStuck && g.auto);
  g.autoTurn();
  assert.equal(g.save.hand[g.activeCard!], "key");
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
  assert.equal(g.message, "The hand moves you inside a climb.");
  g.save.settings.devMode = true;
  assert.ok(g.stepManually(1, 0));
});

test("an Automove turn in the forest takes the step automation chooses and names it", () => {
  const g = new Game(taught());
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
  const g = new Game(taught());
  g.newRun({ outside: true, seed: 1 });
  g.save.upgrades.cardHeal = 1;
  assert.equal(g.deck.place("heal", 1), false, "not before Buildout");
  g.save.upgrades.buildout = 1;
  assert.ok(g.deck.remove("door"));
  assert.ok(g.deck.place("heal", 1));
  assert.deepEqual(g.save.hand, ["stairs", "heal", "key", "monster"]);
  assert.ok(g.deck.place("door", 3), "a full hand swaps the card there out");
  assert.deepEqual(g.save.hand, ["stairs", "heal", "key", "door"]);
  assert.equal(g.deck.place("monster", 0), false, "STAIRS stays");
  assert.equal(g.deck.place("heal", 2), false, "a card already in the hand");
  assert.equal(g.deck.place("monster", 4), false, "no such slot");
  g.enterRun();
  assert.equal(g.deck.place("monster", 1), false, "only in the forest");
});

test("in the forest Enter walks the hero to the entrance, and the run begins there with the hand playing", () => {
  const g = new Game(taught());
  g.newRun({ outside: true, seed: 1 });
  g.toggleAuto();
  assert.ok(!g.auto, "the forest has no play or pause");
  assert.ok(g.headForEntrance());
  assert.ok(g.run.outside && g.route.length, "walking there first");
  const end = g.route[g.route.length - 1];
  assert.deepEqual([end.x, end.y], [g.run.player.x, ENTRANCE_Y], "to the entrance");
  while (g.run.outside && g.routeStep());
  assert.ok(!g.run.outside && g.auto);
  assert.equal(g.run.player.y, 0, "at the entrance");
  assert.equal(g.headForEntrance(), false, "only from the forest");
  assert.equal(g.enterRun(), false, "only from the forest");
});

test("after the first skill, the forest's note to press Enter goes once Enter is pressed", () => {
  const g = new Game(taught());
  g.newRun({ outside: true, seed: 1 });
  assert.equal(g.boardLesson, "enter");
  g.headForEntrance();
  assert.equal(g.boardLesson, null, "dismissed by Enter, before the hero arrives");
  assert.ok(g.run.outside);
});

test("a tap on the Tower's arch walks the hero to the entrance", () => {
  const g = new Game(taught());
  g.newRun({ outside: true, seed: 1 });
  const x = g.run.player.x;
  for (const [dx, dy] of [[-1, 4], [1, 2], [0, 3]]) {
    g.walkTo(x + dx, ENTRANCE_Y + dy);
    const end = g.route[g.route.length - 1];
    assert.deepEqual([end.x, end.y], [x, ENTRANCE_Y], `from the arch at ${dx}, ${dy}`);
  }
  g.walkTo(x - 2, ENTRANCE_Y + 2);
  assert.equal(g.route.length, 0, "beside the arch is the tower's wall");
});

test("ending a run goes straight back to the forest with the next run", () => {
  const g = arena();
  const ended = g.run.seed;
  g.finish("Ascent ended");
  assert.ok(g.run.outside && g.run.seed !== ended && g.save.tower.run === g.run);
  assert.equal(g.fallen, false);
  assert.match(g.message, /^Ascent ended.*Press Enter or the tower entrance to begin a climb\.$/);
});

test("erasing everything leaves a fresh save with a new run outside the Tower", () => {
  const g = arena();
  g.setDevMode(true);
  g.switchMode("delve");
  g.finish("Delve run ended");
  g.eraseAll();
  assert.equal(g.mode, "tower");
  assert.ok(g.run.outside && g.save.tower.run === g.run);
  // Everything but the new run and the new
  // profile's creation, stamped now, with its card buys' stream seeded.
  const fresh = defaults();
  fresh.tower.run = g.run;
  assert.ok(g.save.profile.createdAt > 0, "the new profile is stamped");
  fresh.profile.createdAt = g.save.profile.createdAt;
  assert.equal(typeof g.save.cardBuys.rng, "number", "the new profile's card buys are seeded");
  fresh.cardBuys.rng = g.save.cardBuys.rng;
  assert.deepEqual(g.save, fresh);
});

test("the Deck reorders the hand only with Combat Stance and in the forest, and a run keeps the hand it went in with", () => {
  const g = new Game(taught());
  g.newRun({ outside: true, seed: 1 });
  assert.equal(g.deck.arrange(0, 2), false, "not before Combat Stance is bought");
  g.save.upgrades.combatStance = 1;
  assert.ok(g.deck.arrange(0, 2));
  const ordered = ["door", "key", "stairs", "monster"];
  assert.deepEqual(g.save.hand, ordered);
  assert.deepEqual(g.hand, ordered, "in the forest the hand is the one the next run takes");
  assert.equal(g.deck.arrange(0, 4), false);
  assert.equal(g.deck.arrange(-1, 0), false);
  g.walkTo(g.run.player.x, ENTRANCE_Y);
  for (let i = 0; i < 20 && g.route.length; i++) g.routeStep();
  assert.equal(g.run.outside, false);
  assert.deepEqual(g.run.hand, ordered, "the run saves the hand's order on the way in");
  assert.equal(g.deck.arrange(0, 1), false, "not inside a run");
  g.save.hand = ["stairs", "monster", "key", "door"];
  assert.deepEqual(g.hand, ordered, "a later change waits for the next run");
  const loaded = new Game(decode(JSON.stringify(g.save)));
  assert.deepEqual(loaded.hand, ordered, "and survives a reload");
});

test("Buildout moves cards between the deck and the hand in the forest, and STAIRS always stays", () => {
  const g = new Game(taught());
  g.newRun({ outside: true, seed: 1 });
  assert.equal(g.deck.remove("monster"), false, "not before Buildout is bought");
  g.save.upgrades.buildout = 1;
  g.save.upgrades.cardHeal = 1;
  g.save.hand.push("heal");
  assert.equal(g.deck.remove("stairs"), false, "STAIRS can't leave the hand");
  assert.ok(g.deck.remove("monster"));
  assert.ok(g.deck.remove("heal"));
  assert.deepEqual(g.save.hand, ["stairs", "door", "key"]);
  assert.equal(g.deck.remove("heal"), false, "a card already in the deck");
  assert.ok(g.deck.add("monster"));
  assert.deepEqual(g.save.hand, ["stairs", "door", "key", "monster"], "an added card takes the first empty slot");
  assert.equal(g.deck.add("monster"), false, "a card already in the hand");
  assert.equal(g.deck.add("atkUp"), false, "a card the player doesn't own");
  assert.equal(g.deck.add("heal"), false, "four slots until Larger Hand");
  g.save.upgrades.largerHand = 1;
  assert.ok(g.deck.add("heal"));
  assert.equal(g.deck.add("heal"), false);
  assert.deepEqual(decode(JSON.stringify(g.save)).hand, ["stairs", "door", "key", "monster", "heal"], "the hand is saved as chosen");
  g.walkTo(g.run.player.x, ENTRANCE_Y);
  for (let i = 0; i < 20 && g.route.length; i++) g.routeStep();
  assert.equal(g.run.outside, false);
  assert.equal(g.deck.remove("heal"), false, "not inside a run");
});

/** An arena with the Focus skill and `uses` Focus uses left this run (of
 * the one a run gets). */
test("a card pressed leads the hero to its target ahead of the others, and no other card can be pressed until it arrives", () => {
  const g = arena();
  (g.world as RoomWorld).cells.set("2,0", { kind: "key", color: "yellow" });
  const key = g.hand.indexOf("key");
  g.autoTurn();
  assert.equal(g.activeCard, 0, "STAIRS leads before the press");
  assert.equal(g.focus(key), "focused");
  assert.equal(g.run.focused, "key");
  assert.equal(g.focus(0), "busy", "no other card while the key is still ahead");
  for (let i = 0; i < 6 && g.run.focused; i++) g.autoTurn();
  assert.equal(g.run.focused, undefined, "the press ends at the key");
  assert.equal(g.run.player.keys.yellow, 1);
  g.autoTurn();
  assert.equal(g.activeCard, 0, "then, with Auto-Climb, the hand's order leads again");
  assert.equal(g.focus(0), "focused", "and a card can be pressed again");
});

test("the board's line follows a pressed card's path as the hero walks it, and the hand's own choice only with Show path", () => {
  const g = arena();
  g.autoTurn();
  assert.ok(g.cardPlan?.path.length, "STAIRS heads for the stairs by itself");
  assert.deepEqual(g.shownPath, [], "with Auto-Climb its path is hidden by default");
  g.save.settings.showPath = true;
  assert.equal(g.shownPath, g.cardPlan!.path, "Show path draws it");
  g.save.settings.showPath = false;
  (g.world as RoomWorld).cells.set("4,0", { kind: "key", color: "yellow" });
  assert.equal(g.focus(g.hand.indexOf("key")), "focused");
  const ahead = g.shownPath.length;
  assert.ok(ahead > 1, "a pressed card's path shows from the press");
  assert.equal(g.shownPath[ahead - 1].x, 4, "and ends on its target");
  g.autoTurn();
  assert.equal(g.shownPath.length, ahead - 1, "each step takes one off it");
  for (let i = 0; i < 8 && g.run.focused; i++) g.autoTurn();
  assert.deepEqual(g.shownPath, [], "gone once the hero arrives");
});

test("a press is refused for a card with no path, costing nothing, and outside a run", () => {
  const g = arena();
  assert.equal(g.focus(g.hand.indexOf("key")), "noPath", "there is no key on the floor");
  assert.equal(g.run.focused, undefined);
  g.newRun({ outside: true, seed: 1 });
  assert.equal(g.focus(0), "unavailable", "only inside a run");
});

test("a pressed card that loses its path hands the lead back", () => {
  const g = arena();
  const w = g.world as RoomWorld;
  w.cells.set("0,4", { kind: "key", color: "yellow" });
  assert.equal(g.focus(g.hand.indexOf("key")), "focused");
  g.autoTurn();
  w.cells.set("0,4", { kind: "floor" });
  g.cardPlan = null;
  g.autoTurn();
  assert.equal(g.run.focused, undefined);
  assert.match(g.message, /^Key has no path to a target/);
  assert.equal(g.hand[g.activeCard!], "stairs");
});

test("before Auto-Climb the hand waits for a card to be pressed, and waits again once it arrives", () => {
  const g = arena();
  g.save.upgrades.autoClimb = 0;
  g.autoTurn();
  assert.ok(!g.auto && !g.handStuck && g.activeCard === null, "it waits, not stuck");
  assert.deepEqual([g.run.player.x, g.run.player.y], [0, 0]);
  assert.match(g.message, /^Press a card/);
  (g.world as RoomWorld).cells.set("1,0", { kind: "key", color: "yellow" });
  assert.equal(g.focus(g.hand.indexOf("key")), "focused");
  assert.ok(g.auto);
  g.autoTurn();
  assert.equal(g.run.player.keys.yellow, 1);
  assert.equal(g.run.focused, undefined);
  g.autoTurn();
  assert.ok(!g.auto && !g.handStuck, "the next move waits for the next press");
  assert.deepEqual([g.run.player.x, g.run.player.y], [1, 0]);
  // With nothing any card can reach, it is stuck instead.
  const w = g.world as RoomWorld;
  w.cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "floor" }]]);
  g.autoTurn();
  assert.ok(g.handStuck);
});

test("buying Door & Key, then Enemy, deals their cards into the hand after STAIRS", () => {
  const g = new Game(defaults());
  assert.deepEqual(g.save.hand, ["stairs"]);
  g.save.tower.inspiration = 3;
  g.newRun({ outside: true, seed: 1 });
  assert.ok(g.skills.buy("cardDoorKey"));
  assert.deepEqual(g.save.hand, ["stairs", "door", "key"]);
  assert.ok(g.skills.buy("cardEnemy"));
  assert.deepEqual(g.save.hand, ["stairs", "door", "key", "monster"]);
  assert.ok(g.skills.buy("autoClimb"));
  assert.ok(g.autoClimbs);
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

test("silver: 1 for a weak enemy, rising 0.1 a floor to floor 201 and 0.05 a floor after, times 2–5 by strength", () => {
  assert.deepEqual((["weak", "normal", "strong", "elite", "boss"] as const).map((s) => silverForKill(s, 0)), [2, 4, 6, 8, 10]);
  assert.equal(silverForKill("weak", 9), 3.8, "floor 10");
  assert.equal(silverForKill("weak", 10), 4, "floor 11");
  assert.equal(silverForKill("elite", 25), 28, "floor 26: 7 × 4");
  assert.equal(silverForKill("weak", 200), 42, "floor 201");
  assert.equal(silverForKill("weak", 220), 44, "floor 221: 2 more in twenty floors");
  assert.equal(silverForKill("normal", 1000), 244, "floor 1001: 122 × 2");
  for (let f = 1; f < 400; f++) assert.ok(silverForKill("weak", f) > silverForKill("weak", f - 1), `rises every floor (${f})`);
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
  assert.equal(g.run.silver, 12, "floor 11: 4 × 3 for a strong enemy");
  assert.ok(g.gains.some((gain) => gain.text === "+12 Silver"), "it rises off the enemy's tile");
  assert.equal(new Game(decode(JSON.stringify(g.save))).silver, 12, "saved with the run");
  g.undo();
  assert.equal(g.silver, 0, "undo takes the kill's silver back");
  g.newRun({ outside: true, seed: 1 });
  assert.equal(g.silver, 0, "a new run starts with none");
});

test("ending a run keeps the Gold found in it and says how much", () => {
  const g = new Game(taught());
  g.switchMode("tower");
  g.newRun({ seed: 3 });
  g.save.gold = 40;
  g.save.tower.runGold = 12;
  g.finish("Ascent ended");
  assert.equal(g.save.gold, 40, "Gold is banked as it is found, and stays");
  assert.match(g.message, /12 Gold kept/);
  assert.equal(g.save.tower.runGold, 0, "the next run starts finding afresh");
});

test("undo stays on the floor it was taken on: climbing forgets the history", () => {
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
});

test("a new game's first run holds a hand of STAIRS alone until STAIRS is pressed, then walks at 2x", () => {
  const g = new Game(defaults());
  assert.deepEqual(g.hand, ["stairs"]);
  assert.equal(g.boardLesson, "climb");
  assert.equal(g.auto, false);
  g.toggleAuto();
  assert.equal(g.auto, false, "play waits on the card");
  assert.equal(g.changeSpeed(1), false, "so do the arrows");
  assert.equal(g.dismissLesson(), false, "a tap on the note doesn't end it");
  assert.equal(g.focus(0), "focused");
  assert.equal(g.boardLesson, null);
  assert.ok(g.auto);
  assert.equal(g.stepsPerSecond, 2);
  assert.equal(new Game(decode(JSON.stringify(g.save))).boardLesson, null, "done for good");
});

/** A first run's floor where the hero, at (0, 0), can't get past (1, 0) to the stairs. */
function blocked(g: Game, wall: Tile) {
  (g.world as RoomWorld).cells = new Map<string, Tile>([["0,0", { kind: "floor" }], ["1,0", wall], ["2,0", { kind: "stairs" }]]);
  Object.assign(g.run.player, { x: 0, y: 0 });
}
const SLIME: Tile = { kind: "enemy", enemy: { name: "Cinder slime", hp: 1, attack: 0, defense: 0, tier: 1, strength: "weak" } };

test("a first stuck run's lesson waits on End Run; the forest's then lead to Door & Key, then Enter, then KEY and DOOR in the run", () => {
  const g = new Game(defaults());
  g.save.tutorials.climb = true;
  blocked(g, { kind: "wall" });
  g.autoTurn();
  assert.ok(g.handStuck);
  assert.equal(g.boardLesson, "stuck");
  g.endRunPressed();
  assert.ok(g.save.tutorials.stuck);
  assert.equal(g.boardLesson, null);
  g.save.tower.inspiration = 1;
  g.finish("Ascent ended");
  assert.ok(g.run.outside);
  assert.equal(g.introSkill, "cardDoorKey");
  assert.equal(g.boardLesson, "upgrades");
  assert.ok(g.skills.buy("cardDoorKey"));
  assert.deepEqual([g.introSkill, g.introBought, g.boardLesson], [null, "cardDoorKey", "enter"]);
  assert.ok(g.enterRun());
  assert.equal(g.introBought, null);
  assert.equal(g.boardLesson, "keys");
  (g.world as RoomWorld).cells.set(`${g.run.player.x + 1},${g.run.player.y}`, { kind: "key", color: "yellow" });
  assert.equal(g.focus(g.hand.indexOf("key")), "focused");
  assert.equal(g.boardLesson, null, "pressing KEY ends it");
  assert.ok(decode(JSON.stringify(g.save)).tutorials.keys);
});

test("stuck behind an enemy without Enemy, with its Inspiration held, the lesson sends the player to buy it", () => {
  const g = new Game(taught());
  g.save.tutorials.stuck = true;
  g.save.upgrades.cardEnemy = 0;
  g.save.hand = g.run.hand = ["stairs", "door", "key"];
  blocked(g, SLIME);
  g.autoTurn();
  assert.ok(g.handStuck);
  assert.equal(g.boardLesson, null, "not without the Inspiration Enemy costs");
  g.save.tower.inspiration = 1;
  assert.equal(g.boardLesson, "enemy");
  g.endRunPressed();
  g.finish("Ascent ended");
  assert.equal(g.introSkill, "cardEnemy");
  assert.equal(g.boardLesson, "upgrades");
  assert.ok(g.skills.buy("cardEnemy"));
  assert.deepEqual(g.save.hand, ["stairs", "door", "key", "monster"]);
  assert.deepEqual([g.introBought, g.boardLesson], ["cardEnemy", "enter"]);
  assert.ok(g.enterRun());
  assert.deepEqual([g.introBought, g.save.tutorials.enemy], [null, false]);
});

test("the forest's lessons: Enter once Door & Key is owned, until dismissed or a run goes inside, then the Delve's sign while a tournament opens it", () => {
  const g = new Game(taught());
  assert.equal(g.boardLesson, null);
  g.newRun({ outside: true });
  assert.equal(g.boardLesson, "enter");
  assert.ok(g.dismissLesson());
  assert.equal(g.boardLesson, null, "dismissed without entering");
  assert.ok(g.run.outside);
  g.save.tutorials.enter = false;
  g.enterRun();
  g.newRun({ outside: true });
  assert.equal(g.boardLesson, null, "entering a run finishes it too");
  g.save.upgrades.breakthrough = 1;
  assert.equal(g.boardLesson, null, "Breakthrough no longer opens the Delve");
  openTournament(g);
  assert.equal(g.boardLesson, "delve");
  assert.equal(g.dismissLesson(), false, "the Delve lesson waits on the Delve tab");
  g.switchMode("delve");
  assert.equal(g.boardLesson, null, "only the Tower's board teaches");
  g.switchMode("tower");
  assert.equal(g.boardLesson, null, "opening the Delve finishes its lesson");
  const saved = decode(JSON.stringify(g.save)).tutorials;
  assert.ok(saved.climb && saved.enter && saved.delve);
});

test("a route preview pauses a playing hand and plays it on after, never a hand already paused", () => {
  const g = arena();
  g.autoTurn();
  assert.equal(g.auto, true);
  assert.equal(g.pauseForPreview(), true);
  assert.equal(g.auto, false);
  g.resumeAfterPreview();
  assert.equal(g.auto, true);
  g.toggleAuto();
  assert.equal(g.pauseForPreview(), false, "paused by the player: the preview leaves it");
  g.pauseForPage();
  g.resumeAfterPreview();
  assert.equal(g.auto, false, "a page holding the run paused keeps it so");
});

test("the first run inside with Auto-Climb explains it, the hand playing on, until its note is tapped or a card pressed", () => {
  const taughtClimb = () => {
    const s = taught();
    s.tutorials.autoClimb = false;
    return s;
  };
  const g = new Game(taughtClimb());
  g.newRun({ outside: true });
  assert.notEqual(g.boardLesson, "autoClimb", "not in the forest");
  assert.ok(g.enterRun());
  assert.equal(g.boardLesson, "autoClimb");
  assert.ok(g.auto, "the hand plays on under the note");
  g.save.upgrades.autoClimb = 0;
  assert.equal(g.boardLesson, null, "not before Auto-Climb");
  g.save.upgrades.autoClimb = 1;
  assert.ok(g.dismissLesson());
  assert.equal(g.boardLesson, null, "tapping the note ends it");
  assert.ok(decode(JSON.stringify(g.save)).tutorials.autoClimb, "done for good");

  const pressed = arena();
  pressed.save.tutorials.autoClimb = false;
  assert.equal(pressed.boardLesson, "autoClimb");
  assert.equal(pressed.focus(pressed.hand.indexOf("stairs")), "focused");
  assert.equal(pressed.boardLesson, null, "pressing a card ends it");

  const delve = new Game(taughtClimb());
  delve.save.upgrades.breakthrough = 1;
  delve.switchMode("delve");
  delve.newRun();
  assert.equal(delve.boardLesson, null, "the Tower's alone");
});
