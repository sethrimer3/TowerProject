import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { point } from "../src/entities.ts";
import { missing, RESEARCH, status } from "../src/archives.ts";
import { checkpoint, claimGoal, unlockAt } from "../src/goals.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { elapsed, notesResearched, notesSections, notesText } from "../src/ui/run-notes-dialog.ts";

/** A Delve corridor down column 15, walked in Dev mode, with undo. */
function corridor() {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1;
  g.save.settings.devMode = true;
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 30; x++) g.run.changes[point(x, y)] = { kind: "wall" };
  for (let y = 0; y < 10; y++) g.run.changes[point(15, y)] = { kind: "floor" };
  return g;
}
const walk = (g: Game, y: number) => {
  g.walkTo(15, y);
  while (g.route.length) g.routeStep();
};

test("Note Taking: Tower I's floor 250 Goal opens it, and one level costs 100,000 Gold and 2 days", () => {
  assert.deepEqual(unlockAt("noteTaking"), { tower: 1, floor: 250 });
  assert.deepEqual(checkpoint(1, 250)!.reward, { kind: "unlock", unlock: "noteTaking" });
  const def = RESEARCH.noteTaking;
  assert.equal(def.levels.length, 1);
  assert.equal(def.levels[0]!.gold, 100_000);
  assert.equal(def.levels[0]!.hours, 48);
  assert.deepEqual(def.requires, [{ upgrade: "archives" }, { goalUnlock: "noteTaking" }]);

  const save = defaults();
  save.upgrades.archives = 1;
  assert.equal(status(save, "noteTaking"), "locked");
  assert.deepEqual(missing(save, "noteTaking"), [{ goalUnlock: "noteTaking" }]);
  save.tower.reached = 251;
  assert.ok(claimGoal(save, 1, 250, false));
  assert.equal(status(save, "noteTaking"), "available");
  assert.equal(notesResearched(save), false);
  save.archives.levels.noteTaking = 1;
  assert.equal(notesResearched(save), true);
});

test("a run's notes count steps, keys, doors and pickups, and undo takes them back", () => {
  const g = corridor();
  g.run.changes["15,1"] = { kind: "key", color: "red" };
  g.run.changes["15,2"] = { kind: "potion" };
  g.run.changes["15,3"] = { kind: "door", color: "red" };
  g.run.changes["15,4"] = { kind: "attack" };
  walk(g, 5);
  const notes = g.run.notes!;
  assert.equal(notes.steps, 5);
  assert.deepEqual(notes.keys, { red: 1 });
  assert.deepEqual(notes.doors, { "Crimson Door": 1 });
  assert.equal(notes.potions, 1);
  assert.equal(notes.attackShards, 1);
  g.undo();
  assert.equal(g.run.notes!.attackShards, 0, "undo takes back the shard with the run");
  assert.ok(g.run.notes!.steps < 5);
});

test("finds that undo never takes back stay counted beside the run, and a new run starts them over", () => {
  const g = corridor();
  g.save.delve.runFinds.materials.ironBar = 3;
  g.save.delve.runFinds.gems = 1;
  g.run.changes["15,1"] = { kind: "key", color: "yellow" };
  walk(g, 1);
  g.undo();
  assert.equal(g.save.delve.runFinds.materials.ironBar, 3);
  g.newRun({ outside: true });
  assert.deepEqual(g.save.delve.runFinds, { materials: {}, cells: 0, gems: 0, equipment: 0 });
  assert.equal(g.run.notes, undefined, "the forest keeps no notes");
});

test("a run going inside starts its notes on the clock", () => {
  const g = new Game(defaults());
  const now = g.clock();
  g.retry("test");
  assert.ok(g.run.notes!.startedAt >= now);
  assert.equal(g.run.notes!.steps, 0);
});

test("the notes come grouped under headings, and copy as text", () => {
  const g = corridor();
  g.run.changes["15,1"] = { kind: "key", color: "blue" };
  walk(g, 2);
  g.save.delve.runFinds.materials.whetstone = 2;
  const sections = notesSections(g.save, g.mode, g.run, g.run.notes!.startedAt + 3_725_000);
  assert.deepEqual(sections.map((s) => s.title), ["Run", "Exploration", "Combat", "Keys obtained", "Doors opened", "Currency", "Materials", "Other loot"]);
  const rows = Object.fromEntries(sections.flatMap((s) => s.rows));
  assert.equal(rows["Steps taken"], "2");
  assert.equal(rows["Azure keys"], "1");
  assert.equal(rows["Whetstone"], "2");
  assert.equal(rows["None"], "—", "no door opened");
  assert.ok("Courage" in rows, "the mode's currency");
  const text = notesText("Descent Notes", sections);
  assert.match(text, /^Descent Notes\n\nRUN\nDelve: 1\n/);
  assert.match(text, /\nKEYS OBTAINED\nAmber keys: 0\nAzure keys: 1\n/);
  assert.equal(elapsed(3_725_000), "1h 02m 05s");
  assert.equal(elapsed(65_000), "1m 05s");
});

test("saved notes and finds come back, and malformed ones are dropped", () => {
  const g = new Game(defaults());
  g.retry("test");
  Object.assign(g.run.notes!, { steps: 12, keys: { yellow: 2, blue: 0.5 }, doors: { "Amber Door": 2 }, silver: 7.25 });
  g.save.tower.runFinds.cells = 2;
  const back = decode(JSON.stringify(g.save));
  assert.deepEqual(back.tower.run!.notes, g.run.notes);
  assert.equal(back.tower.runFinds.cells, 2);
  const raw = JSON.parse(JSON.stringify(g.save));
  raw.tower.run.notes = { steps: "many" };
  raw.tower.runFinds = { materials: { ironBar: -1 }, gems: 3 };
  const bad = decode(JSON.stringify(raw));
  assert.equal(bad.tower.run!.notes, undefined);
  assert.deepEqual(bad.tower.runFinds, { materials: {}, cells: 0, gems: 3, equipment: 0 });
});

test("the purse notes the Silver found in the run, and a chest's metal bars beside it", () => {
  const g = new Game(defaults());
  g.newRun({ seed: 7 });
  const before = g.snapshot(), purse = new RunPurse(g.save, g.mode, g.run, () => 0);
  const silver = purse.silver(25);
  assert.equal(g.run.notes!.silver, silver);
  // A roll of 0 always finds metal in the chest.
  const loot = purse.treasure(3, 3)!;
  assert.ok(loot.materials.length > 0);
  for (const m of loot.materials) assert.equal(g.save.tower.runFinds.materials[m.id], m.quantity);
  g.restore(before);
  assert.equal(g.run.notes!.silver, 0, "the Silver went with the run");
  assert.ok(Object.keys(g.save.tower.runFinds.materials).length, "the bars stay found");
});
