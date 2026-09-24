import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TreeParticles } from '../src/tree-particles.ts';
import type { SkillNode } from '../src/skill-trees.ts';

const node: SkillNode = { id: 'shardHp', x: 50, y: 50, requires: [], icon: '' };

test('ambient rotation is CCW and selected rotation is stronger CW in screen coordinates', () => {
  const ambient = new TreeParticles(), selected = new TreeParticles();
  for (let i=0; i<90; i++) {
    ambient['step'](1/30, 400, 600, [node], null);
    selected['step'](1/30, 400, 600, [node], node.id);
  }
  const atRight = 20*40+25;
  assert.ok(ambient['v'][atRight] < 0, 'right side must travel upward for CCW');
  assert.ok(selected['v'][atRight] > -ambient['v'][atRight]*3, 'selected must travel downward more strongly');
});

test('connection current flows from prerequisite toward child', () => {
  const fluid = new TreeParticles();
  const nodes: SkillNode[] = [
    { ...node, x: 20 },
    { ...node, id: 'shardAttack', x: 80, requires: [node.id] },
  ];
  for (let i=0; i<90; i++) fluid['step'](1/30, 600, 400, nodes, null);
  assert.ok(fluid['u'][20*40+20] > 0, 'middle of link must move toward the child');
  assert.ok([...fluid['u'], ...fluid['v']].every(Number.isFinite));
});

test('purchase displaces nearby particles outward and reduce motion clears the effect', () => {
  Object.defineProperty(globalThis, 'devicePixelRatio', { value: 1, configurable: true });
  const context = { setTransform() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {} };
  const canvas = { clientWidth: 400, clientHeight: 600, width: 400, height: 600, getContext: () => context } as unknown as HTMLCanvasElement;
  const fluid = new TreeParticles();
  fluid.draw(canvas, 100, 'test', [node], null, false);
  fluid['particles'] = [{ x: .6, y: .5, radius: 1, alpha: .3 }];
  fluid.purchase(node);
  fluid.draw(canvas, 116, 'test', [node], null, false);
  assert.ok(fluid['particles'][0].x > .6);
  const before = fluid['particles'][0].x;
  fluid.draw(canvas, 132, 'test', [node], null, true);
  assert.equal(fluid['particles'][0].x, before);
  assert.equal(fluid['pulses'].length, 0);
});
