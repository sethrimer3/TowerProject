import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { point, type Enemy, type Player, type Tile } from "../src/entities.ts";
import { bout, heroHpAfter, predict, summarize, type Crits } from "../src/combat.ts";
import { forecast } from "../src/crit-forecast.ts";
import { critChance, critFactor, critRule, trainingStep } from "../src/loadout.ts";
import { trainingGold } from "../src/training-jobs.ts";
import { runTrainingValue, silverPrice } from "../src/run-training.ts";
import { RESEARCH } from "../src/archives.ts";
import { TRAINING, UPGRADES } from "../src/config.ts";
import { TREES } from "../src/skill-trees.ts";
import { DamagePredictions, damageLabel } from "../src/damage-labels.ts";

const hero = (over: Partial<Player> = {}): Player => ({ hp: 100, maxHp: 100, attack: 12, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
const brute: Enemy = { name: "Brute", hp: 60, attack: 30, defense: 0, tier: 0, strength: "normal" };

test("Critical is a 2 Inspiration skill under Trainers that opens Crit % and Crit x, training and research", () => {
  const row = UPGRADES.find((u) => u.id === "critical")!;
  assert.deepEqual([row.currency, row.base, row.max], ["inspiration", 2, 1]);
  assert.deepEqual(TREES[0].nodes.find((n) => n.id === "critical")!.requires, ["trainers"]);
  for (const id of ["critChance", "critFactor"] as const) {
    const t = TRAINING.find((r) => r.id === id)!;
    assert.deepEqual([t.group, "requires" in t && t.requires], ["offense", "critical"]);
  }
  assert.equal(TRAINING.find((r) => r.id === "critChance")!.max, 80);
  assert.equal(TRAINING.find((r) => r.id === "critFactor")!.max, 150);
  assert.deepEqual(RESEARCH.critChance.requires, [{ upgrade: "critical" }]);
  assert.equal(RESEARCH.critChance.levels.length, 100);
  assert.equal(RESEARCH.critFactor.levels.length, 100);
  assert.ok(RESEARCH.critChance.levels.every((l) => l.effect.target === "critChancePercent" && l.effect.value === 2));
  const gold = (id: "critChance" | "critFactor", level: number) => RESEARCH[id].levels[level - 1].gold;
  for (const id of ["critChance", "critFactor"] as const) {
    assert.equal(gold(id, 1), 30);
    assert.ok(gold(id, 12) > 10_000 && gold(id, 27) > 100_000 && gold(id, 60) > 1_000_000, id);
  }
});

test("Crit %: 1% a rank to 80%; Crit x: x1.2, and 0.1 more a rank to x16.2", () => {
  const s = defaults();
  assert.equal(critChance(s), 0, "nothing without the skill");
  assert.equal(critRule(s), undefined);
  s.upgrades.critical = 1;
  assert.equal(critRule(s), undefined, "no chance, no crits");
  assert.equal(critFactor(s), 1.2);
  s.training.critChance = 10;
  s.training.critFactor = 10;
  assert.deepEqual(critRule(s), { chance: 10, factor: 2.2 });
  s.training.critChance = 80;
  s.training.critFactor = 150;
  assert.deepEqual(critRule(s), { chance: 80, factor: 16.2 });
  s.training.critChance = 0;
  s.training.critFactor = 0;
  assert.deepEqual([trainingStep(s, "critChance").now, trainingStep(s, "critChance").next, trainingStep(s, "critChance").unit], [0, 1, "%"]);
  assert.deepEqual([trainingStep(s, "critFactor").now, trainingStep(s, "critFactor").next, trainingStep(s, "critFactor").unit], [1.2, 1.3, "×"]);
  // Research multiplies each trained value: +2% a level.
  s.training.critChance = 80;
  s.training.critFactor = 0;
  s.archives.levels.critChance = 100;
  s.archives.levels.critFactor = 50;
  assert.deepEqual(critRule(s), { chance: 240, factor: 2.4 });
});

test("a Silver rank counts at once in the run's card, and the rows' first prices are 10 and 12 in Silver and 30 in Gold", () => {
  const s = defaults();
  s.upgrades.critical = 1;
  s.training.critChance = 5;
  assert.deepEqual(runTrainingValue(s, { training: { critChance: 3 }, player: hero() } as never, "critChance"), { value: 8, unit: "%" });
  assert.deepEqual(runTrainingValue(s, { training: { critFactor: 2 }, player: hero() } as never, "critFactor"), { value: 1.4, unit: "×" });
  assert.deepEqual([silverPrice("critChance", 0), silverPrice("critFactor", 0)], [10, 12]);
  const rows = (id: "critChance" | "critFactor") => TRAINING.find((r) => r.id === id)!;
  for (const id of ["critChance", "critFactor"] as const) {
    // The n-th rank's trainer asks for the rank's Gold with n - 1 ranks done.
    const asks = (n: number) => trainingGold(rows(id), n - 1);
    assert.equal(asks(1), 30);
    assert.ok(asks(13) >= 1_000 && asks(35) >= 100_000 && asks(72) >= 1_000_000, `${id}: ${asks(13)}, ${asks(35)}, ${asks(72)}`);
    for (let n = 2; n <= 150; n++) assert.ok(asks(n) > asks(n - 1));
  }
});

test("a strike that crits multiplies ATK before DEF, and carries its applications", () => {
  const enemy: Enemy = { ...brute, defense: 4, attack: 1, hp: 100 };
  const plain = bout(hero(), enemy);
  assert.deepEqual(plain.strikes.filter((s) => s.by === "hero").map((s) => s.damage).slice(0, 2), [8, 8]);
  assert.ok(plain.strikes.every((s) => s.crit === undefined));
  // The first strike crits once (x2), the third twice (+200%: x3).
  const crits: Crits = { factor: 2, applications: (n) => (n === 0 ? 1 : n === 2 ? 2 : 0) };
  const fight = bout(hero(), enemy, undefined, crits);
  const mine = fight.strikes.filter((s) => s.by === "hero");
  assert.deepEqual(mine.slice(0, 4).map((s) => [s.damage, s.crit]), [[20, 1], [8, undefined], [32, 2], [8, undefined]]);
  assert.equal(mine[0].hp, 80);
  // Summary rounds keep the mark.
  const rounds = summarize(fight, 0).strikes.filter((s) => s.by === "hero");
  assert.equal(rounds[0].crit, 3, "the summed hero strike carries every application it held");
});

test("the forecast brackets the fight and agrees with every sequence of rolls worked out by hand", () => {
  // 100 HP at 10 a strike takes 10; a 30% crit of x2 takes 20.
  const h = hero({ attack: 10, hp: 1000, maxHp: 1000 }), e: Enemy = { name: "Post", hp: 100, attack: 5, defense: 0, tier: 0, strength: "normal" };
  const f = forecast(h, e, { chance: 30, factor: 2 });
  assert.equal(f.worst.turns, 10);
  assert.equal(f.best.turns, 5);
  // Brute force: the odds of each number of strikes.
  const odds = new Map<number, number>();
  const walk = (hp: number, t: number, p: number) => {
    for (const [hit, chance] of [[20, 0.3], [10, 0.7]] as const) {
      if (hp - hit <= 0) odds.set(t + 1, (odds.get(t + 1) ?? 0) + p * chance);
      else walk(hp - hit, t + 1, p * chance);
    }
  };
  walk(100, 0, 1);
  const damage = (t: number) => predict(hero({ attack: 100 / t, hp: 1000, maxHp: 1000 }), e).damage;
  let expected = 0, turns = 0;
  for (const [t, p] of odds) {
    expected += p * damage(t);
    turns += p * t;
  }
  assert.ok(Math.abs(f.expected - expected) < 1e-3, `${f.expected} vs ${expected}`);
  assert.ok(Math.abs(f.turns - turns) < 1e-9);
  assert.equal(f.survive, 1);
  assert.ok(f.best.damage <= f.p10 && f.p10 <= f.expected && f.expected <= f.p90 && f.p90 <= f.worst.damage);
});

test("the odds to survive sit between lethal when no crit lands and survivable when all do", () => {
  const f = forecast(hero(), brute, { chance: 50, factor: 3.2 });
  assert.equal(f.worst.survivable, false);
  assert.equal(f.best.survivable, true);
  assert.ok(f.survive > 0.3 && f.survive < 1, String(f.survive));
  assert.ok(f.instakill === 0);
  // 100% and over: those applications are certain, so they are the worst case.
  const sure = forecast(hero(), brute, { chance: 100, factor: 3.2 });
  assert.deepEqual([sure.survive, sure.worst.survivable, sure.expected], [1, true, sure.worst.damage]);
  const over = forecast(hero({ attack: 7 }), { ...brute, hp: 120 }, { chance: 150, factor: 2 });
  assert.equal(over.worst.hit, 14, "one certain application");
  assert.equal(over.best.hit, 21, "and a second that rolls at 50%: ATK x (1 + 2 x (2 - 1))");
});

test("a long fight's odds are worked out too", () => {
  const long = forecast(hero({ attack: 10, hp: 1e9, maxHp: 1e9 }), { ...brute, hp: 5000, attack: 1 }, { chance: 40, factor: 2 });
  assert.ok(Math.abs(long.turns - 5000 / 14) < 15, String(long.turns));
  assert.ok(long.p10 <= long.p90);
});

test("labels show the damage to expect, coloured as usual", () => {
  const preds = new DamagePredictions(), rule = { chance: 50, factor: 3.2 };
  const plain = preds.cost(hero(), brute), crit = preds.cost(hero(), brute, rule);
  assert.ok(crit.damage < plain.damage);
  assert.equal(preds.computed, 2, "each hero is cached on its own");
  assert.equal(damageLabel(crit, 100).text, String(Math.round(crit.damage)));
});

/** A Delve run with the hero two tiles below a Brute in a walled corridor. */
function arena(seed: number, chance: number, factorRanks = 20) {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1;
  g.save.upgrades.delve = 1;
  g.save.upgrades.critical = 1;
  g.save.training.critChance = chance;
  g.save.training.critFactor = factorRanks;
  g.save.settings.devMode = true;
  g.switchMode("delve");
  g.newRun({ seed });
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 30; x++) g.run.changes[point(x, y)] = { kind: x === 15 && y < 10 ? "floor" : "wall" };
  Object.assign(g.run.player, { x: 15, y: 0, ...hero() });
  guard(g);
  g.move(0, 1);
  return g;
}
function guard(g: Game) {
  const tile = g.world.tile.bind(g.world);
  const foe: Tile = { kind: "enemy", enemy: brute };
  g.world.tile = (x, y) => (x === 15 && y === 2 && g.run.kills === 0 ? foe : tile(x, y));
}

test("in play, crits land by a fixed roll per run, tile and strike: the same fight again ends the same, and more Crit % only adds", () => {
  let won = 0, fell = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = arena(seed, 15);
    g.move(0, 1);
    const lived = !g.fallen;
    if (lived) won++;
    else fell++;
    assert.ok(g.undo());
    guard(g);
    g.move(0, 1);
    assert.equal(!g.fallen, lived, `seed ${seed}: the same ending`);
    // 100% and a x3.2 factor beat it in two strikes, whatever the seed; 0% never does.
    const sure = arena(seed, 100);
    sure.move(0, 1);
    assert.ok(!sure.fallen && sure.run.player.hp === 70, `seed ${seed}: two crits, one blow taken`);
    if (lived) {
      const more = arena(seed, 80);
      more.move(0, 1);
      assert.ok(!more.fallen, `seed ${seed}: 80% wins wherever 15% did`);
    }
    const none = arena(seed, 0);
    none.move(0, 1);
    assert.ok(none.fallen, `seed ${seed}: without Crit % it falls`);
  }
  assert.ok(won > 8 && fell > 8, `${won} won, ${fell} fell`);
});

test("a played fight shows its crits, and the step ends as the shown fight does", () => {
  const g = arena(3, 100);
  g.playsFights = true;
  g.move(0, 1);
  const fight = g.encounter!;
  assert.ok(fight);
  assert.deepEqual(fight.bout.strikes.filter((s) => s.by === "hero").map((s) => s.crit), [1, 1]);
  g.finishEncounter();
  assert.ok(!g.fallen && g.run.player.hp === 70);
  assert.equal(g.run.kills, 1);
  assert.equal(heroHpAfter(fight.bout, 100), 70);
});
