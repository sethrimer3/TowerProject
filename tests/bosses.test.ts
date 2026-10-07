import { test } from "node:test";
import assert from "node:assert/strict";
import { reachable } from "../src/board.ts";
import { TOWER_START_X, WIDTH, xpForLevel } from "../src/config.ts";
import { point, type Tile } from "../src/entities.ts";
import { region } from "../src/delve/labyrinth.ts";
import { generateTowerFloor, isBossFloor } from "../src/tower/index.ts";
import { getTowerGateEnemy } from "../src/scaling.ts";
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

test("a Tower boss has four times a normal enemy's HP, 1.75 times its ATK and 1.3 times its DEF, on any floor", () => {
  for (const room of [0, 4, 9, 19, 49, 333]) {
    const normal = getTowerGateEnemy(room, "normal", "balanced"), boss = getTowerGateEnemy(room, "boss", "balanced");
    const strong = getTowerGateEnemy(room, "strong", "balanced"), elite = getTowerGateEnemy(room, "elite", "balanced");
    // Each is rounded to hundredths on its own.
    for (const [stat, k] of [["hp", 4], ["attack", 1.75], ["defense", 1.3]] as const)
      assert.ok(Math.abs(boss[stat] - normal[stat] * k) <= 0.02, `floor ${room + 1} ${stat}`);
    assert.ok(boss.attack > strong.attack && boss.attack > elite.attack, `floor ${room + 1}: the boss hits hardest`);
    assert.equal(boss.name, normal.name);
  }
});

test("tenth-floor bosses below floor 50 cost an evenly trained hero no more than before the enemy curves", () => {
  // Floors 10 to 40's bosses as the old zone rosters made them (HP, ATK, DEF),
  // against the hero's level by each floor (docs/PROGRESSION_AND_DIFFICULTY.md).
  const before = [[80, 30, 3], [120, 46, 4], [180, 70, 7], [280, 106, 11]], levels = [7, 13, 18, 23];
  before.forEach(([hp, attack, defense], i) => {
    const s = defaults(), points = levels[i] * 3;
    s.xp = xpForLevel(levels[i]);
    Object.assign(s.training, { hp: points / 3, attack: points / 3, defense: points / 3 });
    const l = loadout(s), hero = { x: 0, y: 0, hp: l.maxHp, maxHp: l.maxHp, attack: l.attack, defense: l.defense, keys: l.keys };
    const enemy = (stats: { hp: number; attack: number; defense: number }) => ({ name: "Boss", tier: 4, strength: "boss" as const, ...stats });
    const now = predict(hero, enemy(getTowerGateEnemy(i * 10 + 9, "boss", "balanced"))).damage;
    const old = predict(hero, enemy({ hp, attack, defense })).damage;
    assert.ok(now <= old, `floor ${i * 10 + 10}: ${now} against ${old}`);
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
