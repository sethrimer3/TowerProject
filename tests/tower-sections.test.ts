import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { point } from "../src/entities.ts";
import { TOWER_SECTION, TOWER_START_X } from "../src/config.ts";
import { generateTowerFloor } from "../src/tower/index.ts";

/** Stands on a fresh floor `height`. */
function standOn(g: Game, height: number) {
  g.run.height = height;
  g.run.changes = {};
  g.loadMode();
}
function climb(g: Game) {
  g.run.changes[point(g.run.player.x, g.run.player.y + 1)] = { kind: "stairs" };
  g.move(0, 1, true);
}

test("every room's entrance is open floor, with no way down", () => {
  for (const room of [0, 1, 9, 10, 11, 20]) assert.equal(generateTowerFloor(7, room).cells.get(point(TOWER_START_X, 0))?.kind, "floor");
});

test("crossing into a new section keeps every stat", () => {
  const g = new Game(defaults());
  standOn(g, TOWER_SECTION - 1);
  g.run.player.attack += 6;
  g.run.player.defense += 3;
  g.run.player.hp = 90;
  const before = { ...g.run.player };
  climb(g);
  assert.equal(g.run.height, TOWER_SECTION);
  assert.equal(g.run.player.attack, before.attack);
  assert.equal(g.run.player.defense, before.defense);
  assert.equal(g.run.player.hp, 90);
});
