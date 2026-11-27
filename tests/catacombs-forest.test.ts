// The Catacombs' way in (docs/CATACOMBS.md, step 3): the Mausoleum in the
// Tower's forest, entering a Catacomb from it, and the menu's Catacomb button.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { MODES } from "../src/modes.ts";
import { BLACKSMITH, MAUSOLEUM, OutsideWorld, TOURNAMENT_HALL } from "../src/outside.ts";

const center = MODES.tower.entranceX;
const door = { x: center + MAUSOLEUM.dx + 1, y: MAUSOLEUM.y + 1 };

test("the Mausoleum stands in the Tower forest's lower-right corner once the Catacombs are open", () => {
  const forest = new OutsideWorld(7, "tower", true, true, true, true, true);
  for (let dx = 0; dx < MAUSOLEUM.width; dx++) for (let dy = 0; dy < MAUSOLEUM.height; dy++) {
    const x = center + MAUSOLEUM.dx + dx, y = MAUSOLEUM.y + dy;
    assert.ok(forest.isMausoleum(x, y));
    assert.equal(forest.tile(x, y).kind, "wall");
    assert.equal(forest.isBlacksmith(x, y) || forest.isTournamentHall(x, y), false);
  }
  assert.ok(door.x + 2 < forest.width && door.x > center + TOURNAMENT_HALL.dx + TOURNAMENT_HALL.width, "right of the path and the Hall, inside the clearing");
  assert.ok(MAUSOLEUM.y + MAUSOLEUM.height < BLACKSMITH.y, "below the other buildings");
  // Its yard is clear of trees.
  for (let x = center + MAUSOLEUM.dx - 1; x <= center + MAUSOLEUM.dx + MAUSOLEUM.width; x++)
    for (let y = MAUSOLEUM.y - 1; y < MAUSOLEUM.y + MAUSOLEUM.height; y++)
      if (!forest.isMausoleum(x, y)) assert.equal(forest.tile(x, y).kind, "floor", `${x},${y}`);
  // The path stays open.
  for (let row = 0; row < 12; row++) assert.notEqual(forest.tile(center, row).kind, "wall");
  assert.equal(new OutsideWorld(7, "tower", true, true, true, true, false).isMausoleum(door.x, door.y), false, "not before they open");
  assert.equal(new OutsideWorld(7, "delve", true, true, true, true, true).isMausoleum(MODES.delve.entranceX + MAUSOLEUM.dx + 1, door.y), false, "never in the Delve's forest");
});

test("buying Reveal Catacombs raises the Mausoleum; tapping it enters the forest's tower number", () => {
  const save = defaults();
  save.goals.claimed[6] = [20];
  save.tower.inspiration = 40;
  save.tower.tiersOpen = 3;
  const g = new Game(save);
  g.newRun({ outside: true, seed: 7 });
  assert.equal(g.atMausoleum(door.x, door.y), false);
  assert.equal(g.catacombs.enter(1), null, "shut until the skill is owned");
  assert.ok(g.skills.buy("catacombs"));
  g.reshapeForest();
  assert.equal(g.atMausoleum(door.x, door.y), true);
  assert.equal(g.catacombs.run, null, "no run before the first entry");
  g.selectTier(3);
  assert.equal(g.save.tower.tier, 3);
  const run = g.catacombs.enter(g.save.tower.tier)!;
  assert.equal(run.hall, 1);
  assert.equal(g.catacombs.number, 3);
  assert.equal(g.catacombs.wouldLeave(3), null, "the same number keeps the run");
  assert.equal(g.catacombs.wouldLeave(2), null, "nothing to lose on Hall 1");
  run.hall = 42;
  assert.deepEqual(g.catacombs.wouldLeave(2), { number: 3, hall: 42 });
  assert.equal(g.catacombs.enter(3)!.hall, 42);
  assert.equal(g.catacombs.enter(2)!.hall, 1);
  assert.equal(g.catacombs.number, 2);
  // Inside a climb there is no Mausoleum to tap.
  g.newRun({ seed: 9 });
  assert.ok(!g.atMausoleum(door.x, door.y));
});

test("Access to Everything shows the Mausoleum and opens the Catacombs", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 7 });
  g.setAccessAll(true);
  assert.equal(g.atMausoleum(door.x, door.y), true);
  assert.ok(g.catacombs.open);
});
