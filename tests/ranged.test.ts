import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { ENEMY_GOLD, RANGED_GOLD, TRAINING } from "../src/config.ts";
import { fastShare } from "../src/fast-enemies.ts";
import { ARCHER_TICKS, archerTurn, ARROW_COST, arrowBoost, arrowDamage, charged, enemiesWithin, FOE_GAIN, foeRange, foeShotCost, held, rangedShare, ready, shotDamage, spent, within, wounded } from "../src/ranged.ts";
import { enemyTitle } from "../src/scaling.ts";
import { tierCells, tierGold } from "../src/tiers.ts";
import { generateTowerRoom, RoomWorld } from "../src/tower/room-world.ts";
import { heroClass, isArcher } from "../src/goals.ts";
import { attackPerTile, attackRange, attackSpeed, multishotChance, multishotTargets, rapidFireChance, rapidFireDuration, trainingOpen, trainingStep, trainingText } from "../src/loadout.ts";
import { runTrainingValue, silverPrice } from "../src/run-training.ts";
import { trainingGold } from "../src/training-jobs.ts";
import { RESEARCH } from "../src/archives.ts";
import { snap } from "../src/exact.ts";
import { BoardPopups } from "../src/board-popups.ts";
import { drawVolley } from "../src/volley-art.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const hero = (over: Partial<Player> = {}): Player => ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 12, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
const brute: Enemy = { name: "Brute", hp: 60, attack: 30, defense: 0, tier: 0, strength: "normal" };

test("Ranged enemies start a point under Fast's share in the third tier and grow as it does; none before", () => {
  assert.deepEqual([1, 500, 9000].map((f) => rangedShare(2, f)), [0, 0, 0]);
  assert.deepEqual([1, 201, 9000].map((f) => rangedShare(3, f)), [7500, 8500, 19_500]);
  for (const f of [1, 77, 3000]) assert.equal(rangedShare(6, f), fastShare(6, f) - 1000);
});

test("Tower floors make about 7.5% of their non-boss enemies Ranged from the third tier, changing nothing else, Fast and Ranged rolled apart", () => {
  let enemies = 0, ranged = 0, both = 0;
  for (const seed of [3, 41, 977])
    for (let room = 0; room < 60; room++) {
      for (const t of new RoomWorld(seed, room, {}, 0, 2).cells.values()) assert.ok(!t.enemy?.ranged, "none in the second tier");
      const cells = new RoomWorld(seed, room, {}, 0, 3).cells, plain = tierCells(generateTowerRoom(seed, room, 3), 3);
      for (const [k, t] of cells) {
        if (!t.enemy?.ranged) continue;
        assert.ok(t.enemy.strength !== "boss" && t.enemy.strength !== "greaterBoss");
        const { ranged: _, fast, ...rest } = t.enemy, { fast: __, ...was } = plain.get(k)!.enemy!;
        assert.deepEqual({ ...rest, attack: was.attack }, was, `${seed}/${room} ${k}: only the flag (and Fast's carry) differ`);
        ranged++;
        if (fast) both++;
      }
      enemies += [...cells.values()].filter((t) => t.enemy && t.enemy.strength !== "boss").length;
    }
  const share = ranged / enemies;
  assert.ok(share > 0.055 && share < 0.095, `about 7.5% Ranged: ${share}`);
  assert.ok(both > 0, "some enemies are both Fast and Ranged");
});

test("cooldowns are whole charge units, so a fraction of a turn carries: 3 shots in 10 turns fire 4, 3 and 3 turns apart", () => {
  // Fires on each turn it is ready, every turn having a target.
  const fires = (gain: number, cost: number, turns: number) => {
    let charge: number | undefined, out: number[] = [];
    for (let turn = 0; turn < turns; turn++) {
      charge = charged(charge, gain);
      if (ready(charge, cost)) {
        out.push(turn);
        charge = spent(charge, cost);
      }
      charge = held(charge, cost);
    }
    return out;
  };
  // The Archer, a hundredth of a turn at a time: Attack Speed 3.00 shots every 10 turns, 60 twentieths.
  const looses = (speed: number, turns: number) => {
    let clock = {}, out: number[] = [];
    for (let turn = 0; turn < turns; turn++) clock = archerTurn(clock, speed, () => (out.push(turn), 0)).clock;
    return out;
  };
  assert.deepEqual(looses(60, 11), [0, 4, 7, 10]);
  assert.deepEqual(looses(20, 21), [0, 10, 20]);
  assert.deepEqual(fires(60 * ARCHER_TICKS, ARROW_COST, 11), [0, 4, 7, 10], "the same as charging a turn at a time");
  // A Ranged enemy's 9.5-turn cooldown (floor 251): twice in 19 turns, 10 then 9 apart.
  assert.equal(foeShotCost(251), 4750);
  assert.deepEqual(fires(FOE_GAIN, foeShotCost(251), 20), [0, 10, 19]);
  assert.deepEqual([1, 501, 4501, 9000].map(foeShotCost), [5000, 4500, 500, 500]);
  // Ready and waiting banks nothing more.
  assert.equal(held(charged(150, 100), 200), undefined);
});

test("reach is Euclidean: a knight's move is within a Ranged enemy's 2.5 tiles, a diagonal two away isn't; walls don't block", () => {
  assert.equal(foeRange(300), 250);
  assert.ok(within(1, 2, 250) && within(2, 1, 250) && within(0, 2, 250));
  assert.ok(!within(2, 2, 250) && !within(3, 0, 250));
  assert.ok(within(3, 0, 300) && within(2, 2, 300));
  const tiles = new Map<string, Tile>([["1,2", { kind: "enemy", enemy: brute }], ["0,1", { kind: "wall" }], ["3,3", { kind: "enemy", enemy: brute }]]);
  const board = { tile: (x: number, y: number) => tiles.get(`${x},${y}`) ?? { kind: "floor" as const } };
  assert.deepEqual(enemiesWithin(board, { x: 0, y: 0 }, 250).map((e) => [e.x, e.y]), [[1, 2]]);
  // Round a 10-wide wrapping board, the short way.
  assert.deepEqual(enemiesWithin(board, { x: 9, y: 2 }, 250, 10).map((e) => [e.x, e.y]), [[1, 2]]);
});

test("a shot takes DEF then the shroud, cut by Parry %; an arrow is one strike less DEF, crits counted", () => {
  const archer = { ...brute, ranged: true as const };
  assert.deepEqual(shotDamage(hero({ defense: 10, shroud: 5 }), archer), { damage: 15, shrouded: 5 });
  assert.deepEqual(shotDamage(hero({ defense: 10, shroud: 50 }), archer), { damage: 0, shrouded: 20 });
  assert.deepEqual(shotDamage(hero({ parry: 50 }), archer), { damage: 15, shrouded: 0 });
  assert.equal(arrowDamage(hero({ attack: 40 }), { ...brute, defense: 15 }), 25);
  assert.equal(arrowDamage(hero({ attack: 40 }), { ...brute, defense: 15 }, 1, 1.5), 45);
  assert.equal(wounded({ kind: "enemy", enemy: brute, wound: 25 }).enemy!.hp, 35);
});

test("Ranged enemies say so before their strength and name, after Fast", () => {
  assert.equal(enemyTitle({ name: "Goblin", strength: "elite", ranged: true }), "Ranged Elite Goblin");
  assert.equal(enemyTitle({ name: "Goblin", strength: "normal", fast: true, ranged: true }), "Fast Ranged Goblin");
});

/** A Tower III run inside on an open 9×9 floor, the hero at (0, 0), with
 * `foes` placed by tile. */
function arena(foes: Record<string, Enemy>, over: Partial<Player> = {}) {
  const save = defaults();
  // An undo, to take a turn back.
  save.upgrades.inspirationUndos = 1;
  const g = new Game(save);
  g.save.themes = [];
  g.run.tier = 3;
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  for (const [k, enemy] of Object.entries(foes)) w.cells.set(k, { kind: "enemy", enemy });
  Object.assign(g.run.player, { x: 0, y: 0, attack: 1000, defense: 0, hp: 100, maxHp: 100, ...over });
  return g;
}
const shooter: Enemy = { name: "Archer", hp: 50, attack: 7, defense: 0, tier: 3, strength: "normal", ranged: true };

test("a Ranged enemy shoots once the hero steps into its 2.5 tiles, every 10 turns after; undo takes the shot back", () => {
  const g = arena({ "4,0": shooter });
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, 100, "3 tiles away: out of reach");
  assert.ok(g.move(0, 1));
  assert.equal(g.run.player.hp, 100, "√10 away: still out of reach");
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, 93, "a knight's move away: shot");
  assert.deepEqual(g.volley?.shots.map((s) => [s.by, s.from, s.to, s.damage]), [["enemy", { x: 4, y: 0 }, { x: 2, y: 1 }, 7]]);
  // Pacing within reach, between (2, 1) and (2, 0): nine turns of cooldown, then the next shot.
  const hps: number[] = [];
  for (let turn = 1; turn <= 10; turn++) {
    assert.ok(g.move(0, turn % 2 ? -1 : 1));
    hps.push(g.run.player.hp);
  }
  assert.deepEqual(hps, [93, 93, 93, 93, 93, 93, 93, 93, 93, 86]);
  assert.equal(g.towerRun.damaged, true, "a shot that costs HP costs the area's mastery");
  const hp = g.run.player.hp;
  assert.ok(g.undo());
  assert.ok(g.run.player.hp >= hp);
  assert.equal(g.volley, null);
});

test("a shot that fells the hero leaves it fallen, and one undo takes the step back", () => {
  const g = arena({ "3,0": { ...shooter, attack: 500 } });
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, 0);
  assert.ok(g.fallen);
  assert.match(g.message, /Shot down by Ranged Archer/);
  assert.ok(g.undo());
  assert.deepEqual([g.run.player.x, g.run.player.hp], [0, 100]);
});

test("no shots below the third tier, and the Archer shoots only once its Goal is claimed", () => {
  const g = arena({ "2,0": shooter });
  g.run.tier = undefined;
  assert.ok(g.move(0, 1));
  assert.deepEqual([g.run.player.hp, g.run.volleys, g.volley], [100, undefined, null]);
});

/** Makes the save's hero an Archer. */
const archer = (g: Game) => {
  g.save.goals.claimed[3] = [10];
  assert.ok(isArcher(g.save));
  return g;
};

test("the Archer shoots the closest enemy within 3 tiles every 10 turns, wounding it before the fight; non-Ranged enemies don't answer", () => {
  const g = archer(arena({ "4,0": { ...brute, hp: 3000, attack: 1 }, "0,4": { ...brute, hp: 3000, attack: 1 } }, { attack: 1000 }));
  assert.ok(g.move(1, 0));
  // (4, 0) is 3 away, (0, 4) √17: the closer one is shot.
  assert.deepEqual(g.volley?.shots.map((s) => [s.by, s.to, s.damage, s.before, s.hp, s.full]), [["hero", { x: 4, y: 0 }, 1000, 3000, 2000, 3000]]);
  assert.equal(g.world.tile(4, 0).enemy!.hp, 2000);
  assert.equal(g.world.tile(4, 0).wound, 1000);
  assert.equal(g.run.player.hp, 100);
  // Pacing within 3 tiles, between (1, 0) and (2, 0): nine turns of cooldown, then the next arrow.
  for (let i = 0; i < 9; i++) {
    assert.ok(g.move(i % 2 ? -1 : 1, 0));
    assert.equal(g.world.tile(4, 0).enemy!.hp, 2000, `turn ${i + 2}: still cooling down`);
  }
  assert.ok(g.move(-1, 0));
  assert.equal(g.world.tile(4, 0).enemy!.hp, 1000);
  // Undo takes the arrow back with the step.
  assert.ok(g.undo());
  assert.equal(g.world.tile(4, 0).enemy!.hp, 2000);
});

test("an arrow that fells an unwounded enemy pays the kill as an instakill; a ready arrow waits for a target", () => {
  const g = archer(arena({ "6,0": { ...brute, hp: 10, strength: "strong", ranged: true } }, { attack: 1000 }));
  for (let i = 0; i < 2; i++) assert.ok(g.move(1, 0));
  assert.equal(g.world.tile(6, 0).kind, "enemy", "out of range: the arrow waits");
  assert.equal(g.run.volleys?.hero, undefined, "ready and waiting");
  assert.ok(g.move(1, 0));
  assert.equal(g.world.tile(6, 0).kind, "floor");
  assert.equal(g.run.kills, 1);
  // Tower III's Gold bonus, ×3.1, on the strength's Gold and the Ranged enemy's 1 more.
  assert.equal(g.save.gold, tierGold(3, ENEMY_GOLD.strong + RANGED_GOLD));
  assert.match(g.message, /Arrow · Ranged Strong Brute defeated/);
  assert.equal(g.run.volleys?.hero, 0, "fired: the cooldown starts again");
});

test("Attack Range and Attack Speed: 3.00 tiles and 1.00 shot every 10 turns, 0.05 more a rank, 7 and 6 at their most, opened by Tower III's floors 20 and 30", () => {
  const save = defaults();
  assert.deepEqual([attackRange(save), attackSpeed(save)], [300, 20]);
  save.training.attackRange = 80;
  save.training.attackSpeed = 100;
  assert.deepEqual([attackRange(save), attackSpeed(save)], [700, 120]);
  save.training.attackRange = 1;
  const step = trainingStep(save, "attackRange");
  assert.deepEqual([step.now, step.next, trainingText(step.now, step.unit)], [3.05, 3.1, "3.05 tiles"]);
  assert.equal(trainingText(trainingStep(save, "attackSpeed").now, "shots"), "6.00/10 turns");
  const run = { training: { attackSpeed: 0 }, player: hero() };
  assert.deepEqual(runTrainingValue({ ...save, training: { ...save.training, attackSpeed: 10 } }, run, "attackSpeed"), { value: 1.5, unit: "shots" });
});

test("the hero's class: a Wayfarer, a Pathfinder once Tower II is open, an Archer once Tower III's floor 10 Goal is claimed", () => {
  const save = defaults();
  assert.equal(heroClass(save), "Wayfarer");
  save.tower.tiersOpen = 3;
  assert.equal(heroClass(save), "Pathfinder");
  save.goals.claimed[3] = [10];
  assert.equal(heroClass(save), "Archer");
});

test("ATK / Tile: 0.01 a tile for the first rank, each later rank 0.00004 less, 1.204 at its 200, opened by Tower III's floor 50; 50 Silver or Gold for the first rank, 1 million for the 130th", () => {
  const save = defaults();
  const row = TRAINING.find((t) => t.id === "attackPerTile")!;
  assert.equal(trainingOpen(row, save), false);
  save.goals.claimed[3] = [50];
  assert.equal(trainingOpen(row, save), true);
  assert.deepEqual([0, 1, 2, 200].map((r) => attackPerTile({ training: { ...save.training, attackPerTile: r } })), [0, 1000, 1996, 120_400]);
  save.training.attackPerTile = 1;
  const step = trainingStep(save, "attackPerTile");
  assert.deepEqual([step.now, step.next, trainingText(step.now, step.unit), trainingText(step.next, step.unit)], [0.01, 0.01996, "+0.010×/tile", "+0.020×/tile"]);
  const prices = [1, 38, 98, 130, 200].map((n) => silverPrice("attackPerTile", n - 1));
  assert.deepEqual(prices, [1, 38, 98, 130, 200].map((n) => trainingGold(row, n - 1)), "the same in Silver and a trainer's Gold");
  assert.deepEqual(prices, [50, 589, 60_929, 1_000_039, 998_422_519]);
});

test("an arrow's ATK is multiplied by ATK / Tile for the distance, Charged Shot for the turns waited, and a critical hit, each on the others", () => {
  assert.equal(arrowBoost(0, 9, 0, 0), 1);
  assert.equal(arrowBoost(1000, 9, 0, 0), 1.03, "3 tiles at 0.01 a tile");
  assert.equal(arrowBoost(1000, 5, 0, 0), snap(1 + Math.sqrt(5) / 100), "Euclidean: a knight's move is √5 away");
  assert.equal(arrowBoost(1000, 9, 10, 2), snap(1.03 * 1.2));
  assert.equal(arrowDamage(hero({ attack: 100 }), { ...brute, defense: 20 }, 1, 2, 1.5), 280, "100 × 1.5 × 2 − 20");
});

test("ATK / Tile lets the Archer hurt, and so target, an enemy its plain arrows can't", () => {
  const armored = { ...brute, hp: 3000, defense: 20 };
  const plain = archer(arena({ "4,0": armored }, { attack: 10 }));
  assert.ok(plain.move(1, 0));
  assert.equal(plain.volley, null, "10 ATK can't pierce 20 DEF: no target");
  const far = archer(arena({ "4,0": armored }, { attack: 10 }));
  far.save.training.attackPerTile = 200;
  assert.ok(far.move(1, 0));
  // 3 tiles at 1.204 a tile: 10 × 4.612 − 20.
  assert.deepEqual(far.volley?.shots.map((s) => [s.to, s.damage]), [[{ x: 4, y: 0 }, 26.12]]);
});

test("Charged Shot: each turn the ready arrow waits unfired adds its percent to the next arrow's ATK, shown in gold, then starts over; nothing counts before it is researched", () => {
  const g = archer(arena({ "6,0": { ...brute, hp: 9000 } }, { attack: 1000 }));
  g.save.archives.levels.chargedShot = 10;
  for (let i = 0; i < 2; i++) assert.ok(g.move(1, 0));
  assert.equal(g.run.volleys?.waited, 2, "out of range two turns");
  assert.ok(g.move(1, 0));
  // Two turns waited, at 10% a turn.
  assert.deepEqual(g.volley?.shots.map((s) => [s.damage, s.charged]), [[1200, true]]);
  assert.equal(g.run.volleys?.waited, undefined, "fired: the wait starts over");
  assert.ok(g.undo());
  assert.equal(g.run.volleys?.waited, 2, "undo takes the arrow back, and the wait with it");
  const plain = archer(arena({ "6,0": { ...brute, hp: 9000 } }, { attack: 1000 }));
  for (let i = 0; i < 2; i++) assert.ok(plain.move(1, 0));
  assert.equal(plain.run.volleys?.waited, undefined);
  assert.ok(plain.move(1, 0));
  assert.deepEqual(plain.volley?.shots.map((s) => [s.damage, s.charged]), [[1000, undefined]]);
});

test("Charged Shot research: +1% a turn a level for 100 levels, opened by Tower III's floor 60, on Critical Factor's hours at ten times its Gold", () => {
  const def = RESEARCH.chargedShot, crit = RESEARCH.critFactor;
  assert.equal(def.levels.length, 100);
  assert.deepEqual(def.levels.map((l) => [l.gold, l.hours]), crit.levels.map((l) => [10 * l.gold, l.hours]));
  assert.ok(def.levels.every((l) => l.effect.target === "chargedShotPercent" && l.effect.op === "add" && l.effect.value === 1));
  assert.ok(def.requires.some((r) => "goalUnlock" in r && r.goalUnlock === "chargedShot"));
  assert.equal(def.levels.reduce((sum, l) => sum + l.gold, 0), 1_960_230_000);
});

test("a charged arrow's number rises in a gold outline drawn under its black one; a plain arrow's has the black alone", () => {
  const popups = new BoardPopups();
  const shot = (to: number, charged: boolean) => ({ by: "hero" as const, from: { x: 0, y: 0 }, to: { x: to, y: 0 }, damage: 40, ...(charged ? { charged } : {}), before: 100, hp: 60, full: 100 });
  popups.update({ run: { seed: 1 }, gains: [], fight: null, lastHeal: null, volley: { at: 0, flight: 0, shots: [shot(1, true), shot(2, false)] } }, 0);
  const strokes: string[] = [];
  const c = new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k === "strokeText" ? (text: string) => strokes.push(`${text}:${t.strokeStyle}:${t.lineWidth}`) : k in t ? t[k as string] : () => ({ addColorStop() {} })),
    set: (t, k, v) => ((t[k as string] = v), true),
  });
  popups.draw({ c, s: 40, now: 10, left: 0, bottom: 0, n: 9, look: { reduceMotion: true, themed: null } } as never);
  assert.deepEqual(strokes, ["40:#ffd34d:8.8", "40:#000:4", "40:#000:4"]);
});

test("a charged arrow flies in a blue glow; a plain arrow has none", () => {
  const glows = (charged: boolean) => {
    const seen = new Set<string>();
    const c = new Proxy({} as Record<string, unknown>, {
      get: (t, k) => (k === "stroke" || k === "fill" ? () => seen.add(String(t.shadowColor ?? "")) : k in t ? t[k as string] : () => {}),
      set: (t, k, v) => ((t[k as string] = v), true),
    });
    const shot = { by: "hero" as const, from: { x: 0, y: 0 }, to: { x: 3, y: 0 }, damage: 40, ...(charged ? { charged } : {}) };
    drawVolley({ c, s: 40, now: 50, left: 0, bottom: 0, n: 9 } as never, { at: 0, flight: 100, shots: [shot] });
    return [...seen];
  };
  assert.deepEqual(glows(true), ["#4da6ff"]);
  assert.deepEqual(glows(false), [""]);
});

test("Multishot Chance and Targets: 0.5% a rank to 49.5% at 99, and 2 targets to 9 at 7, opened by Tower III's floor 70; the same prices in Silver and a trainer's Gold", () => {
  const save = defaults();
  const rows = (["multishotChance", "multishotTargets"] as const).map((id) => TRAINING.find((t) => t.id === id)!);
  assert.deepEqual(rows.map((r) => [r.group, r.max]), [["offense", 99], ["offense", 7]]);
  assert.deepEqual(rows.map((r) => trainingOpen(r, save)), [false, false]);
  save.goals.claimed[3] = [70];
  assert.deepEqual(rows.map((r) => trainingOpen(r, save)), [true, true]);
  const at = (training: Partial<typeof save.training>) => ({ training: { ...save.training, ...training } });
  assert.deepEqual([0, 1, 10, 99].map((r) => multishotChance(at({ multishotChance: r }))), [0, 50, 500, 4950]);
  assert.deepEqual([0, 1, 7].map((r) => multishotTargets(at({ multishotTargets: r }))), [2, 3, 9]);
  save.training.multishotChance = 98;
  const chance = trainingStep(save, "multishotChance");
  assert.deepEqual([chance.unit, chance.now, chance.next], ["%", 49, 49.5]);
  const targets = trainingStep(save, "multishotTargets");
  assert.deepEqual([trainingText(targets.now, targets.unit), trainingText(targets.next, targets.unit)], ["2 targets", "3 targets"]);
  const run = { training: { multishotTargets: 2 }, player: hero() };
  assert.deepEqual(runTrainingValue(save, run, "multishotTargets"), { value: 4, unit: "targets" }, "Silver ranks count in the run");
  assert.deepEqual(runTrainingValue(save, run, "multishotChance"), { value: 49, unit: "%" });
  for (const row of rows) {
    const prices = Array.from({ length: row.max }, (_, k) => silverPrice(row.id, k));
    assert.deepEqual(prices, Array.from({ length: row.max }, (_, k) => trainingGold(row, k)), `${row.id}: the same in Silver and Gold`);
  }
  // 60 × n × (1 + ((n − 1) / 12)^1.5).
  assert.deepEqual([1, 11, 32, 85, 99].map((n) => silverPrice("multishotChance", n - 1)), [60, 1163, 9893, 99_554, 144_569]);
  assert.deepEqual(Array.from({ length: 7 }, (_, k) => silverPrice("multishotTargets", k)), [450, 2000, 5000, 12_500, 40_000, 120_000, 350_000]);
});

test("a multishot fires one charge at up to Multishot Targets of the closest enemies an arrow can hurt, each with its own ATK / Tile; undo takes them all back", () => {
  const foes = { "2,1": { ...brute, hp: 3000, defense: 5000 }, "3,0": { ...brute, hp: 3000 }, "1,2": { ...brute, hp: 3000 }, "4,0": { ...brute, hp: 3000 }, "1,3": { ...brute, hp: 3000 } };
  const shots = (targets: number) => {
    const g = archer(arena(foes, { attack: 1000 }));
    g.save.goals.claimed[3] = [10, 90];
    // Past its 99 ranks, so every shot is a multishot.
    g.save.training.multishotChance = 200;
    g.save.training.multishotTargets = targets;
    g.save.training.attackPerTile = 1;
    assert.ok(g.move(1, 0));
    assert.equal(g.run.volleys?.hero, 0, "one arrow's charge spent");
    return g;
  };
  // From (1, 0): the armored (2, 1) can't be hurt; (3, 0) and (1, 2) are 2 away, (4, 0) and (1, 3) 3.
  assert.deepEqual(shots(0).volley?.shots.map((s) => [s.to, s.damage]), [[{ x: 3, y: 0 }, 1020], [{ x: 1, y: 2 }, 1020]]);
  const g = shots(7);
  assert.deepEqual(g.volley?.shots.map((s) => [s.to, s.damage]), [[{ x: 3, y: 0 }, 1020], [{ x: 1, y: 2 }, 1020], [{ x: 4, y: 0 }, 1030], [{ x: 1, y: 3 }, 1030]], "fewer enemies than targets: one arrow each");
  assert.ok(g.undo());
  assert.deepEqual([g.run.volleys, g.volley], [undefined, null], "the arrows and their charge taken back");
  for (const [x, y] of [[3, 0], [1, 2], [4, 0], [1, 3]] as const) assert.equal(g.world.tile(x, y).wound, undefined);
  const single = archer(arena(foes, { attack: 1000 }));
  assert.ok(single.move(1, 0));
  assert.equal(single.volley?.shots.length, 1, "no Multishot Chance: one arrow");
});

test("every arrow of a multishot carries the first's Charged Shot", () => {
  const g = archer(arena({ "6,0": { ...brute, hp: 9000 }, "5,2": { ...brute, hp: 9000 } }, { attack: 1000 }));
  g.save.archives.levels.chargedShot = 10;
  g.save.training.multishotChance = 200;
  for (let i = 0; i < 3; i++) assert.ok(g.move(1, 0));
  assert.deepEqual(g.volley?.shots.map((s) => [s.to, s.damage, s.charged]), [[{ x: 5, y: 2 }, 1200, true], [{ x: 6, y: 0 }, 1200, true]]);
});

test("Multishot Chance at 99 ranks makes about 49.5% of shots multishots, a fixed roll per run, turn and tile", () => {
  const g = archer(arena({}));
  g.save.training.multishotChance = 99;
  const roll = (turn: number) => (g as unknown as { multishot(turn: number): boolean }).multishot(turn);
  let hits = 0;
  for (let turn = 1; turn <= 4000; turn++) hits += roll(turn) ? 1 : 0;
  assert.ok(Math.abs(hits / 4000 - 0.495) < 0.03, `about 49.5%: ${hits / 4000}`);
  assert.equal(roll(17), roll(17));
  g.save.training.multishotChance = 0;
  assert.ok(Array.from({ length: 200 }, (_, t) => roll(t)).every((m) => !m));
});

test("Rapid Fire Chance and Duration: 0.4% a rank to 34% at 85, and 1 turn, +0.05 a rank, to 5.95 at 99, opened by Tower III's floor 80; the same prices in Silver and a trainer's Gold", () => {
  const save = defaults();
  const rows = (["rapidFireChance", "rapidFireDuration"] as const).map((id) => TRAINING.find((t) => t.id === id)!);
  assert.deepEqual(rows.map((r) => [r.group, r.max]), [["offense", 85], ["offense", 99]]);
  save.goals.claimed[3] = [70];
  assert.deepEqual(rows.map((r) => trainingOpen(r, save)), [false, false]);
  save.goals.claimed[3] = [80];
  assert.deepEqual(rows.map((r) => trainingOpen(r, save)), [true, true]);
  const at = (training: Partial<typeof save.training>) => ({ training: { ...save.training, ...training } });
  assert.deepEqual([0, 1, 10, 85].map((r) => rapidFireChance(at({ rapidFireChance: r }))), [0, 40, 400, 3400]);
  assert.deepEqual([0, 1, 10, 99].map((r) => rapidFireDuration(at({ rapidFireDuration: r }))), [100, 105, 150, 595]);
  save.training.rapidFireChance = 84;
  const chance = trainingStep(save, "rapidFireChance");
  assert.deepEqual([chance.unit, chance.now, chance.next], ["%", 33.6, 34]);
  save.training.rapidFireDuration = 98;
  const duration = trainingStep(save, "rapidFireDuration");
  assert.deepEqual([trainingText(duration.now, duration.unit), trainingText(duration.next, duration.unit), trainingText(duration.now, duration.unit, true)], ["5.90 turns", "5.95 turns", "5.90"]);
  const run = { training: { rapidFireDuration: 1 }, player: hero() };
  assert.deepEqual(runTrainingValue(save, run, "rapidFireDuration"), { value: 5.95, unit: "turns" }, "Silver ranks count in the run");
  for (const row of rows) {
    const prices = Array.from({ length: row.max }, (_, k) => silverPrice(row.id, k));
    assert.deepEqual(prices, Array.from({ length: row.max }, (_, k) => trainingGold(row, k)), `${row.id}: the same in Silver and Gold`);
  }
  // 120 + 42m + 7.85m² + 0.085m³ for the n-th, m = n − 1.
  assert.deepEqual([1, 9, 30, 82, 85].map((n) => silverPrice("rapidFireChance", n - 1)), [120, 1002, 10_013, 100_199, 109_418]);
  assert.deepEqual([1, 9, 30, 82, 99].map((n) => silverPrice("rapidFireDuration", n - 1)), [120, 1002, 10_013, 100_199, 159_629]);
});

test("Rapid Fire fires four times as fast from the shot that starts it; what's left toward a shot when it ends carries at the usual pace", () => {
  // One shot every 2 turns (Attack Speed 5.00 a 10 turns), Rapid Fire 3.3 turns, started by the first shot only.
  const times: [number, boolean][] = [];
  let clock = {}, started = false;
  for (let turn = 0; turn < 6; turn++)
    clock = archerTurn(clock, 100, (rapid, tick) => {
      times.push([turn * ARCHER_TICKS + tick, rapid]);
      if (rapid || started) return 0;
      started = true;
      return 330;
    }).clock;
  // The first shot fires at the end of turn 0 (100); six more every half turn while Rapid Fire lasts (to 430),
  // the last leaving 60% of a shot, so the next comes 0.8 turns after it ends, 1.1 after the last rapid one.
  assert.deepEqual(times.map(([t]) => t), [100, 150, 200, 250, 300, 350, 400, 510]);
  assert.deepEqual(times.map(([, rapid]) => rapid), [false, true, true, true, true, true, true, false], "only a shot after Rapid Fire may start it again");
  // A waiting arrow lets Rapid Fire run down, and fires at the turn's end.
  assert.deepEqual(archerTurn({ rapid: 150 }, 100, () => false), { clock: { rapid: 50 }, idle: true });
  assert.deepEqual(archerTurn({}, 100, () => 250).clock, { charge: 0, rapid: 250 }, "a shot at the turn's end starts it for the turns after");
});

test("Rapid Fire in a run: several arrows a turn, each leaving in turn, at most one start per window; undo takes it back", () => {
  const g = archer(arena({ "3,0": { ...brute, hp: 1e7, attack: 1 } }, { attack: 1000 }));
  g.save.goals.claimed[3] = [10, 80];
  g.save.training.attackSpeed = 100;
  // Past its 85 ranks, so every shot fired outside Rapid Fire starts it.
  g.save.training.rapidFireChance = 300;
  g.save.training.rapidFireDuration = 99;
  assert.ok(g.move(1, 0));
  assert.equal(g.volley?.shots.length, 1, "the arrow waiting ready fires at the turn's end");
  assert.equal(g.volley?.shots[0]!.lead, undefined, "one arrow a turn flies as ever");
  assert.equal(g.run.volleys?.rapid, 595, "and starts Rapid Fire");
  assert.ok(g.move(0, 1));
  const shots = g.volley!.shots;
  // 120 twentieths × 4 a hundredth: an arrow every 41⅔ hundredths, from an empty charge.
  assert.deepEqual(shots.map((s) => s.lead), [0.42, 0.84]);
  assert.equal(g.run.volleys?.rapid, 495);
  assert.ok(g.undo());
  assert.equal(g.run.volleys?.rapid, 595, "undo takes the turn's Rapid Fire back");
});
