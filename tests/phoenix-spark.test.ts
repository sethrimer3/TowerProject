// Phoenix Spark (docs/agents/movement-and-combat.md): each charge a run
// has shrugs off one hit that would defeat the hero, once Revive's roll and
// Angel Wings have failed, in a fight or from a shot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { point, type Enemy, type Player, type Tile } from "../src/entities.ts";
import { bout, heroHpAfter, resume, sparkings, SPARK_MS, summarize } from "../src/combat.ts";
import { loadout } from "../src/progression/loadout.ts";
import { RoomWorld } from "../src/tower/room-world.ts";

// Its fourth strike back (30, 31, 32, then 33) fells a 100 HP hero, whose
// fifth strike fells it.
const brute: Enemy = { name: "Brute", hp: 60, attack: 30, defense: 0, tier: 0, strength: "normal" };
const hero = (): Player => ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 12, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } });

test("a charge shrugs off the strike that would fell the hero, which does nothing, and the fight goes on", () => {
  assert.equal(heroHpAfter(bout(hero(), brute), 100), 0, "without a charge, the hero falls");
  const fight = bout(hero(), brute, undefined, undefined, undefined, 1);
  const sparked = fight.strikes.filter((s) => s.sparked);
  assert.equal(sparked.length, 1);
  assert.deepEqual([sparked[0]!.damage, sparked[0]!.hp], [0, 7], "no damage: the hero keeps the 7 HP it had");
  assert.equal(heroHpAfter(fight, 100), 7, "and wins with its next strike");
  const next = fight.strikes[fight.strikes.indexOf(sparked[0]!) + 1]!;
  assert.ok(next.start >= sparked[0]!.end + SPARK_MS, "the next strike waits for its mark");
  assert.deepEqual(sparkings(fight), [sparked[0]!.at]);
  // The shroud and the shield it would have taken stay whole.
  const guarded = bout({ ...hero(), shroud: 5, shield: 3 }, { ...brute, hp: 400 }, undefined, undefined, undefined, 1);
  const lethal = guarded.strikes.find((s) => s.sparked)!;
  assert.deepEqual([lethal.shrouded, lethal.shielded], [undefined, undefined]);
});

test("each charge saves one strike; with none left the hero falls", () => {
  const tough = { ...brute, hp: 400 };
  for (const sparks of [1, 2, 3]) {
    const fight = bout(hero(), tough, undefined, undefined, undefined, sparks);
    assert.equal(fight.strikes.filter((s) => s.sparked).length, sparks, `${sparks} charges`);
    assert.equal(heroHpAfter(fight, 100), 0, "the strike after the last charge fells it");
  }
  // Played on from after a charge was spent (Training bought mid-fight), it counts as spent.
  const fight = bout(hero(), tough, undefined, undefined, undefined, 1), from = fight.strikes.findIndex((s) => s.sparked) + 1;
  const again = resume(fight, from, { player: { ...hero(), hp: 7 }, enemy: tough, sparks: 1 });
  assert.equal(again.strikes.filter((s) => s.sparked).length, 1);
  // A summary round keeps the mark.
  assert.ok(summarize(bout(hero(), brute, undefined, undefined, undefined, 1), 0).strikes.some((s) => s.sparked));
});

test("it comes only after the revivals: Revive's roll first, then Angel Wings", () => {
  const revived = bout(hero(), brute, () => true, undefined, undefined, 1);
  assert.ok(revived.strikes.some((s) => s.revived) && !revived.strikes.some((s) => s.sparked));
  const winged = bout(hero(), brute, undefined, undefined, { smites: false }, 1);
  assert.ok(winged.strikes.some((s) => s.winged) && !winged.strikes.some((s) => s.sparked));
  // Wings spent, the next lethal strike takes the charge.
  const tough = { ...brute, hp: 400 }, both = bout(hero(), tough, undefined, undefined, { smites: false }, 1);
  const winging = both.strikes.findIndex((s) => s.winged), sparking = both.strikes.findIndex((s) => s.sparked);
  assert.ok(winging >= 0 && sparking > winging);
});

test("the skill gives a run one charge, and Phoenix Spark Count research more", () => {
  const s = defaults();
  assert.equal(loadout(s).sparks, 0);
  s.upgrades.phoenixSpark = 1;
  assert.equal(loadout(s).sparks, 1);
  s.archives.levels.sparkCount = 3;
  assert.equal(loadout(s).sparks, 4);
});

/** A Delve run with the hero two tiles above the Brute in a walled
 * corridor, Phoenix Spark owned unless `owned` is false. */
function arena(owned = true, sparkCount = 0) {
  const g = new Game(defaults());
  g.save.upgrades.breakthrough = 1;
  g.save.settings.devMode = true;
  if (owned) g.save.upgrades.phoenixSpark = 1;
  g.save.archives.levels.sparkCount = sparkCount;
  g.switchMode("delve");
  g.newRun({ seed: 1 });
  g.run.hand = ["stairs"];
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 30; x++) g.run.changes[point(x, y)] = { kind: x === 15 && y < 10 ? "floor" : "wall" };
  Object.assign(g.run.player, { x: 15, y: 0, ...hero(), x: 15, y: 0 });
  const tile = g.world.tile.bind(g.world);
  g.world.tile = (x, y): Tile => (x === 15 && (y === 2 || y === 4) && g.run.player.y < y ? { kind: "enemy", enemy: brute } : tile(x, y));
  g.move(0, 1);
  return g;
}

test("in play, a charge saves the hero from a lethal fight, once, and the board marks it", () => {
  const g = arena();
  assert.equal(g.sparksLeft, 1);
  assert.ok(g.move(0, 1));
  assert.ok(!g.fallen, "saved");
  assert.deepEqual([g.run.player.hp, g.run.kills, g.run.sparksUsed], [7, 1, 1]);
  assert.equal(g.sparksLeft, 0, "spent for the run");
  assert.equal(g.fights.sparkedAt.length, 1, "the skull in its circle over the hero");
  assert.match(g.message, /^Phoenix Spark · −93 HP · Brute defeated/);
  // The next lethal fight, with none left, fells the hero.
  g.run.player.hp = 100;
  g.move(0, 1);
  g.move(0, 1);
  assert.ok(g.fallen);
  // Without the skill the first fight fells it, and research adds charges.
  const bare = arena(false);
  bare.move(0, 1);
  assert.ok(bare.fallen);
  const more = arena(true, 1);
  assert.equal(more.sparksLeft, 2);
});

test("a charge shrugs off a shot that would fell the hero, after Angel Wings", () => {
  const shooter: Enemy = { name: "Archer", hp: 50, attack: 500, defense: 0, tier: 3, strength: "normal", ranged: true };
  const shot = (wings = false) => {
    const save = defaults();
    save.upgrades.phoenixSpark = 1;
    if (wings) save.upgrades.angelWings = 1;
    const g = new Game(save);
    g.run.tier = 3;
    if (wings) g.run.hand = ["stairs", "angelWings"];
    const w = g.world as RoomWorld;
    w.cells = new Map();
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
    w.cells.set("3,0", { kind: "enemy", enemy: shooter });
    Object.assign(g.run.player, { x: 0, y: 0, attack: 1000, defense: 0, hp: 100, maxHp: 100 });
    assert.ok(g.move(1, 0));
    return g;
  };
  const g = shot();
  assert.ok(!g.fallen);
  assert.equal(g.run.player.hp, 100, "the shot did nothing");
  assert.equal(g.run.sparksUsed, 1);
  assert.equal(g.fights.sparkedAt.length, 1);
  assert.ok(g.volley?.shots.some((s) => s.sparked && s.damage === 0));
  assert.match(g.message, /Phoenix Spark/);
  // Angel Wings, held and ready, raises the hero first, and keeps the charge.
  const winged = shot(true);
  assert.ok(!winged.fallen && winged.run.wingsSpent);
  assert.equal(winged.run.sparksUsed, undefined);
});
