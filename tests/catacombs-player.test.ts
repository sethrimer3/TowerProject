// Playing the Catacombs on the wall clock (src/catacombs/player.ts, docs/CATACOMBS.md):
// the turns due, at most 15 steps a second, Lore credited, haste and the bank.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save/save.ts";
import { enterCatacomb, setHaste } from "../src/catacombs/index.ts";
import { CatacombPlayer, DRAWN_PER_SECOND } from "../src/catacombs/player.ts";

const ready = (number = 1) => {
  const save = defaults();
  save.catacombs.rng = 5;
  enterCatacomb(save.catacombs, number);
  return save;
};

test("no run, no turns", () => {
  const save = defaults(), p = new CatacombPlayer();
  assert.equal(p.step(save, 5_000, 0), null);
  assert.equal(save.catacombs.clock.lastTurnAt, 0);
});

test("a turn a second on the wall clock, stepped at most 15 times a second", () => {
  const save = ready(), p = new CatacombPlayer();
  assert.equal(p.step(save, 1_000_000, 0)!.gains.turns, 0, "the first step starts the clock");
  assert.equal(p.step(save, 1_001_000, 10), null, "too soon after the last step");
  const due = p.step(save, 1_001_000, 1000 / DRAWN_PER_SECOND)!;
  assert.equal(due.gains.turns, 1);
  assert.equal(due.last?.kind, "dash");
  let turns = 1, frame = 1000 / DRAWN_PER_SECOND;
  for (let ms = 1_001_000; ms <= 1_009_000; ms += 100) { frame += 100; turns += p.step(save, ms, frame)?.gains.turns ?? 0; }
  assert.equal(turns, 9);
});

test("Lore found goes to the Lore Fragments, counted as earned", () => {
  const save = ready(3), p = new CatacombPlayer();
  save.catacombs.run!.slots = [null, null, null, null, null, null];
  p.step(save, 1_000_000, 0);
  p.step(save, 1_001_000, 100);
  assert.equal(save.cells, 3.1, "Tower III's ×3.1");
  assert.equal(save.profile.earned.cells, 3.1);
});

test("haste spends the bank and falls back to ×1 when it runs dry", () => {
  const save = ready(), p = new CatacombPlayer();
  p.step(save, 1_000_000, 0);
  save.catacombs.clock.bank = 30;
  setHaste(save.catacombs.clock, 10);
  let turns = 0, slowed = false, frame = 0;
  for (let ms = 1_000_000 + 100; ms <= 1_010_000 && !slowed; ms += 100) {
    frame += 100;
    const s = p.step(save, ms, frame);
    if (s) { turns += s.gains.turns; slowed = s.due.slowed; }
  }
  assert.ok(slowed);
  assert.equal(save.catacombs.clock.bank, 0);
  assert.equal(save.catacombs.clock.haste, 1);
  assert.ok(turns >= 30 && turns <= 35, `${turns}`);
});

test("a long gap banks its seconds instead of playing them", () => {
  const save = ready(), p = new CatacombPlayer();
  p.step(save, 1_000_000, 0);
  const s = p.step(save, 1_000_000 + 3_600_000, 100)!;
  assert.equal(s.due.banked, 3600);
  assert.equal(s.gains.turns, 0);
  assert.equal(save.catacombs.clock.bank, 3600);
});
