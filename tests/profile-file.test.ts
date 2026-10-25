import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { KEPT_SLICE, PROFILE_FORMAT, PROFILE_SECTIONS, UNSECTIONED, exportProfile, importProfile } from "../src/profile-file.ts";

const NOW = Date.UTC(2026, 9, 24);

/** A Game well into its progress (Dev mode's grants and a few records by
 * hand, loaded as a stored save is), with a Tower run inside on seed 7. */
function progressed() {
  const dev = new Game(defaults());
  dev.setDevMode(true);
  const s = dev.save;
  Object.assign(s, { xp: 1234, medals: 5, cells: 7 });
  s.provisions.heal = 2;
  s.training.attack = 3;
  s.tower.best = 42;
  s.tower.reached = 42;
  s.breakthrough = 11;
  s.tutorials.deck = true;
  s.profile.createdAt = NOW - 1000;
  const g = new Game(decode(JSON.stringify(s)));
  g.newRun({ seed: 7 });
  return g;
}
const imported = (text: string) => {
  const read = importProfile(text);
  assert.ok("save" in read, "error" in read ? read.error : "");
  return read.save;
};

test("old profiles ignore the removed city section while keeping supported progression",()=> {
  const original=JSON.parse(exportProfile(progressed().save,NOW));
  const expected=imported(JSON.stringify(original));
  original.defend={defend:{seed:11,bestWave:20,layout:{}}};
  original.gear.materials={ironBar:40,steelBar:5};
  const loaded=imported(JSON.stringify(original));
  assert.deepEqual(loaded,expected);
  const file=JSON.parse(exportProfile(loaded,NOW));
  assert.equal("defend" in file,false);assert.equal("materials" in file.gear,false);
});

test("every field of the save is in one section of the file, or named as left out", () => {
  const placed = [...Object.values(PROFILE_SECTIONS).flat(), ...UNSECTIONED];
  assert.equal(new Set(placed).size, placed.length);
  // The Proving Grounds attempt is the only field a save may leave out.
  assert.deepEqual([...placed].sort(), [...Object.keys(defaults()), "provingGrounds"].sort());
});

test("the file is readable JSON headed by its format and save version, with no run in it", () => {
  const g = progressed();
  const file = JSON.parse(exportProfile(g.save, NOW));
  assert.equal(file.format, PROFILE_FORMAT);
  assert.equal(file.version, g.save.version);
  assert.equal(file.exportedAt, "2026-10-24T00:00:00.000Z");
  assert.deepEqual(Object.keys(file), ["format", "version", "exportedAt", ...Object.keys(PROFILE_SECTIONS)]);
  assert.deepEqual(Object.keys(file.towers.tower), [...KEPT_SLICE, "inspiration"]);
  assert.deepEqual(Object.keys(file.towers.delve), [...KEPT_SLICE]);
  assert.equal(file.towers.tower.best, 42);
  assert.equal(file.currencies.gemDrop.out, null);
  assert.equal(file.gear.provisions.heal, 2);
});

test("importing a file gives back everything kept between runs, and no run", () => {
  const g = progressed();
  const text = exportProfile(g.save, NOW);
  const save = imported(text);
  assert.equal(exportProfile(save, NOW), text);
  assert.equal(save.tower.run, null);
  assert.equal(save.delve.run, null);
  assert.deepEqual(save.tower.history, []);
  assert.equal(save.provingGrounds, undefined);
});

test("importing replaces the whole save: what the file leaves out starts afresh", () => {
  const g = progressed();
  const file = JSON.parse(exportProfile(g.save, NOW));
  delete file.gear;
  delete file.training;
  const other = new Game(defaults());
  other.save.gold = 5;
  other.save.provisions.heal = 9;
  other.replaceSave(imported(JSON.stringify(file)));
  assert.equal(other.save.provisions.heal, 0);
  assert.deepEqual(other.save.training, defaults().training);
  assert.equal(other.save.gold, g.save.gold);
  assert.equal(other.save.tower.best, 42);
  assert.equal(other.save.profile.createdAt, NOW - 1000);
  assert.equal(other.mode, "tower");
  assert.equal(other.run.outside, true);
});

test("a file that isn't a readable profile is refused, naming why", () => {
  const text = exportProfile(defaults(), NOW);
  const refused = (t: string) => "error" in importProfile(t);
  assert.ok(refused("not json"));
  assert.ok(refused(JSON.stringify({ ...JSON.parse(text), format: "other" })));
  assert.ok(refused(JSON.stringify({ ...JSON.parse(text), version: 99 })));
  assert.ok(refused(JSON.stringify({ ...JSON.parse(text), deck: [1, 2] })));
  assert.ok(!refused(text));
});
