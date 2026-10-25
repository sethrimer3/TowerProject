import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/state.ts';
import { defaults } from '../src/save/save.ts';
import { RoomWorld } from '../src/tower/room-world.ts';
function arena() {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1; // undo needs Rehearsed steps
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: 'floor' });
  w.cells.set('4,4', { kind: 'stairs' });
  g.run.player.x = 0; g.run.player.y = 0;
  return g;
}
test('milestones are immediate, incremental and cannot be farmed with undo or reruns', () => {
  const g = arena();
  g.advanceTowerRoom(); assert.equal(g.save.tower.inspiration, 1);
  g.advanceTowerRoom(); assert.equal(g.save.tower.inspiration, 2);
  g.newRun(); g.advanceTowerRoom(); assert.equal(g.save.tower.inspiration, 2);
  // The Delve's depth pays nothing: it only scores a tournament.
  g.switchMode('delve');
  for (const height of [9, 10, 19, 20, 10, 30]) {
    g.run.height = height; assert.equal(g.recordProgress(), 0); assert.equal(g.save.breakthrough, 0);
  }
  assert.equal(g.save.delve.reached, 30, "the record still rises");
  g.finish('test'); assert.equal(g.save.breakthrough, 0);
});
test('area chests persist open, undo closed, and never pay', () => {
  const g = arena(), w = g.world as RoomWorld;
  g.run.changes['1,0'] = { kind: 'reward', tier: 'silver' };
  const before = g.save.tower.inspiration;
  assert.ok(g.move(1, 0));
  assert.equal(g.world.tile(1, 0).kind, 'openedChest');
  assert.equal(g.save.tower.inspiration, before);
  assert.ok(g.undo());
  assert.equal(g.world.tile(1, 0).kind, 'reward');
  assert.ok(g.move(1, 0));
  assert.equal(g.world.tile(1, 0).kind, 'openedChest');
  assert.equal(g.save.tower.inspiration, before);
});
test('delve approach movement does not award physical Y as progression', () => {
  const g = new Game(defaults());
  g.save.upgrades.breakthrough = 1;
  g.switchMode('delve');
  // Keep the two northward cells deterministic instead of relying on a
  // Date.now-derived map that can occasionally place a wall in the route.
  g.newRun({ seed: 3 });
  assert.equal(g.run.player.y, 0);
  assert.equal(g.run.maxHeight, 0);

  // Manually step up (north, dy = +1)
  g.move(0, 1);
  assert.equal(g.run.player.y, 1);
  assert.equal(g.run.maxHeight, 0);

  g.move(0, 1);
  assert.equal(g.run.player.y, 2);
  assert.equal(g.run.maxHeight, 0);

  // Move back down (south, dy = -1)
  g.move(0, -1);
  assert.equal(g.run.player.y, 1);
  assert.equal(g.run.maxHeight, 0); // Run best stays 2 even as current depth goes down to 1
});
