import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { ENEMY_GOLD } from "../src/config.ts";
import { RESEARCH, researched, status } from "../src/archives.ts";
import { resolveStep, type StepEffect } from "../src/step-effects.ts";
import type { Enemy, Player } from "../src/entities.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

// The research the Courage tree's Find Yellow Key, Key Efficiency,
// Interest, Max Interest and Mug skills open.

/** A Tower run inside, the hero at (0, 0) beside the stairs at (1, 0). */
function stairs(seed?: number) {
  const save = defaults();
  save.upgrades.inspirationUndos = 1;
  const g = new Game(save);
  if (seed !== undefined) g.newRun({ seed });
  g.run.height = 3;
  standBeside(g);
  return g;
}
function standBeside(g: Game) {
  (g.world as RoomWorld).cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "stairs" }]]);
  Object.assign(g.run.player, { x: 0, y: 0 });
}

test("each skill opens its research, which is priced as agreed", () => {
  const save = defaults();
  for (const [id, skill] of [["findYellowKey", "findYellowKey"], ["keyEfficiency", "keyEfficiency"], ["interest", "interest"], ["maxInterest", "maxInterest"], ["mug", "mug"]] as const) {
    assert.equal(status(save, id), "locked", id);
    save.upgrades[skill] = 1;
    assert.equal(status(save, id), "available", id);
  }
  assert.deepEqual([RESEARCH.findYellowKey.levels.length, RESEARCH.keyEfficiency.levels.length, RESEARCH.interest.levels.length,
    RESEARCH.maxInterest.levels.length, RESEARCH.mug.levels.length], [50, 100, 100, 20, 100]);
  // Max Interest: Focus Count's schedule with its Gold raised 20% a level.
  assert.deepEqual(RESEARCH.maxInterest.levels.slice(0, 4).map((l) => [l.gold, l.hours]), [[500, 8], [1200, 16], [2900, 24], [6000, 32]]);
  assert.equal(RESEARCH.maxInterest.levels[19]!.gold, 3051000);
  const full = (id: keyof typeof RESEARCH) => ({ ...save.archives, levels: { [id]: RESEARCH[id].levels.length } });
  assert.equal(researched(full("findYellowKey"), "yellowKeyChance", 0), 200, "20%, in tenths of a percent");
  assert.equal(researched(full("keyEfficiency"), "keyCost", 1000), 500, "half a key");
  assert.equal(researched(full("interest"), "interestRate", 0), 100, "10%");
  assert.equal(researched(full("maxInterest"), "interestCap", 50), 50000);
  assert.equal(researched({ ...save.archives, levels: { maxInterest: 3 } }, "interestCap", 50), 350);
  assert.equal(researched(full("mug"), "instakillGold", 100), 300);
});

test("Key Efficiency: a door takes less of each key, so less than a whole key opens it", () => {
  const p: Player = { x: 0, y: 0, hp: 10, maxHp: 10, attack: 1, defense: 0, keys: { yellow: 1, blue: 0, red: 0 } };
  const door = { kind: "door" as const, color: "yellow" as const };
  const rules = { potionHeal: 100, percentPotion: 0, regen: 0, keyCost: 900 };
  const opened = resolveStep(p, door, rules) as StepEffect;
  assert.deepEqual([opened.player.keys.yellow, opened.keyAmount], [0.1, 0.9]);
  assert.ok(!("blocked" in resolveStep({ ...p, keys: { ...p.keys, yellow: 0.9 } }, door, rules)), "0.9 of a key opens it");
  assert.equal((resolveStep({ ...p, keys: { ...p.keys, yellow: 0.89 } }, door, rules) as { blocked: string }).blocked, "locked");
  // With Effective's 1.05 on the card too, the two multiply.
  assert.equal((resolveStep(p, door, { ...rules, scale: 1.05 }) as StepEffect).keyAmount, 0.945);
  const g = stairs();
  assert.equal(g.stepRules.keyCost, 1000);
  g.save.archives.levels.keyEfficiency = 4;
  assert.equal(g.stepRules.keyCost, 980, "read at once, mid-run");
});

test("Interest adds its share of the Silver held on a new floor, up to Max Interest, after Wishing Well, and undo takes it back", () => {
  const g = stairs();
  g.run.silver = 1000;
  g.save.archives.levels.interest = 100;
  assert.ok(g.move(1, 0));
  assert.equal(g.run.silver, 1050, "10% of 1,000 is 100, capped at 50");
  assert.ok(g.undo());
  assert.equal(g.run.silver, 1000);
  g.save.archives.levels.maxInterest = 1;
  standBeside(g);
  assert.ok(g.move(1, 0));
  assert.equal(g.run.silver, 1100, "Max Interest's first level: 100");
  const small = stairs();
  small.run.silver = 200;
  small.save.archives.levels.interest = 25;
  assert.ok(small.move(1, 0));
  assert.equal(small.run.silver, 205, "2.5% of 200");
  // Wishing Well's Silver counts toward what is held first.
  const climb = (interest: number) => {
    const well = stairs();
    well.save.upgrades.wishingWell = 1;
    well.run.silver = 100;
    well.save.archives.levels.interest = interest;
    assert.ok(well.move(1, 0));
    return well.run.silver;
  };
  const afterWell = climb(0);
  assert.ok(afterWell > 100);
  assert.equal(climb(100), afterWell + afterWell / 10);
});

test("Find Yellow Key: a fixed roll per run and floor, more research only adding keys, and undo finds the same", () => {
  const found = (levels: number) => {
    const g = stairs(4242);
    g.save.archives.levels.findYellowKey = levels;
    const keys: number[] = [];
    for (let i = 0; i < 60; i++) {
      const before = g.run.player.keys.yellow;
      standBeside(g);
      assert.ok(g.move(1, 0));
      if (g.run.player.keys.yellow > before) keys.push(g.run.height);
    }
    return keys;
  };
  assert.deepEqual(found(0), []);
  const some = found(25), all = found(50);
  assert.ok(some.length > 0 && some.every((h) => all.includes(h)), "20% finds every key 10% did");
  assert.ok(all.length >= 5 && all.length <= 22, `about 20% of 60 floors (${all.length})`);
  assert.deepEqual(found(50), all, "the same run finds the same keys");
  // Undo takes a key found back, and climbing again finds it again.
  const g = stairs(4242);
  g.save.archives.levels.findYellowKey = 50;
  g.run.height = all[0]! - 1;
  standBeside(g);
  const before = g.run.player.keys.yellow;
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.keys.yellow, before + 1);
  assert.ok(g.undo());
  assert.equal(g.run.player.keys.yellow, before);
  standBeside(g);
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.keys.yellow, before + 1);
});

test("Mug raises the Gold of a kill the hero's first strike makes, and only that", () => {
  const foe = (hp: number): Enemy => ({ name: "Rat", hp, attack: 1, defense: 0, strength: "normal" });
  const kill = (hp: number, mug: number) => {
    const g = stairs();
    g.save.archives.levels.mug = mug;
    (g.world as RoomWorld).cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "enemy", enemy: foe(hp) }]]);
    Object.assign(g.run.player, { x: 0, y: 0, attack: 10, defense: 0, hp: 100 });
    assert.ok(g.move(1, 0));
    return g.save.gold;
  };
  assert.equal(kill(5, 0), ENEMY_GOLD.normal);
  assert.equal(kill(5, 50), ENEMY_GOLD.normal * 2, "+2% a level, 50 levels");
  assert.equal(kill(15, 50), ENEMY_GOLD.normal, "two strikes: no Mug");
});
