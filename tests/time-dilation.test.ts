// Time Dilation (docs/agents/arcana.md): a cooldown's field round the hero, in which
// enemies strike, shoot, move and count down their boss effects slower.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCANA } from "../src/arcana/arcana.ts";
import { actsOf, clearDilation, fieldReach, fieldSlowdown, SLOWDOWN_CAP, slowedAct, slowedCharge, slowedTickGain, stepDilation, tallyAfter, validDilation, type DilationRun } from "../src/arcana/time-dilation.ts";
import { bout, heroHpAfter, predict, replies, resume } from "../src/combat.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";
import { aggroTurn } from "../src/enemies/flying.ts";
import { FOE_GAIN, foeShotCost, foeTickGain } from "../src/enemies/ranged.ts";
import { random } from "../src/random.ts";
import { decodeTrial, startTrial, trialStep, type TrialState } from "../src/proving-grounds/trial.ts";
import { decodeTrialArcana } from "../src/proving-grounds/trial-arcana.ts";
import { bossClock, bossDueIn, bossTurn, foeActs, slowedAt } from "../src/proving-grounds/trial-spells.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";
import { decode, defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import { volleyTurn } from "../src/volley.ts";

const rat: Enemy = { name: "Rat", hp: 100, attack: 10, defense: 0, tier: 1, strength: "weak" };
const hero: Player = { x: 0, y: 0, hp: 100_000, maxHp: 100_000, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };

/** The numbers of an enemy's first `n` chances it acts on. */
function actsOn(slow: number, n: number) {
  const out: number[] = [];
  let tally = 0;
  for (let i = 1; i <= n; i++) {
    const next = slowedAct(tally, slow);
    tally = next.tally;
    if (next.acts) out.push(i);
  }
  return out;
}
/** Who strikes in order, in a fight as played. */
const order = (player: Player, enemy: Enemy) => bout(player, enemy).strikes.map((s) => (s.by === "hero" ? "H" : "E")).join("");

test("its tables hold the spec's ends, sizes and prices", () => {
  const [duration, slowdown, cooldown] = ARCANA.timeDilation.attributes;
  assert.deepEqual([duration.name, duration.steps.length, duration.steps[0], duration.steps[1], duration.steps[2], duration.steps[20], duration.steps.at(-1)], ["Duration", 36, [5, 0], [6, 5], [7, 14], [25, 176], [40, 311]]);
  assert.deepEqual([slowdown.name, slowdown.steps.length, slowdown.steps[0], slowdown.steps[6], slowdown.steps.at(-1)], ["Slowdown", 12, [20, 0], [50, 150], [75, 900]]);
  assert.deepEqual([cooldown.name, cooldown.steps.length, cooldown.steps[0], cooldown.steps[1], cooldown.steps[2], cooldown.steps.at(-1)], ["Cooldown", 13, [180, 0], [170, 10], [160, 31], [60, 241]]);
  assert.equal(ARCANA.timeDilation.trigger.on, "cooldown");
});

test("Slowdown and reach: research adds, up to 90%", () => {
  assert.equal(fieldSlowdown(75, { slowdown: 0, range: 0 }), 75);
  assert.equal(fieldSlowdown(75, { slowdown: 10, range: 0 }), 85);
  assert.equal(fieldSlowdown(75, { slowdown: 40, range: 0 }), SLOWDOWN_CAP);
  assert.equal(fieldReach(300, { slowdown: 0, range: 0 }), 300);
  assert.equal(fieldReach(300, { slowdown: 0, range: 50 }), 450);
});

test("the spec's examples: which strikes land", () => {
  assert.deepEqual(actsOn(25, 9), [1, 2, 3, 5, 6, 7, 9], "the fourth round goes without a strike");
  assert.deepEqual(actsOn(50, 8), [2, 4, 6, 8], "every other round");
  assert.deepEqual(actsOn(75, 12), [4, 8, 12], "three skipped, then one");
  assert.deepEqual(actsOn(90, 30), [10, 20, 30], "ten times slower at the most");
  assert.deepEqual(actsOn(35, 3), [1, 2], "the third delayed");
});

test("the tally and the closed form agree, whatever the Slowdown", () => {
  for (const slow of [0.5, 5, 20, 25, 30, 35, 40, 45, 49, 50, 55, 60, 65, 70, 75, 80, 85, 90]) {
    for (const n of [0, 1, 2, 3, 7, 20, 100, 1000]) assert.equal(actsOn(slow, n).length, actsOf(n, slow), `${slow}% over ${n}`);
    assert.ok(Math.abs(actsOn(slow, 1000).length - 10 * (100 - slow)) <= 1, `${slow}%: it acts on 100 − Slowdown of its chances`);
  }
  assert.equal(actsOf(9, 0), 9);
  assert.equal(tallyAfter(4, 25), 0);
  assert.equal(tallyAfter(3, 35), 5, "what is over a whole chance rolls on");
});

test("the field: a cooldown sets it, the next takes its place, nothing stacks", () => {
  const s: DilationRun = { timer: 3 }, rule = { duration: 5, turns: 180 };
  assert.deepEqual([stepDilation(s, rule), stepDilation(s, rule), stepDilation(s, rule)], [false, false, true]);
  assert.deepEqual(s, { timer: 180, left: 5 });
  for (let i = 0; i < 4; i++) stepDilation(s, rule);
  assert.equal(s.left, 1);
  stepDilation(s, rule);
  assert.equal(s.left, undefined, "gone after its duration");

  const long: DilationRun = { timer: 1 }, always = { duration: 40, turns: 60 };
  stepDilation(long, always);
  for (let i = 0; i < 59; i++) {
    stepDilation(long, always);
    assert.ok(long.left! > 0 || i >= 39);
  }
  stepDilation(long, always);
  assert.deepEqual(long, { timer: 60, left: 40 }, "time left is wasted, never added");
  const lasting: DilationRun = { timer: 2, left: 30 };
  stepDilation(lasting, { duration: 40, turns: 2 });
  assert.equal(lasting.left, 29);
  stepDilation(lasting, { duration: 40, turns: 2 });
  assert.equal(lasting.left, 40, "a duration past the cooldown is constant");

  clearDilation(s);
  assert.deepEqual(s, {});
  assert.ok(validDilation({ timer: 1, left: 2 }) && validDilation({}));
  assert.ok(!validDilation({ left: 0 }) && !validDilation({ timer: 1.5 }) && !validDilation(4));
});

test("a fight: strikes skipped as the spec says, Fast ones too", () => {
  const long = { ...rat, hp: 90 };
  const plain = order(hero, long);
  assert.equal(plain, "HEHEHEHEHEHEHEHEH", "nine strikes to fell it");
  assert.equal(order({ ...hero, slowdown: 25 }, long), "HEHEHEHHEHEHEHH", "rounds 4 and 8 skipped");
  assert.equal(order({ ...hero, slowdown: 50 }, long), "HHEHHEHHEHHEH", "every other round");
  assert.equal(order({ ...hero, slowdown: 75 }, long), "HHHHEHHHHEH", "rounds 4 and 8 alone");

  const fast = { ...long, fast: true };
  assert.ok(order({ ...hero, slowdown: 35 }, fast).startsWith("EHEHHE"), "35%: first, next, then the third a round late");
  assert.ok(order({ ...hero, slowdown: 45 }, fast).startsWith("EHEHH"), "just under 50% it still strikes first");
  assert.ok(order({ ...hero, slowdown: 50 }, fast).startsWith("HEHHE"), "50%: delayed till after the hero's first");
  assert.ok(order({ ...hero, slowdown: 75 }, fast).startsWith("HHHEHHHHE"), "75%: the fourth chance, the opening counted");
});

test("predict and bout end alike under any Slowdown, with every system that plays a fight", () => {
  const heroes: Player[] = [
    hero,
    { ...hero, hp: 500, maxHp: 500 },
    { ...hero, thorns: 3 },
    { ...hero, lifesteal: 10, hp: 500 },
    { ...hero, lifesteal: 10, thorns: 2, hp: 400 },
    { ...hero, parry: 30 },
    { ...hero, shroud: 50 },
    { ...hero, shield: 40, shieldMax: 40, shieldThorns: 50, thorns: 4 },
    { ...hero, armorBreak: 2, attack: 12 },
  ];
  const enemies: Enemy[] = [rat, { ...rat, fast: true }, { ...rat, hp: 700, attack: 35, defense: 3 }, { ...rat, hp: 700, attack: 35, defense: 3, fast: true }, { ...rat, hp: 7, attack: 40 }, { ...rat, hp: 7, fast: true, attack: 40 }];
  for (const h of heroes) for (const e of enemies) for (const slowdown of [20, 25, 35, 45, 50, 60, 75, 90]) {
    const player = { ...h, slowdown }, r = predict(player, e), fight = bout(player, e), label = `${JSON.stringify(h)} v ${JSON.stringify(e)} at ${slowdown}%`;
    const felled = fight.strikes.at(-1)!.by === "enemy" && fight.strikes.at(-1)!.hp === 0;
    if (felled) {
      assert.ok(r.hpAfter === undefined ? !r.survivable : false, label);
      continue;
    }
    assert.equal(fight.strikes.filter((s) => s.by === "hero").length, r.turns, label);
    assert.equal(fight.strikes.filter((s) => s.by === "enemy").length, replies(r), label);
    assert.ok(Math.abs(heroHpAfter(fight, h.hp) - (r.hpAfter ?? h.hp - r.damage)) < 1e-6, label);
  }
});

test("its ATK rises with the strikes that land, so a slowed fight costs less", () => {
  const enemy = { ...rat, hp: 90 }, plain = predict(hero, enemy), slowed = predict({ ...hero, slowdown: 50 }, enemy);
  assert.equal(plain.damage, 10 + 11 + 12 + 13 + 14 + 15 + 16 + 17);
  assert.equal(slowed.damage, 10 + 11 + 12 + 13);
  assert.equal(slowed.turns, plain.turns);
  assert.equal(replies(slowed), 4);
  assert.equal(predict(hero, enemy).strikes, undefined, "no field, nothing new");
});

test("a fight retrained part way keeps the tally", () => {
  const enemy = { ...rat, hp: 120 }, player = { ...hero, slowdown: 25 }, fight = bout(player, enemy);
  for (let from = 1; from < fight.strikes.length; from++) {
    const kept = fight.strikes[from - 1]!, hp = kept.by === "enemy" ? kept.hp : fight.strikes.slice(0, from).filter((s) => s.by === "enemy").at(-1)?.hp ?? player.hp;
    const again = resume(fight, from, { player: { ...player, hp }, enemy });
    assert.deepEqual(again.strikes.map((s) => [s.by, s.damage, s.hp]), fight.strikes.map((s) => [s.by, s.damage, s.hp]), `from strike ${from}`);
  }
  const fast = { ...enemy, fast: true }, quick = { ...hero, slowdown: 60 }, opened = bout(quick, fast);
  for (let from = 1; from < opened.strikes.length; from++) {
    const hp = opened.strikes.slice(0, from).filter((s) => s.by === "enemy").at(-1)?.hp ?? quick.hp;
    assert.deepEqual(resume(opened, from, { player: { ...quick, hp }, enemy: fast }).strikes.map((s) => s.by), opened.strikes.map((s) => s.by), `Fast, from strike ${from}`);
  }
});

test("charges stay whole and add up to the slowed turn", () => {
  for (const slow of [20, 25, 35, 50, 75, 90]) for (const gain of [5, 10]) {
    let sum = 0;
    for (let tick = 1; tick <= 100; tick++) {
      const at = slowedTickGain(gain, slow, tick);
      assert.ok(Number.isInteger(at), `${slow}% tick ${tick}`);
      sum += at;
    }
    assert.equal(sum, slowedCharge(gain * 100, slow));
    assert.equal(sum, (gain * 100 * (100 - slow)) / 100);
  }
  assert.equal(slowedCharge(FOE_GAIN, 0), FOE_GAIN);
});

/** Lays plain floor holding `tiles` on `g`'s Tower floor; undo builds the floor again from its seed. */
function lay(g: Game, tiles: Record<string, Tile> = {}) {
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) w.cells.set(`${x},${y}`, tiles[`${x},${y}`] ?? { kind: "floor" });
}
/** A Tower floor of plain floor holding `tiles`, and `g`'s hero at the origin with Time Dilation. */
function arena(tiles: Record<string, Tile> = {}, levels: [number, number, number] = [0, 0, 0]) {
  const s = defaults();
  s.upgrades.inspirationUndos = 1;
  const g = new Game(s, random(5));
  g.newRun({ seed: 7 });
  lay(g, tiles);
  Object.assign(g.run.player, { x: 0, y: 0, attack: 100, defense: 0, hp: 100_000, maxHp: 100_000 });
  g.save.arcana.owned.timeDilation = levels;
  return g;
}
const turn = (g: Game) => assert.ok(g.move(g.run.player.x % 2 ? -1 : 1, 0));

test("a run: the first field comes when its cooldown runs out, and the card's bar counts", () => {
  const g = arena({}, [0, 2, 0]), held = g.arcana.held[0]!;
  assert.equal(g.dilation, undefined);
  assert.deepEqual(g.arcana.cooldown(held), { left: 180, turns: 180 });
  g.run.timeDilation = { timer: 2 };
  turn(g);
  assert.deepEqual(g.arcana.cooldown(held), { left: 1, turns: 180 });
  assert.equal(g.dilation, undefined);
  turn(g);
  assert.deepEqual(g.dilation, { slow: 30, reach: 300 });
  for (let i = 0; i < 4; i++) {
    turn(g);
    assert.ok(g.dilation, `turn ${i}`);
  }
  turn(g);
  assert.equal(g.dilation, undefined, "over after five");
  assert.equal(g.arcana.cooldown(held)!.left, 175);
});

test("a run: undo takes the field back; switching it off loses it; a reload keeps it", () => {
  const g = arena();
  g.run.timeDilation = { timer: 1 };
  turn(g);
  assert.ok(g.dilation);
  assert.equal(g.save.tower.run!.timeDilation!.left, 5);
  assert.deepEqual(decode(JSON.stringify(g.save)).tower.run!.timeDilation, { timer: 180, left: 5 });
  g.undo();
  assert.equal(g.dilation, undefined);
  assert.deepEqual(g.run.timeDilation, { timer: 1 });
  lay(g);
  turn(g);
  assert.ok(g.dilation);
  g.arcana.toggle("timeDilation");
  assert.equal(g.dilation, undefined);
  assert.deepEqual(g.run.timeDilation, {});
  g.arcana.toggle("timeDilation");
  assert.equal(g.dilation, undefined, "it starts over");
  assert.equal(g.arcana.cooldown(g.arcana.held[0]!)!.left, 180);
});

test("a run: the fight in the field skips strikes; undo and a refight agree; previews count the plain hero", () => {
  const tough = { ...rat, hp: 400, attack: 50 };
  const g = arena({ "1,0": { kind: "enemy", enemy: tough } }, [0, 6, 0]);
  const unslowed = predict(g.run.player, tough).damage;
  assert.equal(g.fighterAt({ x: 1, y: 0 }).slowdown, undefined, "no field yet");
  g.run.timeDilation = { timer: 100, left: 3 };
  assert.equal(g.fighterAt({ x: 1, y: 0 }).slowdown, 50);
  assert.equal(g.fighterAt({ x: 9, y: 9 }).slowdown, undefined, "out of range");
  assert.equal(g.run.player.slowdown, undefined, "only the fight's copy carries it");
  const expected = predict(g.fighterAt({ x: 1, y: 0 }), tough).damage;
  assert.ok(expected < unslowed);
  const hp = g.run.player.hp;
  g.run.hand = ["monster"];
  assert.ok(g.move(1, 0), g.message);
  assert.equal(g.run.player.hp, hp - expected);
  g.undo();
  assert.equal(g.run.player.hp, hp);
  lay(g, { "1,0": { kind: "enemy", enemy: tough } });
  assert.ok(g.move(1, 0), g.message);
  assert.equal(g.run.player.hp, hp - expected);
});

test("reach: Euclidean from the hero, its shot range, the base without an Archer", () => {
  const g = arena();
  g.run.timeDilation = { timer: 100, left: 3 };
  assert.equal(g.dilation!.reach, 300);
  assert.equal(g.fighterAt({ x: 3, y: 0 }).slowdown, 20, "3 tiles");
  assert.equal(g.fighterAt({ x: 2, y: 2 }).slowdown, 20, "2.83 tiles");
  assert.equal(g.fighterAt({ x: 3, y: 1 }).slowdown, undefined, "3.16 tiles");
  g.save.training.attackRange = 40;
  assert.equal(g.dilation!.reach, g.lifespringReach);
  assert.ok(g.dilation!.reach > 300);
});

test("the Delve: the same field, its reach round the wrap", () => {
  const s = defaults();
  s.arcana.owned.timeDilation = [0, 2, 0];
  const g = new Game(s, random(5));
  g.newRun({ seed: 7 });
  g.save.delve.run = null;
  g.switchMode("delve");
  g.newRun({ seed: 9 });
  assert.equal(g.mode, "delve");
  g.run.timeDilation = { timer: 100, left: 3 };
  assert.deepEqual(g.dilation, { slow: 30, reach: 300 });
  const width = g.world.width, y = g.run.player.y;
  Object.assign(g.run.player, { x: 0 });
  assert.equal(g.fighterAt({ x: width - 2, y }).slowdown, 30, "two tiles off, round the wrap");
  assert.equal(g.fighterAt({ x: 4, y }).slowdown, undefined);
});

/** A turn's volley on a stub board with a Ranged enemy at (x, 0) and the hero at the origin. */
function shots(x: number, dilation: { slow: number; reach: number } | undefined, turns: number, charge = 0) {
  const enemy: Enemy = { ...rat, ranged: true, attack: 1 };
  const board = { tile: (tx: number, ty: number): Tile => (tx === x && ty === 0 ? { kind: "enemy", enemy } : { kind: "floor" }), clear() {}, wound() {}, floorEnemies: () => [] };
  let volleys: { turn: number; foes?: Record<string, number> } = { turn: 0, foes: { [`${x},0`]: charge } }, fired = 0;
  const ranks = { upgrades: {}, training: {}, archives: {} } as never;
  for (let i = 0; i < turns; i++) {
    const out = volleyTurn({ board: board as never, wrap: 0, floorOf: () => 1, hero: { ...hero }, seed: 1, volleys: { ...volleys, turn: volleys.turn + 1 }, archer: false, ranks, ...(dilation ? { dilation } : {}) });
    volleys = out.volleys;
    fired += out.shots.length;
  }
  return { fired, volleys };
}

test("a Ranged enemy in the field shoots slower by its Slowdown", () => {
  // Within its own reach (2 tiles): a shot every 10 turns, less a floor's 500th.
  const cost = foeShotCost(1) / FOE_GAIN;
  assert.equal(cost, 10);
  assert.equal(shots(2, undefined, 100).fired, 10);
  assert.equal(shots(2, { slow: 50, reach: 300 }, 100).fired, 5);
  assert.equal(shots(2, { slow: 75, reach: 300 }, 100).fired, 2);
  assert.equal(shots(2, { slow: 75, reach: 100 }, 100).fired, 10, "out of the field it isn't slowed");
  // Out of its own reach but in the field: its cooldown still runs slower.
  assert.equal(shots(3, { slow: 50, reach: 300 }, 1, 100).volleys.foes!["3,0"], 350, "half of 500");
  assert.equal(shots(3, undefined, 1, 100).volleys.foes!["3,0"], 600);
  assert.ok(foeTickGain(rat) === 5);
});

test("an Aggroed enemy in the field moves slower: 1 / (1 − Slowdown) as many turns a move", () => {
  const flyer: Enemy = { ...rat, flying: true, aggro: true };
  const run = (slow: number) => {
    const changes: Record<string, Tile> = { "8,0": { kind: "floor", flyer } };
    const tile = (x: number, y: number): Tile => changes[`${x},${y}`] ?? { kind: "floor" };
    const board = { tile, step: (x: number, y: number, dx: number, dy: number) => (x + dx >= 0 && x + dx < 12 && y + dy >= 0 && y + dy < 3 ? { x: x + dx, y: y + dy } : undefined), floor: 0 };
    let moves = 0;
    for (let i = 0; i < 50; i++) moves += aggroTurn({ board: board as never, changes, hero: { x: 0, y: 0 }, floorOf: () => 1, lit: new Set(), ...(slow ? { slowAt: () => slow } : {}) }).steps.length;
    return moves;
  };
  assert.equal(run(0), 5, "every 10 turns");
  assert.equal(run(50), 2, "every 20");
  assert.equal(run(75), 1, "every 40");
});

/** A trial in its arena with a field of `slow` percent standing. */
function fielded(trial: Parameters<typeof startTrial>[5], slow: number, left = 1000): TrialState {
  const s = startTrial({ maxHp: 100_000, attack: 10, defense: 0 }, "manual", [], 7391, 1, trial);
  s.room = "arena";
  s.arcana = { run: { toggles: 0, off: [], timers: {} }, beamTurns: 0, dilation: { timer: 500, left }, spells: { overseer: false, timeDilation: { duration: 5, slow, turns: 500, reach: 4000 } } };
  return s;
}

test("a boss clock: 75% takes 0.25 a turn, and what is over rolls on", () => {
  const s = fielded("light-elemental", 75), fires: number[] = [];
  for (let i = 1; i <= 90; i++) {
    s.steps = i;
    if (bossTurn(s, s.elemental)(10)) fires.push(i);
  }
  assert.deepEqual(fires, [40, 80]);
  assert.equal(bossClock(s), 90 * 25);
  const rolled = fielded("light-elemental", 30), at: number[] = [];
  for (let i = 1; i <= 45; i++) {
    rolled.steps = i;
    if (bossTurn(rolled, rolled.elemental)(10)) at.push(i);
  }
  assert.deepEqual(at, [15, 29, 43], "0.7 a turn: 10.5, 20.3 and 30.1 at those turns");
  const plain = startTrial({ maxHp: 100, attack: 10, defense: 0 }), fires2: number[] = [];
  for (let i = 1; i <= 20; i++) {
    plain.steps = i;
    if (bossTurn(plain, plain.elemental)(4, 2)) fires2.push(i);
  }
  assert.deepEqual(fires2, [2, 6, 10, 14, 18], "no field: the turns it always fell on");
  assert.equal(bossDueIn(plain, 10), 10 - (20 % 10));
});

test("out of range, or with no field, nothing is held back", () => {
  const s = fielded("light-elemental", 50);
  s.arcana!.spells!.timeDilation!.reach = 100;
  s.player.x = 12;
  s.player.y = 2;
  s.elemental.x = 12;
  s.elemental.y = 12;
  assert.equal(slowedAt(s, s.elemental), 0);
  assert.equal(slowedAt(s, { x: 12, y: 3 }), 50);
  assert.ok(foeActs(s, s.elemental, "boss"));
  delete s.arcana!.dilation!.left;
  assert.equal(slowedAt(s, { x: 12, y: 3 }), 0);
});

/** The attempt's turns the hero strikes the Obelisk, standing beside it, until `n` have gone by. */
function pound(s: TrialState, n: number) {
  s.player.x = s.elemental.x;
  s.player.y = s.elemental.y - 1;
  const taken: number[] = [];
  for (let i = 0; i < n; i++) {
    const hp = s.player.hp;
    assert.ok(trialStep(s, 0, 1).changed);
    taken.push(hp - s.player.hp);
    s.bossHp = s.bossMaxHp;
  }
  return taken;
}

test("a boss's counter skips rounds as its tally reaches a whole, across turns", () => {
  // The turret and Obelisk's own effects aside: the Magic Tower counters and regenerates, no more.
  const s = fielded("magic-tower", 50);
  s.bossVariant!.minions = [];
  const taken = pound(s, 6);
  assert.deepEqual(taken.map((t) => t > 0), [false, true, false, true, false, true]);
  pound(s, 1);
  assert.equal(s.arcana!.tallies?.boss, 50);
  assert.equal(decodeTrial(JSON.parse(JSON.stringify(s)))!.arcana!.tallies?.boss, 50, "and a reload keeps it");
  const quarter = fielded("magic-tower", 25);
  quarter.bossVariant!.minions = [];
  assert.deepEqual(pound(quarter, 8).map((t) => t > 0), [true, true, true, false, true, true, true, false]);
  const none = startTrial({ maxHp: 100_000, attack: 10, defense: 0 }, "manual", [], 7391, 1, "magic-tower");
  none.room = "arena";
  assert.ok(pound(none, 4).every((t) => t > 0));
});

test("the Obelisk's shots come slower in the field, the turn limit doesn't", () => {
  const shotsOf = (s: TrialState, n: number) => {
    s.player.x = 10;
    s.player.y = 8;
    let count = 0;
    for (let i = 0; i < n; i++) {
      assert.ok(trialStep(s, i % 2 ? -1 : 1, 0).changed);
      s.bossVariant!.minions = [];
      if (s.bossVariant!.lastRound?.shots.length) count++;
    }
    return count;
  };
  const plain = shotsOf(fielded("obelisk", 0, 0), 24), slowed = shotsOf(fielded("obelisk", 75), 24);
  assert.equal(plain, 10, "8s and 3s of 24");
  assert.equal(slowed, 2, "a quarter as fast: 6 turns' worth");
  const s = fielded("obelisk", 75);
  shotsOf(s, 24);
  assert.equal(s.steps, 24);
});

test("the Light Elemental: its beam and slimes hold off, and a slowed beam survives a reload", () => {
  const s = fielded("light-elemental", 75);
  s.player.x = 11;
  s.player.y = 11;
  let firedAt = 0;
  for (let i = 1; i <= 40 && !firedAt; i++) {
    const out = trialStep(s, i % 2 ? -1 : 1, 0);
    assert.ok(out.changed, `turn ${i}`);
    if (out.fired) firedAt = i;
  }
  assert.equal(firedAt, 40, "10 turns' worth at 0.25 a turn");
  assert.equal(s.beam!.step, 40);
  const fielded2 = fielded("light-elemental", 30);
  fielded2.player.x = 11;
  fielded2.player.y = 11;
  let at = 0;
  for (let i = 1; i <= 20 && !at; i++) if (trialStep(fielded2, i % 2 ? -1 : 1, 0).fired) at = i;
  assert.equal(at, 15);
  assert.equal(fielded2.beam!.step, 15);
  assert.equal(fielded2.beam!.axis, 0);
  const back = decodeTrial(JSON.parse(JSON.stringify(fielded2)))!;
  assert.ok(back, "a beam off its usual turn decodes while the clock lags");
  assert.deepEqual(back.beam, fielded2.beam);
  assert.equal(back.arcana!.lag!.boss, fielded2.arcana!.lag!.boss);
  assert.equal(back.arcana!.dilation!.left, fielded2.arcana!.dilation!.left);
});

test("the Keymaster's retreat and mimics step on their schedule, slowed", () => {
  const moves = (slow: number) => {
    const s = fielded("keymaster", slow);
    s.player.x = 12;
    s.player.y = 2;
    s.keymaster!.mimics = [{ id: 1, x: 12, y: 20, hp: 1000, maxHp: 1000 }];
    s.keymaster!.spawned = 1;
    let moved = 0;
    for (let i = 0; i < 16; i++) {
      const y = s.keymaster!.mimics[0]?.y ?? 0, x = s.keymaster!.mimics[0]?.x ?? 0;
      assert.ok(trialStep(s, 0, i % 2 ? -1 : 1).changed);
      s.keymaster!.mimics = s.keymaster!.mimics.slice(0, 1);
      if (s.keymaster!.mimics[0] && (s.keymaster!.mimics[0].y !== y || s.keymaster!.mimics[0].x !== x)) moved++;
    }
    return moved;
  };
  assert.equal(moves(0), 8);
  assert.equal(moves(50), 4);
  assert.equal(moves(75), 2);
});

test("a trial's own field: the session's desk fills it in, its turns run on the attempt", () => {
  const save = defaults();
  save.arcana.owned.timeDilation = [0, 2, 0];
  const base = new Game(save, random(3));
  base.newRun({ seed: 11 });
  const state = startTrial({ maxHp: 1000, attack: 10, defense: 0 }, "manual", [], 7391, 1, "light-elemental");
  state.room = "arena";
  state.player.x = 12;
  state.player.y = 2;
  const session = new TrialSession(base, state);
  assert.deepEqual(state.arcana!.spells!.timeDilation, { duration: 5, slow: 30, turns: 180, reach: 300 });
  state.arcana!.dilation = { timer: 1 };
  session.sync();
  assert.equal(session.game.run.timeDilation, state.arcana!.dilation, "the card reads the attempt's");
  assert.ok(trialStep(state, 0, 1).changed);
  assert.deepEqual(state.arcana!.dilation, { timer: 180, left: 5 });
  assert.equal(base.run.timeDilation, undefined, "the run outside is left alone");
  session.game.arcana.toggle("timeDilation");
  session.sync();
  assert.equal(state.arcana!.spells!.timeDilation, undefined);
  assert.deepEqual(state.arcana!.dilation, {});
});

test("what an attempt saves of it is checked", () => {
  const a = decodeTrialArcana({ run: {}, beamTurns: 0, dilation: { timer: 5, left: 2 }, tallies: { boss: 25, "mimic:1": 200, x: -1, y: "z" }, lag: { boss: 150, turret: -2, other: 4 } })!;
  assert.deepEqual(a.dilation, { timer: 5, left: 2 });
  assert.deepEqual(a.tallies, { boss: 25 });
  assert.deepEqual(a.lag, { boss: 150 });
  const b = decodeTrialArcana({ run: {}, beamTurns: 0, dilation: { left: 0 }, tallies: 3, lag: {} })!;
  assert.deepEqual([b.dilation, b.tallies, b.lag], [undefined, undefined, undefined]);
});
