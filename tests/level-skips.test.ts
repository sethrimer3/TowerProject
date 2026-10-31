import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { TRAINING, trainedAmount, trainingCap, trainingCeiling } from "../src/progression/training.ts";
import { trainingGold } from "../src/progression/training-jobs.ts";
import { runTrainingOffer, silverPrice } from "../src/progression/run-training.ts";
import { cost, UPGRADES } from "../src/progression/upgrades.ts";
import { skillAvailable, skillHidden, TREES } from "../src/progression/skill-trees.ts";
import { LEVEL_SKIP_SURE, levelSkipSeed, levelSkipsOf, rollLevelSkip, skippedEnemy, skippedTile } from "../src/enemies/level-skips.ts";
import { enemyStats } from "../src/enemies/curves.ts";
import { getTowerGateEnemy } from "../src/enemies/scaling.ts";
import { drawAt } from "../src/random.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { World } from "../src/delve/world.ts";
import type { LevelSkips } from "../src/enemies/level-skips.ts";
import type { Tile } from "../src/entities.ts";

const row = (id: "enemyHpSkip" | "enemyCombatSkip") => TRAINING.find((t) => t.id === id)!;
const hits = (skips: number): LevelSkips => ({ hp: { skips, draws: skips, tally: 0 }, combat: { skips, draws: skips, tally: 0 } });
/** A seed whose first `n` draws of `kind` all miss `chance`. */
function missingSeed(kind: "hp" | "combat", chance: number, n: number) {
  for (let seed = 1; ; seed++) {
    let miss = true;
    for (let d = 0; d < n && miss; d++) miss = drawAt(levelSkipSeed(seed, kind), d) * LEVEL_SKIP_SURE >= chance;
    if (miss) return seed;
  }
}

test("the skills: their trees, prices, places and what reveals them", () => {
  const at = (id: string) => TREES.flatMap((t) => t.nodes).find((n) => n.id === id)!;
  for (const id of ["enemyLevelSkips", "enemyLevelSkipLimitBreak"] as const) assert.deepEqual([UPGRADES.find((u) => u.id === id)!.currency, cost(id, 0)], ["breakthrough", 5], id);
  for (const id of ["enemyHpLevelSkips", "enemyCombatLevelSkips"] as const) assert.deepEqual([UPGRADES.find((u) => u.id === id)!.currency, cost(id, 0)], ["inspiration", 50], id);
  assert.deepEqual([at("enemyLevelSkips").x, at("enemyLevelSkips").y, at("enemyLevelSkips").requires], [50, 137, ["life"]], "straight below Life");
  assert.deepEqual([at("life").x, at("life").y], [50, 111]);
  assert.deepEqual(["floorSkipReward", "cardTorch"].map((id) => [at(id).x, at(id).y]), [[10, 358], [30, 358]], "Floor Skip Reward and Torch swapped");
  assert.deepEqual([at("enemyHpLevelSkips").x, at("enemyHpLevelSkips").y, at("enemyHpLevelSkips").requires], [10, 376, ["floorSkipReward"]]);
  assert.deepEqual([at("enemyCombatLevelSkips").x, at("enemyCombatLevelSkips").y, at("enemyCombatLevelSkips").requires], [10, 394, ["enemyHpLevelSkips"]]);
  assert.deepEqual([at("enemyLevelSkipLimitBreak").y, at("enemyLevelSkipLimitBreak").requires], [at("limitBreak1").y, ["limitBreak1"]], "splits off Limit Break 1");
  assert.equal(at("dashBadge").y, at("keyMastery").y, "Dash Badge in line with its row");
  const save = defaults();
  for (const id of ["enemyHpLevelSkips", "enemyCombatLevelSkips", "enemyLevelSkipLimitBreak"] as const) assert.ok(skillHidden(id, save.upgrades), `${id} waits on Enemy Level Skips`);
  save.upgrades.enemyLevelSkips = 1;
  for (const id of ["enemyHpLevelSkips", "enemyLevelSkipLimitBreak"] as const) assert.equal(skillHidden(id, save.upgrades), skillHidden(at(id).requires[0]!, save.upgrades), `${id} then shows with what it requires`);
  // Bought in order, each opens the next.
  save.upgrades.breakthrough = save.upgrades.trainers = 1;
  for (const id of ["questForKnowledge", "moveSpeed", "physician", "pathToWealth", "moreWealth", "overheal", "life", "ignoreMore", "ignore", "extraTrainer", "keyMastery", "cardBadges", "archives"] as const) save.upgrades[id] = 1;
  assert.equal(skillAvailable("enemyLevelSkipLimitBreak", save.upgrades), false, "waits on Limit Break 1");
  save.upgrades.limitBreak1 = 1;
  assert.equal(skillAvailable("enemyLevelSkipLimitBreak", save.upgrades), true);
  save.upgrades.enemyLevelSkips = 0;
  assert.equal(skillAvailable("enemyLevelSkipLimitBreak", save.upgrades), false, "hidden again without Enemy Level Skips");
});

test("the rows: 0.05% a level, 350 levels, 700 with the Limit Break", () => {
  const save = defaults();
  for (const [id, skill] of [["enemyHpSkip", "enemyHpLevelSkips"], ["enemyCombatSkip", "enemyCombatLevelSkips"]] as const) {
    const r = row(id);
    assert.deepEqual([r.group, r.cost, trainingCap(r, save.upgrades), trainingCeiling(r), "time" in r], ["utility", 1, 350, 700, false], id);
    save.training[id] = 7;
    assert.equal(trainedAmount(save, id), 0, "nothing without its skill");
    save.upgrades[skill] = 1;
    assert.equal(trainedAmount(save, id), 35, "0.35%, in hundredths of a percent");
    save.training[id] = 700;
    assert.equal(trainedAmount(save, id), 3500);
    save.training[id] = 0;
  }
  save.upgrades.enemyLevelSkipLimitBreak = 1;
  assert.equal(trainingCap(row("enemyHpSkip"), save.upgrades), 700);
  assert.equal(trainingCap(TRAINING.find((t) => t.id === "overheal")!, save.upgrades), 500, "no other row moves");
  const ranks = decode(JSON.stringify({ ...defaults(), training: { ...defaults().training, enemyHpSkip: 700 } })).training.enemyHpSkip;
  assert.equal(ranks, 700, "a save keeps ranks up to the raised cap");
});

test("trainers train past 350 once the Limit Break is owned, and past a Limit Break's base too", () => {
  const save = defaults();
  Object.assign(save.upgrades, { trainers: 1, enemyHpLevelSkips: 1 });
  save.gold = 1e30;
  save.training.enemyHpSkip = 350;
  save.trainerRanks.enemyHpSkip = 350;
  const g = new Game(save);
  assert.equal(g.training.batch("enemyHpSkip", 1).count, 0, "at its most");
  save.upgrades.enemyLevelSkipLimitBreak = 1;
  assert.equal(g.training.batch("enemyHpSkip", 1).count, 1);
  save.training.attack = 1000;
  assert.equal(g.training.batch("attack", 1).count, 0);
  save.upgrades.limitBreak1 = 1;
  assert.equal(g.training.batch("attack", 1).count, 1);
});

test("the prices run through the asked-for numbers", () => {
  const near = (actual: number, wanted: number, n: number) => assert.ok(Math.abs(actual / wanted - 1) < 0.002, `level ${n}: ${actual}, wanted about ${wanted}`);
  const gold: readonly (readonly [number, number])[] = [[1, 3e8], [10, 3.72e9], [20, 9e9], [50, 45e9], [100, 280e9], [200, 5.26e12], [300, 78e12], [400, 1.45e15], [500, 45.54e15], [600, 1.57e18], [700, 124e18]];
  for (const id of ["enemyHpSkip", "enemyCombatSkip"] as const) {
    for (const [n, wanted] of gold) near(trainingGold(row(id), n - 1), wanted, n);
    assert.deepEqual([0, 1, 2, 3].map((k) => silverPrice(id, k)), [240, 341, 449, 569]);
    for (const [n, wanted] of [[50, 122e3], [100, 1e6], [200, 35e6]] as const) near(silverPrice(id, n - 1), wanted, n);
    for (let k = 1; k < 700; k++) {
      assert.ok(silverPrice(id, k) > silverPrice(id, k - 1), `Silver rises at ${k}`);
      assert.ok(trainingGold(row(id), k) > trainingGold(row(id), k - 1), `Gold rises at ${k}`);
    }
  }
});

test("a chance's draws skip floors, each kind on its own stream", () => {
  const roll = (seed: number, kind: "hp" | "combat", chance: number, floors: number) => {
    const run: { seed: number; levelSkips?: LevelSkips } = { seed }, skipped: boolean[] = [];
    for (let f = 0; f < floors; f++) skipped.push(rollLevelSkip(run, kind, chance));
    return { run, skipped };
  };
  assert.deepEqual(roll(5, "hp", 2000, 100).skipped, roll(5, "hp", 2000, 100).skipped, "the same seed replays");
  assert.notDeepEqual(roll(5, "hp", 2000, 100).skipped, roll(5, "combat", 2000, 100).skipped, "the kinds roll apart");
  // Drawing one leaves the other where it was.
  const both: { seed: number; levelSkips?: LevelSkips } = { seed: 5 };
  rollLevelSkip(both, "hp", 2000);
  rollLevelSkip(both, "hp", 2000);
  const combat = rollLevelSkip(both, "combat", 2000);
  assert.equal(combat, roll(5, "combat", 2000, 1).skipped[0]);
  const none: { seed: number; levelSkips?: LevelSkips } = { seed: 5 };
  assert.equal(rollLevelSkip(none, "hp", 0), false);
  assert.equal(none.levelSkips, undefined, "no chance draws nothing");
  const many = roll(9, "hp", 2000, 5000).run.levelSkips!.hp!;
  assert.ok(Math.abs(many.skips - 1000) < 100, `about 20% of 5,000 floors: ${many.skips}`);
  assert.equal(many.draws, 5000);
});

test("below 10% the chance adds up: at 0.5% floor 200 brings a skip by itself", () => {
  const seed = missingSeed("hp", 50, 200), run: { seed: number; levelSkips?: LevelSkips } = { seed };
  for (let f = 1; f < 200; f++) assert.equal(rollLevelSkip(run, "hp", 50), false, `floor ${f}`);
  assert.equal(run.levelSkips!.hp!.tally, 9950);
  assert.equal(rollLevelSkip(run, "hp", 50), true, "the 200th floor");
  assert.deepEqual(run.levelSkips!.hp, { skips: 1, draws: 200, tally: 0 });
});

test("an early skip makes the next sure one wait longer", () => {
  const run = { seed: missingSeed("hp", 50, 400), levelSkips: { hp: { skips: 1, draws: 0, tally: -9500 } } as LevelSkips };
  // As if a lucky skip came on floor 10: 390 more floors to 100%.
  for (let f = 1; f < 390; f++) assert.equal(rollLevelSkip(run, "hp", 50), false, `floor ${f} after`);
  assert.equal(rollLevelSkip(run, "hp", 50), true);
  assert.deepEqual([run.levelSkips.hp!.skips, run.levelSkips.hp!.tally], [2, 0]);
});

test("a run put back draws the same again, as undo's copy does", () => {
  const run = { seed: 44, levelSkips: undefined as LevelSkips | undefined };
  for (let f = 0; f < 30; f++) rollLevelSkip(run, "hp", 300);
  const copy = JSON.parse(JSON.stringify(run));
  const ahead = Array.from({ length: 30 }, () => rollLevelSkip(run, "hp", 300));
  assert.deepEqual(Array.from({ length: 30 }, () => rollLevelSkip(copy, "hp", 300)), ahead);
  assert.deepEqual(copy.levelSkips, run.levelSkips);
});

test("from 10% only the draw counts", () => {
  const seed = missingSeed("combat", 1000, 40), run: { seed: number; levelSkips?: LevelSkips } = { seed, levelSkips: { combat: { skips: 0, draws: 0, tally: 9999 } } };
  for (let f = 0; f < 40; f++) assert.equal(rollLevelSkip(run, "combat", 1000), false, "no sure skip");
  assert.deepEqual(run.levelSkips!.combat, { skips: 0, draws: 40, tally: 0 });
  // Just below, the tally still brings one.
  const below = { seed: missingSeed("combat", 995, 11), levelSkips: undefined as LevelSkips | undefined };
  let got = 0;
  for (let f = 0; f < 11; f++) if (rollLevelSkip(below, "combat", 995)) got++;
  assert.equal(got, 1, "11 floors at 9.95% pass 100%");
});

test("five skips on floor 100: floor 95's stats, HP and combat apart", () => {
  for (const strength of ["normal", "elite", "boss", "greaterBoss"] as const) {
    const here = getTowerGateEnemy(99, strength, "attackHeavy"), low = enemyStats("tower", 1, 94, strength, "attackHeavy");
    const both = skippedEnemy(here, "tower", 1, 99, hits(5));
    assert.deepEqual([both.hp, both.attack, both.defense], [low.hp, low.attack, low.defense], strength);
    const hp = skippedEnemy(here, "tower", 1, 99, { hp: { skips: 5, draws: 5, tally: 0 } });
    assert.deepEqual([hp.hp, hp.attack, hp.defense], [low.hp, here.attack, here.defense], "HP alone");
    const combat = skippedEnemy(here, "tower", 1, 99, { combat: { skips: 5, draws: 5, tally: 0 } });
    assert.deepEqual([combat.hp, combat.attack, combat.defense], [here.hp, low.attack, low.defense], "ATK and DEF alone");
  }
  // Whatever else scales it stays in proportion, and floors stop at the curve's start.
  const armored = { ...getTowerGateEnemy(99, "normal", "balanced"), defense: enemyStats("tower", 1, 99, "normal", "balanced").defense * 2 };
  assert.equal(skippedEnemy(armored, "tower", 1, 99, hits(5)).defense, enemyStats("tower", 1, 94, "normal", "balanced").defense * 2);
  assert.equal(skippedEnemy(getTowerGateEnemy(2, "normal", "balanced"), "tower", 1, 2, hits(50)).hp, enemyStats("tower", 1, 0, "normal", "balanced").hp);
  const flyer: Tile = { kind: "floor", flyer: getTowerGateEnemy(99, "normal", "balanced") };
  assert.equal(skippedTile(flyer, "tower", 1, 99, hits(5)).flyer!.hp, enemyStats("tower", 1, 94, "normal", "balanced").hp);
  const wall: Tile = { kind: "wall" };
  assert.equal(skippedTile(wall, "tower", 1, 99, hits(5)), wall);
  const none: Tile = { kind: "enemy", enemy: getTowerGateEnemy(99, "normal", "balanced") };
  assert.equal(skippedTile(none, "tower", 1, 99, { hp: { skips: 0, draws: 3, tally: 90 } }), none, "no skip yet changes nothing");
});

test("a Tower floor reads every enemy by the run's skips, its wounds off after", () => {
  const plain = new RoomWorld(12, 40, {}), low = new RoomWorld(12, 40, {}, 0, 1, undefined, undefined, undefined, undefined, 0, hits(4));
  let checked = 0;
  for (const k of plain.cells.keys()) {
    const [x, y] = k.split(",").map(Number) as [number, number], a = plain.tile(x, y), b = low.tile(x, y);
    assert.equal(a.kind, b.kind, "the layout never changes");
    if (a.kind !== "enemy") continue;
    checked++;
    assert.ok(b.enemy!.hp < a.enemy!.hp && b.enemy!.attack < a.enemy!.attack, "weaker");
  }
  assert.ok(checked > 0);
  assert.ok(low.typicalEnemy().hp < plain.typicalEnemy().hp);
  const at = low.floorEnemies()[0]!, full = low.tile(at.x, at.y).enemy!.hp;
  low.wound(at.x, at.y, 1);
  assert.equal(low.tile(at.x, at.y).enemy!.hp, full - 1);
});

/** A Tower run past the forest with `ranks` of both rows owned. */
function climber(ranks: number) {
  const save = defaults();
  Object.assign(save.upgrades, { enemyHpLevelSkips: 1, enemyCombatLevelSkips: 1 });
  Object.assign(save.training, { enemyHpSkip: ranks, enemyCombatSkip: ranks });
  const g = new Game(save);
  g.newRun({ outside: false, seed: 321 });
  return g;
}

test("climbing rolls once a new floor, and the new floor stands by them", () => {
  const g = climber(350);
  for (let f = 0; f < 60; f++) g.advanceTowerRoom();
  const skips = g.run.levelSkips!;
  assert.deepEqual([skips.hp!.draws, skips.combat!.draws], [60, 60]);
  assert.ok(skips.hp!.skips > 0 && skips.combat!.skips > 0, "17.5% over 60 floors");
  assert.notEqual(skips.hp!.skips, skips.combat!.skips, "rolled apart, on this seed");
  const world = g.world as RoomWorld, enemy = world.floorEnemies()[0]!, e = world.tile(enemy.x, enemy.y).enemy!;
  const hpFactor = enemyStats("tower", 1, 60 - skips.hp!.skips, e.strength, e.profile ?? "balanced").hp / enemyStats("tower", 1, 60, e.strength, e.profile ?? "balanced").hp;
  const raw = new RoomWorld(g.run.seed, 60, {}).tile(enemy.x, enemy.y).enemy!;
  assert.ok(Math.abs(e.hp / raw.hp - hpFactor) < 0.001, "at the HP skips' floor");
  assert.equal(levelSkipsOf(g.run, "enemyHpSkip"), skips.hp!.skips);
  assert.equal(levelSkipsOf(g.run, "enemyCombatSkip"), skips.combat!.skips);
  assert.equal(levelSkipsOf(g.run, "overheal"), null);

  // A reload keeps them, and the board rebuilt reads them.
  const back = decode(JSON.stringify(g.save));
  assert.deepEqual(back.tower.run!.levelSkips, skips);
  const again = new Game(back), read = (again.world as RoomWorld).tile(enemy.x, enemy.y).enemy!;
  assert.equal(read.hp, e.hp);
});

test("no ranks draw nothing; Silver ranks count from the next floor", () => {
  const g = climber(0);
  g.advanceTowerRoom();
  assert.equal(g.run.levelSkips, undefined);
  g.run.training = { ...g.run.training, enemyHpSkip: 4 };
  assert.equal(runTrainingOffer(g.save, g.run, "enemyHpSkip").level, 4);
  g.advanceTowerRoom();
  assert.deepEqual([g.run.levelSkips!.hp!.draws, g.run.levelSkips!.hp!.tally >= 0 || g.run.levelSkips!.hp!.skips === 1, g.run.levelSkips!.combat], [1, true, undefined]);
});

test("a malformed save's tally is dropped; a good one stays", () => {
  const g = climber(10);
  g.advanceTowerRoom();
  const good = JSON.parse(JSON.stringify(g.save));
  assert.deepEqual(decode(JSON.stringify(good)).tower.run!.levelSkips, g.run.levelSkips);
  good.tower.run.levelSkips = { hp: { skips: -1, draws: 1, tally: 0 } };
  assert.equal(decode(JSON.stringify(good)).tower.run!.levelSkips, undefined);
});

test("a Delve rolls each equivalent floor, ten depth a skip, every enemy on the board at once", () => {
  const save = defaults();
  Object.assign(save.upgrades, { delve: 1, enemyHpLevelSkips: 1, enemyCombatLevelSkips: 1 });
  const g = new Game(save);
  g.switchMode("delve");
  g.newRun({ outside: false, seed: 77 });
  const world = g.world as World, typical = world.typicalEnemy(500), level = () => (g.run.levelSkips ??= {});
  assert.equal(typical.hp, enemyStats("delve", 1, 500, "normal", "balanced").hp, "no skips yet");
  level().hp = { skips: 3, draws: 3, tally: 0 };
  assert.equal(world.typicalEnemy(500).hp, enemyStats("delve", 1, 470, "normal", "balanced").hp, "the live run's skips");
  assert.equal(world.typicalEnemy(500).attack, typical.attack, "HP's skips leave ATK alone");

  // A real enemy on the board weakens by its own depth the moment a skip comes, and comes back without.
  delete g.run.levelSkips;
  let at: { x: number; y: number } | undefined;
  for (let y = 40; y < 400 && !at; y++) for (let x = 0; x < world.width && !at; x++) if (world.tile(x, y).kind === "enemy") at = { x, y };
  const full = world.tile(at!.x, at!.y).enemy!;
  level().combat = { skips: 2, draws: 2, tally: 0 };
  const less = world.tile(at!.x, at!.y).enemy!;
  assert.equal(less.hp, full.hp, "Combat's skips leave HP alone");
  assert.ok(less.attack < full.attack && less.defense <= full.defense);
  assert.equal(world.tile(at!.x + world.width, at!.y).kind, "wall", "off the board stays wall");

  // Crossing floors rolls each one, however many a step crosses.
  g.save.training.enemyHpSkip = 100;
  g.save.training.enemyCombatSkip = 100;
  delete g.run.levelSkips;
  const pay = (g as unknown as { payDelveFloors(from: number, at: { x: number; y: number }): void });
  g.run.maxHeight = 40;
  pay.payDelveFloors(0, { x: g.run.player.x, y: g.run.player.y });
  const floors = g.rules.equivalentFloor(40);
  assert.deepEqual([g.run.levelSkips!.hp!.draws, g.run.levelSkips!.combat!.draws], [floors, floors]);
});
