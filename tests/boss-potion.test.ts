// Boss Potion Drop (docs/gameplay/towers-areas-goals.md): Tower III's floor 200
// Goal opens a one-level Archives project; once done, each boss killed gives
// the hero a percent potion, drunk at once. A Greater Boss gives none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { random } from "../src/random.ts";
import { checkpoint } from "../src/goals.ts";
import { RESEARCH } from "../src/progression/archives.ts";
import { potionRestores } from "../src/step-effects.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { Enemy } from "../src/entities.ts";

const boss: Enemy = { name: "Warden", hp: 1, attack: 0, defense: 0, tier: 1, strength: "boss" };

/** A Tower run on an open floor with `enemy` east of the hero, at 100 of 1,000 HP, Boss Potion Drop researched if `researched`. */
function arena(enemy: Enemy, researched = true) {
  const s = defaults();
  if (researched) s.archives.levels.bossPotion = 1;
  const g = new Game(s, random(5));
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("1,0", { kind: "enemy", enemy: { ...enemy } });
  Object.assign(g.run.player, { x: 0, y: 0, attack: 100, defense: 0, hp: 100, maxHp: 1000 });
  return g;
}

test("Tower III's floor 200 Goal opens Boss Potion Drop: one level, 1 billion Gold and 11,667 minutes", () => {
  assert.deepEqual(checkpoint(3, 200)?.reward, { kind: "unlock", unlock: "bossPotion" });
  const project = RESEARCH.bossPotion;
  assert.ok(project.requires.some((r) => "goalUnlock" in r && r.goalUnlock === "bossPotion"));
  assert.equal(project.levels.length, 1);
  assert.deepEqual([project.levels[0]!.gold, Math.round(project.levels[0]!.hours * 60)], [1e9, 11667]);
});

test("a boss's kill heals the hero as a percent potion would, rising where it fell", () => {
  const g = arena(boss), heal = potionRestores({ kind: "potion", color: "red" }, 1000, g.stepRules);
  assert.ok(heal > 0);
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, 100 + heal);
  assert.deepEqual([g.lastHeal?.from, g.lastHeal?.to, g.lastHeal?.x, g.lastHeal?.y], [100, 100 + heal, 1, 0]);
});

test("no potion from a Greater Boss, an ordinary enemy, or before the research", () => {
  for (const g of [arena({ ...boss, strength: "greaterBoss" }), arena({ ...boss, strength: "normal" }), arena(boss, false)]) {
    assert.ok(g.move(1, 0));
    assert.equal(g.run.player.hp, 100);
    assert.equal(g.lastHeal, null);
  }
});

test("a potion heals no further than the hero lacks", () => {
  const g = arena(boss);
  g.run.player.hp = 1000;
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, 1000);
  assert.equal(g.lastHeal, null);
});
