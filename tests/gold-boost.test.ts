import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { GOLD_BOOST_MAX_MS, GOLD_BOOST_MS, claimGoldBoost, goldBoostFactor, goldBoostLeft } from "../src/gold-boost.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

const MIN = 60_000;

test("each Gold ad stores 20 minutes more, up to two hours", () => {
  const save = defaults(), now = 1_000_000;
  assert.equal(goldBoostFactor(save, now), 1);
  assert.ok(claimGoldBoost(save, now));
  assert.equal(goldBoostLeft(save, now), GOLD_BOOST_MS);
  assert.equal(goldBoostFactor(save, now), 1.5);
  // Time passing runs it down; a claim adds to what is left.
  assert.ok(claimGoldBoost(save, now + 5 * MIN));
  assert.equal(goldBoostLeft(save, now + 5 * MIN), 35 * MIN);
  for (let i = 0; i < 5; i++) assert.ok(claimGoldBoost(save, now + 5 * MIN));
  assert.equal(goldBoostLeft(save, now + 5 * MIN), GOLD_BOOST_MAX_MS, "capped at two hours");
  assert.equal(claimGoldBoost(save, now + 5 * MIN), false, "a full store refuses another ad");
  // Once it runs out, Gold is paid as before.
  assert.equal(goldBoostFactor(save, now + 5 * MIN + GOLD_BOOST_MAX_MS), 1);
});

test("Gold found while the boost lasts is multiplied by 1.5", () => {
  const save = defaults();
  save.upgrades.inspirationUndos = 1;
  const g = new Game(save);
  let now = 5_000_000;
  g.clock = () => now;
  // Each kill on tiles of its own, so no earlier kill's change or loot stands there.
  let x = 0;
  const kill = () => {
    (g.world as RoomWorld).cells = new Map([[`${x},0`, { kind: "floor" }], [`${x + 1},0`, { kind: "enemy", enemy: { name: "Rat", hp: 1, attack: 0, defense: 0, strength: "normal" } }]]);
    Object.assign(g.run.player, { x, y: 0, attack: 100 });
    x += 2;
    const before = g.save.gold;
    assert.ok(g.move(1, 0));
    return g.save.gold - before;
  };
  const plain = kill();
  assert.ok(plain > 0);
  assert.ok(g.gemFinder.claimGoldAd());
  assert.equal(g.gemFinder.goldBoostLeft, GOLD_BOOST_MS);
  assert.equal(kill(), plain * 1.5);
  now += GOLD_BOOST_MS;
  assert.equal(kill(), plain, "the boost has run out");
});

test("a run keeps the Gold it found while boosted, before the boost, for its end dialog", () => {
  const g = new Game(defaults());
  let now = 5_000_000;
  g.clock = () => now;
  g.newRun({ outside: true });
  g.enterRun();
  assert.equal(g.save.tower.runBoostGold, null, "the boost hasn't run");
  let x = 0;
  const kill = () => {
    (g.world as RoomWorld).cells = new Map([[`${x},0`, { kind: "floor" }], [`${x + 1},0`, { kind: "enemy", enemy: { name: "Rat", hp: 1, attack: 0, defense: 0, strength: "normal" } }]]);
    Object.assign(g.run.player, { x, y: 0, attack: 100 });
    x += 2;
    const before = g.save.gold;
    assert.ok(g.move(1, 0));
    return g.save.gold - before;
  };
  const plain = kill();
  assert.ok(g.gemFinder.claimGoldAd());
  assert.equal(g.save.tower.runBoostGold, 0, "claimed inside a run: the boost ran, with no Gold found yet");
  assert.equal(kill() + kill(), 3 * plain);
  assert.equal(g.save.tower.runBoostGold, 2 * plain, "before the boost");
  assert.equal(g.save.tower.runGold, 4 * plain);
  assert.equal(decode(JSON.stringify(g.save)).tower.runBoostGold, 2 * plain, "saved");
  g.newRun({ outside: true });
  assert.equal(g.save.tower.runBoostGold, null, "a new run starts without");
  g.enterRun();
  assert.equal(g.save.tower.runBoostGold, 0, "entering while the boost lasts counts it");
});

test("the Gold boost's end is saved, and a bad value starts with none", () => {
  const save = defaults();
  save.goldBoostUntil = 123_456;
  assert.equal(decode(JSON.stringify(save)).goldBoostUntil, 123_456);
  assert.equal(decode(JSON.stringify({ ...save, goldBoostUntil: "soon" })).goldBoostUntil, 0);
});

test("the forest shows the Silver a run will start with", () => {
  const save = defaults();
  const g = new Game(save);
  g.newRun({ outside: true });
  assert.equal(g.startingSilver, 0);
  g.save.archives.levels.pocketMoney = 2;
  assert.ok(g.startingSilver > 0);
  g.enterRun();
  assert.equal(g.silver, g.startingSilver);
});
