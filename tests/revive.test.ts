import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { point, type Enemy, type Tile } from "../src/entities.ts";
import { bout, heroHpAfter, REVIVE_MS, revivals } from "../src/combat.ts";
import { reviveChance, trainingStep } from "../src/loadout.ts";
import { TREES } from "../src/skill-trees.ts";
import { UPGRADES } from "../src/config.ts";

// 12 ATK takes five strikes to beat it; its fourth strike back (30, 30, 30,
// 31) fells a 100 HP hero, who at full HP again wins with its fifth.
const brute: Enemy = { name: "Brute", hp: 60, attack: 30, defense: 0, tier: 0, strength: "normal" };
const hero = () => ({ hp: 100, maxHp: 100, attack: 12, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } });

test("a revival raises the hero at full HP from the strike that would fell it, and the fight goes on", () => {
  const lost = bout(hero(), brute);
  assert.equal(heroHpAfter(lost, 100), 0);
  const won = bout(hero(), brute, (strike) => strike === 3);
  assert.deepEqual(won.strikes.slice(0, 7).map((s) => s.damage), lost.strikes.slice(0, 7).map((s) => s.damage), "the same strikes up to the fall");
  const rose = won.strikes[7];
  assert.deepEqual([rose.by, rose.revived, rose.hp], ["enemy", true, 100]);
  assert.equal(won.strikes.at(-1)!.by, "hero", "the hero strikes the last blow");
  assert.equal(heroHpAfter(won, 100), 100);
  assert.deepEqual(revivals(won), [rose.at]);
  assert.equal(revivals(lost).length, 0);
  // Each lethal strike rolls again: a revival that is not repeated falls.
  const tough = { ...brute, hp: 200 };
  assert.equal(heroHpAfter(bout(hero(), tough, (strike) => strike === 3), 100), 0);
  assert.ok(heroHpAfter(bout(hero(), tough, () => true), 100) > 0);
});

test("Revive's chance: 0.5%, and 0.5% more a training rank, up to 50% at 99 ranks", () => {
  const s = defaults();
  assert.equal(reviveChance(s), 0, "nothing without the skill");
  s.upgrades.revive = 1;
  assert.equal(reviveChance(s), 50);
  s.training.revive = 10;
  assert.equal(reviveChance(s), 550);
  s.training.revive = 99;
  assert.equal(reviveChance(s), 5000);
  const step = trainingStep(s, "revive");
  assert.ok(step.maxed);
  assert.equal(step.now, 50);
  s.training.revive = 0;
  assert.deepEqual([trainingStep(s, "revive").now, trainingStep(s, "revive").next, trainingStep(s, "revive").worth], [0.5, 1, 0.5]);
});

test("Revive is a 10 Inspiration skill below Shroud, and the Courage tree no longer has it", () => {
  const row = UPGRADES.find((u) => u.id === "revive")!;
  assert.deepEqual([row.currency, row.base, row.max], ["inspiration", 10, 1]);
  const where = TREES.filter((t) => t.nodes.some((n) => n.id === "revive")).map((t) => t.id);
  assert.deepEqual(where, ["inspiration"]);
  assert.deepEqual(TREES.find((t) => t.id === "inspiration")!.nodes.find((n) => n.id === "revive")!.requires, ["shroud"]);
  assert.deepEqual(TREES.find((t) => t.id === "courage")!.nodes.find((n) => n.id === "legacy")!.requires, ["attack", "undos"]);
});

/** A Delve run on `seed` with the hero two tiles below a Brute in a walled
 * corridor, 100 HP and 12 ATK, with Revive trained to `ranks`. */
function arena(seed: number, ranks: number | null) {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1;
  g.save.upgrades.delve = 1;
  g.save.settings.devMode = true;
  if (ranks !== null) {
    g.save.upgrades.revive = 1;
    g.save.training.revive = ranks;
  }
  g.switchMode("delve");
  g.newRun({ seed });
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 30; x++) g.run.changes[point(x, y)] = { kind: x === 15 && y < 10 ? "floor" : "wall" };
  Object.assign(g.run.player, { x: 15, y: 0, ...hero() });
  guard(g);
  g.move(0, 1);
  return g;
}
/** Stands the Brute on the live board (saved changes hold only terrain,
 * and undo builds the board again). */
function guard(g: Game) {
  const tile = g.world.tile.bind(g.world);
  const foe: Tile = { kind: "enemy", enemy: brute };
  g.world.tile = (x, y) => (x === 15 && y === 2 && g.run.kills === 0 ? foe : tile(x, y));
}

test("in play, a lethal fight revives the hero by a fixed roll per run, tile and strike, so undo can't fish for one", () => {
  let revived = 0, fell = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = arena(seed, 99);
    g.move(0, 1);
    if (g.fallen) {
      fell++;
      assert.equal(g.revivedAt.length, 0);
      // Taken back and fought again, the fight ends the same way.
      assert.ok(g.undo());
      guard(g);
      g.move(0, 1);
      assert.ok(g.fallen, `seed ${seed}: the same fall again`);
      continue;
    }
    revived++;
    assert.equal(g.run.player.y, 2, "the hero stands where the Brute fell");
    assert.equal(g.run.player.hp, 100, "at full HP, the Brute felled by the next strike");
    assert.equal(g.run.kills, 1);
    assert.equal(g.revivedAt.length, 1);
    assert.match(g.message, /^Revived · Brute defeated/);
    assert.ok(g.undo());
    assert.equal(g.revivedAt.length, 0, "undo puts out the fire");
    guard(g);
    g.move(0, 1);
    assert.ok(!g.fallen && g.run.player.hp === 100, `seed ${seed}: the same revival again`);
    // Played out strike by strike, the fire rises when the revival lands.
    const shown = arena(seed, 99);
    shown.playsFights = true;
    const start = performance.now();
    shown.move(0, 1);
    const fight = shown.encounter!;
    assert.ok(fight);
    assert.deepEqual(shown.revivedAt, revivals(fight.bout).map((at) => fight.start + at));
    assert.ok(shown.revivedAt[0] > start);
    shown.finishEncounter();
    assert.ok(!shown.fallen && shown.run.player.hp === 100);
    // Settled at once, it shows in summary rounds, each after the last
    // revival's fire, and counts once the last has shown.
    const quick = arena(seed, 99);
    quick.playsFights = true;
    quick.save.upgrades.instantCombat = 1;
    quick.save.settings.fightAnimation = false;
    quick.move(0, 1);
    const summary = quick.encounter!;
    assert.ok(summary?.summary, "a revival makes even a quick fight wait");
    assert.deepEqual(quick.revivedAt.map((at) => at - summary.start), [0]);
    assert.equal(summary.bout.duration, REVIVE_MS);
    quick.finishEncounter();
    assert.ok(!quick.fallen && quick.run.player.hp === 100);
  }
  // At 50%, about half of them.
  assert.ok(revived > 8 && fell > 8, `${revived} revived, ${fell} fell`);
  // Without the skill every one of them falls.
  for (let seed = 1; seed <= 10; seed++) {
    const g = arena(seed, null);
    g.move(0, 1);
    assert.ok(g.fallen);
  }
});

test("more Revive training only ever adds revivals", () => {
  for (let seed = 1; seed <= 24; seed++) {
    const low = arena(seed, 20), high = arena(seed, 60);
    low.move(0, 1);
    high.move(0, 1);
    if (!low.fallen) assert.ok(!high.fallen, `seed ${seed}`);
  }
});
