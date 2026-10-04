import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDelve, flood } from '../src/delve/analyzer.ts';
import { region, depthAt } from '../src/delve/labyrinth.ts';
import { World, generate } from '../src/delve/world.ts';
import { Game } from '../src/state.ts';
import { defaults, decode } from '../src/save.ts';
import { point } from '../src/entities.ts';
import { FULL } from './test-size.ts';

// 600 regions in CI, 150 locally; the totals below scale with the sample.
const SEEDS = FULL ? 60 : 15;
test(`${SEEDS * 10} regions have connected geometry and exactly one unbypassable milestone connection`, () => {
  const quality = { good: 0, poor: 0, contextual: 0 }; let loops = 0;
  for (let seed = 0; seed < SEEDS; seed++) for (let area = 0; area < 10; area++) {
    const a = analyzeDelve(seed, area);
    assert.ok(a.connected, JSON.stringify(a)); assert.equal(a.gateBypass, false, JSON.stringify(a));
    assert.ok(a.pastAboveGate && a.futureBelowGate, 'geometry must overlap the physical milestone');
    assert.equal(a.seamRows, 0, `solid wall row near milestone ${JSON.stringify(a.gate)}`);
    assert.ok(a.falseAscent, 'the old-area tongue must end in a false ascent');
    assert.ok(a.deadEnds >= 2); loops += a.loops;
    for (const k of ['good', 'poor', 'contextual'] as const) quality[k] += a.qualities[k];
  }
  assert.ok(loops > SEEDS * 10 / 3); for (const count of Object.values(quality)) assert.ok(count > SEEDS * 25 / 3);
});
test('generation is deterministic, order independent and extends past the old depth cap', () => {
  const before = generate(12, 2); generate(12, 6000); assert.deepEqual(generate(12, 2), before);
  assert.ok([...generate(12, 6000).values()].some(t => t.kind !== 'wall'));
});
test('costs on terminal branches really separate rewards from the main labyrinth', () => {
  for (let seed = 0; seed < 40; seed++) for (const area of [0, 1, 3]) {
    const r = region(seed, area);
    for (const n of r.nodes.filter(n => n.pattern?.gates.length && !n.fork)) {
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
test('a forked pocket is reached by either lane and by nothing else', () => {
  let forks = 0;
  for (let seed = 0; seed < 40; seed++) for (const area of [0, 1, 3]) {
    const r = region(seed, area), from = point(r.entry.x, r.entry.y);
    for (const n of r.nodes.filter(n => n.fork)) {
      forks++;
      const [a, b] = n.lanes!.map(lane => lane.map(p => point(p.x, p.y)));
      const pocket = point(n.x, n.y);
      // Each lane alone leads in: block every tile of the other.
      for (const [open, shut] of [[a, b], [b, a]]) {
        const cells = new Map(r.cells);
        for (const k of shut) cells.delete(k);
        assert.ok(flood(cells, from).has(pocket), `seed ${seed} area ${area}: lane ${open} doesn't lead in`);
      }
      const cells = new Map(r.cells);
      for (const k of [...a, ...b]) cells.delete(k);
      assert.ok(!flood(cells, from).has(pocket), `seed ${seed} area ${area}: forked pocket has a bypass`);
      // Its lanes hold what the fork asked for, from the neighbour's side.
      n.fork!.lanes.forEach((lane, i) => lane.forEach((step, k) => {
        const want = step.kind === 'reward' ? step.reward.kind : ['steel', 'heart'].includes(step.kind) ? 'door' : step.kind;
        assert.equal(r.cells.get([a, b][i][k])?.kind, want);
      }));
    }
  }
  assert.ok(forks > 20, `only ${forks} forked pockets`);
});
test('milestone crossing seals behind the player, persists, and prevents undo across the seal', () => {
  const g = new Game(defaults()); g.save.upgrades.delve = 1; g.switchMode('delve');
  g.newRun({ seed: 42 });
  const gate = region(42, 0).gate;
  Object.assign(g.run.player, { x: gate.x, y: gate.y - 1 });
  assert.ok(g.move(0, 1)); assert.equal(g.run.height, 100); assert.equal(g.run.milestone, 1);
  assert.equal(g.world.tile(gate.x, gate.y - 1).kind, 'wall'); assert.equal(g.undo(), false);
  assert.ok(g.move(0, 1)); assert.equal(g.world.step(gate.x, gate.y + 1, 0, -1), null);
  const restored = new Game(decode(JSON.stringify(g.save))); restored.switchMode('delve');
  assert.equal(restored.run.milestone, 1);
  assert.equal(restored.world.tile(gate.x, gate.y - 1).kind, 'wall');
  assert.notEqual(restored.world.tile(restored.run.player.x, restored.run.player.y).kind, 'wall');
});
test('physical false ascent cannot award the next official milestone', () => {
  const r = region(42, 0), high = r.nodes.reduce((a, b) => a.y > b.y ? a : b);
  assert.ok(high.y > r.gate.y); assert.ok(depthAt(42, high.x, high.y, 0) < 100);
});

test('torches sit on plain floor, once, even where areas interlock', () => {
  for (let seed = 0; seed < 6; seed++) {
    const w = new World({ seed, changes: {}, floor: 0, milestone: 0 }), spots = w.torches.map(t => point(t.x, t.y));
    assert.equal(new Set(spots).size, spots.length);
    for (const t of w.torches) assert.equal(w.tile(t.x, t.y).kind, 'floor', `torch at ${t.x},${t.y}`);
  }
});

test('undo stays on its equivalent floor: a step across a floor line (each ten depth) forgets the history', () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = g.save.upgrades.inspirationUndos = 1;
  g.switchMode('delve');
  g.newRun({ seed: 42 });
  (g as unknown as { enterFromOutside(): void }).enterFromOutside();
  const world = g.world as World, floorAt = (x: number, y: number) => Math.floor(world.depth(x, y) / 10);
  const plain = (x: number, y: number) => world.tile(x, y).kind === 'floor';
  // Two pairs of plain floor tiles side by side: one across a line, one not.
  let across: number[] | undefined, within: number[] | undefined;
  for (const key of region(42, 0).metadata.keys()) {
    const [x, y] = key.split(',').map(Number);
    if (!plain(x, y) || !plain(x, y + 1) || world.step(x, y, 0, 1)?.y !== y + 1) continue;
    if (floorAt(x, y) !== floorAt(x, y + 1)) across ??= [x, y];
    else within ??= [x, y];
  }
  assert.ok(across && within, 'the labyrinth has both');
  for (const [[x, y], undoes] of [[within!, true], [across!, false]] as const) {
    g.save.delve.history = [];
    Object.assign(g.run.player, { x, y });
    assert.ok(g.move(0, 1));
    assert.equal(g.undo(), undoes, undoes ? 'a step on the floor can be undone' : 'a step across the line cannot');
  }
});
