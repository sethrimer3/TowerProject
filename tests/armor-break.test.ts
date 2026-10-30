import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";
import { snap } from "../src/exact.ts";
import { attackForFewerHits, bout, breaksArmor, defenseAgainst, heroHpAfter, impervious, instakill, predict, replies, resume, summarize, type Strike } from "../src/combat.ts";
import { forecast } from "../src/crit-forecast.ts";
import { DamagePredictions } from "../src/render/effects/damage-labels.ts";
import { arrowDamage, wounded, woundMore } from "../src/enemies/ranged.ts";
import { volleyTurn, type VolleyTurn } from "../src/volley.ts";
import { TRAINING, isStatRow, trained } from "../src/progression/training.ts";
import { trainingGold, trainingSeconds } from "../src/progression/training-jobs.ts";
import { loadout, shownStat } from "../src/progression/loadout.ts";
import { silverPrice } from "../src/progression/run-training.ts";
import { UPGRADES } from "../src/progression/upgrades.ts";
import { TREES } from "../src/progression/skill-trees.ts";
import { rollFreeTraining } from "../src/progression/free-training.ts";
import { startingHero } from "../src/game/hero-sync.ts";
import { tileInfo } from "../src/ui/tile-info.ts";
import { xpForLevel } from "../src/progression/xp.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

const hero = (over: Partial<Player> = {}): Player => ({ x: 0, y: 0, hp: 1000, maxHp: 1000, attack: 100, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
const brute: Enemy = { name: "Brute", hp: 500, attack: 30, defense: 40, tier: 1, strength: "normal" };
const row = TRAINING.find((t) => t.id === "armorBreak")!;
const heroStrikes = (strikes: Strike[]) => strikes.filter((s) => s.by === "hero");

/** A Tower run inside on an open 5×5 floor, with the skill, On the Job and `enemy` at (1, 0). */
function arena(enemy?: Enemy, edit?: (g: Game) => void) {
  const g = new Game(defaults());
  g.save.upgrades.armorBreak = 1;
  g.save.upgrades.onTheJob = 1;
  g.save.xp = xpForLevel(10);
  edit?.(g);
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("4,4", { kind: "stairs" });
  if (enemy) w.cells.set("1,0", { kind: "enemy", enemy });
  g.run.player.x = 0;
  g.run.player.y = 0;
  return g;
}

test("the skill sits under Super Critical at 50 Inspiration and opens its Offense row", () => {
  const u = UPGRADES.find((u) => u.id === "armorBreak")!;
  assert.deepEqual([u.currency, u.base, u.max], ["inspiration", 50, 1]);
  const node = TREES[0].nodes.find((n) => n.id === "armorBreak")!;
  assert.deepEqual([node.x, node.y, node.requires], [10, 192, ["superCritical"]]);
  if (!isStatRow(row)) throw new Error("a stat row");
  assert.deepEqual([row.group, row.max, row.cost, row.requires, row.stat], ["offense", 300, 1, "armorBreak", "armorBreak"]);
  assert.deepEqual([trained(row, 0), trained(row, 1), trained(row, 10), trained(row, 300)], [0, 0.5, 5, 150]);
  assert.equal(shownStat("armorBreak", 0.5), 0.5);
  assert.equal(shownStat("armorBreak", 150), 150);
});

test("its trainers ask 600 million to 20 quadrillion Gold at the asked ranks, on the Super Critical rows' time", () => {
  const gold = (rank: number) => trainingGold(row, rank - 1);
  assert.equal(gold(1), 600_000_000);
  const near = (rank: number, want: number) => assert.ok(Math.abs(gold(rank) / want - 1) < 0.001, `rank ${rank}: ${gold(rank)}`);
  near(50, 3e9);
  near(100, 105e9);
  near(150, 2.74e12);
  near(200, 46e12);
  near(250, 1.6e15);
  near(300, 20e15);
  assert.equal("time" in row, false, "the shared schedule, as Super Critical's rows have");
  assert.equal(trainingSeconds(299), 600 * 296);
});

test("its Silver starts at 150 and rises faster than the Super Critical rows' through their ranks", () => {
  assert.equal(silverPrice("armorBreak", 0), 150);
  for (const other of ["superCritChance", "superCritFactor"] as const) {
    const ranks = TRAINING.find((t) => t.id === other)!.max;
    for (let k = 1; k < ranks; k++) {
      assert.ok(silverPrice("armorBreak", k) > silverPrice(other, k), `${other} rank ${k + 1}`);
      assert.ok(silverPrice("armorBreak", k) / silverPrice("armorBreak", k - 1) >= (silverPrice(other, k) / silverPrice(other, k - 1)), `${other} rise at rank ${k + 1}`);
    }
  }
  assert.ok(silverPrice("armorBreak", 299) / silverPrice("armorBreak", 298) > trainingGold(row, 299) / trainingGold(row, 298), "still faster than its Gold at the end");
});

test("the loadout and the hero carry it only once it has ranks", () => {
  const s = defaults();
  assert.equal(loadout(s).armorBreak, 0);
  assert.equal("armorBreak" in startingHero(s, "tower").player, false, "no ranks: the hero is as before");
  s.upgrades.armorBreak = 1;
  s.training.armorBreak = 4;
  assert.equal(loadout(s).armorBreak, 2);
  assert.equal(startingHero(s, "tower").player.armorBreak, 2);
});

test("each hit takes its share of the original DEF off before its damage, past 0 into extra damage", () => {
  const fight = bout(hero({ armorBreak: 50 }), brute);
  // DEF 40: 20 for the first hit, then 0, -20, -40 ...
  assert.deepEqual(heroStrikes(fight.strikes).map((s) => s.damage).slice(0, 4), [80, 100, 120, 140]);
  assert.deepEqual(heroStrikes(fight.strikes).map((s) => s.broken).slice(0, 4), [50, 100, 150, 200]);
  const below = bout(hero({ attack: 100 }), { ...brute, defense: 0 });
  assert.equal(heroStrikes(below.strikes)[0]!.damage, 100, "0 DEF is plain ATK, what -0 is to the hit above");
  assert.deepEqual(predict(hero({ armorBreak: 50 }), brute).hit, 80, "a prediction's hit is the first");
  assert.equal(defenseAgainst(hero(), { ...brute, broken: 150 }), -20);
});

test("a critical hit multiplies ATK and leaves the break as it is", () => {
  const crits = { factor: 2, applications: () => 1 };
  const fight = bout(hero({ armorBreak: 50 }), brute, undefined, crits);
  assert.deepEqual(heroStrikes(fight.strikes).map((s) => s.damage).slice(0, 2), [180, 200]);
});

test("Piercing takes its share of the original DEF, and the break comes off after, so negative DEF isn't pierced back", () => {
  const e = { ...brute, broken: 150 };
  assert.equal(defenseAgainst(hero({ pierce: 50 }), e), -40);
  assert.equal(defenseAgainst(hero({ pierce: 50 }), brute), 20);
});

test("with no ranks, or an enemy with no DEF, nothing changes", () => {
  const plain = predict(hero(), brute);
  assert.equal(breaksArmor(hero(), brute), false);
  assert.equal(breaksArmor(hero({ armorBreak: 50 }), { ...brute, defense: 0 }), false);
  assert.deepEqual(predict(hero({ armorBreak: 50 }), { ...brute, defense: 0 }), predict(hero(), { ...brute, defense: 0 }));
  assert.equal(heroStrikes(bout(hero(), brute).strikes).every((s) => s.broken === undefined), true);
  assert.deepEqual([plain.hit, plain.turns], [60, 9]);
});

test("a hit past the hero's ATK still breaks: no enemy is impervious, and it can be fought, for what that costs", () => {
  const wall = { ...brute, defense: 200, hp: 50 };
  assert.ok(impervious(hero(), wall));
  assert.deepEqual(bout(hero(), wall).strikes, []);
  const breaker = hero({ armorBreak: 25 });
  assert.equal(impervious(breaker, wall), false);
  const p = predict(breaker, wall), fight = bout(breaker, wall), hits = heroStrikes(fight.strikes);
  // DEF 200: 150, 100, 50: 0, 0, then 50.
  assert.deepEqual(hits.map((s) => s.damage), [0, 0, 50]);
  assert.deepEqual([p.impervious, p.hit, p.turns], [false, 0, 3]);
  assert.equal(p.damage, 30 + 31);
  assert.equal(heroHpAfter(fight, 1000), 1000 - p.damage);
});

test("predictions and fights played out end alike, with thorns, Lifesteal, a parry, a shroud, Fast and a bubble", () => {
  for (const armorBreak of [0.5, 5, 25, 150]) for (const attack of [20, 60, 300]) for (const defense of [1, 40, 400])
    for (const over of [{}, { thorns: 4 }, { lifesteal: 3 }, { lifesteal: 3, thorns: 4 }, { parry: 30 }, { shroud: 50 }, { pierce: 20 }] as Partial<Player>[])
      for (const foe of [{}, { fast: true as const }, { guard: 60 }, { broken: 30 }] as Partial<Enemy>[]) {
        const p = hero({ hp: 5000, maxHp: 5000, attack, defense: 10, armorBreak, ...over }), e = { ...brute, hp: 900, defense, ...foe }, say = JSON.stringify({ armorBreak, attack, defense, over, foe });
        const r = predict(p, e), fight = bout(p, e), hits = heroStrikes(fight.strikes), end = heroHpAfter(fight, p.hp);
        if (!end) {
          assert.equal(r.hpAfter === undefined ? r.survivable : r.hpAfter > 0, false, say);
          continue;
        }
        assert.equal(hits.length, r.turns, say);
        assert.equal(fight.strikes.filter((s) => s.by === "enemy").length, replies(r), say);
        assert.equal(end, r.hpAfter ?? snap(p.hp - r.damage), say);
        assert.equal(hits[0]!.damage, r.hit, say);
      }
});

test("a long fight's strikes are counted past the ones played one by one", () => {
  const p = hero({ attack: 100, armorBreak: 0.5, hp: 1e300, maxHp: 1e300, defense: 1e300 }), e: Enemy = { ...brute, hp: 3e9, attack: 1, defense: 50 };
  let hp = e.hp, turns = 0;
  while (hp > 0) hp -= Math.max(0, 100 - 50 * (1 - ++turns * 0.005));
  const r = predict(p, e);
  assert.ok(Math.abs(r.turns - turns) <= 1, `${r.turns} against ${turns}`);
});

test("a prediction that estimates past its played rounds stays within a few percent, Lifesteal too", () => {
  const e: Enemy = { ...brute, hp: 60_000, attack: 40, defense: 100 };
  for (const over of [{}, { lifesteal: 5 }]) {
    const p = hero({ attack: 300, defense: 30, armorBreak: 0.5, hp: 1e7, maxHp: 1e7, ...over });
    const exact = predict(p, e), rough = predict(p, e, 50);
    assert.equal(rough.turns, exact.turns);
    assert.ok(Math.abs(rough.damage - exact.damage) <= Math.max(1, exact.damage * 0.05), `${JSON.stringify(over)}: ${rough.damage} against ${exact.damage}`);
  }
});

test("Attack Lore finds the least ATK that takes a hit fewer, the hits rising", () => {
  const p = hero({ attack: 60, armorBreak: 25 }), e = { ...brute, hp: 5000 };
  const more = attackForFewerHits(p, e)!, turns = predict(p, e).turns;
  assert.ok(predict({ ...p, attack: p.attack + more }, e).turns < turns);
  assert.ok(more === 1 || predict({ ...p, attack: p.attack + more - 1 }, e).turns === turns);
  assert.equal(attackForFewerHits(hero({ attack: 1000, armorBreak: 25 }), { ...brute, hp: 100 }), null, "one hit does it");
});

test("the crit forecast counts the rising hits between its worst and its best", () => {
  const p = hero({ attack: 100, defense: 20, armorBreak: 25, hp: 1e6, maxHp: 1e6 }), e = { ...brute, hp: 4000 };
  const crit = { chance: 50, factor: 2 };
  const f = forecast(p, e, crit);
  assert.equal(f.worst.turns, predict(p, e).turns);
  assert.ok(f.best.turns < f.worst.turns);
  assert.ok(f.turns > f.best.turns && f.turns < f.worst.turns, String(f.turns));
  assert.ok(f.expected > f.best.damage && f.expected < f.worst.damage, String(f.expected));
  const plain = forecast(hero({ attack: 100, defense: 20, hp: 1e6, maxHp: 1e6 }), e, crit);
  assert.ok(f.expected < plain.expected, "less than without the row");
  // Monte Carlo over rolls: the forecast's mean length lands where fights do.
  let sum = 0;
  const tries = 2000;
  for (let n = 0, seed = 1; n < tries; n++) {
    const rolls = new Map<number, number>();
    const fight = bout(p, e, undefined, { factor: 2, applications: (k) => {
      if (!rolls.has(k)) rolls.set(k, ((seed = (seed * 16807) % 2147483647) % 1000) / 1000 < 0.5 ? 1 : 0);
      return rolls.get(k)!;
    } });
    sum += heroStrikes(fight.strikes).length;
  }
  assert.ok(Math.abs(sum / tries - f.turns) < 0.3, `${sum / tries} against ${f.turns}`);
  const superCrit = forecast(p, e, { ...crit, superCrit: { chance: 20, factor: 3 } }), long = forecast(hero({ attack: 100, defense: 20, armorBreak: 0.5, hp: 1e12, maxHp: 1e12 }), { ...brute, hp: 200_000 }, crit, 50);
  assert.ok(superCrit.turns < f.turns, "Super Critical shortens it");
  assert.ok(Number.isFinite(long.expected) && long.survive >= 0 && long.survive <= 1, "a long fight's approximation stays sane");
});

test("Damage Visual's labels see the rank and what is broken", () => {
  const labels = new DamagePredictions(), p = hero({ armorBreak: 25 });
  const plain = labels.cost(p, brute).turns, broken = labels.cost(p, { ...brute, broken: 400 }).turns, none = labels.cost(hero(), brute).turns;
  assert.ok(broken < plain && plain < none, `${broken}, ${plain}, ${none}`);
});

test("a fight's strikes keep what is broken when training bought mid-fight plays it on", () => {
  const p = hero({ armorBreak: 25 }), fight = bout(p, brute);
  const on = resume(fight, 2, { player: { ...p, armorBreak: 50 }, enemy: brute });
  // One hero strike kept, at 25%: the next takes 50% more, to 75%.
  assert.equal(heroStrikes(fight.strikes)[0]!.broken, 25);
  assert.equal(heroStrikes(on.strikes)[1]!.broken, 75);
  assert.equal(heroStrikes(on.strikes)[1]!.damage, 100 - 40 * 0.25);
  assert.equal(heroStrikes(summarize(fight, 0).strikes).at(-1)!.broken, heroStrikes(fight.strikes).at(-1)!.broken, "a summary round carries it");
});

test("an arrow breaks first, stays on the tile with its wound, and a later fight starts from it", () => {
  const p = hero({ armorBreak: 25 });
  assert.equal(arrowDamage(p, brute), 70);
  const once = woundMore({ kind: "enemy", enemy: brute }, 70, 25), twice = woundMore(once, 80, 25);
  assert.deepEqual([twice.wound, twice.broken], [150, 50]);
  const read = wounded(twice).enemy!;
  assert.deepEqual([read.hp, read.fullHp, read.broken, read.defense], [350, 500, 50, 40]);
  assert.equal(heroStrikes(bout(p, read).strikes)[0]!.broken, 75);
  assert.equal(heroStrikes(bout(p, read).strikes)[0]!.damage, 100 - 40 * 0.25);
  const unhurt = woundMore({ kind: "enemy", enemy: brute }, 0, 25);
  assert.equal("wound" in unhurt, false, "an arrow that only breaks leaves no wound");
  assert.deepEqual(wounded(unhurt).enemy, { ...brute, broken: 25 });
  assert.equal(wounded({ kind: "enemy", enemy: brute }).enemy, brute);
});

/** An open board holding `foes` by tile, as `Board.wound` keeps them. */
function board(foes: Record<string, Enemy>) {
  const tiles = new Map<string, Tile>(Object.entries(foes).map(([k, enemy]) => [k, { kind: "enemy", enemy }]));
  return {
    tiles,
    tile: (x: number, y: number): Tile => {
      const t = tiles.get(`${x},${y}`);
      return t ? wounded(t) : { kind: "floor" };
    },
    clear: (x: number, y: number) => void tiles.delete(`${x},${y}`),
    wound(x: number, y: number, damage: number, broke = 0) {
      tiles.set(`${x},${y}`, woundMore(tiles.get(`${x},${y}`)!, damage, broke));
    },
  };
}

test("the Archer aims at an enemy it can't yet hurt, wearing down its DEF", () => {
  const near: Enemy = { ...brute, name: "Near", defense: 5000 }, far: Enemy = { ...brute, name: "Far", defense: 0 };
  const shoot = (armorBreak?: number) => {
    const b = board({ "1,0": near, "2,0": far }), t = { board: b, wrap: 0, floorOf: () => 1, hero: hero(armorBreak ? { armorBreak } : {}), seed: 7, volleys: { turn: 1 }, archer: true, ranks: defaults() } as unknown as VolleyTurn;
    return { out: volleyTurn(t), b };
  };
  const plain = shoot();
  assert.deepEqual(plain.out.shots.map((s) => s.to), [{ x: 2, y: 0 }], "no ranks: only what an arrow can hurt");
  const breaking = shoot(25);
  assert.deepEqual(breaking.out.shots.map((s) => [s.to, s.damage]), [[{ x: 1, y: 0 }, 0]]);
  assert.deepEqual([breaking.b.tiles.get("1,0")!.broken, breaking.b.tiles.get("1,0")!.wound], [25, undefined]);
  // An arrow's earlier break doesn't make the kill it later lands an instakill.
  const felled = board({ "1,0": { ...brute, hp: 10 } });
  felled.wound(1, 0, 0, 25);
  const out = volleyTurn({ board: felled, wrap: 0, floorOf: () => 1, hero: hero({ armorBreak: 25 }), seed: 7, volleys: { turn: 1 }, archer: true, ranks: defaults() } as unknown as VolleyTurn);
  assert.equal(out.kills[0]!.instakill, false);
});

test("what an arrow broke lasts the run on either board, and undo takes it back with the run", () => {
  const g = arena(brute), w = g.world as RoomWorld;
  w.wound(1, 0, 0, 25);
  assert.equal(g.world.tile(1, 0).enemy!.broken, 25);
  assert.equal(g.run.changes["1,0"]!.broken, 25);
  assert.equal("wound" in g.run.changes["1,0"]!, false);
});

test("a save keeps a tile's break, with or without a wound, and rejects a bad one", () => {
  const round = (change: unknown, player?: object) => {
    const g = arena();
    g.run.changes["1,0"] = change as Tile;
    if (player) Object.assign(g.run.player, player);
    return decode(JSON.stringify(g.save));
  };
  const change = (s: ReturnType<typeof round>) => s.tower.run?.changes["1,0"];
  assert.deepEqual(change(round({ kind: "enemy", enemy: brute, broken: 25 })), { kind: "enemy", enemy: brute, broken: 25 });
  assert.deepEqual(change(round({ kind: "enemy", enemy: brute, wound: 5, broken: 25 })), { kind: "enemy", enemy: brute, wound: 5, broken: 25 });
  assert.deepEqual(change(round({ kind: "floor", flyer: { ...brute, flying: true }, broken: 25 })), { kind: "floor", flyer: { ...brute, flying: true }, broken: 25 });
  assert.equal(round({ kind: "enemy", enemy: brute, broken: -1 }).tower.run, defaults().tower.run && round({ kind: "enemy", enemy: brute, broken: -1 }).tower.run);
  assert.notDeepEqual(change(round({ kind: "enemy", enemy: brute, broken: -1 })), { kind: "enemy", enemy: brute, broken: -1 });
  assert.equal(round({ kind: "floor" }, { armorBreak: 25 }).tower.run?.player.armorBreak, 25);
});

test("the inspect panel shows what is broken after DEF, and what DEF below 0 does to the next hit, the one it shows", () => {
  const g = arena(brute), w = g.world as RoomWorld;
  g.run.player.attack = 100;
  g.run.player.armorBreak = 25;
  const body = () => tileInfo(g, 1, 0).body;
  assert.doesNotMatch(body(), /hit-heal">-/, "nothing broken: no (-X)");
  assert.doesNotMatch(body(), /Armor broken/);
  w.wound(1, 0, 0, 25);
  assert.match(body(), /hit-heal">-10<\/span>\)/, "25% of 40 DEF");
  assert.doesNotMatch(body(), /Armor broken/, "DEF still above 0 on the next hit");
  w.wound(1, 0, 0, 75);
  assert.match(body(), /Armor broken: DEF 0, -10 on your next hit, for 10 extra damage/, "below 0 first on the next hit");
  w.wound(1, 0, 0, 25);
  assert.match(body(), /hit-heal">-50<\/span>\) \(<span class="hit-hurt">-120<\/span>\)/, "the hit shown is ATK and those 20 extra");
  assert.match(body(), /Armor broken: DEF -10, -20 on your next hit, for 20 extra damage/);
  delete g.run.player.armorBreak;
  assert.match(body(), /hit-hurt">-110<\/span>\).*Armor broken: DEF -10, your next hit deals 10 extra damage/, "no ranks: nothing more breaks");
  g.run.player.armorBreak = 25;
  assert.match(tileInfo({ ...g, world: g.world, run: g.run, mode: g.mode, stepRules: g.stepRules, save: g.save, enemyGold: () => 0, fights: { brokenAt: () => 200 } } as never, 1, 0).body, /hit-heal">-80<\/span>\) \(<span class="hit-hurt">-150<\/span>\).*Armor broken: DEF -40, -50 on your next hit, for 50 extra damage/, "a fight being played out counts its strikes");
});

test("a flyer's panel shows it too", () => {
  const g = arena(), w = g.world as RoomWorld, bat: Enemy = { ...brute, flying: true };
  g.run.player.armorBreak = 25;
  w.cells.set("1,0", { kind: "floor", flyer: bat });
  w.wound(1, 0, 0, 125);
  assert.match(tileInfo(g, 1, 0).body, /hit-heal">-50<\/span>\).*Armor broken: DEF -10, -20 on your next hit, for 20 extra damage/);
});

test("Silver buys ranks that count in the run at once, up to the cap, and Free Offense Up can give one", () => {
  const g = arena(brute);
  g.run.silver = 1000;
  g.run.player.attack = 100;
  assert.ok(g.trainInRun("armorBreak"));
  assert.deepEqual([g.run.silver, g.run.player.armorBreak], [850, 0.5]);
  assert.ok(predict(g.run.player, brute).hit > predict({ ...g.run.player, armorBreak: 0 }, brute).hit);
  g.save.training.armorBreak = 299;
  g.run.silver = 1e30;
  assert.equal(g.trainInRun("armorBreak"), false, "299 and the one bought reach its 300");
  const found = new Set<string>(), free = { seed: 1, freeRolls: {}, hand: [], training: {} };
  for (let n = 0; n < 2000; n++) for (const id of rollFreeTraining({ ...g.save, training: { ...g.save.training, armorBreak: 0, freeOffense: 100 }, upgrades: { ...g.save.upgrades, freeTraining: 1 } }, { ...free, seed: n })) found.add(id);
  assert.ok(found.has("armorBreak"));
  assert.ok(!instakill(predict(hero({ attack: 1, armorBreak: 25 }), brute)));
});
