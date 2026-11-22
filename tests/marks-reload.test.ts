// An enemy left in a run's changes with nothing on it: a hit that does no
// damage writes it as it was, and a stun wears off to it. Its run must
// outlive a reload (decoding once refused the enemy and dropped the run).
import { test } from "node:test";
import assert from "node:assert/strict";
import { stunWorn } from "../src/enemies/ranged.ts";
import { random } from "../src/random.ts";
import { decode, defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import type { Mode } from "../src/entities.ts";

function floor(mode: Mode) {
  const g = new Game(defaults(), random(3));
  if (mode === "delve") g.switchMode("delve");
  g.newRun({ seed: 3 });
  let found: { x: number; y: number } | undefined;
  for (let y = g.run.player.y; y < g.run.player.y + 18 && !found; y++)
    for (let x = 0; x < g.world.width && !found; x++) if (g.world.tile(x, y).kind === "enemy") found = { x, y };
  assert.ok(found, `${mode} has an enemy`);
  return { g, at: found, key: `${found.x},${found.y}` };
}

for (const mode of ["tower", "delve"] as const) {
  test(`${mode}: a hit of no damage doesn't cost the run on a reload`, () => {
    const { g, at, key } = floor(mode), before = g.world.tile(at.x, at.y);
    g.world.wound!(at.x, at.y, 0);
    const back = new Game(decode(JSON.stringify(g.save)), random(3));
    if (back.mode !== mode) back.switchMode(mode);
    assert.equal(back.run.seed, 3);
    assert.ok(back.run.changes[key]);
    assert.deepEqual(back.world.tile(at.x, at.y).enemy, before.enemy);
  });

  test(`${mode}: a stun worn off an unwounded enemy doesn't cost the run on a reload`, () => {
    const { g, at, key } = floor(mode);
    g.world.markStun!(at.x, at.y, 1);
    g.run.changes[key] = stunWorn(g.run.changes[key]!);
    assert.equal(decode(JSON.stringify(g.save))[mode].run?.seed, 3);
  });
}

test("a Slime's stun and linger worn off don't cost the run on a reload", () => {
  const save = defaults();
  save.familiars.slime = { levels: [0, 0, 0, 15] };
  const g = new Game(save, random(3));
  g.newRun({ seed: 3 });
  g.run.familiars = { slime: { turns: 0, timer: 1 } };
  for (let turn = 1; turn <= 12; turn++) {
    (g as any).holdTurn();
    assert.equal(decode(JSON.stringify(g.save)).tower.run?.seed, 3, `turn ${turn}`);
  }
  assert.ok(Object.values(g.run.changes).some((t) => t.kind === "enemy" && !t.stun && !t.linger), "one wore off");
});
