import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save.ts";
import { RUN_TRAINING_PRICES, TRAINER_GOLD_CURVES, TRAINING, xpForLevel } from "../src/config.ts";
import { loadout, trainingPoints, trainingStep } from "../src/loadout.ts";
import { BOOST_MAX_MS, claimBoost, doneAt, finishGems, trainingGold, trainingMs, trainingSeconds, workLeft } from "../src/training-jobs.ts";
import { RESEARCH } from "../src/archives.ts";

const HOUR = 3_600_000;
const game = (level = 10) => {
  const g = new Game(defaults());
  g.save.upgrades.trainers = 1;
  g.newRun({ outside: true });
  g.save.xp = xpForLevel(level);
  g.save.gold = 10_000;
  // A real timestamp, so saving keeps times past 1e9 ms.
  let now = 1_790_000_000_000;
  g.clock = () => now;
  return { g, wait: (s: number) => { now += s * 1000; } };
};

test("a stat's first ranks are quick, then each takes a quarter hour more", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 99].map(trainingSeconds), [15, 60, 300, 600, 900, 1800, 2700, 86400]);
});

test("a trainer's Gold: 20 a point, times the rank's number, times 1 + ranks / the row's growth", () => {
  const at = (id: (typeof TRAINING)[number]["id"], ranks: number[], cost = 1) => ranks.map((r) => trainingGold({ id, cost }, r));
  assert.deepEqual(at("potion", [0, 1, 2, 3, 4, 9]), [20, 44, 72, 104, 140, 380], "20 Silver rows: growth 10");
  assert.deepEqual(at("floorGold", [0, 1, 2, 3, 9]), [20, 42, 66, 92, 290], "10 Silver rows: growth 20");
  assert.deepEqual(at("attack", [0, 1, 2, 3, 9]), [20, 41, 63, 86, 245], "5 Silver rows: growth 40");
  assert.deepEqual(at("hp", [0, 1, 2, 3, 9]), [20, 41, 62, 84, 230], "Max HP and Shroud, 3 Silver: growth 60");
  assert.deepEqual(at("shroud", [0, 1, 2, 3, 9]), at("hp", [0, 1, 2, 3, 9]));
  assert.deepEqual(at("attack", [0], 3), [60], "times the row's point cost");
  // The dearer a row's first Silver rank, the steeper its trainers, and rows
  // that start alike in Silver share a trainer curve.
  const silverBase = (id: keyof typeof RUN_TRAINING_PRICES) => RUN_TRAINING_PRICES[id].base;
  // (The crit rows' growth is on a cubic curve of its own and doesn't compare.)
  const linear = TRAINING.filter((t) => !TRAINER_GOLD_CURVES[t.id].power);
  for (const a of linear) for (const b of linear) {
    const [ga, gb] = [TRAINER_GOLD_CURVES[a.id].growth, TRAINER_GOLD_CURVES[b.id].growth];
    if (silverBase(a.id) < silverBase(b.id)) assert.ok(ga > gb, `${a.id} softer than ${b.id}`);
    if (silverBase(a.id) === silverBase(b.id)) assert.equal(ga, gb, `${a.id} and ${b.id} alike`);
  }
  const { g } = game();
  assert.equal(trainingStep(g.save, "attack").gold, 20, "ATK costs 1 point a rank");
});

test("training points work from the start; trainers need the Trainers skill, or Dev mode", () => {
  const { g } = game();
  g.save.upgrades.trainers = 0;
  assert.ok(g.training.train("hp"), "points need no skill");
  assert.equal(g.training.trainWithGold("hp"), false);
  g.save.gems = 1000;
  assert.equal(g.training.buyTrainer(), false);
  g.save.settings.devMode = true;
  assert.ok(g.training.trainWithGold("attack"));
  g.save.settings.devMode = false;
  g.save.upgrades.trainers = 1;
  assert.ok(g.training.buyTrainer());
  assert.ok(g.training.trainWithGold("hp"));
});

test("points and trainers keep separate schedules: points never make a trainer dearer or slower", () => {
  const { g, wait } = game();
  for (let i = 0; i < 5; i++) assert.ok(g.training.train("attack"));
  assert.equal(g.save.training.attack, 5);
  assert.equal(trainingStep(g.save, "attack").gold, 20, "a trainer's first rank's Gold");
  assert.equal(g.training.toNextRank("attack"), 15_000, "and its first rank's time");
  assert.ok(g.training.trainWithGold("attack"));
  wait(15);
  g.training.settle();
  assert.deepEqual([g.save.training.attack, g.save.trainerRanks.attack], [6, 1]);
  assert.equal(trainingStep(g.save, "attack").gold, 41, "the trainer's second rank");
  assert.equal(g.training.toNextRank("attack"), 60_000);
  assert.ok(g.training.train("attack"));
  assert.equal(trainingStep(g.save, "attack").gold, 41, "points left the trainer's schedule alone");
  assert.deepEqual(decode(JSON.stringify(g.save)).trainerRanks, g.save.trainerRanks, "saved");
  g.save.gems = 2;
  assert.ok(g.training.reset("attack"));
  assert.equal(g.save.trainerRanks.attack, 0, "a reset starts the trainer's schedule over");
});

test("training points buy a rank at once, without Gold, time or a trainer", () => {
  const { g, wait } = game();
  const before = loadout(g.save).maxHp, points = trainingPoints(g.save).left, gold = g.save.gold;
  assert.ok(g.training.trainWithGold("defense"), "the one trainer is busy");
  assert.ok(g.training.train("hp"));
  assert.equal(g.save.training.hp, 1, "at once");
  assert.equal(trainingPoints(g.save).left, points - 1);
  assert.equal(g.save.gold, gold - 20, "only the trainer's Gold");
  assert.ok(loadout(g.save).maxHp > before);
  assert.equal(g.run.player.maxHp, loadout(g.save).maxHp, "a run in the forest takes it");
  // Bought with points while a trainer trains it, the rank counts at once
  // and the trainer stops: its Gold back, the time spent as credit.
  wait(10);
  assert.ok(g.training.train("defense"));
  assert.equal(g.save.training.defense, 1);
  assert.deepEqual(g.save.trainingJobs, []);
  assert.equal(g.save.gold, gold, "the trainer's Gold back");
  assert.equal(g.save.trainingCredit.defense, 10_000, "the time spent as DEF's credit");
  assert.equal(g.save.trainingCredit.hp, 0, "no other stat's");
  g.save.xp = 0;
  assert.equal(g.training.train("hp"), false, "no points left");
});

test("a trainer takes Gold and time, not points, and the rank counts when its time is up", () => {
  const { g, wait } = game();
  const before = loadout(g.save).maxHp, points = trainingPoints(g.save).left;
  assert.ok(g.training.trainWithGold("hp"));
  assert.equal(g.save.gold, 10_000 - 20, "paid when started");
  assert.equal(trainingPoints(g.save).left, points, "no points");
  assert.equal(g.save.training.hp, 0);
  assert.equal(loadout(g.save).maxHp, before, "no effect yet");
  wait(14);
  assert.equal(g.training.settle(), 0);
  wait(1);
  assert.equal(g.training.settle(), 1);
  assert.equal(g.save.training.hp, 1);
  assert.deepEqual(g.save.trainingPaid.hp, { points: 0, gold: 20, ms: 15_000 });
  assert.deepEqual(g.training.done, [{ id: "hp", level: 1 }], "announced");
  assert.ok(loadout(g.save).maxHp > before);
  // The second rank takes a minute and costs 40.
  assert.ok(g.training.trainWithGold("hp"));
  assert.equal(g.save.trainingJobs[0].completesAt - g.save.trainingJobs[0].startedAt, 60_000);
  g.save.gold = 0;
  wait(60);
  g.training.settle();
  assert.equal(g.training.trainWithGold("hp"), false, "no Gold");
});

test("one stat trains at a time, and each trainer bought with Gems adds one", () => {
  const { g } = game();
  assert.ok(g.training.trainWithGold("hp"));
  assert.equal(g.training.trainWithGold("hp"), false, "already training");
  assert.equal(g.training.trainWithGold("defense"), false, "the one slot is busy");
  assert.equal(g.training.buyTrainer(), false, "no Gems");
  g.save.gems = 400;
  assert.ok(g.training.buyTrainer());
  assert.equal(g.save.gems, 300);
  assert.ok(g.training.trainWithGold("defense"));
  assert.equal(g.training.trainWithGold("attack"), false, "both slots busy");
  assert.ok(g.training.buyTrainer(), "the next costs 300");
  assert.equal(g.save.gems, 0);
  assert.equal(decode(JSON.stringify(g.save)).trainers, 2, "trainers are saved");
  assert.equal(decode(JSON.stringify({ ...g.save, trainers: 9 })).trainers, 0, "no more than there are");
  g.save.gems = 1e6;
  for (const price of [700, 1200, 1800]) {
    const before = g.save.gems;
    assert.ok(g.training.buyTrainer());
    assert.equal(before - g.save.gems, price);
  }
  assert.equal(g.training.buyTrainer(), false, "every trainer bought");
});

test("Gems finish a rank at once: one per ten minutes left, rounded up", () => {
  assert.deepEqual([0, -5, 1, 600_000, 600_001, 1_800_000].map(finishGems), [0, 0, 1, 1, 2, 3]);
  const { g, wait } = game();
  g.save.training.hp = g.save.trainerRanks.hp = 5; // its next rank takes 30 minutes
  assert.ok(g.training.trainWithGold("hp"));
  wait(60);
  assert.equal(g.training.finish("hp"), false, "29 minutes left take 3 Gems");
  g.save.gems = 3;
  assert.ok(g.training.finish("hp"));
  assert.equal(g.save.gems, 0);
  assert.equal(g.save.training.hp, 6);
  assert.deepEqual(g.save.trainingJobs, []);
  assert.equal(g.training.finish("hp"), false, "nothing in training");
});

test("stopping a rank gives its Gold back and its time spent as credit, which the next rank uses up", () => {
  const { g, wait } = game();
  g.save.training.hp = g.save.trainerRanks.hp = 5; // 30 minutes
  assert.ok(g.training.trainWithGold("hp"));
  const loaded = decode(JSON.stringify(g.save));
  assert.deepEqual(loaded.trainingJobs, g.save.trainingJobs, "jobs survive a save");
  wait(600);
  assert.ok(g.training.cancel("hp"));
  assert.equal(g.save.gold, 10_000);
  assert.equal(g.save.trainingCredit.hp, 600_000, "ten minutes of credit");
  assert.equal(g.training.toNextRank("hp"), 20 * 60_000, "the next rank shows what is left of it");
  assert.equal(g.training.cancel("hp"), false);
  // The next rank starts ten minutes in.
  assert.ok(g.training.trainWithGold("hp"));
  assert.equal(g.save.trainingCredit.hp, 0);
  assert.equal(g.training.left("hp"), 20 * 60_000);
  // Credit enough for a whole rank counts it at once.
  wait(1200);
  g.training.settle();
  g.save.trainingCredit.attack = 10 * HOUR;
  g.save.trainingCredit.defense = 10 * HOUR;
  g.save.training.attack = g.save.trainerRanks.attack = 4; // 15 minutes
  assert.equal(g.training.toNextRank("attack"), 0);
  assert.ok(g.training.trainWithGold("attack"));
  assert.equal(g.save.training.attack, 5);
  assert.equal(g.save.trainingCredit.attack, 10 * HOUR - 15 * 60_000);
  assert.equal(g.save.trainingCredit.defense, 10 * HOUR, "another stat's credit is its own");
  // Credit counts only for its own stat.
  g.save.training.hp = g.save.trainerRanks.hp = 4;
  assert.ok(g.training.trainWithGold("hp"));
  assert.equal(g.training.left("hp"), 15 * 60_000, "DEF's credit leaves Max HP's rank whole");
  const bad = decode(JSON.stringify({ ...g.save, trainingJobs: [{ id: "nope", startedAt: 1, completesAt: 2 }, { id: "hp", startedAt: "x" }] }));
  assert.deepEqual(bad.trainingJobs, []);
});

test("a Gem reset returns the points, the Gold, and all the stat's training time to the time bank", () => {
  const { g, wait } = game();
  g.save.gems = 2;
  assert.ok(g.training.train("hp"));
  assert.ok(g.training.trainWithGold("hp")); // a trainer's first rank: 15 s
  wait(15);
  g.training.settle();
  assert.ok(g.training.trainWithGold("hp")); // its second: a minute
  wait(40);
  const points = trainingPoints(g.save).left;
  assert.ok(g.training.reset("hp"));
  assert.equal(g.save.training.hp, 0);
  assert.deepEqual(g.save.trainingJobs, [], "the rank in training stops");
  assert.equal(trainingPoints(g.save).left, points + 1);
  assert.equal(g.save.gold, 10_000);
  assert.equal(g.save.trainingBank, 15_000 + 40_000, "the 15 s trained, and the 40 s of the stopped rank");
  assert.equal(g.save.trainingCredit.hp, 0, "none left as the stat's own credit");
  assert.equal(decode(JSON.stringify(g.save)).trainingBank, g.save.trainingBank, "saved");
  assert.deepEqual(decode(JSON.stringify(g.save)).trainingCredit, g.save.trainingCredit);
  assert.equal(decode(JSON.stringify({ ...g.save, trainingCredit: 5 })).trainingCredit.hp, 0, "an old single credit is dropped");
});

test("the boost doubles training for up to four hours, banked an hour a claim, refused within ten minutes of that", () => {
  const now = 10 * HOUR;
  assert.equal(claimBoost(0, now), now + HOUR);
  assert.equal(claimBoost(now + 3.5 * HOUR, now), now + BOOST_MAX_MS);
  assert.equal(claimBoost(now + BOOST_MAX_MS, now), null, "full");
  assert.equal(claimBoost(now + BOOST_MAX_MS - 10 * 60_000, now), null, "within ten minutes of full");
  assert.equal(claimBoost(now + BOOST_MAX_MS - 11 * 60_000, now), now + BOOST_MAX_MS, "eleven minutes short: capped at four hours");
  assert.equal(doneAt(HOUR, now + HOUR, now), now + HOUR / 2);
  assert.equal(doneAt(3 * HOUR, now + HOUR, now), now + 2 * HOUR);
  assert.equal(workLeft(now + 2 * HOUR, now + HOUR, now), 3 * HOUR);
  const { g, wait } = game();
  g.save.training.hp = g.save.trainerRanks.hp = 7; // an hour
  assert.ok(g.training.trainWithGold("hp"));
  wait(600);
  assert.ok(g.training.claimBoost());
  assert.equal(g.training.left("hp"), 50 * 60_000);
  wait(60);
  assert.equal(g.training.left("hp"), 48 * 60_000, "the timer counts down twice as fast");
  for (let i = 0; i < 3; i++) assert.ok(g.training.claimBoost(), "up to 3 h 59 min");
  assert.equal(g.training.claimBoost(), false, "not within ten minutes of four hours");
  wait(24 * 60);
  assert.equal(g.training.settle(), 1, "done in 25 minutes");
  assert.equal(decode(JSON.stringify(g.save)).trainingBoostUntil, g.save.trainingBoostUntil);
});

test("Faster Trainers research: +2% training speed a level, for 100 levels, 250n + 2n³ Gold and 1.75n + n²/20 hours", () => {
  const levels = RESEARCH.fasterTrainers.levels;
  assert.equal(levels.length, 100);
  assert.deepEqual([levels[0].gold, levels[0].hours, levels[99].gold, levels[99].hours], [252, 1.8, 2_025_000, 675]);
  const hours = levels.reduce((sum, l) => sum + l.hours, 0);
  assert.ok(hours > 1070 * 24 && hours < 1076 * 24, `${hours} hours`);
  assert.ok(hours > 6 * RESEARCH.potionHp.levels.reduce((sum, l) => sum + l.hours, 0));
  assert.equal(trainingMs(4, 0.5), 600_000);
  const { g } = game();
  g.save.archives.levels.fasterTrainers = 50;
  g.save.training.hp = g.save.trainerRanks.hp = 4; // 15 minutes, at double speed
  assert.ok(g.training.trainWithGold("hp"));
  assert.equal(g.training.left("hp"), 450_000);
});

test("auto-continue starts the next rank the moment one is done, while the Gold lasts", () => {
  const { g, wait } = game();
  g.training.setAutoContinue("attack", true);
  assert.ok(g.training.autoContinues("attack"));
  const atk = TRAINING.find((t) => t.id === "attack")!;
  g.save.gold = trainingGold(atk, 0) + trainingGold(atk, 1) + trainingGold(atk, 2) - 1;
  assert.ok(g.training.trainWithGold("attack"));
  wait(15);
  assert.equal(g.training.settle(), 1);
  assert.equal(g.save.training.attack, 1);
  const [job] = g.save.trainingJobs;
  assert.equal(job.id, "attack", "the next rank started");
  assert.equal(job.startedAt, g.clock());
  assert.equal(g.save.gold, trainingGold(atk, 2) - 1, "and was paid for");
  // Ranks the clock passed while the game was closed count in turn, each
  // starting when the last was done; the third can't be paid for.
  wait(3600);
  assert.equal(g.training.settle(), 1);
  assert.equal(g.save.training.attack, 2);
  assert.deepEqual(g.save.trainingJobs, [], "no Gold for the next");
  // Unticked, a finished rank starts nothing.
  g.save.gold = 10_000;
  g.training.setAutoContinue("attack", false);
  assert.ok(g.training.trainWithGold("attack"));
  wait(3600);
  g.training.settle();
  assert.deepEqual(g.save.trainingJobs, []);
});

test("auto-continue chains ranks done while away, and is saved", () => {
  const { g, wait } = game();
  g.training.setAutoContinue("hp", true);
  assert.ok(g.training.trainWithGold("hp"));
  wait(15 + 60 + 10);
  assert.equal(g.training.settle(), 2, "two ranks passed");
  assert.equal(g.save.training.hp, 2);
  assert.equal(g.save.trainingJobs[0].startedAt, g.clock() - 10 * 1000, "the third started when the second was done");
  assert.deepEqual(decode(JSON.stringify(g.save)).trainingAuto, ["hp"]);
  assert.deepEqual(decode(JSON.stringify({ ...g.save, trainingAuto: ["nope", "hp", 3] })).trainingAuto, ["hp"]);
});

test("the time bank serves any stat, after that stat's own time credit", () => {
  const { g, wait } = game();
  g.save.gems = 2;
  g.save.trainerRanks.attack = 4; // a 15-minute rank
  g.save.trainingCredit.attack = 5 * 60_000;
  g.save.trainingCredit.hp = 60 * 60_000;
  assert.ok(g.training.trainWithGold("attack"));
  wait(60);
  assert.ok(g.training.reset("attack"), "its credit and the minute spent go to the bank");
  assert.equal(g.save.trainingBank, 6 * 60_000);
  assert.equal(g.save.trainingCredit.attack, 0);
  // DEF has no credit of its own: the bank pays its first two ranks
  // (15 s and 1 min) and part of the third (5 min).
  g.save.training.defense = g.save.trainerRanks.defense = 2;
  g.save.trainingCredit.defense = 60_000;
  assert.equal(g.training.toNextRank("defense"), 0, "its credit, then the bank, cover the 5 minutes");
  assert.ok(g.training.trainWithGold("defense"));
  assert.equal(g.save.training.defense, 3, "counted at once");
  assert.equal(g.save.trainingCredit.defense, 0, "its own credit used first");
  assert.equal(g.save.trainingBank, 2 * 60_000, "then 4 minutes of the bank");
  // Max HP's own credit covers its rank, leaving the bank alone.
  assert.ok(g.training.trainWithGold("hp"));
  assert.equal(g.save.trainingBank, 2 * 60_000);
});
