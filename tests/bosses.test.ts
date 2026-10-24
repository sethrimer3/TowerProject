import { test } from "node:test";
import assert from "node:assert/strict";
import { reachable } from "../src/board.ts";
import { TOWER_START_X, WIDTH, xpForLevel } from "../src/config.ts";
import { point, type EnemyStrength, type Tile, type EnemyProfile } from "../src/entities.ts";
import { region } from "../src/delve/labyrinth.ts";
import { generateTowerFloor, isBossFloor } from "../src/tower/index.ts";
import { getTowerGateEnemy } from "../src/enemies/scaling.ts";
import { defaults } from "../src/save.ts";
import { loadout } from "../src/loadout.ts";
import { predict } from "../src/combat.ts";

// A boss guards the way up at the end of every ten floors: beside the stairs
// on each Tower section's last floor, and at each Delve milestone gate.
const SEEDS = [0, 1, 7, 42, 1234, 90210];
const bosses = (cells: Map<string, Tile>) => [...cells].filter(([, t]) => t.enemy?.strength === "boss").map(([k]) => k);

test("the 10th, 20th, … Tower floors are the boss floors", () => {
  assert.deepEqual([0, 8, 9, 10, 19, 29].map(isBossFloor), [false, false, true, false, true, true]);
});

test("a boss stands on the only way to each boss floor's stairs, and on no other floor", () => {
  for (const seed of SEEDS)
    for (let room = 0; room < 30; room++) {
      const { cells } = generateTowerFloor(seed, room);
      const found = bosses(cells);
      if (!isBossFloor(room)) { assert.deepEqual(found, [], `seed ${seed} floor ${room + 1}`); continue; }
      assert.equal(found.length, 1, `seed ${seed} floor ${room + 1}`);
      const stairs = [...cells].find(([, t]) => t.kind === "stairs")![0];
      const entrance = point(TOWER_START_X, 0);
      assert.ok(reachable(cells, entrance).has(stairs));
      assert.ok(!reachable(cells, entrance, new Set(found)).has(stairs), `seed ${seed} floor ${room + 1}: the stairs are reachable round the boss`);
    }
});

test("a Tower boss has 3.5 times a normal enemy's HP, 1.3 times its ATK and its DEF, on any floor", () => {
  for (const room of [0, 4, 9, 19, 49, 333]) {
    const normal = getTowerGateEnemy(room, "normal", "balanced"), boss = getTowerGateEnemy(room, "boss", "balanced");
    const elite = getTowerGateEnemy(room, "elite", "balanced"), hitter = getTowerGateEnemy(room, "elite", "attackHeavy");
    // Each is rounded to hundredths on its own.
    for (const [stat, k] of [["hp", 3.5], ["attack", 1.3], ["defense", 1]] as const)
      assert.ok(Math.abs(boss[stat] - normal[stat] * k) <= 0.02, `floor ${room + 1} ${stat}`);
    // It outlasts the floor rather than outhitting it.
    assert.ok(boss.hp > 2 * elite.hp, `floor ${room + 1}: the boss has twice the elite's HP`);
    assert.ok(boss.attack < hitter.attack, `floor ${room + 1}: an attack-heavy elite hits harder`);
    assert.equal(boss.name, normal.name);
  }
});

test("a Tower boss costs about as much as the worst other enemy on its floor, and at most 3 times it", () => {
  // Heroes sized to the floor's normal, balanced enemy: three strikes fell
  // it, and DEF holds off 30% to all of its ATK. With the boss at four times
  // the HP, 1.75 times the ATK and 1.3 times the DEF, its fight cost such a
  // hero three to five times the worst other enemy's (51% of max HP against
  // 10% from floor 100 on). A hero whose DEF stops a normal enemy's blows
  // can still find an attack-heavy elite a little dearer than the boss.
  const sized = (room: number, guard: number) => {
    const n = getTowerGateEnemy(room, "normal", "balanced"), maxHp = n.attack * 20;
    return { x: 0, y: 0, hp: maxHp, maxHp, attack: n.hp / 3 + n.defense, defense: n.attack * guard, keys: { yellow: 0, blue: 0, red: 0 } };
  };
  const cost = (hero: ReturnType<typeof sized>, room: number, strength: EnemyStrength, profile: EnemyProfile) =>
    predict(hero, { ...getTowerGateEnemy(room, strength, profile), strength }).damage / hero.maxHp;
  for (const room of [9, 29, 49, 99, 149, 199, 299])
    for (const guard of [0.3, 0.6, 0.8, 1]) {
      const hero = sized(room, guard), boss = cost(hero, room, "boss", "balanced");
      const worst = Math.max(...(["weak", "normal", "strong", "elite"] as const).flatMap((s) =>
        (["attackHeavy", "balanced", "defenseHeavy"] as const).map((p) => cost(hero, room, s, p))));
      assert.ok(boss >= 0.9 * worst && boss <= 3 * worst, `floor ${room + 1}, DEF ${guard}: boss ${boss.toFixed(3)} against ${worst.toFixed(3)}`);
    }
});

test("tenth-floor bosses below floor 50 cost an evenly trained hero no more than before the enemy curves", () => {
  // Floors 10 to 40's bosses as the old zone rosters made them (HP, ATK, DEF),
  // against the hero's level by each floor (docs/PROGRESSION_AND_DIFFICULTY.md).
  // Floor 10's costs more since DEF's rank curve lost its whole point a rank
  // (7 ranks give 4.1 DEF, not 11.1): 74 of 219 HP, not 49, so no more than
  // 35% of the hero's max HP.
  const before = [[80, 30, 3], [120, 46, 4], [180, 70, 7], [280, 106, 11]], levels = [7, 13, 18, 23];
  before.forEach(([hp, attack, defense], i) => {
    const s = defaults(), points = levels[i] * 3;
    s.xp = xpForLevel(levels[i]);
    Object.assign(s.training, { hp: points / 3, attack: points / 3, defense: points / 3 });
    const l = loadout(s), hero = { x: 0, y: 0, hp: l.maxHp, maxHp: l.maxHp, attack: l.attack, defense: l.defense, keys: l.keys };
    const enemy = (stats: { hp: number; attack: number; defense: number }) => ({ name: "Boss", tier: 4, strength: "boss" as const, ...stats });
    const now = predict(hero, enemy(getTowerGateEnemy(i * 10 + 9, "boss", "balanced"))).damage;
    const old = predict(hero, enemy({ hp, attack, defense })).damage;
    if (i === 0) assert.ok(now <= 0.35 * l.maxHp, `floor 10: ${now} of ${l.maxHp} HP`);
    else assert.ok(now <= old, `floor ${i * 10 + 10}: ${now} against ${old}`);
  });
});

test("each Delve milestone gate is held by a boss the way up must pass", () => {
  for (const seed of SEEDS)
    for (let area = 0; area < 4; area++) {
      const r = region(seed, area), found = bosses(r.cells);
      assert.deepEqual(found, [point(r.gate.x, r.gate.y - 2)], `seed ${seed} area ${area}`);
      const entry = point(r.entry.x, r.entry.y), gate = point(r.gate.x, r.gate.y);
      assert.ok(reachable(r.cells, entry, new Set(), WIDTH).has(gate));
      assert.ok(!reachable(r.cells, entry, new Set(found), WIDTH).has(gate), `seed ${seed} area ${area}: the gate is reachable round the boss`);
    }
});
