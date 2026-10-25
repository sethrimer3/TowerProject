import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save/save.ts";
import { OutsideWorld, ENTRANCE_Y, OUTSIDE_SIZE, OUTSIDE_START_Y, weatherForRoll, outsideWeather, onPath, roadsOf, BLACKSMITH, TOURNAMENT_HALL } from "../src/outside.ts";
import { lightningOpacity } from "../src/render/weather.ts";
import { chooseStep } from "../src/automation.ts";
import { TOWER_UNLOCK_FLOOR } from "../src/goals.ts";

for (const mode of ["tower", "delve"] as const) {
  test(`${mode}: death, forest persistence, entry and Undo preserve progression`, () => {
    const g = new Game(defaults());
    g.save.upgrades.inspirationUndos = 1; // undo needs Rehearsed steps
    g.save.upgrades.breakthrough = 1;
    g.switchMode(mode);
    const before = g.snapshot();
    // Lethal but damageable (low defense so it's not impervious), on the
    // board as it stands (undo builds it again).
    const guard = () => {
      const originalTile = g.world.tile.bind(g.world);
      g.world.tile = (x, y) => y === 1 && x === g.run.player.x
        ? { kind: "enemy", enemy: { name: "Fatal guardian", hp: 999999, attack: 9999, defense: 0, tier: 3 } }
        : originalTile(x, y);
    };
    guard();
    g.move(0, 1);
    assert.ok(g.fallen);
    assert.ok(g.undo());
    // The damage stays on the floor's record, as after any undo, and the undo is spent.
    const undone = { ...before.run, undosUsed: 1 };
    assert.deepEqual(g.run, mode === "tower" ? { ...undone, damaged: true } : undone);
    guard();
    g.move(0, 1);
    assert.ok(g.acceptDefeat());
    assert.ok(g.run.outside);
    assert.ok(g.world instanceof OutsideWorld);
    assert.equal(g.run.height, 0);
    g.newRun({ outside: true });
    g.move(0, 1);
    const loaded = new Game(decode(JSON.stringify(g.save)));
    loaded.switchMode(mode);
    assert.ok(loaded.world instanceof OutsideWorld);
    assert.equal(loaded.run.player.y, OUTSIDE_START_Y + 1);
    assert.equal(outsideWeather(loaded.run.seed), outsideWeather(g.run.seed));
    const beforeWalk = loaded.run.player.y;
    loaded.walkTo(loaded.run.player.x, ENTRANCE_Y);
    assert.ok(loaded.route.length);
    for (let i = 0; i < 20 && loaded.route.length; i++) loaded.routeStep();
    // The Delve's cave asks for a tournament run instead (forest-swap.test.ts).
    if (mode === "delve") return assert.ok(loaded.run.outside && loaded.tournamentRequested === "ticket");
    assert.equal(loaded.run.outside, false);
    assert.equal(loaded.run.height, 0);
    assert.equal(loaded.run.player.y, 0);
    assert.equal(loaded.run.kills, 0);
    // A tap-to-walk route is one undo step, however many tiles it crossed.
    assert.ok(loaded.undo());
    assert.ok(loaded.world instanceof OutsideWorld);
    assert.equal(loaded.run.player.y, beforeWalk);
    loaded.walkTo(loaded.run.player.x, ENTRANCE_Y);
    for (let i = 0; i < 20 && loaded.route.length; i++) loaded.routeStep();
    assert.equal(loaded.run.outside, false);
  });
  test(`${mode}: automation finds the forest entrance without farming height`, () => {
    const g = new Game(defaults()); g.save.upgrades.breakthrough = 1; g.switchMode(mode); g.newRun({ outside: true });
    for (let i = 0; i < 25 && g.run.outside && !g.tournamentRequested; i++) {
      const step = chooseStep(g); assert.ok(step); assert.ok(g.move(step.dx, step.dy, false));
      assert.equal(g.run.height, 0);
    }
    // The Delve's cave asks for a tournament run instead of going in.
    if (mode === "delve") assert.ok(g.run.outside && g.tournamentRequested);
    else assert.equal(g.run.outside, false);
  });
}

test("weather uses exact 40/30/20/10 intervals; lightning is slow and faint", () => {
  const counts = { cloudy: 0, sunny: 0, rain: 0, storm: 0 };
  for (let i = 0; i < 1000; i++) counts[weatherForRoll((i + 0.5) / 1000)]++;
  assert.deepEqual(counts, { cloudy: 400, sunny: 300, rain: 200, storm: 100 });
  assert.equal(lightningOpacity(-1), 0);
  assert.equal(lightningOpacity(5), 0);
  assert.equal(lightningOpacity(2), 0.015);
  for (let t = 0; t <= 4; t += 0.01) {
    assert.ok(lightningOpacity(t) <= 0.015);
    assert.ok(Math.abs(lightningOpacity(t + 0.01) - lightningOpacity(t)) < 0.00012);
  }
});

test("the crossroads' road goes on to each building's door once that building stands", () => {
  const world = new OutsideWorld(7, "tower", true, true), center = world.entranceX, row = OUTSIDE_START_Y;
  const roadAt = (x: number, roads?: { blacksmith: boolean; hall: boolean }) =>
    onPath({ x, y: row, seed: 7, center, roads });
  const door = { blacksmith: center + BLACKSMITH.dx + 1, hall: center + TOURNAMENT_HALL.dx + 1 };
  for (let x = door.blacksmith; x <= door.hall; x++) {
    const near = Math.abs(x - center) <= 1;
    assert.equal(roadAt(x), near, "no road past the crossroads before a building stands");
    assert.equal(roadAt(x, { blacksmith: true, hall: false }), near || x < center, "the Blacksmith's side");
    assert.equal(roadAt(x, { blacksmith: false, hall: true }), near || x > center, "the Hall's side");
    assert.ok(roadAt(x, { blacksmith: true, hall: true }), "both roads form one row from door to door");
  }
  assert.ok(!roadAt(door.blacksmith - 1, { blacksmith: true, hall: true }) && !roadAt(door.hall + 1, { blacksmith: true, hall: true }), "and stop at the doors");
  for (let x = door.blacksmith; x <= door.hall; x++) assert.equal(world.tile(x, row).kind, "floor", "the road is walkable");
});

for (const mode of ["tower", "delve"] as const)
  test(`${mode}: the crossroads' road runs out to the forest's edge toward each opened tier the arrows can reach`, () => {
    const g = new Game(defaults());
    g.save.upgrades.breakthrough = 1;
    g.switchMode(mode);
    const row = OUTSIDE_START_Y;
    const roadTo = (edge: number) => {
      const world = g.world as OutsideWorld, center = world.entranceX, roads = roadsOf(world);
      // Out to the view's edge: the forest shows OUTSIDE_SIZE columns, past the Tower board's right edge.
      const last = Math.max(world.width, OUTSIDE_SIZE) - 1;
      const xs = edge < center ? Array.from({ length: center }, (_, x) => x) : Array.from({ length: last - center }, (_, i) => center + 1 + i);
      return xs.every(x => world.tile(x, row).kind === "floor" && onPath({ x, y: row, seed: world.seed, center, roads }));
    };
    const right = g.world.width - 1;
    g.newRun({ outside: true });
    assert.deepEqual([roadTo(0), roadTo(right)], [false, false], "one tier open: no roads out");
    g.save[mode].tiersOpen = 3;
    assert.ok(g.selectTier(2));
    assert.deepEqual([roadTo(0), roadTo(right)], [true, true], "the middle tier leads both ways");
    assert.ok(g.selectTier(3));
    assert.deepEqual([roadTo(0), roadTo(right)], [true, false], "the last open tier leads only back");
    assert.ok(g.selectTier(1));
    assert.deepEqual([roadTo(0), roadTo(right)], [false, true], "the first leads only on");
  });

test("claiming the Goal that opens the next tower lays the road out to it in the forest at once", () => {
  const g = new Game(defaults());
  g.save.tower.best = g.save.tower.reached = TOWER_UNLOCK_FLOOR;
  g.newRun({ outside: true, seed: 7 });
  assert.equal(roadsOf(g.world)?.next, false, "no road out before Tower II opens");
  assert.equal(g.claimGoal(1, TOWER_UNLOCK_FLOOR, false)?.kind, "tower");
  assert.equal(roadsOf(g.world)?.next, true, "the forest the claim was made from is redrawn with the road");
});
