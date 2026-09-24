import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDefendState,
  placeBuilding,
  damageKeep,
  DEFEND_WIDTH,
  DEFEND_NO_BUILD_ROW,
} from "../src/defend.ts";
import {
  DEFEND_WAVES,
  DEFEND_WAVE_COUNT,
  ENEMY_DEFS,
  createDefendWaveState,
  buildWave,
  startNextWave,
  stepDefendCombat,
  damageEnemy,
} from "../src/defend-enemies.ts";

test("there are five waves and they get harder", () => {
  assert.equal(DEFEND_WAVE_COUNT, 5);
  const total = (w: (typeof DEFEND_WAVES)[number]) =>
    (w.roach ?? 0) + (w.orc ?? 0) + (w.bombat ?? 0);
  for (let i = 1; i < DEFEND_WAVES.length; i++) {
    assert.ok(total(DEFEND_WAVES[i]) >= total(DEFEND_WAVES[i - 1]), `wave ${i + 1} should not be smaller than wave ${i}`);
  }
  assert.equal(DEFEND_WAVES[0].orc ?? 0, 0, "the first wave should be roaches only");
  assert.ok((DEFEND_WAVES[0].roach ?? 0) > 0);
});

test("wave enemy counts and kinds are deterministic", () => {
  const a = buildWave(2, 1);
  const b = buildWave(2, 1);
  assert.deepEqual(a, b);
  const composition = DEFEND_WAVES[2];
  const counted = { roach: 0, orc: 0, bombat: 0 };
  for (const e of a) counted[e.kind]++;
  assert.deepEqual(counted, { roach: composition.roach ?? 0, orc: composition.orc ?? 0, bombat: composition.bombat ?? 0 });
});

test("enemies spawn on the reserved top row, within board bounds", () => {
  const enemies = buildWave(4, 1);
  for (const e of enemies) {
    assert.equal(e.y, DEFEND_NO_BUILD_ROW);
    assert.ok(e.x >= 0 && e.x < DEFEND_WIDTH);
  }
});

test("starting a wave requires the board to be clear and waves remaining", () => {
  const state = createDefendState();
  const waves = createDefendWaveState();
  assert.equal(startNextWave(state, waves), true);
  assert.equal(waves.wavesStarted, 1);
  assert.ok(waves.enemies.length > 0);
  assert.equal(startNextWave(state, waves), false, "can't start a new wave while enemies remain");

  waves.enemies = [];
  for (let i = 1; i < DEFEND_WAVE_COUNT; i++) {
    assert.equal(startNextWave(state, waves), true);
    waves.enemies = [];
  }
  assert.equal(waves.wavesStarted, DEFEND_WAVE_COUNT);
  assert.equal(startNextWave(state, waves), false, "no waves left");
});

test("starting a wave fails once the keep has fallen", () => {
  const state = createDefendState();
  const waves = createDefendWaveState();
  damageKeep(state, state.keepMaxHp);
  assert.equal(state.lost, true);
  assert.equal(startNextWave(state, waves), false);
});

test("with no walls in the way, an enemy marches straight for the keep and then attacks it", () => {
  const state = createDefendState();
  const waves = createDefendWaveState();
  waves.enemies = [{ id: 1, kind: "roach", x: state.keep.x, y: DEFEND_NO_BUILD_ROW, hp: 6, maxHp: 6 }];
  let steps = 0;
  while (waves.enemies[0].y < state.keep.y - 1) {
    const before = { ...waves.enemies[0] };
    stepDefendCombat(state, waves);
    assert.equal(waves.enemies[0].y, before.y + 1, "moves one tile closer per tick");
    steps++;
    assert.ok(steps < 50, "should not loop forever");
  }
  const keepHpBefore = state.keepHp;
  stepDefendCombat(state, waves);
  assert.ok(state.keepHp < keepHpBefore, "adjacent enemy attacks the keep instead of moving onto it");
});

test("a wall blocking the only path gets attacked until it's breached, then the enemy pathfinds through", () => {
  const state = createDefendState();
  const waves = createDefendWaveState();
  // Seal the keep behind a single-tile-wide corridor with one wall in it.
  for (let x = 0; x < DEFEND_WIDTH; x++) {
    if (x !== state.keep.x) assert.equal(placeBuilding(state, x, state.keep.y - 1, "wall"), true);
  }
  assert.equal(placeBuilding(state, state.keep.x, state.keep.y - 1, "wall"), true);
  waves.enemies = [{ id: 1, kind: "orc", x: state.keep.x, y: state.keep.y - 2, hp: 20, maxHp: 20 }];

  let breached = false;
  for (let i = 0; i < 10 && !breached; i++) {
    stepDefendCombat(state, waves);
    breached = state.tiles[state.keep.y - 1][state.keep.x].kind !== "wall";
  }
  assert.equal(breached, true, "the orc should have broken through the wall directly above the keep");
  assert.equal(waves.enemies[0].y, state.keep.y - 2, "still attacking, hasn't moved yet");

  stepDefendCombat(state, waves);
  assert.equal(waves.enemies[0].y, state.keep.y - 1, "moves into the breach once it opens");
});

test("damaging an enemy to 0 hp removes it, and a bombat explodes on death", () => {
  const state = createDefendState();
  const waves = createDefendWaveState();
  const bombatX = state.keep.x;
  const bombatY = state.keep.y - 1;
  waves.enemies = [{ id: 7, kind: "bombat", x: bombatX, y: bombatY, hp: ENEMY_DEFS.bombat.hp, maxHp: ENEMY_DEFS.bombat.hp }];
  const keepHpBefore = state.keepHp;
  const impacts = damageEnemy(state, waves, 7, ENEMY_DEFS.bombat.hp, bombatX, bombatY - 1);
  assert.equal(waves.enemies.length, 0, "the bombat is removed once defeated");
  assert.ok(state.keepHp < keepHpBefore, "its death explosion reaches the adjacent keep");
  assert.ok(impacts.some((i) => i.targetKind === "enemy" && i.targetId === 7), "the killing blow itself is reported");
  assert.ok(impacts.some((i) => i.targetKind === "keep"), "the explosion's hit on the keep is reported too");
});

test("a non-exploding enemy (roach) leaves no blast damage behind", () => {
  const state = createDefendState();
  const waves = createDefendWaveState();
  waves.enemies = [{ id: 3, kind: "roach", x: state.keep.x, y: state.keep.y - 1, hp: 6, maxHp: 6 }];
  const keepHpBefore = state.keepHp;
  const impacts = damageEnemy(state, waves, 3, 6, state.keep.x, state.keep.y - 2);
  assert.equal(waves.enemies.length, 0);
  assert.equal(state.keepHp, keepHpBefore, "roaches don't explode");
  assert.deepEqual(impacts, [
    { targetKind: "enemy", targetId: 3, x: state.keep.x, y: state.keep.y - 1, fromX: state.keep.x, fromY: state.keep.y - 2, amount: 6 },
  ]);
});
