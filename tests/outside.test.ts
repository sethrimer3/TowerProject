import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save.ts";
import { OutsideWorld, ENTRANCE_Y, weatherForRoll, outsideWeather } from "../src/outside.ts";
import { lightningOpacity } from "../src/weather.ts";
import { chooseStep } from "../src/automation.ts";

for (const mode of ["tower", "delve"] as const) {
  test(`${mode}: death, forest persistence, entry, Undo and Revive preserve progression`, () => {
    const g = new Game(defaults());
    g.save.upgrades.delve = 1;
    g.switchMode(mode);
    g.save.upgrades.revive = 1;
    const before = g.snapshot();
    const originalTile = g.world.tile.bind(g.world);
    g.world.tile = (x, y) => y === 1 && x === g.run.player.x
      ? { kind: "enemy", enemy: { name: "Fatal guardian", hp: 9999, attack: 9999, defense: 9999, tier: 3 } }
      : originalTile(x, y);
    g.move(0, 1);
    assert.ok(g.summary?.dead);
    assert.ok(g.run.outside);
    assert.ok(g.world instanceof OutsideWorld);
    assert.equal(g.run.height, 0);
    assert.ok(g.undo());
    assert.deepEqual(g.run, before.run);
    assert.ok(!(g.world instanceof OutsideWorld));
    g.newRun(true);
    g.move(0, 1);
    const loaded = new Game(decode(JSON.stringify(g.save)));
    loaded.switchMode(mode);
    assert.ok(loaded.world instanceof OutsideWorld);
    assert.equal(loaded.run.player.y, 1);
    assert.equal(outsideWeather(loaded.run.seed), outsideWeather(g.run.seed));
    const beforeWalk = loaded.run.player.y;
    loaded.walkTo(loaded.run.player.x, ENTRANCE_Y);
    assert.ok(loaded.route.length);
    for (let i = 0; i < 20 && loaded.route.length; i++) loaded.routeStep();
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
    const g = new Game(defaults()); g.save.upgrades.delve = 1; g.switchMode(mode); g.newRun(true);
    for (let i = 0; i < 25 && g.run.outside; i++) {
      const step = chooseStep(g); assert.ok(step); assert.ok(g.move(step.dx, step.dy, false));
      assert.equal(g.run.height, 0);
    }
    assert.equal(g.run.outside, false);
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
