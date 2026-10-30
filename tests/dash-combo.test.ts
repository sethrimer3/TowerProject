import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { COMBO_PERCENT, predict } from "../src/combat.ts";
import { decode } from "../src/save/save.ts";
import { TREES, skillAvailable } from "../src/progression/skill-trees.ts";
import { UPGRADES, cost } from "../src/progression/upgrades.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { Enemy, Tile } from "../src/entities.ts";
import { playedSave } from "./first-skills.ts";

const rat = (hp = 1): Enemy => ({ name: "rat", hp, attack: 1, defense: 0, tier: 0, strength: "normal" });
const foe = (hp?: number): Tile => ({ kind: "enemy", enemy: rat(hp) });

/** A Tower corridor along the bottom row, the hero at its west end with ATK
 * 10: `cells` puts what stands on it by x, the rest is floor. Dash and its
 * research are owned, and Dash Combo unless `skill` is false. */
function corridor(cells: Record<number, Tile>, skill = true) {
  const g = new Game(playedSave());
  g.save.upgrades.inspirationUndos = 1;
  g.save.upgrades.dash = 1;
  g.save.archives.levels.dash = 25;
  if (skill) g.save.upgrades.dashCombo = 1;
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let x = 0; x < 30; x++) w.cells.set(`${x},0`, cells[x] ?? { kind: "floor" });
  w.torches = [];
  Object.assign(g.run.player, { x: 0, y: 0, attack: 10, hp: 100, maxHp: 100 });
  g.run.hand = ["monster"];
  return g;
}
const step = (g: Game, dx = 1) => assert.ok(g.move(dx, 0));

test("Dash Combo is a 1 Breakthrough skill split off Dash, down and left of it", () => {
  const row = UPGRADES.find((u) => u.id === "dashCombo")!, nodes = TREES.find((t) => t.id === "breakthrough")!.nodes, node = nodes.find((n) => n.id === "dashCombo")!;
  assert.deepEqual([row.max, row.currency, cost("dashCombo", 0)], [1, "breakthrough", 1]);
  assert.deepEqual([node.x, node.y, node.requires], [70, 85, ["dash"]]);
  assert.match(row.description!, new RegExp(`\\+${COMBO_PERCENT}% ATK`));
  const levels = { ...playedSave().upgrades, trainers: 1, breakthrough: 1, questForKnowledge: 1, moveSpeed: 1 };
  assert.equal(skillAvailable("dashCombo", levels), false, "not before Dash");
  assert.ok(skillAvailable("dashCombo", { ...levels, dash: 1 }));
});

test("a dash that lands beside an enemy starts the combo, and the fight next turn strikes at +20%", () => {
  // 11 HP takes 2 strikes of ATK 10, and 1 of ATK 12.
  const g = corridor({ 5: foe(11) });
  g.autoTurn();
  assert.equal(g.run.player.x, 4, "the dash stops before the rat");
  assert.deepEqual(g.run.combo, { next: 1, idle: 1 });
  assert.equal(g.comboShown, 0, "nothing shows until the fight begins");
  g.autoTurn();
  assert.equal(g.world.tile(5, 0).kind, "floor");
  assert.equal(g.run.player.hp, 100, "felled by the first strike, before it struck back");
  assert.equal(g.run.player.attack, 10, "the hero's own ATK is untouched");
  assert.equal(g.comboShown, 1);
  assert.deepEqual(g.run.combo, { next: 2, idle: 0 });
  const plain = corridor({ 5: foe(11) }, false);
  plain.autoTurn();
  plain.autoTurn();
  assert.equal(plain.run.combo, undefined, "nothing without the skill");
  assert.ok(plain.run.player.hp < 100, "two strikes, and one back");
});

test("a fight within two turns of the last raises the Combo, and two turns without one end it", () => {
  // Next turn, then the second turn after: each fight's ATK rises with the Combo.
  const g = corridor({ 5: foe(11), 6: foe(13), 8: foe(15), 11: foe() });
  g.autoTurn();
  g.autoTurn();
  step(g);
  assert.equal(g.comboShown, 2, "the fight right after, felled by ATK 14");
  assert.equal(g.run.player.hp, 100);
  step(g);
  assert.deepEqual([g.comboShown, g.run.combo?.idle], [2, 1], "one step keeps it");
  step(g);
  assert.equal(g.comboShown, 3, "the second turn after, felled by ATK 16");
  assert.equal(g.run.player.hp, 100);
  step(g);
  step(g);
  assert.equal(g.run.combo, undefined, "two turns without a fight reset it");
  assert.equal(g.comboShown, 0);
  step(g);
  assert.equal(g.run.combo, undefined, "the next fight isn't chained");
});

test("only a dash starts a combo: a walked fight doesn't", () => {
  const g = corridor({ 2: foe() });
  step(g);
  step(g);
  assert.equal(g.run.combo, undefined);
});

test("a dash beside an enemy the hero then leaves alone is gone after that turn, never shown", () => {
  const g = corridor({ 5: foe() });
  g.autoTurn();
  assert.ok(g.run.combo);
  step(g, -1);
  assert.equal(g.run.combo, undefined);
});

test("a dash that lands beside an enemy on a chain's last turn starts it again at 1", () => {
  const g = corridor({ 1: foe(), 8: foe() });
  g.run.combo = { next: 4, idle: 1 };
  step(g);
  assert.equal(g.run.combo?.next, 5);
  step(g);
  assert.equal(g.run.combo?.idle, 1);
  g.autoTurn();
  assert.equal(g.run.player.x, 7, "a dash on the chain's last turn");
  assert.deepEqual(g.run.combo, { next: 1, idle: 1 });
});

test("previews and planners don't count the combo: the step does, even past an impervious DEF", () => {
  const armored: Tile = { kind: "enemy", enemy: { ...rat(1), defense: 10 } };
  const g = corridor({ 1: armored });
  assert.ok(predict(g.run.player, armored.enemy!).impervious, "ATK 10 can't hurt it");
  assert.equal(g.move(1, 0), false, "blocked without a combo");
  g.run.combo = { next: 1, idle: 0 };
  assert.ok(predict(g.run.player, armored.enemy!).impervious, "the preview goes without");
  assert.ok(predict(g.fighter, armored.enemy!).impervious === false, "the fight has it");
  step(g);
  assert.equal(g.world.tile(1, 0).kind, "floor");
});

test("undo takes the combo back with the run", () => {
  const g = corridor({ 1: foe(), 3: foe() });
  g.run.combo = { next: 2, idle: 0 };
  step(g);
  assert.equal(g.run.combo?.next, 3);
  g.undo();
  assert.deepEqual(g.run.combo, { next: 2, idle: 0 });
});

test("the combo carries across a Tower floor and ends with the run", () => {
  const g = corridor({ 1: { kind: "stairs" } });
  g.run.combo = { next: 3, idle: 0 };
  step(g);
  assert.equal(g.run.height, 1, "climbed");
  assert.deepEqual(g.run.combo, { next: 3, idle: 1 });
  g.newRun({ seed: 7 });
  assert.equal(g.run.combo, undefined);
});

test("the Delve's fights count the combo too", () => {
  const s = playedSave();
  s.upgrades.delve = 1;
  const g = new Game(s);
  g.switchMode("delve");
  g.newRun({ seed: 3 });
  const p = g.run.player, way = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => {
    const at = g.world.step(p.x, p.y, dx, dy);
    return at && g.world.tile(at.x, at.y).kind === "floor";
  })!, at = g.world.step(p.x, p.y, way[0], way[1])!;
  Object.assign(p, { attack: 10, hp: 100, maxHp: 100 });
  // 11 HP takes 2 strikes of ATK 10, and 1 of ATK 12.
  g.run.changes[`${at.x},${at.y}`] = foe(11);
  g.run.combo = { next: 1, idle: 0 };
  assert.ok(g.move(way[0], way[1]));
  assert.equal(g.run.player.hp, 100, "felled by the first strike");
  assert.equal(g.run.combo?.next, 2);
});

test("a reload keeps the combo, and a bad one is dropped", () => {
  const g = corridor({});
  g.run.combo = { next: 3, idle: 1 };
  const kept = decode(JSON.stringify(g.save));
  assert.deepEqual(kept.tower.run?.combo, { next: 3, idle: 1 });
  const bad = JSON.parse(JSON.stringify(g.save));
  bad.tower.run.combo = { next: 0, idle: 9 };
  assert.equal(decode(JSON.stringify(bad)).tower.run?.combo, undefined);
});

test("the meter shows the fight's own Combo while it plays out", () => {
  const g = corridor({ 1: foe(50) });
  g.run.combo = { next: 2, idle: 0 };
  g.fights.playsFights = true;
  step(g);
  assert.ok(g.fights.encounter);
  assert.equal(g.comboShown, 2);
  g.fights.finish();
  assert.equal(g.comboShown, 2);
  assert.equal(g.run.combo?.next, 3);
});
