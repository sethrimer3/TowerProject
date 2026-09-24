import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDefendState,
  placeBuilding,
  barracksCorner,
} from "../src/defend.ts";
import { createDefendWaveState } from "../src/defend-enemies.ts";
import {
  TROOP_DEFS,
  BARRACKS_GARRISON_CAP,
  createDefendTroopState,
  trainTroopsTick,
  stepTroopCombat,
  damageTroop,
} from "../src/defend-troops.ts";

function enclose(state: ReturnType<typeof createDefendState>) {
  const ring: [number, number][] = [
    [2, 4], [3, 4], [4, 4], [5, 4], [6, 4],
    [2, 5], [6, 5],
    [2, 6], [6, 6],
    [2, 7], [6, 7],
    [2, 8], [3, 8], [4, 8], [5, 8], [6, 8],
  ];
  state.wallCapacity = 20;
  for (const [x, y] of ring) assert.equal(placeBuilding(state, x, y, "wall"), true);
}

test("swordsman and archer barracks each sit in a fixed, distinct corner", () => {
  assert.notEqual(barracksCorner("barracks_swordsman"), barracksCorner("barracks_archer"));
  // deterministic across calls
  assert.equal(barracksCorner("barracks_swordsman"), barracksCorner("barracks_swordsman"));
});

test("a barracks trains one troop after its training time, up to the garrison cap", () => {
  const state = createDefendState();
  enclose(state);
  assert.equal(placeBuilding(state, 3, 6, "barracks_swordsman"), true);
  const troops = createDefendTroopState();
  const ticksNeeded = TROOP_DEFS.swordsman.trainTicks;
  for (let i = 0; i < ticksNeeded - 1; i++) {
    trainTroopsTick(state, troops);
    assert.equal(troops.troops.length, 0, "not trained yet");
  }
  trainTroopsTick(state, troops);
  assert.equal(troops.troops.length, 1, "first swordsman trained");
  assert.equal(troops.troops[0].kind, "swordsman");
  assert.equal(troops.troops[0].x, 3);
  assert.equal(troops.troops[0].y, 6);

  // keep ticking until the garrison cap is hit, then confirm it stops
  for (let i = 0; i < ticksNeeded * (BARRACKS_GARRISON_CAP + 3); i++) trainTroopsTick(state, troops);
  assert.equal(troops.troops.length, BARRACKS_GARRISON_CAP, "training halts at the garrison cap");
});

test("an archer fires a ranged bolt without moving toward the target", () => {
  const state = createDefendState();
  const waves = createDefendWaveState();
  waves.enemies = [{ id: 1, kind: "roach", x: 4, y: 4, hp: 6, maxHp: 6 }];
  const troops = createDefendTroopState();
  troops.troops = [{ id: 1, kind: "archer", x: 4, y: 6, hp: 8, maxHp: 8, homeX: 4, homeY: 6 }];
  const shots = stepTroopCombat(state, waves, troops);
  assert.equal(troops.troops[0].x, 4, "archer holds its ground");
  assert.equal(troops.troops[0].y, 6);
  assert.equal(waves.enemies[0].hp, 6 - TROOP_DEFS.archer.attack, "the target takes ranged damage");
  assert.equal(shots.length, 1);
  assert.deepEqual(shots[0], { from: { x: 4, y: 6 }, to: { x: 4, y: 4 } });
});

test("an archer out of range holds fire and doesn't move", () => {
  const state = createDefendState();
  const waves = createDefendWaveState();
  waves.enemies = [{ id: 1, kind: "roach", x: 8, y: 12, hp: 6, maxHp: 6 }];
  const troops = createDefendTroopState();
  troops.troops = [{ id: 1, kind: "archer", x: 0, y: 1, hp: 8, maxHp: 8, homeX: 0, homeY: 1 }];
  const shots = stepTroopCombat(state, waves, troops);
  assert.equal(shots.length, 0);
  assert.equal(waves.enemies[0].hp, 6);
  assert.deepEqual(troops.troops[0], { id: 1, kind: "archer", x: 0, y: 1, hp: 8, maxHp: 8, homeX: 0, homeY: 1 });
});

test("a swordsman walks toward the nearest enemy and melees once adjacent", () => {
  const state = createDefendState();
  const waves = createDefendWaveState();
  waves.enemies = [{ id: 1, kind: "orc", x: 4, y: 2, hp: 20, maxHp: 20 }];
  const troops = createDefendTroopState();
  troops.troops = [{ id: 1, kind: "swordsman", x: 4, y: 6, hp: 12, maxHp: 12, homeX: 4, homeY: 6 }];

  let steps = 0;
  while (Math.max(Math.abs(troops.troops[0].x - 4), Math.abs(troops.troops[0].y - 2)) > 1) {
    const before = { ...troops.troops[0] };
    stepTroopCombat(state, waves, troops);
    assert.notDeepEqual({ x: troops.troops[0].x, y: troops.troops[0].y }, { x: before.x, y: before.y });
    steps++;
    assert.ok(steps < 20);
  }
  const hpBefore = waves.enemies[0].hp;
  stepTroopCombat(state, waves, troops);
  assert.ok(waves.enemies[0].hp < hpBefore, "adjacent swordsman melees instead of moving further");
});

test("damaging a troop to 0 hp removes it", () => {
  const troops = createDefendTroopState();
  troops.troops = [{ id: 5, kind: "swordsman", x: 1, y: 1, hp: 12, maxHp: 12, homeX: 1, homeY: 1 }];
  damageTroop(troops, 5, 5);
  assert.equal(troops.troops[0].hp, 7);
  damageTroop(troops, 5, 100);
  assert.equal(troops.troops.length, 0);
});

test("with no enemies on the board, troops stay put", () => {
  const state = createDefendState();
  const waves = createDefendWaveState();
  const troops = createDefendTroopState();
  troops.troops = [{ id: 1, kind: "swordsman", x: 2, y: 2, hp: 12, maxHp: 12, homeX: 2, homeY: 2 }];
  const shots = stepTroopCombat(state, waves, troops);
  assert.equal(shots.length, 0);
  assert.equal(troops.troops[0].x, 2);
  assert.equal(troops.troops[0].y, 2);
});
