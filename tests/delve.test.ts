import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDelve, flood } from '../src/delve/analyzer.ts';
import { region, depthAt } from '../src/delve/labyrinth.ts';
import { World, generate, LAYOUT_VERSION } from '../src/generation.ts';
import { Game } from '../src/state.ts';
import { defaults, decode } from '../src/save.ts';
import { point } from '../src/entities.ts';

test('600 regions have connected geometry and exactly one unbypassable milestone connection', () => {
  const quality = { good: 0, poor: 0, contextual: 0 }; let loops = 0;
  for (let seed = 0; seed < 60; seed++) for (let area = 0; area < 10; area++) {
    const a = analyzeDelve(seed, area);
    assert.ok(a.connected, JSON.stringify(a)); assert.equal(a.gateBypass, false, JSON.stringify(a));
    assert.ok(a.pastAboveGate && a.futureBelowGate, 'geometry must overlap the physical milestone');
    assert.ok(a.deadEnds >= 2); loops += a.loops;
    for (const k of ['good', 'poor', 'contextual'] as const) quality[k] += a.qualities[k];
  }
  assert.ok(loops > 200); for (const count of Object.values(quality)) assert.ok(count > 500);
});
test('generation is deterministic, order independent and extends past the old depth cap', () => {
  const before = generate(12, 2); generate(12, 6000); assert.deepEqual(generate(12, 2), before);
  assert.ok([...generate(12, 6000).values()].some(t => t.kind !== 'wall'));
});
test('costs on terminal branches really separate rewards from the main labyrinth', () => {
  for (let seed = 0; seed < 40; seed++) for (const area of [0, 1, 3]) {
    const r = region(seed, area);
    for (const n of r.nodes.filter(n => n.pattern?.gates.length)) {
      const e = r.edges.find(e => e.a === n.id || e.b === n.id)!;
      const route = e.b === n.id ? e.path : [...e.path].reverse();
      const gates = route.filter(p => ['enemy', 'door'].includes(r.cells.get(point(p.x, p.y))?.kind ?? ''));
      assert.equal(gates.length, n.pattern!.gates.length);
      for (const gate of gates) {
        const visited = flood(r.cells, point(r.entry.x, r.entry.y), point(gate.x, gate.y));
        assert.ok(!visited.has(point(n.x, n.y)), `bypassed ${n.pattern!.id} seed ${seed}`);
      }
    }
  }
});
test('milestone crossing seals behind the player, persists, and prevents undo across the seal', () => {
  const g = new Game(defaults()); g.save.upgrades.delve = 1; g.switchMode('delve');
  g.run.seed = 42; g.run.outside = false; g.run.layoutVersion = LAYOUT_VERSION;
  g.world = new World(42, g.run.changes);
  const gate = region(42, 0).gate;
  Object.assign(g.run.player, { x: gate.x, y: gate.y - 1 });
  assert.ok(g.move(0, 1)); assert.equal(g.run.height, 100); assert.equal(g.run.delveMilestone, 1);
  assert.equal(g.world.tile(gate.x, gate.y - 1).kind, 'wall'); assert.equal(g.undo(), false);
  assert.ok(g.move(0, 1)); assert.equal(g.world.step(gate.x, gate.y + 1, 0, -1), null);
  const restored = new Game(decode(JSON.stringify(g.save))); restored.switchMode('delve');
  assert.equal(restored.run.delveMilestone, 1);
  assert.equal(restored.world.tile(gate.x, gate.y - 1).kind, 'wall');
  assert.notEqual(restored.world.tile(restored.run.player.x, restored.run.player.y).kind, 'wall');
});
test('physical false ascent cannot award the next official milestone', () => {
  const r = region(42, 0), high = r.nodes.reduce((a, b) => a.y > b.y ? a : b);
  assert.ok(high.y > r.gate.y); assert.ok(depthAt(42, high.x, high.y, 0) < 100);
});
