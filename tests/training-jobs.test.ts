import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save/save.ts";
import { TRAINING, trainingCap, trainingCeiling, xpForLevel, trainingDef } from "../src/config.ts";
import { loadout, trainingOpen, trainingPoints, trainingRowsFull, trainingStep } from "../src/progression/loadout.ts";
import { BOOST_MAX_MS, claimBoost, doneAt, finishGems, rushEfficiencyText, trainingGold, trainingMs, trainingSeconds, workLeft } from "../src/progression/training-jobs.ts";
import { RESEARCH } from "../src/progression/archives.ts";
import { silverPrice } from "../src/progression/run-training.ts";

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

test("a stat's first ranks are quick, then each takes ten minutes more", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 99].map((r) => trainingSeconds(r)), [15, 60, 300, 600, 600, 1200, 1800, 57600]);
});

test("ATK / m and Multishot Chance trainers start at a minute and rise from there; Multishot Targets' n-th rank takes n hours", () => {
  const time = (id: (typeof TRAINING)[number]["id"], ranks: number[]) => ranks.map((r) => trainingSeconds(r, trainingDef(id).time));
  assert.deepEqual(time("attackPerTile", [0, 1, 2, 3, 4]), [60, 300, 600, 600, 1200]);
  assert.deepEqual(time("multishotChance", [0, 1, 2, 3, 4]), time("attackPerTile", [0, 1, 2, 3, 4]));
  assert.deepEqual(time("multishotTargets", [0, 1, 6]), [3600, 7200, 25_200]);
  assert.deepEqual(time("attack", [0, 1]), [15, 60], "other rows as ever");
  assert.equal(trainingMs(0, 0, trainingDef("multishotTargets").time), 3_600_000);
});

test("a trainer's Gold: 20 a point, times the rank's number, times 1 + ranks / the row's growth", () => {
  const at = (id: (typeof TRAINING)[number]["id"], ranks: number[], cost = 1) => ranks.map((r) => trainingGold({ ...trainingDef(id), cost }, r));
  assert.deepEqual(at("potion", [0, 1, 2, 3, 4, 9]), [20, 44, 72, 104, 140, 380], "20 Silver rows: growth 10");
  assert.deepEqual(at("floorGold", [0, 1, 2, 3, 9]), [20, 42, 66, 92, 291], "10 Silver rows: growth 20");
  assert.deepEqual(at("attack", [0, 1, 2, 3, 9]), [20, 41, 63, 86, 245], "5 Silver rows: growth 40");
  assert.deepEqual(at("hp", [0, 1, 2, 3, 9]), [20, 41, 62, 84, 230], "Max HP and Shroud, 3 Silver: growth 60");
  assert.deepEqual(at("shroud", [0, 1, 2, 3, 9]), at("hp", [0, 1, 2, 3, 9]));
  assert.deepEqual(at("attack", [0], 3), [60], "times the row's point cost");
  // The dearer a row's first Silver rank, the steeper its trainers, and rows
  // that start alike in Silver share a trainer curve.
  const silverBase = (id: TrainingId) => trainingDef(id).silver.base;
  // (The crit rows' growth is on a cubic curve of its own, and the Free
  // Upgrade rows start from their own price, so neither compares.)
  const linear = TRAINING.filter((t) => !("prices" in t.gold) && !t.gold.power && !t.gold.start);
  for (const a of linear) for (const b of linear) {
    const [ga, gb] = [a.gold.growth, b.gold.growth];
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
  assert.ok(g.training.reset("attack", "gold"));
  assert.equal(g.save.trainerRanks.attack, 0, "a reset starts the trainer's schedule over");
  assert.equal(g.save.training.attack, 6, "the ranks bought with points stay");
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
  // and the trainer trains on, untouched.
  wait(10);
  const job = { ...g.save.trainingJobs[0] };
  assert.ok(g.training.train("defense"));
  assert.equal(g.save.training.defense, 1);
  assert.deepEqual(g.save.trainingJobs, [job], "the trainer trains on");
  assert.equal(g.save.gold, gold - 20, "its Gold still paid");
  assert.equal(g.save.trainingCredit.defense, 0);
  g.save.xp = 0;
  assert.equal(g.training.train("hp"), false, "no points left");
});

/** A game with DEF 5 ranks short of its most and a trainer on all five
 * (x2 for the batch of 5: 15 s, 1 min, 5 min, 10 min and 10 min, 26 min 15 s
 * of base time in 13 min 7.5 s). */
const nearlyMaxed = () => {
  const t = game(), { g } = t, row = TRAINING.find((r) => r.id === "defense")!;
  g.save.training.defense = row.max - 5;
  assert.ok(g.training.trainWithGold("defense", 5));
  const gold = g.save.gold, paid = g.save.trainingJobs[0].gold;
  return { ...t, row, gold, paid, price: (k: number) => trainingGold(row, k) };
};

test("points past a batch in training take its last ranks: their Gold back, their time off, the training done kept", () => {
  const { g, wait, row, gold, paid, price } = nearlyMaxed(), started = g.clock();
  assert.equal(g.save.trainingJobs[0].ms, 1_575_000);
  wait(100);
  assert.equal(trainingStep(g.save, "defense").affordable, true, "points can still buy the ranks the trainer has");
  assert.ok(g.training.train("defense", 1));
  assert.ok(g.training.train("defense", 1));
  assert.equal(g.save.training.defense, row.max - 3);
  const [job] = g.save.trainingJobs;
  assert.equal(job.ranks, 3, "the trainer trains the three ranks left");
  assert.equal(job.ms, 375_000, "15 s, 1 min and 5 min of base time");
  assert.equal(job.gold, paid - price(3) - price(4));
  assert.equal(g.save.gold, gold + price(3) + price(4), "the two dropped ranks' Gold back");
  assert.equal(job.completesAt, started + 100_000 + 87_500, "6 min 15 s at x2 less the 100 s done");
  wait(87.5);
  g.training.settle();
  assert.equal(g.save.training.defense, row.max, "at its most");
  assert.equal(g.save.trainerRanks.defense, 3);
  assert.equal(g.training.train("defense"), false, "no room left for points");
});

test("points that leave a batch no room stop it; training done past its new time finishes it at once", () => {
  {
    const { g, wait, row, gold, paid } = nearlyMaxed();
    wait(60);
    assert.ok(g.training.train("defense", 5));
    assert.equal(g.save.training.defense, row.max);
    assert.deepEqual(g.save.trainingJobs, [], "the trainer stops");
    assert.equal(g.save.gold, gold + paid, "its Gold back");
    assert.equal(g.save.trainingCredit.defense, 60_000, "the time spent as DEF's credit");
  }
  {
    const { g, wait, row } = nearlyMaxed();
    wait(200);
    assert.ok(g.training.train("defense", 1));
    assert.ok(g.training.train("defense", 1));
    assert.deepEqual(g.save.trainingJobs, [], "200 s at x2 covers the 6 min 15 s left");
    assert.equal(g.save.training.defense, row.max);
    assert.equal(g.save.trainerRanks.defense, 3);
  }
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
  g.save.gems = 350;
  assert.ok(g.training.buyTrainer());
  assert.equal(g.save.gems, 250);
  assert.ok(g.training.trainWithGold("defense"));
  assert.equal(g.training.trainWithGold("attack"), false, "both slots busy");
  assert.ok(g.training.buyTrainer(), "the next costs 250");
  assert.equal(g.save.gems, 0);
  assert.equal(decode(JSON.stringify(g.save)).trainers, 2, "trainers are saved");
  assert.equal(decode(JSON.stringify({ ...g.save, trainers: 9 })).trainers, 0, "no more than there are");
  g.save.gems = 1e6;
  for (const price of [450, 700, 1000, 1400]) {
    const before = g.save.gems;
    assert.ok(g.training.buyTrainer());
    assert.equal(before - g.save.gems, price);
  }
  assert.equal(g.training.buyTrainer(), false, "every trainer bought");
});

test("Gems finish a rank at once: one per ten minutes left, rounded up", () => {
  assert.deepEqual([0, -5, 1, 600_000, 600_001, 1_800_000].map((ms) => finishGems(ms)), [0, 0, 1, 1, 2, 3]);
  const { g, wait } = game();
  g.save.training.hp = g.save.trainerRanks.hp = 6; // its next rank takes 30 minutes
  assert.ok(g.training.trainWithGold("hp"));
  wait(60);
  assert.equal(g.training.finish("hp"), false, "29 minutes left take 3 Gems");
  g.save.gems = 3;
  assert.ok(g.training.finish("hp"));
  assert.equal(g.save.gems, 0);
  assert.equal(g.save.training.hp, 7);
  assert.deepEqual(g.save.trainingJobs, []);
  assert.equal(g.training.finish("hp"), false, "nothing in training");
});

test("each item maxed takes 1.5% off a rush: its Gems divided by 1 + 1.5% each, rounded up", () => {
  assert.equal(finishGems(100 * 600_000, 10), 87, "100 Gems over 1.15");
  assert.equal(finishGems(115 * 600_000, 10), 100, "an exact quotient stays whole");
  assert.equal(finishGems(600_000, 200), 1, "a Gem's worth still costs one");
  assert.equal(finishGems(0, 10), 0);
  assert.deepEqual([1, 3, 10].map(rushEfficiencyText), ["+1.5% to Rush", "+4.5% to Rush", "+15% to Rush"]);
});

test("each Training row at its most makes finishing a rank cheaper, and a reset takes that back", () => {
  const { g, wait } = game();
  g.save.training.hp = g.save.trainerRanks.hp = 60;
  assert.ok(g.training.trainWithGold("hp"));
  wait(60);
  const base = finishGems(g.training.left("hp"));
  assert.ok(base > 20);
  assert.equal(g.training.finishGems("hp"), base, "no row at its most");
  const rows = TRAINING.filter((t) => t.id !== "hp" && trainingOpen(t, g.save));
  for (const t of rows) g.save.training[t.id] = trainingCap(t, g.save.upgrades);
  assert.ok(rows.length >= 2);
  assert.equal(trainingRowsFull(g.save), rows.length);
  assert.equal(g.training.finishGems("hp"), Math.ceil((base * 1000) / (1000 + 15 * rows.length)));
  g.save.training[rows[0].id]--;
  assert.equal(trainingRowsFull(g.save), rows.length - 1, "a rank taken back leaves its row short of its most");
  assert.equal(g.training.finishGems("hp"), Math.ceil((base * 1000) / (1000 + 15 * (rows.length - 1))));
  g.save.gems = g.training.finishGems("hp");
  assert.ok(g.training.finish("hp"));
  assert.equal(g.save.gems, 0);
});

test("stopping a rank gives its Gold back and its time spent as credit, which the next rank uses up", () => {
  const { g, wait } = game();
  g.save.training.hp = g.save.trainerRanks.hp = 6; // 30 minutes
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
  g.save.training.attack = g.save.trainerRanks.attack = 4; // 10 minutes
  assert.equal(g.training.toNextRank("attack"), 0);
  assert.ok(g.training.trainWithGold("attack"));
  assert.equal(g.save.training.attack, 5);
  assert.equal(g.save.trainingCredit.attack, 10 * HOUR - 10 * 60_000);
  assert.equal(g.save.trainingCredit.defense, 10 * HOUR, "another stat's credit is its own");
  // Credit counts only for its own stat.
  g.save.training.hp = g.save.trainerRanks.hp = 4;
  assert.ok(g.training.trainWithGold("hp"));
  assert.equal(g.training.left("hp"), 10 * 60_000, "DEF's credit leaves Max HP's rank whole");
  const bad = decode(JSON.stringify({ ...g.save, trainingJobs: [{ id: "nope", startedAt: 1, completesAt: 2 }, { id: "hp", startedAt: "x" }] }));
  assert.deepEqual(bad.trainingJobs, []);
});

test("a Gem reset returns either the points or the Gold and all the stat's training time to the time bank", () => {
  const { g, wait } = game();
  g.save.gems = 4;
  assert.ok(g.training.train("hp"));
  assert.ok(g.training.trainWithGold("hp")); // a trainer's first rank: 15 s
  wait(15);
  g.training.settle();
  assert.ok(g.training.trainWithGold("hp")); // its second: a minute
  wait(40);
  const points = trainingPoints(g.save).left;
  assert.deepEqual(g.training.resettable("hp"), { points: 1, gold: 1, inTraining: true });
  assert.ok(g.training.reset("hp", "gold"));
  assert.equal(g.save.training.hp, 1, "the rank bought with points stays");
  assert.deepEqual(g.save.trainingJobs, [], "the rank in training stops");
  assert.equal(trainingPoints(g.save).left, points, "no points back");
  assert.equal(g.save.gold, 10_000);
  assert.equal(g.save.trainingBank, 15_000 + 40_000, "the 15 s trained, and the 40 s of the stopped rank");
  assert.equal(g.save.trainingCredit.hp, 0, "none left as the stat's own credit");
  assert.equal(g.training.reset("hp", "gold"), false, "nothing more trained with Gold");
  assert.equal(decode(JSON.stringify(g.save)).trainingBank, g.save.trainingBank, "saved");
  assert.deepEqual(decode(JSON.stringify(g.save)).trainingCredit, g.save.trainingCredit);
  assert.equal(decode(JSON.stringify({ ...g.save, trainingCredit: 5 })).trainingCredit.hp, 0, "an old single credit is dropped");
  assert.ok(g.training.reset("hp", "points"));
  assert.equal(g.save.training.hp, 0);
  assert.equal(trainingPoints(g.save).left, points + 1, "the point back, to spend on any stat");
  assert.equal(g.save.gems, 0, "each reset two Gems");
  assert.equal(g.save.trainingBank, 15_000 + 40_000, "the time bank untouched");
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
  g.save.training.hp = g.save.trainerRanks.hp = 9; // an hour
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

test("Faster Trainers research: +2% training speed a level, for 100 levels, 250n + 2n³ Gold and Research Speed's time or 1.75n + n²/20 hours, whichever is shorter", () => {
  const levels = RESEARCH.fasterTrainers.levels;
  assert.equal(levels.length, 100);
  assert.deepEqual([levels[0].gold, levels[0].hours, levels[99].gold, levels[99].hours], [252, 1 / 60, 2_025_000, 675]);
  levels.forEach((l, i) => {
    const n = i + 1;
    assert.equal(l.hours, Math.min(RESEARCH.researchSpeed.levels[i]!.hours, 1.75 * n + (n * n) / 20), `level ${n}`);
    assert.ok(n > 27 || l.hours === RESEARCH.researchSpeed.levels[i]!.hours, `level ${n} on Research Speed's time`);
  });
  const hours = levels.reduce((sum, l) => sum + l.hours, 0);
  assert.ok(hours > 1055 * 24 && hours < 1062 * 24, `${hours} hours`);
  assert.ok(hours > 6 * RESEARCH.potionHp.levels.reduce((sum, l) => sum + l.hours, 0));
  assert.equal(trainingMs(4, 0.5), 400_000);
  const { g } = game();
  g.save.archives.levels.fasterTrainers = 50;
  g.save.training.hp = g.save.trainerRanks.hp = 4; // 10 minutes, at double speed
  assert.ok(g.training.trainWithGold("hp"));
  assert.equal(g.training.left("hp"), 300_000);
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
  assert.ok(g.training.reset("attack", "gold"), "its credit and the minute spent go to the bank");
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

test("a cubic scale adds (ranks / cubic)^3 to a trainer's Gold: never below the linear price, far above it at the cap", () => {
  for (const t of TRAINING) {
    const c = t.gold;
    // (ATK / m's trainers ask a rising ratio more each rank instead, and Multishot Targets' a price a rank.)
    if ("ratio" in c || "prices" in c || c.power) continue;
    assert.ok(c.cubic, `${t.id} has a cubic scale`);
    const linear = (r: number) => Math.ceil((c.start ?? 20) * t.cost * (r + 1) * (c.growth + r) / c.growth);
    const cap = trainingCeiling(t);
    for (const r of [0, 1, 10, Math.floor(cap / 2), cap - 1]) assert.ok(trainingGold(t, r) >= linear(r), `${t.id} rank ${r}`);
    // The Free Upgrade rows' 100 ranks end at less than twice their linear price.
    if (!c.start) assert.ok(trainingGold(t, cap - 1) > 3 * linear(cap - 1), `${t.id} much dearer at its cap`);
  }
});

test("the Free Upgrade rows: 75 Gold for the first rank, 1,582 for the 11th, 9,771 for the 32nd, 92,815 for the 87th, 136,855 for the 100th, the same in Silver", () => {
  for (const id of ["freeOffense", "freeDefense", "freeUtility"] as const) {
    const gold = (n: number) => trainingGold(trainingDef(id), n - 1);
    assert.deepEqual([1, 10, 11, 32, 87, 100].map(gold), [75, 1368, 1582, 9771, 92815, 136855]);
    for (let n = 1; n <= 100; n++) assert.equal(silverPrice(id, n - 1), gold(n), `${id} rank ${n} costs as much Silver as Gold`);
    assert.equal(TRAINING.find((t) => t.id === id)!.max, 100);
  }
});

test("Training Discount takes its share off every rank a trainer trains, and only the discounted Gold comes back", () => {
  const { g } = game(), row = TRAINING.find((r) => r.id === "attack")!;
  const full = g.training.batch("attack", 1).gold;
  g.save.archives.levels.trainingDiscount = 20; // 10% off
  assert.equal(trainingStep(g.save, "attack").gold, Math.ceil((trainingGold(row, 0) * 900) / 1000));
  const off = g.training.batch("attack", 1).gold;
  assert.equal(off, trainingGold(row, 0, 100));
  assert.ok(off < full);
  const gold = g.save.gold;
  assert.ok(g.training.trainWithGold("attack", 1));
  assert.equal(g.save.gold, gold - off);
  g.training.cancel("attack");
  assert.equal(g.save.gold, gold, "a stop gives back what was paid");
  assert.equal(trainingGold(row, 30, 495), Math.ceil((trainingGold(row, 30) * 505) / 1000), "49.5% off at level 99, rounded up");
});

test("a training timer's next second comes sooner as training goes faster", async () => {
  const { nextTrainingCountdownIn } = await import("../src/ui/research-page.ts");
  const now = 1_000_000, job = { id: "attack", startedAt: now, completesAt: now + 10_400, gold: 0, ms: 10_400, ranks: 1, speed: 1, used: 0 } as const;
  // 10.4s left shows 11s; it shows 10s 400ms of training on.
  assert.equal(nextTrainingCountdownIn(job, 0, now, 1), 400);
  // The Coin Packs' ×3: 10.4s × 3 = 31.2s of training left, 200ms to its next second, a third of that real time.
  assert.ok(Math.abs(nextTrainingCountdownIn(job, 0, now, 3) - 200 / 3) < 1e-9);
  // The boost doubles it while it lasts.
  assert.equal(nextTrainingCountdownIn(job, now + 60_000, now, 1), 800 / 2);
  // Done: a second.
  assert.equal(nextTrainingCountdownIn(job, 0, now + 20_000, 1), 1000);
});
