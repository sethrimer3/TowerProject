import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { point } from "../src/entities.ts";
import { TOWER_SECTION, TOWER_START_X } from "../src/config.ts";
import { generateTowerFloor } from "../src/tower/index.ts";

function climb(g: Game) {
  g.run.changes[point(g.run.player.x, g.run.player.y + 1)] = { kind: "stairs" };
  g.move(0, 1, true);
}

test("each section's first room has no way down; other rooms do", () => {
  for (const room of [10, 20]) assert.notEqual(generateTowerFloor(7, room).cells.get(point(TOWER_START_X, 0))?.kind, "stairsDown");
  for (const room of [1, 9, 11]) assert.equal(generateTowerFloor(7, room).cells.get(point(TOWER_START_X, 0))?.kind, "stairsDown");
});

test("crossing into a new section resets ATK/DEF, records start HP, and blocks descent", () => {
  const g = new Game(defaults());
  const base = { attack: g.run.player.attack, defense: g.run.player.defense };
  g.run.height = TOWER_SECTION - 1;
  g.enterTowerFloor();
  g.run.player.attack += 6;
  g.run.player.defense += 3;
  g.run.player.hp = 90;
  climb(g);
  assert.equal(g.run.height, TOWER_SECTION);
  assert.equal(g.run.player.attack, base.attack);
  assert.equal(g.run.player.defense, base.defense);
  assert.equal(g.save.tower.sectionHp[1], 90);
  g.descendTowerRoom();
  assert.equal(g.run.height, TOWER_SECTION);
  // A worse arrival never lowers the record.
  g.run.height = TOWER_SECTION - 1;
  g.enterTowerFloor();
  g.run.player.hp = 40;
  climb(g);
  assert.equal(g.save.tower.sectionHp[1], 90);
});

test("new ascents begin at the chosen unlocked section with its best HP", () => {
  const g = new Game(defaults());
  assert.equal(g.setStartSection(1), false);
  g.save.tower.sectionHp[1] = 77;
  g.newRun(true);
  assert.ok(g.setStartSection(1));
  // Still on the forest path, so the pending run moves at once.
  assert.equal(g.run.height, TOWER_SECTION);
  assert.equal(g.run.player.hp, 77);
  g.newRun();
  assert.equal(g.run.height, TOWER_SECTION);
  assert.equal(g.run.player.hp, 77);
  const loaded = decode(JSON.stringify(g.save));
  assert.equal(loaded.tower.startSection, 1);
  assert.equal(loaded.tower.sectionHp[1], 77);
});
