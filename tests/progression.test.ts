import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/state.ts';
import { defaults, decode } from '../src/save.ts';
import { RoomWorld } from '../src/generation.ts';
import { chooseStep } from '../src/automation.ts';
function arena() {
  const g = new Game(defaults());
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: 'floor' });
  w.cells.set('4,4', { kind: 'stairs' });
  g.run.player.x = 0; g.run.player.y = 0;
  return g;
}
test('milestones are immediate, incremental and cannot be farmed with undo or reruns', () => {
  const g = arena();
  g.advanceTowerRoom(); assert.equal(g.save.tower.shards, 1);
  g.advanceTowerRoom(); assert.equal(g.save.tower.shards, 2);
  g.newRun(); g.advanceTowerRoom(); assert.equal(g.save.tower.shards, 2);
  g.save.upgrades.delve = 1; g.switchMode('delve');
  for (const [height, balance] of [[9,0],[10,1],[19,1],[20,2],[10,2],[30,3]]) {
    g.run.height = height; g.recordProgress(); assert.equal(g.save.delve.essence, balance);
  }
  g.finish('test'); assert.equal(g.save.delve.essence, 3);
});
test('all doors and enemies are required; silver, gold and platinum stack only once', () => {
  const g = arena(), w = g.world as RoomWorld;
  w.cells.set('1,0', {kind:'door', color:'yellow'});
  w.cells.set('2,0', {kind:'enemy', enemy:{name:'test', hp:1, attack:0, defense:0, tier:0}});
  g.checkClear(); assert.equal(g.run.rewards?.length, 0);
  w.clear(1,0); g.checkClear(); assert.equal(g.run.rewards?.length, 0);
  w.clear(2,0); g.checkClear();
  assert.deepEqual(g.save.tower.log[0].earned, ['silver','gold','platinum']);
  assert.equal(g.run.rewards?.length, 3);
  assert.equal(g.save.tower.shards, 0);
  assert.equal(g.claimRewards('silver'), 1);
  assert.equal(g.run.rewards?.length, 2);
  g.checkClear(); g.claimRewards(); g.checkClear();
  assert.equal(g.save.tower.shards, 3); assert.equal(g.run.rewards?.length, 0);
});
test('damage disqualifies gold after healing; keys disqualify platinum', () => {
  const g = arena(); g.run.damaged = true; g.run.player.hp = g.run.player.maxHp;
  g.checkClear(); assert.deepEqual(g.save.tower.log[0].earned, ['silver']);
  const h = arena(); h.run.keysSpent = true; h.checkClear();
  assert.deepEqual(h.save.tower.log[0].earned, ['silver','gold']);
});
test('uncollected rewards survive reload, undo, departure, death and retirement exactly once', () => {
  for (const action of ['reload','undo','stairs','death','retire','mode']) {
    const g = arena(), before = g.snapshot(); g.checkClear();
    if (action === 'reload') {
      const loaded = new Game(decode(JSON.stringify(g.save)));
      assert.equal(loaded.run.rewards?.length, 3); loaded.claimRewards();
      assert.equal(loaded.save.tower.shards, 3); continue;
    }
    if (action === 'undo') g.restore(before);
    if (action === 'stairs') g.advanceTowerRoom();
    if (action === 'retire') g.finish('test');
    if (action === 'mode') { g.save.upgrades.delve=1; g.switchMode('delve'); }
    if (action === 'death') {
      (g.world as RoomWorld).cells.set('1,0', {kind:'enemy',enemy:{name:'doom',hp:999,attack:999,defense:999,tier:3}});
      g.move(1,0);
    }
    assert.equal(g.save.tower.shards, action === 'stairs' ? 4 : 3, action);
  }
});
test('automove walks to and collects every clear chest before the stairs', () => {
  const g = arena(); g.checkClear();
  for (let n=0; n<50 && g.run.rewards?.length; n++) {
    const step = chooseStep(g); assert.ok(step); assert.ok(g.move(step.dx,step.dy));
  }
  assert.equal(g.run.height,0); assert.equal(g.save.tower.shards,3); assert.equal(g.run.rewards?.length,0);
});
test('legacy balances and records migrate without retroactive duplication', () => {
  const old = defaults(); old.tower.best=8; old.tower.shards=4;
  delete (old.tower as any).reached; delete (old.tower as any).log;
  const g = new Game(decode(JSON.stringify(old))); g.run.height=8; g.recordProgress();
  assert.equal(g.save.tower.shards,4); g.run.height=9; g.recordProgress(); assert.equal(g.save.tower.shards,5);
});
